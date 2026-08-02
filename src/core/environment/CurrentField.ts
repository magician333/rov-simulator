/**
 * CurrentField：水流场（docs/03-物理仿真.md §5）。
 * - 均匀基准流（流速/流向，UI 实时可调）
 * - 深度衰减（近底阻力）
 * - 湍流扰动（3D Value Noise，可复现）
 */

import * as THREE from 'three';
import type { EnvironmentState } from '../environment/EnvironmentState';
import { fbm3 } from '../../utils/noise';
import { deg2rad } from '../../utils/units';

/** 局部水流增强区（场景注册：桥墩涡流、坝前急流等） */
export interface LocalFlowZone {
  /** 世界系中心 */
  position: THREE.Vector3;
  /** 影响半径（m） */
  radius: number;
  /** 流速增量（m/s，可为负 = 反向） */
  strength: number;
  /** 方向（度，与基准流同约定：0=朝南 +Z） */
  directionDeg: number;
  /** 衰减指数（1=线性，2=高斯） */
  decay?: number;
}

export class CurrentField {
  /** 湍流扰动空间频率 */
  private static readonly TURB_FREQ = 0.12;
  private static readonly TURB_TIME_SCALE = 0.4;

  private zones: LocalFlowZone[] = [];

  constructor(private env: EnvironmentState) {}

  /** 注册局部流区（场景加载时） */
  addZone(zone: LocalFlowZone): void {
    this.zones.push(zone);
  }

  clearZones(): void {
    this.zones = [];
  }

  /** 世界系基准流速度向量（m/s），含深度衰减 */
  baseCurrent(pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const e = this.env.get();
    if (e.currentSpeed <= 0.001) return out.set(0, 0, 0);
    // 流向约定：0° = 朝南(+Z)、90° = 朝西(-X)、180° = 朝北(-Z)、270° = 朝东(+X)
    // （与文档 03 §5.1 一致：0=朝南；注意与航向 0=北相反）
    const dir = deg2rad(e.currentDirectionDeg);
    out.set(Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(e.currentSpeed);
    const depth = -pos.y;
    return out.multiplyScalar(THREE.MathUtils.clamp(1 - depth / 400, 0.3, 1));
  }

  /**
   * 世界系完整水流速度（基准流 × 深度衰减 + 湍流扰动）
   * @param pos 世界系位置
   * @param time 累计时间（秒）
   */
  velocityAt(pos: THREE.Vector3, time: number, out: THREE.Vector3): THREE.Vector3 {
    const e = this.env.get();
    // 乱流模式：流向拉满（≥359.9°）时模拟海洋乱流——方向随机摆动、强度脉动
    if (e.currentDirectionDeg >= 359.9 && e.currentSpeed > 0.001) {
      const swirl = fbm3(pos.x * 0.02, pos.z * 0.02, time * 0.35, 2);
      const ang = swirl * Math.PI * 2 + time * 0.6;
      const s = e.currentSpeed * (0.7 + 0.6 * Math.abs(fbm3(pos.x * 0.1, pos.z * 0.1, time * 0.5, 2)));
      return out.set(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(s);
    }
    this.baseCurrent(pos, out);

    // 局部流区叠加
    for (const z of this.zones) {
      const dist = pos.distanceTo(z.position);
      if (dist >= z.radius) continue;
      const t = 1 - dist / z.radius;
      const falloff = z.decay === 2 ? t * t : t;
      const rad = deg2rad(z.directionDeg);
      out.x += Math.sin(rad) * z.strength * falloff;
      out.z += Math.cos(rad) * z.strength * falloff;
    }

    if (e.turbulence > 0.001) {
      // 湍流扰动：低频噪声叠加在基流上（水平面为主，垂直弱）
      const nx = fbm3(pos.x * CurrentField.TURB_FREQ, pos.z * CurrentField.TURB_FREQ, time * CurrentField.TURB_TIME_SCALE, 3);
      const nz = fbm3(pos.x * CurrentField.TURB_FREQ + 100, pos.z * CurrentField.TURB_FREQ, time * CurrentField.TURB_TIME_SCALE + 50, 3);
      const ny = fbm3(pos.x * CurrentField.TURB_FREQ + 200, pos.z * CurrentField.TURB_FREQ, time * CurrentField.TURB_TIME_SCALE + 100, 2) * 0.3;
      const strength = e.turbulence * 0.6;
      out.x += nx * strength;
      out.y += ny * strength * 0.5;
      out.z += nz * strength;
    }
    return out;
  }
}
