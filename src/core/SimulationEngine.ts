/**
 * SimulationEngine：仿真核心总装（M2：接入六自由度物理）。
 *
 * - 持有 PhysicsWorld（物理积分）、EnvironmentState（环境）、ROVConfig
 * - step(renderDelta) 内部按固定步长 FIXED_DT=1/120 追赶积分
 * - UI 层通过 setControlInput() / levelAttitude() / setMaxSpeedKnots() 操控
 * - 渲染层与 UI 层只通过 getRenderSnapshot() / getHudSnapshot() 读取数据
 */

import * as THREE from 'three';
import type { ROVConfig } from './rov/ROVConfig';
import { getRov } from './rov/registry';
import type { ControlInput } from './rov/ROVController';
import { EMPTY_INPUT } from './rov/ROVController';
import type { AxisMode, PowerCurve } from './rov/ROVController';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { FIXED_DT } from './physics/integrator';
import { EnvironmentState } from './environment/EnvironmentState';
import type { HudSnapshot, ROVSnapshot } from './rov/ROVState';
import { ms2kn, rad2deg, worldYToDepth, normalizeHeading, deg2rad } from '../utils/units';
import type { LocalFlowZone } from './environment/CurrentField';
import type { ColliderShape } from './physics/Collider';

export interface SimulationOptions {
  rovId?: string;
  startLightsOn?: boolean;
  /** 出生点（世界系） */
  startPosition?: THREE.Vector3;
}

const MAX_ACCUMULATE_STEPS = 8;

export class SimulationEngine {
  readonly environment: EnvironmentState = new EnvironmentState();
  readonly rovConfig: ROVConfig;
  readonly startLightsOn: boolean;
  readonly physics: PhysicsWorld;

  private lightsOn: boolean;
  private accumulator = 0;
  /** 电机锁定（默认锁定，需按空格/手柄 A 解锁） */
  private motorLocked = true;
  /** 解锁后无输入时推进器微转动画指令 */
  private readonly hoverNorm: number[];

  private readonly euler = new THREE.Euler();
  private lastThrusterNorm: number[] = [];

  constructor(options: SimulationOptions = {}) {
    const cfg = getRov(options.rovId ?? 'rov_6dof_standard');
    if (!cfg) throw new Error(`ROV 机型不存在: ${options.rovId}`);
    this.rovConfig = cfg;
    this.lightsOn = options.startLightsOn ?? false;
    this.startLightsOn = this.lightsOn;
    this.physics = new PhysicsWorld(cfg, this.environment);
    this.lastThrusterNorm = new Array(cfg.thrusters.length).fill(0);
    this.hoverNorm = new Array(cfg.thrusters.length).fill(0.12);

    if (options.startPosition) {
      this.physics.setPose(options.startPosition.clone(), new THREE.Quaternion());
    }
  }

  /** 重置到出生点（M5：场景定义覆盖） */
  reset(opts?: { position?: THREE.Vector3; yawDeg?: number }): void {
    const pos = opts?.position?.clone() ?? new THREE.Vector3(0, -8, 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, deg2rad(opts?.yawDeg ?? 0), 0, 'YXZ'));
    this.physics.setPose(pos, q);
    this.lightsOn = this.startLightsOn;
    this.environment.reset();
    this.accumulator = 0;
    this.lastThrusterNorm.fill(0);
    this.clearControlInput();
    this.physics.controllerRef.cancelLevel();
    this.setMotorLocked(true); // 每次重置/重开：电机锁定（同步 physics+controller）
  }

  /** 应用场景局部水流区（场景切换时） */
  applySceneLocalFlow(zones: LocalFlowZone[]): void {
    this.physics.setLocalFlowZones(zones);
  }

  /** 应用场景碰撞体（场景切换时） */
  setSceneColliders(colliders: ColliderShape[]): void {
    this.physics.setSceneColliders(colliders);
  }

  /** 开启/关闭 DVL */
  setDvl(on: boolean): void {
    this.physics.setDvl(on);
  }

  /** 电机加锁/解锁 */
  setMotorLocked(locked: boolean): void {
    this.motorLocked = locked;
    this.physics.setMotorLocked(locked);
  }

  getMotorLocked(): boolean {
    return this.motorLocked;
  }

  setLightsOn(on: boolean): void {
    this.lightsOn = on;
  }

  /** 更新控制输入（部分字段） */
  setControlInput(patch: Partial<ControlInput>): void {
    Object.assign(this.physics.input, patch);
  }

  clearControlInput(): void {
    Object.assign(this.physics.input, EMPTY_INPUT);
  }

  /** 一键水平：PD 稳定 roll/pitch 归零 */
  levelAttitude(): void {
    this.physics.controllerRef.startLevel();
  }

  cancelLevelAttitude(): void {
    this.physics.controllerRef.cancelLevel();
  }

  get levelActive(): boolean {
    return this.physics.controllerRef.levelActive;
  }

  setMaxSpeedKnots(kn: number): void {
    this.physics.controllerRef.setMaxSpeedKnots(kn);
  }

  getMaxSpeedKnots(): number {
    return this.physics.controllerRef.getMaxSpeedKnots();
  }

  /** 切换控制坐标系：body = 机身（向前随头向）；world = 向前恒为机头水平投影方向 */
  setAxisMode(mode: AxisMode): void {
    this.physics.controllerRef.setAxisMode(mode);
  }

  /** 动力曲线：linear 水平 / ease 缓入缓出 */
  setPowerCurve(curve: PowerCurve): void {
    this.physics.controllerRef.setPowerCurve(curve);
  }

  /** 动力输出百分比 [0,1] */
  setPowerLevel(level: number): void {
    this.physics.controllerRef.setPowerLevel(level);
  }

  /** 物理步进入口（内部固定步长追赶） */
  step(renderDelta: number): void {
    this.accumulator += Math.min(Math.max(renderDelta, 0), 0.1); // 防螺旋
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_ACCUMULATE_STEPS) {
      const res = this.physics.step(FIXED_DT);
      this.lastThrusterNorm = res.thrusterNorm;
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_ACCUMULATE_STEPS) this.accumulator = 0;
  }

  /** 渲染层每帧读取的高频快照 */
  /** 恢复会话：瞬移到位姿并清零速度 */
  teleport(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.physics.body.setPose(position, quaternion);
  }

  getRenderSnapshot(): ROVSnapshot {
    const b = this.physics.body;
    this.euler.setFromQuaternion(b.quaternion, 'YXZ');
    const yawDeg = rad2deg(this.euler.y);
    return {
      position: { x: b.position.x, y: b.position.y, z: b.position.z },
      quaternion: { x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w },
      euler: { roll: rad2deg(this.euler.z), pitch: rad2deg(this.euler.x), yaw: yawDeg },
      velocityWorld: { x: b.velocityWorld.x, y: b.velocityWorld.y, z: b.velocityWorld.z },
      speedKnots: ms2kn(b.velocityWorld.length()),
      depthMeters: worldYToDepth(b.position.y),
      // 航向：yaw=0 → 前向 -Z（北）；yaw 正（逆时针）→ 西（航向 270），故取 360 - yawDeg
      headingDeg: normalizeHeading(360 - yawDeg),
      // 电机锁定 = 推进器停转；解锁无输入 = 微转悬停
      thrusterCommands: this.motorLocked
        ? this.lastThrusterNorm
        : this.isIdleInputNow()
          ? this.hoverNorm
          : this.lastThrusterNorm,
      lightsOn: this.lightsOn,
      attitudeHoldActive: this.levelActive,
    };
  }

  /** UI 节流读取的 HUD 快照 */
  getHudSnapshot(): HudSnapshot {
    const s = this.getRenderSnapshot();
    return {
      speedKnots: s.speedKnots,
      depthMeters: s.depthMeters,
      headingDeg: s.headingDeg,
      pitchDeg: s.euler.pitch,
      rollDeg: s.euler.roll,
      temperatureC: this.environment.get().temperatureC,
      attitude: s.quaternion,
      motorLocked: this.motorLocked,
    };
  }

  /** 当前是否无控制输入 */
  private isIdleInputNow(): boolean {
    const i = this.physics.input;
    return Math.abs(i.surge) < 0.01 && Math.abs(i.sway) < 0.01 && Math.abs(i.heave) < 0.01 &&
      Math.abs(i.yaw) < 0.01 && Math.abs(i.pitch) < 0.01 && Math.abs(i.roll) < 0.01;
  }

  /** 水流场采样（供渲染层展示水流方向等，可选） */
  sampleCurrentAt(_pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    // 仅基准流（湍流由物理内部处理；局部流/湍流采样预留）

    const e = this.environment.get();
    const rad = (e.currentDirectionDeg * Math.PI) / 180;
    out.set(Math.sin(rad), 0, Math.cos(rad)).multiplyScalar(e.currentSpeed);
    return out;
  }

  dispose(): void {
    this.clearControlInput();
  }
}
