/**
 * DistanceSonar：定距声纳（避碰测距，POV HUD 用）。
 * 沿 ROV 体坐标系六向（前/后/左/右/上/下）发射射线，返回最近距离。
 * 采样频率由调用方控制（TrainingScreen 每 200ms）。
 */

import * as THREE from 'three';
import type { DistanceReadings } from '../../core/rov/ROVState';
import { sampleDistance, buildSonarTargets } from './sonarUtils';

const BODY_DIRS: [keyof DistanceReadings, THREE.Vector3][] = [
  ['fwd', new THREE.Vector3(0, 0, -1)],
  ['back', new THREE.Vector3(0, 0, 1)],
  ['left', new THREE.Vector3(-1, 0, 0)],
  ['right', new THREE.Vector3(1, 0, 0)],
  ['up', new THREE.Vector3(0, 1, 0)],
  ['down', new THREE.Vector3(0, -1, 0)],
];

export class DistanceSonar {
  private raycaster = new THREE.Raycaster();
  private dir = new THREE.Vector3();
  /** 采样起点（机身表面偏移用，记录沿各体轴半尺寸） */
  private origin = new THREE.Vector3();
  /** 机身半尺寸（x=宽/2, y=高/2, z=长/2），默认 0.45×0.35×0.5 */
  private half = new THREE.Vector3(0.45, 0.35, 0.5);
  /** 采样目标（排除海底/ROV/粒子） */
  private targets: THREE.Object3D[] = [];

  constructor(
    private scene: THREE.Scene,
    private maxRange = 80,
    half?: THREE.Vector3,
  ) {
    if (half) this.half.copy(half);
    this.refreshTargets();
  }

  /** 场景加载/切换后刷新采样目标 */
  refreshTargets(): void {
    this.targets = buildSonarTargets(this.scene);
  }

  /**
   * 采样：射线从机身表面起算（沿方向偏移对应半尺寸），
   * 返回值为机身表面到目标的距离。
   */
  sample(pos: THREE.Vector3, quat: THREE.Quaternion): DistanceReadings {
    this.raycaster.far = this.maxRange;
    const out: DistanceReadings = { fwd: null, back: null, left: null, right: null, up: null, down: null };
    for (const [key, bodyDir] of BODY_DIRS) {
      this.dir.copy(bodyDir).applyQuaternion(quat);
      // 起点 = 机身表面：中心 + 体轴方向 × 半尺寸
      this.origin.copy(bodyDir).multiply(this.half).applyQuaternion(quat).add(pos);
      const hit = sampleDistance(this.raycaster, this.targets, this.origin, this.dir, this.maxRange);
      // 向上方向：水面（y=0.04）被排除出采样，用解析距离（机身表面到水面）
      if (key === 'up' && hit === null && this.dir.y > 0.5) {
        out[key] = Math.max(0.04 - this.origin.y, 0);
      } else {
        out[key] = hit;
      }
    }
    return out;
  }
}
