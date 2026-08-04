/**
 * ROVController：控制输入 → 6DOF 指令（docs/03-物理仿真.md §4）。
 * - 输入轴：surge/sway/heave/yaw/pitch/roll，各 ∈ [-1, 1]
 * - 线性油门：cmd_i = axis_i * F_max_i（体坐标系）
 * - 航速限制：前向速度超过 maxSpeedKnots 时削减 surge 指令
 * - 一键水平：PD 控制 roll/pitch 归零，覆盖手动转动输入
 */

import * as THREE from 'three';
import type { ROVConfig } from '../rov/ROVConfig';
import type { RigidBody6 } from '../physics/RigidBody6';
import { kn2ms, SEAWATER_DENSITY } from '../../utils/units';

// 临时对象（模块级复用，避免每帧分配）
const VEC_TMP = new THREE.Vector3();
const EULER_TMP = new THREE.Euler();

/** 动力曲线：linear=水平线性；ease=缓入缓出（两端慢中间快，smoothstep） */
export type PowerCurve = 'linear' | 'ease';

/** 输入轴映射（缓入缓出曲线） */
function applyCurve(v: number, curve: PowerCurve): number {
  if (curve === 'ease') {
    const a = Math.abs(v);
    const s = Math.sign(v);
    return s * (a * a * (3 - 2 * a)); // smoothstep
  }
  return v;
}

export interface ControlInput {
  surge: number;
  sway: number;
  heave: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export const EMPTY_INPUT: ControlInput = { surge: 0, sway: 0, heave: 0, yaw: 0, pitch: 0, roll: 0 };

export interface LevelAttitudeResult {
  active: boolean;
}

/** 控制坐标系：机身 = 向前随头向；世界 = 向前恒为水平前进方向 */
export type AxisMode = 'body' | 'world';

export class ROVController {
  /** 平动最大力（N）——由推进器能力推导 */
  private readonly fMax = { surge: 0, sway: 0, heave: 0 };
  /** 转动最大力矩（N·m，按机型 torqueScale 缩放：M2S 俯仰/横滚 ×2） */
  private readonly tauMax = { yaw: 21, pitch: 17, roll: 14 };

  /** 当前航速上限对应的 surge 最大推力（按稳态阻力标定） */
  private surgeMaxForce: number;
  /** 侧向限速对应的 sway 最大推力（机型 maxSwaySpeedKnots） */
  private readonly swayMaxForce: number;
  /** 垂直限速对应的 heave 最大推力（机型 maxHeaveSpeedKnots；缺省不限速） */
  private readonly heaveMaxForce: number;
  /** 稳态限速速度（缓存 sqrt，避免每步计算） */
  private vForwardLimit = 3.0;
  private readonly vSwayLimit: number;
  private readonly vHeaveLimit: number;

  /** 一键水平状态 */
  levelActive = false;
  /** 水平 PD 参数 */
  private readonly kp = 70;
  private readonly kd = 18;
  /** 控制坐标系 */
  axisMode: AxisMode = 'body';
  /** 动力曲线 */
  powerCurve: PowerCurve = 'linear';
  /** 动力输出百分比 [0,1] */
  powerLevel = 1;

  private readonly invQuat = new THREE.Quaternion();
  private readonly vTmp = new THREE.Vector3();

  constructor(private config: ROVConfig) {
    // 机型转动响应缩放（默认 1）
    const ts = config.torqueScale ?? {};
    this.tauMax.yaw *= ts.yaw ?? 1;
    this.tauMax.pitch *= ts.pitch ?? 1;
    this.tauMax.roll *= ts.roll ?? 1;
    // surge/sway 由 4 个水平推进器组合；heave 由 4 个垂直推进器组合
    const hMax = Math.max(...config.thrusters.map((t) => t.maxForce));
    const vMax = Math.max(...config.thrusters.filter((t) => Math.abs(t.direction[1]) > 0.5).map((t) => t.maxForce));
    this.fMax.surge = 4 * 0.7071 * hMax;
    this.fMax.sway = 4 * 0.7071 * hMax;
    this.fMax.heave = 4 * vMax;
    this.surgeMaxForce = this.fMax.surge;
    this.setMaxSpeedKnots(config.maxSpeedKnots);
    // 侧向限速（缺省 = maxSpeedKnots）：F = 0.5·ρ·CdA_x·v²
    const vSway = kn2ms(config.maxSwaySpeedKnots ?? config.maxSpeedKnots);
    this.swayMaxForce = 0.5 * SEAWATER_DENSITY * this.config.dragCoeffs.lin[0] * vSway * vSway;
    this.vSwayLimit = vSway;
    // 垂直限速（可选）：F = 0.5·ρ·CdA_y·v²
    if (config.maxHeaveSpeedKnots) {
      const vH = kn2ms(config.maxHeaveSpeedKnots);
      this.heaveMaxForce = 0.5 * SEAWATER_DENSITY * this.config.dragCoeffs.lin[1] * vH * vH;
      this.vHeaveLimit = vH;
    } else {
      this.heaveMaxForce = Infinity;
      this.vHeaveLimit = Infinity;
    }
  }

  /** 按最大航速反标定 surge 推力上限（稳态 F = 0.5·ρ·CdA·v²） */
  setMaxSpeedKnots(kn: number): void {
    // 上限 = 机型硬限速（缺省 4.5）；M2S hardMaxSpeedKnots=3 → 滑块调到 4.5 也被钳制
    const cap = this.config.hardMaxSpeedKnots ?? 4.5;
    const clamped = Math.min(Math.max(kn, 0.5), cap);
    const v = kn2ms(clamped);
    const cdA = this.config.dragCoeffs.lin[2];
    this.surgeMaxForce = 0.5 * SEAWATER_DENSITY * cdA * v * v;
    this.vForwardLimit = v;
  }

  getMaxSpeedKnots(): number {
    const v = Math.sqrt((2 * this.surgeMaxForce) / (SEAWATER_DENSITY * this.config.dragCoeffs.lin[2]));
    return v / 0.514444;
  }

  /** 触发一键水平 */
  startLevel(): void {
    this.levelActive = true;
  }

  /** 取消一键水平（手动输入接管） */
  cancelLevel(): void {
    this.levelActive = false;
  }

  setAxisMode(mode: AxisMode): void {
    this.axisMode = mode;
  }

  setPowerCurve(curve: PowerCurve): void {
    this.powerCurve = curve;
  }

  setPowerLevel(level: number): void {
    this.powerLevel = Math.min(1, Math.max(0.1, level));
  }

  /**
   * 计算 6DOF 指令（体坐标系）。
   * cmd6 顺序：F_x(sway), F_y(heave), F_z(surge), τ_x(pitch), τ_y(yaw), τ_z(roll)
   */
  computeCmd6(input: ControlInput, body: RigidBody6, out: number[]): void {
    const lvl = this.powerLevel;
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 0; out[5] = 0;

    // 平动（动力曲线映射）
    let surge = applyCurve(input.surge, this.powerCurve);
    let sway = applyCurve(input.sway, this.powerCurve);
    let heave = applyCurve(input.heave, this.powerCurve);
    // 软限速保险（按当前有效前进方向的速度）
    const vBody = body.velocityBody(VEC_TMP);
    const vW = body.velocityWorld;
    let vForward: number;
    let vSway: number;
    if (this.axisMode === 'world') {
      // 世界系前 = 机头水平投影（yaw，忽略 pitch/roll）
      const yaw = EULER_TMP.setFromQuaternion(body.quaternion, 'YXZ').y;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      vForward = vW.x * fx + vW.z * fz;
      vSway = Math.abs(vW.x * rx + vW.z * rz);
    } else {
      vForward = -vBody.z;
      vSway = Math.abs(vBody.x);
    }
    if (vForward > this.vForwardLimit && surge > 0) {
      // 硬限速：超过限速立即快速切除推力（2% 超速带内线性归零，防瞬时超调）
      const over = vForward - this.vForwardLimit;
      const band = Math.max(0.05, this.vForwardLimit * 0.02);
      surge *= over > band ? 0 : Math.max(0, 1 - over / band);
    }
    // 侧向限速
    if (vSway > this.vSwayLimit && Math.abs(sway) > 0) {
      sway *= Math.max(0, 1 - (vSway - this.vSwayLimit) / this.vSwayLimit);
    }
    // 垂直限速（世界系竖直速度，缩放 heave 变量）
    if (this.heaveMaxForce !== Infinity) {
      const vy = Math.abs(body.velocityWorld.y);
      if (vy > this.vHeaveLimit && Math.abs(heave) > 0) {
        heave *= Math.max(0, 1 - (vy - this.vHeaveLimit) / this.vHeaveLimit);
      }
    }
    // heave 推力上限（限速对应的平衡推力；避免满推过冲振荡）
    const fHeave = Math.min(this.fMax.heave, this.heaveMaxForce);

    const fSurge = Math.min(this.fMax.surge, this.surgeMaxForce);
    const fSway = Math.min(this.fMax.sway, this.swayMaxForce);
    if (this.axisMode === 'body') {
      // 机身坐标系：力直接沿体轴
      out[0] = sway * fSway * lvl;            // F_x（右 +X）
      out[1] = heave * fHeave * lvl;          // F_y（上 +Y）
      out[2] = -surge * fSurge * lvl;         // F_z（前进 = -Z）
      // 偏航：直接用体 Y
      if (this.config.controllableAxes.includes('yaw')) out[4] = -applyCurve(input.yaw, this.powerCurve) * this.tauMax.yaw * lvl;
    } else {
      // 世界坐标系：前 = 机头水平投影方向（yaw，忽略 pitch/roll）
      // 前向水平 = rotateY(yaw)·(0,0,-1) = (-sinY, 0, -cosY)
      // 右侧水平 = rotateY(yaw)·(1,0,0) = (cosY, 0, -sinY)
      const yaw = EULER_TMP.setFromQuaternion(body.quaternion, 'YXZ').y;
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const fx = -sinY;
      const fz = -cosY;
      const rx = cosY;
      const rz = -sinY;
      const Fwx = surge * fSurge * fx + sway * fSway * rx;
      const Fwy = heave * fHeave; // 竖直 = 世界 Y
      const Fwz = surge * fSurge * fz + sway * fSway * rz;
      this.invQuat.copy(body.quaternion).invert();
      this.vTmp.set(Fwx * lvl, Fwy * lvl, Fwz * lvl).applyQuaternion(this.invQuat);
      out[0] = this.vTmp.x;
      out[1] = this.vTmp.y;
      out[2] = this.vTmp.z;
      // 偏航用体 Y（水平时 = 世界 Y）：不转体，稳定无耦合
      if (this.config.controllableAxes.includes('yaw')) out[4] = -applyCurve(input.yaw, this.powerCurve) * this.tauMax.yaw * lvl;
    }

    // 俯仰/横滚：体轴（两种模式一致），应用曲线与动力百分比
    if (this.config.controllableAxes.includes('pitch')) out[3] += applyCurve(input.pitch, this.powerCurve) * this.tauMax.pitch * lvl;
    if (this.config.controllableAxes.includes('roll')) out[5] += applyCurve(input.roll, this.powerCurve) * this.tauMax.roll * lvl;

    // 一键水平：PD 覆盖 pitch/roll
    if (this.levelActive) {
      const euler = EULER_TMP.setFromQuaternion(body.quaternion, 'YXZ');
      const rollErr = -euler.z;
      const pitchErr = -euler.x;
      out[3] = this.kp * pitchErr - this.kd * body.omegaBody.x; // τ_x
      out[5] = this.kp * rollErr - this.kd * body.omegaBody.z;  // τ_z
      // 完成判定：|roll|、|pitch| < 0.01 rad 且角速度足够小
      if (Math.abs(euler.z) < 0.01 && Math.abs(euler.x) < 0.01 && Math.abs(body.omegaBody.x) < 0.05 && Math.abs(body.omegaBody.z) < 0.05) {
        this.levelActive = false;
      }
    }
  }
}
