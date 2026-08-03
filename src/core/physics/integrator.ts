/**
 * 数值积分工具（docs/03-物理仿真.md §6）。
 * 固定步长 1/120s；姿态用四元数积分避免万向锁。
 */

import * as THREE from 'three';

export const FIXED_DT = 1 / 120;

// 模块级临时对象（物理固定步单线程，复用安全），避免每步 GC 分配
const WQ_TMP = new THREE.Quaternion();
const DQ_TMP = new THREE.Quaternion();

/**
 * 半隐式欧拉更新四元数：
 *   ω_quat = (0, ω_x, ω_y, ω_z)
 *   dq/dt  = 0.5 * q * ω_quat
 *   q += dq/dt * dt; normalize
 */
export function integrateQuaternion(q: THREE.Quaternion, omegaBody: THREE.Vector3, dt: number): void {
  WQ_TMP.set(omegaBody.x, omegaBody.y, omegaBody.z, 0);
  DQ_TMP.multiplyQuaternions(q, WQ_TMP);
  const k = 0.5 * dt;
  // 四元数无 multiplyScalar/add，手动标量乘加
  q.x += DQ_TMP.x * k;
  q.y += DQ_TMP.y * k;
  q.z += DQ_TMP.z * k;
  q.w += DQ_TMP.w * k;
  q.normalize();
}

/** 半隐式欧拉平动：先更新速度再用新速度更新位置 */
export function integrateLinear(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  accelWorld: THREE.Vector3,
  dt: number,
): void {
  vel.addScaledVector(accelWorld, dt);
  pos.addScaledVector(vel, dt);
}
