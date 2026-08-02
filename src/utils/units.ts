/** 单位换算工具（docs/GLOSSARY.md） */

export const KNOT_TO_MS = 0.514444;
export const MS_TO_KNOT = 1 / KNOT_TO_MS;
export const SEAWATER_DENSITY = 1025; // kg/m³
export const GRAVITY = 9.81; // m/s²

export function kn2ms(kn: number): number {
  return kn * KNOT_TO_MS;
}

export function ms2kn(ms: number): number {
  return ms * MS_TO_KNOT;
}

export function rad2deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 归一化到 [0, 360) */
export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 深度（米） = -worldY（Three.js Y 向上） */
export function worldYToDepth(y: number): number {
  return -y;
}
