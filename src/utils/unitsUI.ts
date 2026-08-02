/**
 * 单位制显示工具：公制 / 英制。
 * 速度统一用节（kn，国际海事惯例不转换）；深度/距离 m↔ft；温度 ℃↔℉。
 */

export type UnitSystem = 'metric' | 'imperial';

export const UNIT_MARKS = {
  metric: { depth: 'm', dist: 'm', temp: '℃' },
  imperial: { depth: 'ft', dist: 'ft', temp: '℉' },
} as const;

export function toFt(m: number): number {
  return m * 3.28084;
}

/** 深度显示值（m → ft 若英制） */
export function fmtDepth(m: number, units: UnitSystem): string {
  return units === 'imperial' ? toFt(m).toFixed(0) : m.toFixed(1);
}

/** 距离显示值 */
export function fmtDist(m: number, units: UnitSystem): string {
  return units === 'imperial' ? toFt(m).toFixed(0) : m.toFixed(1);
}

/** 温度显示值（℃ → ℉ 若英制） */
export function fmtTemp(c: number, units: UnitSystem): string {
  return units === 'imperial' ? (c * 9) / 5 + 32 + '' : c.toFixed(1);
}
