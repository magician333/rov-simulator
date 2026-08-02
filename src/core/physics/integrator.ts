/**
 * 数值积分工具（docs/03-物理仿真.md §6）。
 * 固定步长 1/120s；姿态用四元数积分避免万向锁。
 */

import * as THREE from 'three';

export const FIXED_DT = 1 / 120;

/**
 * 半隐式欧拉更新四元数：
 *   ω_quat = (0, ω_x, ω_y, ω_z)
 *   dq/dt  = 0.5 * q * ω_quat
 *   q += dq/dt * dt; normalize
 */
export function integrateQuaternion(q: THREE.Quaternion, omegaBody: THREE.Vector3, dt: number): void {
  const wq = new THREE.Quaternion(omegaBody.x, omegaBody.y, omegaBody.z, 0);
  const dq = new THREE.Quaternion().multiplyQuaternions(q, wq);
  const k = 0.5 * dt;
  // 四元数无 multiplyScalar/add，手动标量乘加
  q.x += dq.x * k;
  q.y += dq.y * k;
  q.z += dq.z * k;
  q.w += dq.w * k;
  q.normalize();
}

/** 将体坐标系向量转到世界系 */
export function bodyToWorld(q: THREE.Quaternion, v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(v).applyQuaternion(q);
}

/** 将世界系向量转到体坐标系 */
export function worldToBody(q: THREE.Quaternion, v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(v).applyQuaternion(q.clone().invert());
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
