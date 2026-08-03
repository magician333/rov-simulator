/**
 * Collider：ROV 碰撞体（docs/03 扩展）。
 * - 海底：高度场函数（seabedHeight）——始终启用
 * - 场景物体：球体（Sphere）或盒体（Box，带 Y 旋转），由场景定义注册
 * 响应：将 ROV 推出碰撞体并把速度法向分量置零（海底）或轻微反弹。
 */

import * as THREE from 'three';
import { seabedHeight } from '../terrain';

export type ColliderShape =
  | { type: 'sphere'; position: THREE.Vector3; radius: number }
  | { type: 'box'; position: THREE.Vector3; halfExtents: THREE.Vector3; rotationY?: number };

export function resolveCollisions(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  rovRadius: number,
  colliders: ColliderShape[],
): void {
  // 1) 海底高度场碰撞
  const sea = seabedHeight(position.x, position.z);
  if (position.y - rovRadius < sea) {
    position.y = sea + rovRadius;
    if (velocity.y < 0) velocity.y = 0;
  }

  // 2) 场景碰撞体
  for (const c of colliders) {
    if (c.type === 'sphere') {
      resolveSphere(position, velocity, rovRadius, c.position, c.radius);
    } else {
      resolveBox(position, velocity, rovRadius, c);
    }
  }
}

function resolveSphere(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  r: number,
  center: THREE.Vector3,
  radius: number,
): void {
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  const dz = pos.z - center.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const minDist = r + radius;
  if (distSq >= minDist * minDist || distSq < 1e-8) return;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;

  pos.x += nx * overlap;
  pos.y += ny * overlap;
  pos.z += nz * overlap;
  applyVelocityResponse(vel, nx, ny, nz);
}

function resolveBox(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  r: number,
  box: Extract<ColliderShape, { type: 'box' }>,
): void {
  const yaw = box.rotationY ?? 0;
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const bx = box.position.x;
  const by = box.position.y;
  const bz = box.position.z;

  // 球心变换到盒局部系
  const lx = cos * (pos.x - bx) - sin * (pos.z - bz);
  const ly = pos.y - by;
  const lz = sin * (pos.x - bx) + cos * (pos.z - bz);

  const hx = box.halfExtents.x;
  const hy = box.halfExtents.y;
  const hz = box.halfExtents.z;

  // 最近点（局部系）
  let cx: number;
  let cy: number;
  let cz: number;
  const inside = Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz;
  if (inside) {
    const dx = hx - Math.abs(lx);
    const dy = hy - Math.abs(ly);
    const dz = hz - Math.abs(lz);
    if (dx <= dy && dx <= dz) {
      cx = Math.sign(lx) * hx;
      cy = ly;
      cz = lz;
    } else if (dy <= dx && dy <= dz) {
      cx = lx;
      cy = Math.sign(ly) * hy;
      cz = lz;
    } else {
      cx = lx;
      cy = ly;
      cz = Math.sign(lz) * hz;
    }
  } else {
    cx = clamp(lx, -hx, hx);
    cy = clamp(ly, -hy, hy);
    cz = clamp(lz, -hz, hz);
  }

  // 最近点回世界系
  const wx = bx + cos * cx + sin * cz;
  const wy = by + cy;
  const wz = bz - sin * cx + cos * cz;

  const dx = pos.x - wx;
  const dy = pos.y - wy;
  const dz = pos.z - wz;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= r * r) return;
  if (distSq < 1e-8) return; // 极端重合：忽略（数值罕见）

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const overlap = r - dist;

  pos.x += nx * overlap;
  pos.y += ny * overlap;
  pos.z += nz * overlap;
  applyVelocityResponse(vel, nx, ny, nz);
}

function applyVelocityResponse(vel: THREE.Vector3, nx: number, ny: number, nz: number): void {
  const vn = vel.x * nx + vel.y * ny + vel.z * nz;
  if (vn >= 0) return;
  // 法向：轻微反弹（e=0.15）
  const e = 0.15;
  // 切向：摩擦衰减（模拟与结构/道具表面摩擦，避免打滑）
  const friction = 0.62;
  const tx = vel.x - vn * nx;
  const ty = vel.y - vn * ny;
  const tz = vel.z - vn * nz;
  vel.x = tx * friction + -e * vn * nx;
  vel.y = ty * friction + -e * vn * ny;
  vel.z = tz * friction + -e * vn * nz;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
