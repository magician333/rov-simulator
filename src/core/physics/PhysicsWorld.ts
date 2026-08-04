/**
 * PhysicsWorld：六自由度物理总装（docs/03-物理仿真.md）。
 * 每步流程：控制指令 → 推进器分配 → 合力/力矩 → 数值积分。
 * 固定步长由 SimulationEngine 的 accumulator 控制（FIXED_DT = 1/120）。
 */

import * as THREE from 'three';
import type { ROVConfig } from '../rov/ROVConfig';
import type { EnvironmentState } from '../environment/EnvironmentState';
import { RigidBody6 } from './RigidBody6';
import { WaterForces } from './WaterForces';
import { ThrusterAllocator } from './ThrusterAllocator';
import { CurrentField, type LocalFlowZone } from '../environment/CurrentField';
import { resolveCollisions, type ColliderShape } from './Collider';
import { ROVController, EMPTY_INPUT, type ControlInput } from '../rov/ROVController';
import { integrateLinear, integrateQuaternion, FIXED_DT } from './integrator';
import { SEAWATER_DENSITY, GRAVITY } from '../../utils/units';

export interface PhysicsStepResult {
  /** 各推进器归一化指令 -1..1（渲染动画） */
  thrusterNorm: number[];
  /** 一键水平进行中 */
  levelActive: boolean;
}

/** 水面（世界 Y=0 为海面，ROV 不允许高于水面） */
export const WATER_SURFACE_Y = 0;
/** DVL 悬停速度阻尼（固定步长常量） */
const DVL_DAMP = Math.exp(-FIXED_DT * 3);

export class PhysicsWorld {
  readonly body: RigidBody6;
  /** 控制输入（由 SimulationEngine/UI 更新） */
  input: ControlInput = { ...EMPTY_INPUT };

  private readonly water: WaterForces;
  private readonly allocator: ThrusterAllocator;
  private readonly current: CurrentField;
  private readonly controller: ROVController;

  private time = 0;
  private readonly cmd6: number[] = [0, 0, 0, 0, 0, 0];
  private readonly fBody = new THREE.Vector3();
  private readonly tauBody = new THREE.Vector3();
  private readonly fWorld = new THREE.Vector3();
  private readonly currentWorld = new THREE.Vector3();
  private readonly invQuat = new THREE.Quaternion();
  private readonly attitudeEuler = new THREE.Euler();
  private lastNorm: number[] = [];

  /** ROV 碰撞半径（m） */
  private readonly rovRadius: number;
  /** 场景碰撞体（场景加载时注册） */
  private colliders: ColliderShape[] = [];

  constructor(config: ROVConfig, env: EnvironmentState) {
    this.body = new RigidBody6(config);
    this.water = new WaterForces(config);
    this.allocator = new ThrusterAllocator(config);
    this.current = new CurrentField(env);
    this.controller = new ROVController(config);
    this.lastNorm = new Array(config.thrusters.length).fill(0);
    const { length, width, height } = config.dimensions;
    this.rovRadius = Math.sqrt(length * length + width * width + height * height) * 0.55;
    // 解锁后悬停：抵消净浮力（ρgV - mg，正 = 上浮）
    this.hoverCompY = -(SEAWATER_DENSITY * config.displacementM3 * GRAVITY - config.massKg * GRAVITY);
  }

  /** 注册场景碰撞体（场景切换时替换） */
  setSceneColliders(colliders: ColliderShape[]): void {
    this.colliders = colliders;
  }

  /** 电机加锁/解锁（锁定 = 推进器无动力） */
  setMotorLocked(locked: boolean): void {
    this.motorLocked = locked;
  }

  getMotorLocked(): boolean {
    return this.motorLocked;
  }

  /** 是否无控制输入（解锁后悬停判定） */
  private isIdleInput(): boolean {
    const i = this.input;
    return Math.abs(i.surge) < 0.001 && Math.abs(i.sway) < 0.001 && Math.abs(i.heave) < 0.001 &&
      Math.abs(i.yaw) < 0.001 && Math.abs(i.pitch) < 0.001 && Math.abs(i.roll) < 0.001;
  }

  get controllerRef(): ROVController {
    return this.controller;
  }

  private dvlOn = false;
  private dvlAnchor = new THREE.Vector3();
  private dvlActive = false;

  /** 电机锁定（默认锁定：启动需按空格/手柄 A 解锁） */
  private motorLocked = true;
  /** 解锁后悬停补偿力（世界系 Y，抵消净浮力保持当前位置） */
  private readonly hoverCompY: number;

  /** 开启/关闭 DVL（多普勒测速）：悬停保持 + 洋流削弱 */
  setDvl(on: boolean): void {
    this.dvlOn = on;
    this.dvlActive = false;
  }

  setLocalFlowZones(zones: LocalFlowZone[]): void {
    this.current.clearZones();
    for (const z of zones) this.current.addZone(z);
  }

  setPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.body.setPose(position, quaternion);
  }

  /** 姿态角钳制（机型 attitudeLimits；限制后角速度法向分量归零防止反复越界） */
  private clampAttitude(): void {
    const lim = this.body.config.attitudeLimits;
    if (!lim) return;
    const maxP = lim.pitchDeg !== undefined ? (lim.pitchDeg * Math.PI) / 180 : undefined;
    const maxR = lim.rollDeg !== undefined ? (lim.rollDeg * Math.PI) / 180 : undefined;
    if (maxP === undefined && maxR === undefined) return;
    const e = this.attitudeEuler.setFromQuaternion(this.body.quaternion, 'YXZ');
    let changed = false;
    if (maxP !== undefined) {
      const cx = Math.max(-maxP, Math.min(maxP, e.x));
      if (Math.abs(cx - e.x) > 1e-9) changed = true;
      e.x = cx;
    }
    if (maxR !== undefined) {
      const cz = Math.max(-maxR, Math.min(maxR, e.z));
      if (Math.abs(cz - e.z) > 1e-9) changed = true;
      e.z = cz;
    }
    if (changed) {
      this.body.quaternion.setFromEuler(e);
      this.body.quaternion.normalize();
      // 已到限位轴的角速度归零：防止持续顶压导致欧拉分解漂移（俯仰超限诱发横滚）
      if (maxP !== undefined && Math.abs(e.x) >= maxP - 1e-6) this.body.omegaBody.x = 0;
      if (maxR !== undefined && Math.abs(e.z) >= maxR - 1e-6) this.body.omegaBody.z = 0;
    }
  }

  /** 单物理步（dt = FIXED_DT） */
  step(dt: number): PhysicsStepResult {
    this.time += dt;

    // 1) 控制指令 → 6DOF（体坐标系）
    this.controller.computeCmd6(this.input, this.body, this.cmd6);

    // 2) 推进器分配（电机锁定 = 无动力，推进器停转）
    const alloc = this.allocator.allocate(this.cmd6);
    if (this.motorLocked) {
      alloc.thrust.fill(0);
      alloc.norm.fill(0);
    }
    this.lastNorm = alloc.norm;

    // 3) 合力（体坐标系）：推进器 + 水力
    this.allocator.applyThrust(alloc.thrust, this.fBody, this.tauBody);

    // 4) 水流（世界系）；DVL 开启时洋流削弱（移动受干扰更小）
    this.current.velocityAt(this.body.position, this.time, this.currentWorld);
    if (this.dvlOn) this.currentWorld.multiplyScalar(0.3);

    // 5) 水力（重力/浮力/阻尼）累加
    this.water.compute(this.body, this.currentWorld, this.fBody, this.tauBody);

    // 6) 积分
    // 平动：F_world = R·F_body；a = F/m
    this.invQuat.copy(this.body.quaternion).invert();
    this.fWorld.copy(this.fBody).applyQuaternion(this.body.quaternion);
    // 解锁 + 无输入：悬停保持当前位置（抵消净浮力 + 水平阻尼）
    if (!this.motorLocked && this.isIdleInput()) {
      this.fWorld.y += this.hoverCompY;
      this.body.velocityWorld.x *= 0.985;
      this.body.velocityWorld.z *= 0.985;
    }
    const accelWorld = this.fWorld.divideScalar(this.body.config.massKg);
    integrateLinear(this.body.position, this.body.velocityWorld, accelWorld, dt);

    // 转动：α = I⁻¹(τ - ω×Iω)
    const alpha = this.body.angularAcceleration(this.tauBody);
    this.body.omegaBody.addScaledVector(alpha, dt);
    integrateQuaternion(this.body.quaternion, this.body.omegaBody, dt);

    // 姿态角限制（通用 ROV：俯仰 ±60°、横滚 ±45°）
    this.clampAttitude();

    // DVL 悬停保持：无控制输入时锁定位置（PD 反馈 + 速度阻尼）
    if (this.dvlOn) {
      const inp = this.input;
      const idle =
        inp.surge === 0 && inp.sway === 0 && inp.heave === 0 &&
        inp.yaw === 0 && inp.pitch === 0 && inp.roll === 0;
      if (idle) {
        if (!this.dvlActive) {
          this.dvlAnchor.copy(this.body.position);
          this.dvlActive = true;
        }
        // 位置误差反馈（回拉）+ 速度阻尼（快速停）
        const k = 1.8;
        this.body.velocityWorld.x += (this.dvlAnchor.x - this.body.position.x) * k * dt;
        this.body.velocityWorld.z += (this.dvlAnchor.z - this.body.position.z) * k * dt;
        this.body.velocityWorld.y += (this.dvlAnchor.y - this.body.position.y) * k * dt;
        this.body.velocityWorld.multiplyScalar(DVL_DAMP);
      } else {
        this.dvlActive = false;
      }
    }

    // 水面边界：深度不能大于 0（不能高于水面）
    if (this.body.position.y > WATER_SURFACE_Y) {
      this.body.position.y = WATER_SURFACE_Y;
      if (this.body.velocityWorld.y > 0) this.body.velocityWorld.y = 0;
    }

    // 碰撞解析：海底高度场 + 场景球体
    resolveCollisions(this.body.position, this.body.velocityWorld, this.rovRadius, this.colliders);

    return { thrusterNorm: this.lastNorm, levelActive: this.controller.levelActive };
  }
}
