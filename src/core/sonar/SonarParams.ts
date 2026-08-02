/**
 * 声纳参数（docs/05-视角HUD与声纳.md §3）。
 * 含低频/高频预设（模拟真实 FLS 频率切换）。
 */

export type SonarFreqMode = 'low' | 'high';

export interface SonarParams {
  /** 量程（m） */
  rangeM: number;
  /** 扇面角（度） */
  sectorDeg: number;
  /** 波束数（射线数） */
  beamCount: number;
  /** 距离量化 bin 数 */
  rangeBins: number;
  /** 增益 0..1 */
  gain: number;
  /** 噪声 0..1 */
  noise: number;
  /** 刷新率（Hz） */
  updateHz: number;
  /** 垂直扇面总角（度），3 子射线对称分布 */
  verticalDeg: number;
}

/** 频率预设：低频 = 远程搜索（60m）；高频 = 近程高清作业（10m，看清目标轮廓） */
export const FREQ_PRESETS: Record<SonarFreqMode, Omit<SonarParams, 'gain' | 'noise'>> = {
  // 低频 = 远程搜索（120m、120°、垂直 ±10°）
  low: { rangeM: 120, sectorDeg: 120, beamCount: 80, rangeBins: 420, updateHz: 5, verticalDeg: 20 },
  // 高频 = 近程高清作业（40m、80°、垂直 ±6°）
  high: { rangeM: 40, sectorDeg: 80, beamCount: 240, rangeBins: 480, updateHz: 12, verticalDeg: 12 },
};

export const DEFAULT_SONAR_PARAMS: SonarParams = {
  ...FREQ_PRESETS.high, // 默认高频 40m 近程高清
  gain: 1.0,
  noise: 1, // 默认噪声 = 1
};

export const SONAR_RANGES: Record<keyof SonarParams, { min: number; max: number; step: number }> = {
  rangeM: { min: 5, max: 120, step: 1 },
  sectorDeg: { min: 40, max: 120, step: 10 },
  beamCount: { min: 40, max: 300, step: 10 },
  rangeBins: { min: 120, max: 600, step: 20 },
  gain: { min: 0.1, max: 1, step: 0.05 },
  noise: { min: 1, max: 2, step: 0.05 },
  updateHz: { min: 2, max: 15, step: 1 },
  verticalDeg: { min: 4, max: 40, step: 1 },
};
