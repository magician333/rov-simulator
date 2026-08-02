/**
 * 声纳公共工具：射线最近命中 + 海底解析 ray-march。
 * 性能关键：构建采样目标列表（排除海底大网格/ROV/粒子 Points），
 * raycast 只对小型物体检测（海底由 ray-march 解析，不参与 raycast）。
 */

import * as THREE from 'three';
import { seabedHeight } from '../../core/terrain';

export function isSonarExcluded(obj: THREE.Object3D | null): boolean {
  while (obj) {
    if ((obj.userData as { sonarExclude?: boolean } | undefined)?.sonarExclude) return true;
    obj = obj.parent;
  }
  return false;
}

export function isSonarGround(obj: THREE.Object3D | null): boolean {
  while (obj) {
    if ((obj.userData as { sonarGround?: boolean } | undefined)?.sonarGround) return true;
    obj = obj.parent;
  }
  return false;
}

/** 排除粒子系统（Points 有数千顶点，raycast 遍历开销大） */
export function isPointsObj(obj: THREE.Object3D | null): boolean {
  return (obj as THREE.Points | null)?.isPoints === true;
}

/** 构建声纳采样目标列表（排除海底/ROV/粒子；场景加载后调用） */
export function buildSonarTargets(scene: THREE.Scene): THREE.Object3D[] {
  return scene.children.filter((obj) => !isSonarGround(obj) && !isSonarExcluded(obj) && !isPointsObj(obj));
}

/** 所有命中（目标列表已排除大网格，过滤 ROV 子级/粒子），未命中返回空数组 */
export function raycastHits(
  raycaster: THREE.Raycaster,
  targets: THREE.Object3D[],
  position: THREE.Vector3,
  direction: THREE.Vector3,
): THREE.Intersection[] {
  raycaster.set(position, direction);
  return raycaster
    .intersectObjects(targets, true)
    .filter((h) => !isSonarExcluded(h.object) && !isPointsObj(h.object));
}

/** raycast 最近命中距离（未命中返回 null） */
export function raycastNearest(
  raycaster: THREE.Raycaster,
  targets: THREE.Object3D[],
  position: THREE.Vector3,
  direction: THREE.Vector3,
): number | null {
  const hits = raycastHits(raycaster, targets, position, direction);
  return hits.length > 0 ? hits[0].distance : null;
}

/** 海底解析 ray-march：沿射线步进高度场（射线必须向下才可能命中） */
export function rayMarchSeafloor(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  maxRange: number,
): number | null {
  if (direction.y >= 0) return null;
  let t = 0.05; // 从机身表面起算（接触即 0）
  const step = 1.6;
  while (t < maxRange) {
    const x = position.x + direction.x * t;
    const y = position.y + direction.y * t;
    const z = position.z + direction.z * t;
    if (y <= seabedHeight(x, z)) return t;
    t += step;
  }
  return null;
}

/** 合并采样：物体 raycast + 海底 ray-march，取最近 */
export function sampleDistance(
  raycaster: THREE.Raycaster,
  targets: THREE.Object3D[],
  position: THREE.Vector3,
  direction: THREE.Vector3,
  maxRange: number,
): number | null {
  const d1 = raycastNearest(raycaster, targets, position, direction);
  const d2 = rayMarchSeafloor(position, direction, maxRange);
  if (d1 !== null && d2 !== null) return Math.min(d1, d2);
  return d1 ?? d2;
}
