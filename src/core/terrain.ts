/**
 * 地形高度函数（渲染层与物理碰撞共用，保证一致）。
 * 海底：基准 -12m + fbm 起伏 ±2.2m。
 */

import { fbm3 } from '../utils/noise';

export const SEABED_BASE_Y = -12;
export const SEABED_AMP = 2.2;

/** 世界系 (x, z) 处的海底高度（y 值） */
export function seabedHeight(x: number, z: number): number {
  return SEABED_BASE_Y + fbm3(x * 0.02, z * 0.02, 3, 4) * SEABED_AMP;
}
