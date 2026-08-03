/**
 * RigidBody6：ROV 六自由度刚体状态。
 * 约定（docs/03）：
 * - position / velocityWorld：世界系（Y 向上，x 东 z 南）
 * - omegaBody：体坐标系角速度（rad/s）
 * - 平动方程在世界系积分，转动方程在体坐标系积分
 */

import * as THREE from 'three';
import type { ROVConfig } from '../rov/ROVConfig';

export class RigidBody6 {
  readonly position: THREE.Vector3 = new THREE.Vector3(0, -8, 0);
  readonly quaternion: THREE.Quaternion = new THREE.Quaternion();
  readonly velocityWorld: THREE.Vector3 = new THREE.Vector3();
  readonly omegaBody: THREE.Vector3 = new THREE.Vector3();

  /** 惯性张量（对角近似） */
  readonly inertiaBody: THREE.Vector3;

  /** 临时向量池，避免每步分配 */
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly invQuat = new THREE.Quaternion();

  constructor(readonly config: ROVConfig) {
    // 长方体近似惯性矩：I = m/12 * (b²+c²)
    // 约定：length=Z（前后）、width=X（左右）、height=Y（上下）
    // 绕 X 轴：截面 YZ → 用 height 与 length；绕 Y 轴：截面 XZ → width 与 length；绕 Z 轴：截面 XY → width 与 height
    const { length, width, height } = config.dimensions;
    const m = config.massKg;
    const Ix = (m / 12) * (height * height + length * length);
    const Iy = (m / 12) * (width * width + length * length);
    const Iz = (m / 12) * (width * width + height * height);
    this.inertiaBody = new THREE.Vector3(Ix, Iy, Iz);
  }

  setPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.position.copy(position);
    this.quaternion.copy(quaternion);
    this.velocityWorld.set(0, 0, 0);
    this.omegaBody.set(0, 0, 0);
  }

  /** 线速度转体坐标系 */
  velocityBody(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.velocityWorld).applyQuaternion(this.invQuat.copy(this.quaternion).invert());
  }

  /** 世界系线速度（体向量转到世界） */
  velocityToWorld(bodyVec: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(bodyVec).applyQuaternion(this.quaternion);
  }

  /** 计算绕体轴角加速度：α = I⁻¹ * (τ - ω × (I·ω))（低速可忽略科氏项） */
  angularAcceleration(tauBody: THREE.Vector3): THREE.Vector3 {
    // ω × (I·ω)
    const Iw = this._v1.copy(this.omegaBody).multiply(this.inertiaBody);
    this._v2.crossVectors(this.omegaBody, Iw);
    const effective = this._v1.copy(tauBody).sub(this._v2);
    return effective.divide(this.inertiaBody);
  }

  /** 相对水流速度（体坐标系）：v_rel = v_body - v_current_body */
  relativeVelocityBody(currentWorld: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.velocityBody(out);
    const currBody = this._v1.copy(currentWorld).applyQuaternion(this.invQuat.copy(this.quaternion).invert());
    return out.sub(currBody);
  }
}
