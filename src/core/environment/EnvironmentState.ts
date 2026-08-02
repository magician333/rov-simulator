/**
 * 环境参数（需求 R1）：水流、光线、温度、能见度等，训练中实时可调。
 * 参数值被物理模块（水流拖曳/扰动）与渲染模块（雾/光/粒子）共同消费。
 */

export type EnvModel = 'sea' | 'river' | 'custom';

export interface EnvironmentParams {
  /** 环境模式：海况 / 河流 / 自定义 */
  envModel: EnvModel;
  /** 海况等级 0-4（0 静水，4 强流） */
  seaState: number;
  /** 河流流速（节）0-4 */
  riverKnots: number;
  /** 流速 m/s，范围 [0, 3]（海况/河流模式由换算得出） */
  currentSpeed: number;
  /** 流向（来流方向，度）：0=北(-Z)、90=东(+X)、180=南(+Z)、270=西(-X) */
  currentDirectionDeg: number;
  /** 湍流强度 0..1 */
  turbulence: number;
  /** 能见度 m，范围 [1, 60] */
  visibility: number;
  /** 水温 ℃，范围 [-2, 30] */
  temperatureC: number;
  /** 浊度 0..1 */
  turbidity: number;
  /** 水面光照强度 0..1 */
  sunlight: number;
  /** 光照闪烁强度 0..1 */
  lightFlicker: number;
}

export const DEFAULT_ENV_PARAMS: EnvironmentParams = {
  envModel: 'custom',
  seaState: 0,
  riverKnots: 0,
  currentSpeed: 0,
  currentDirectionDeg: 0,
  turbulence: 0, // 默认静水（湍流由学员自行调节）
  visibility: 25,
  temperatureC: 8,
  turbidity: 0.15,
  sunlight: 0.8,
  lightFlicker: 0.2,
};

/** 海况等级 → 基准流速(m/s) / 湍流 */
export const SEA_STATES: { speed: number; turb: number }[] = [
  { speed: 0, turb: 0 }, // 0 级：静水
  { speed: 0.3, turb: 0.05 }, // 1 级：微流
  { speed: 0.6, turb: 0.1 }, // 2 级：中流
  { speed: 1.0, turb: 0.2 }, // 3 级：较强流
  { speed: 1.6, turb: 0.35 }, // 4 级：强流
];

export const ENV_RANGES: Record<keyof EnvironmentParams, { min: number; max: number; step: number }> = {
  envModel: { min: 0, max: 0, step: 1 },
  seaState: { min: 0, max: 4, step: 1 },
  riverKnots: { min: 0, max: 4, step: 0.1 },
  currentSpeed: { min: 0, max: 3, step: 0.05 },
  currentDirectionDeg: { min: 0, max: 360, step: 1 },
  turbulence: { min: 0, max: 1, step: 0.01 },
  visibility: { min: 1, max: 60, step: 0.5 },
  temperatureC: { min: -2, max: 30, step: 0.5 },
  turbidity: { min: 0, max: 1, step: 0.01 },
  sunlight: { min: 0, max: 1, step: 0.01 },
  lightFlicker: { min: 0, max: 1, step: 0.01 },
};

/** 环境状态：持有当前参数，物理/渲染模块从此读取。 */
export class EnvironmentState {
  private params: EnvironmentParams = { ...DEFAULT_ENV_PARAMS };

  get(): Readonly<EnvironmentParams> {
    return this.params;
  }

  /** 应用参数（UI 实时调节入口）：clamp 后写入，并按模式换算流速/湍流。 */
  apply(patch: Partial<EnvironmentParams>): void {
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'envModel') {
        this.params.envModel = value as EnvModel;
        continue;
      }
      const k = key as keyof EnvironmentParams;
      if (!(k in ENV_RANGES)) continue;
      const { min, max } = ENV_RANGES[k];
      (this.params as unknown as Record<string, unknown>)[k] = Math.min(max, Math.max(min, Number(value)));
    }
    this.recomputeFlow();
  }

  /** 海况/河流模式换算：由等级/节数推导基准流速与湍流（自定义模式直接用滑杆值） */
  private recomputeFlow(): void {
    const p = this.params;
    if (p.envModel === 'sea') {
      const sea = SEA_STATES[Math.round(p.seaState)] ?? SEA_STATES[0];
      p.currentSpeed = sea.speed;
      p.turbulence = Math.max(p.turbulence, sea.turb);
    } else if (p.envModel === 'river') {
      p.currentSpeed = p.riverKnots * 0.514444;
      p.turbulence = Math.max(p.turbulence, 0.06 + p.riverKnots * 0.04);
    }
    // custom：保持滑杆值
  }

  /** 重置为场景默认值 */
  reset(defaults?: Partial<EnvironmentParams>): void {
    this.params = { ...DEFAULT_ENV_PARAMS, ...(defaults ?? {}) };
    this.recomputeFlow();
  }
}
