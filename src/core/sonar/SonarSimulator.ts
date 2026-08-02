/**
 * SonarSimulator：多波束扇面声纳成像（docs/05-视角HUD与声纳.md §3）。
 * 每条波束多条回波（物体前缘/后缘 + 海底回波段）写入强度图，
 * 显示层再做点阵化与调色（真实 FLS 散点质感）。
 */

import type { SonarParams } from './SonarParams';
import { DEFAULT_SONAR_PARAMS } from './SonarParams';

export interface SonarEnv {
  /** 浊度 0..1（影响衰减） */
  turbidity: number;
  /** 能见度 m（影响衰减） */
  visibility: number;
}

/** 单条回波：距离 + 强度（多回波构成物体轮廓） */
export interface SonarBeamHit {
  distance: number;
  strength: number;
}

export class SonarSimulator {
  private _image: Uint8ClampedArray;
  private params: SonarParams;

  constructor(params: Partial<SonarParams> = {}) {
    this.params = { ...DEFAULT_SONAR_PARAMS, ...params };
    this._image = new Uint8ClampedArray(this.params.beamCount * this.params.rangeBins);
  }

  get image(): Uint8ClampedArray {
    return this._image;
  }

  getParams(): Readonly<SonarParams> {
    return this.params;
  }

  updateParams(patch: Partial<SonarParams>): void {
    const next = { ...this.params, ...patch };
    const resize = next.beamCount !== this.params.beamCount || next.rangeBins !== this.params.rangeBins;
    this.params = next;
    if (resize) this._image = new Uint8ClampedArray(this.params.beamCount * this.params.rangeBins);
  }

  /**
   * 生成声纳图像（每条波束含多条回波 → 物体轮廓）。
   * @param beams 每条波束的回波列表（SonarSampler 采样）
   * @param env 环境（浊度/能见度）
   */
  /** 全量生成（兼容旧调用） */
  generate(beams: SonarBeamHit[][], env: SonarEnv): void {
    this.renderFrame(beams, 0, env);
  }

  /**
   * 分帧渲染：只刷新指定起始波束起的列（其余列保留旧数据，滚动平滑 + 省 CPU）。
   * @param beams 该帧波束回波（长度 = 本次写入波束数）
   * @param startBeam 起始波束列
   * @param env 环境
   */
  renderFrame(beams: SonarBeamHit[][], startBeam: number, env: SonarEnv): void {
    const { beamCount, rangeBins, rangeM, gain, noise } = this.params;
    const count = Math.min(beams.length, beamCount - startBeam);
    if (count <= 0) return;

    // 衰减系数
    const att = 0.03 + env.turbidity * 0.24 + Math.max(0, 1 / Math.max(1, env.visibility)) * 0.18;
    const noiseFloor = 12 + noise * 38;
    const rngBase = 0;

    // 1) 刷新这些列的稀疏底噪 + 远处散射渐弱
    for (let b = 0; b < count; b++) {
      const col = startBeam + b;
      for (let r = 0; r < rangeBins; r++) {
        const idx = col * rangeBins + r;
        const h = Math.sin(rngBase + idx * 12.9898) * 43758.5453;
        const d = (r / rangeBins) * rangeM;
        this._image[idx] = noiseFloor * (0.5 + 0.5 * (h - Math.floor(h))) * (0.45 + 0.55 * Math.exp(-d / rangeM));
      }
    }

    // 2) 回波写入
    for (let b = 0; b < count; b++) {
      const beam = beams[b];
      const col = startBeam + b;
      if (!beam) continue;
      for (const hit of beam) {
        if (hit.distance > rangeM) continue;
        const bin = Math.min(rangeBins - 1, Math.round((hit.distance / rangeM) * rangeBins));
        const base = col * rangeBins + bin;
        const raw = gain * Math.exp(-att * hit.distance) * hit.strength;
        const echo = Math.pow(Math.min(1, raw * 2.5), 0.32);

        for (let k = -2; k <= 2; k++) {
          const bi = bin + k;
          if (bi < 0 || bi >= rangeBins) continue;
          const w = k === 0 ? 1 : 0.6;
          this._image[base + k] = Math.min(255, this._image[base + k] + echo * 255 * w);
        }
        for (const db of [-1, 1]) {
          const nb = col + db;
          if (nb < 0 || nb >= beamCount) continue;
          this._image[nb * rangeBins + bin] = Math.min(255, this._image[nb * rangeBins + bin] + echo * 255 * 0.5);
        }
        for (let k = 3; k <= 6; k++) {
          const tail = echo * 255 * Math.pow(0.55, k - 2);
          if (base + k < col * rangeBins + rangeBins) this._image[base + k] = Math.min(255, this._image[base + k] + tail);
          if (base - k >= col * rangeBins) this._image[base - k] = Math.min(255, this._image[base - k] + tail * 0.5);
        }
      }
    }
  }
}
