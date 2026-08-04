/**
 * ROV 机型配置类型与默认配置。
 * 约定（见 docs/03-物理仿真.md）：
 * - 体坐标系：+X 右侧、+Y 上、+Z 后方；模型前向 = -Z。
 * - 姿态欧拉角：rotation.order = 'YXZ'；x=pitch, y=yaw, z=roll。
 */

export type ThrustAxis = 'surge' | 'sway' | 'heave' | 'roll' | 'pitch' | 'yaw';

export interface ThrusterSpec {
  id: string;
  /** 安装位置（体坐标系，米） */
  position: [number, number, number];
  /** 推水方向单位向量（体坐标系）：产生的力 = -dir * u，u>0 为正推力 */
  direction: [number, number, number];
  /** 最大推力 N */
  maxForce: number;
  /** 最小推力（负 = 可反转）N */
  minForce: number;
  /** 视觉导管直径（渲染用，米） */
  ductRadius: number;
}

export interface LightSpec {
  id: string;
  /** 安装位置（体坐标系，米） */
  position: [number, number, number];
  /** 相对强度 */
  intensity: number;
  /** 有效射程 m */
  range: number;
  /** 光束角 rad */
  angle: number;
  /** 0xRRGGBB */
  color: number;
}

export type ROVModelSpec =
  | { type: 'generated' }
  | {
      type: 'gltf';
      url: string;
      /** 可选缩放（默认 1）；数组为逐轴缩放 */
      scale?: number | [number, number, number];
      /** 可选欧拉旋转（rad） */
      rotation?: [number, number, number];
    };

export interface ROVConfig {
  id: string;
  name: string;
  description: string;
  model: ROVModelSpec;
  /** 代码生成模型风格（gltf 机型忽略） */
  visualVariant?: 'standard' | 'm2';
  /** 转动响应缩放（1=默认；如 M2S 俯仰/横滚 ×2） */
  torqueScale?: { yaw?: number; pitch?: number; roll?: number };
  /** 姿态角限制（度）：缺省不限制；如通用 ROV 俯仰 ±60°、横滚 ±45° */
  attitudeLimits?: { pitchDeg?: number; rollDeg?: number };
  /** 机型硬航速上限（节）：UI 限速滑块无法超过（如 M2S 恒 ≤3 节） */
  hardMaxSpeedKnots?: number;
  /** 最大前进航速（节） */
  maxSpeedKnots: number;
  /** 最大侧向航速（节，可选；缺省 = maxSpeedKnots） */
  maxSwaySpeedKnots?: number;
  /** 最大垂直航速（节，可选；缺省不限速） */
  maxHeaveSpeedKnots?: number;
  massKg: number;
  /** 排水体积 m³ */
  displacementM3: number;
  /** 外形尺寸（米）：length 沿 Z 轴，width 沿 X 轴，height 沿 Y 轴 */
  dimensions: { length: number; width: number; height: number };
  /** 重心偏移（体坐标系） */
  cogOffset: [number, number, number];
  /** 浮心偏移（体坐标系） */
  cobOffset: [number, number, number];
  /** 阻尼系数近似 Cd*A（平动，体轴）与角阻尼（体轴） */
  dragCoeffs: {
    lin: [number, number, number];
    /** 二次角阻尼：τ = -D·ω|ω| */
    ang: [number, number, number];
    /** 线性角阻尼：τ = -D1·ω（低角速度时快速停转） */
    angLin: [number, number, number];
  };
  thrusters: ThrusterSpec[];
  /** 可控制自由度白名单 */
  controllableAxes: ThrustAxis[];
  lights: LightSpec[];
  /** 第一视角相机位置（体坐标系） */
  povOffset: [number, number, number];
  /** 推进器导管直径（视觉统一用） */
  thrusterDuctRadius: number;
}

const DEG = Math.PI / 180;

/**
 * 第一版内置机型：通用 6 自由度 ROV。
 * 推进器布局（8 推进器）：
 * - 水平层 4 个 X 形矢量推进器（四角，水平 45°）→ 合成 surge/sway/yaw
 * - 垂直层 4 个竖直推进器（四角，向下推水）→ 合成 heave/roll/pitch
 */
export const DEFAULT_ROV_CONFIG: ROVConfig = {
  id: 'rov_6dof_standard',
  name: '通用 6 自由度 ROV',
  // 姿态限制：俯仰 ±60°、横滚 ±45°
  attitudeLimits: { pitchDeg: 60, rollDeg: 45 },
  description: '标准 8 推进器矢量布局，可独立控制全部六个自由度。',
  model: { type: 'generated' },
  maxSpeedKnots: 3,
  massKg: 120,
  displacementM3: 120.6 / 1025, // 微正浮力 ≈ 0.5%（空载上浮速度较低，符合真实 ROV）
  dimensions: { length: 1.2, width: 0.8, height: 0.7 },
  cogOffset: [0, 0, 0],
  // cobOffset = [0,0,0]：浮心与重心重合，无自动回正力矩（学员通过 R/F、方向键保持姿态）
  cobOffset: [0, 0, 0],
  // 标定（docs/03 §7）：
  // surge 满推 F≈4*0.707*300=848N，稳定航速由 ROVController 动态标定（≈4.5kn）
  // ang 二次角阻尼；angLin 线性角阻尼（低角速度时快速停转，姿态保持更稳）
  dragCoeffs: { lin: [0.25, 0.32, 0.28], ang: [140, 110, 120], angLin: [7, 5, 6] },
  thrusterDuctRadius: 0.11,
  thrusters: [
    // 水平层（z=0 平面，X 形对角矢量）
    {
      id: 'thruster_fr', position: [0.42, 0, -0.38], direction: [0.7071, 0, 0.7071],
      maxForce: 300, minForce: -300, ductRadius: 0.11,
    },
    {
      id: 'thruster_fl', position: [-0.42, 0, -0.38], direction: [0.7071, 0, -0.7071],
      maxForce: 300, minForce: -300, ductRadius: 0.11,
    },
    {
      id: 'thruster_br', position: [0.42, 0, 0.38], direction: [-0.7071, 0, 0.7071],
      maxForce: 300, minForce: -300, ductRadius: 0.11,
    },
    {
      id: 'thruster_bl', position: [-0.42, 0, 0.38], direction: [-0.7071, 0, -0.7071],
      maxForce: 300, minForce: -300, ductRadius: 0.11,
    },
    // 垂直层（四角，向下推水 → 上浮）
    {
      id: 'thruster_vfr', position: [0.42, 0.12, -0.38], direction: [0, -1, 0],
      maxForce: 280, minForce: -280, ductRadius: 0.1,
    },
    {
      id: 'thruster_vfl', position: [-0.42, 0.12, -0.38], direction: [0, -1, 0],
      maxForce: 280, minForce: -280, ductRadius: 0.1,
    },
    {
      id: 'thruster_vbr', position: [0.42, 0.12, 0.38], direction: [0, -1, 0],
      maxForce: 280, minForce: -280, ductRadius: 0.1,
    },
    {
      id: 'thruster_vbl', position: [-0.42, 0.12, 0.38], direction: [0, -1, 0],
      maxForce: 280, minForce: -280, ductRadius: 0.1,
    },
  ],
  controllableAxes: ['surge', 'sway', 'heave', 'roll', 'pitch', 'yaw'],
  lights: [
    {
      id: 'main_light', position: [0, 0.18, -0.52],
      intensity: 6, range: 60, angle: 45 * DEG, color: 0xfff8e8,
    },
  ],
  povOffset: [0, 0.18, -0.55],
};

/**
 * CHASING M2（参考 M2 外观：紧凑箱式、黄色浮力块）：
 * - 8 推进器（4 水平 X 形 + 4 垂直），六自由度
 * - 最大航速 3 节
 * - 双补光灯 + 相机 + 机械臂（夹取功能）
 * 模型：代码生成（visualVariant 'm2'）
 */
export const CHASING_M2_CONFIG: ROVConfig = {
  id: 'chasing_m2s',
  name: 'CHASING M2 S',
  description: '紧凑作业型 ROV（M2 风格），8 推进器六自由度，带机械臂',
  model: { type: 'generated' },
  visualVariant: 'm2',
  maxSpeedKnots: 3,
  // 机型硬限速：无论滑块调到多少，M2S 最大航速恒为 3 节
  hardMaxSpeedKnots: 3,
  // 姿态限制 ±75°：保持翻转灵活性，同时避免欧拉分解失真（显示/世界模式/一键水平依赖 YXZ 欧拉）
  attitudeLimits: { pitchDeg: 75, rollDeg: 75 },
  // 俯仰/横滚灵活性（转动响应 ×16）
  torqueScale: { yaw: 1, pitch: 32, roll: 32 },
  maxSwaySpeedKnots: 1.5,
  maxHeaveSpeedKnots: 1.5,
  massKg: 30,
  displacementM3: 30.09 / 1025, // 微正浮力 ≈ 0.3%（质量小 → 惯性小，响应轻盈）
  dimensions: { length: 0.72, width: 0.48, height: 0.4 },
  cogOffset: [0, 0, 0],
  cobOffset: [0, 0, 0],
  dragCoeffs: { lin: [0.17, 0.22, 0.18], ang: [140, 110, 120], angLin: [7, 5, 6] }, // 旋转灵活性与通用 ROV 保持一致
  thrusterDuctRadius: 0.09,
  thrusters: [
    // 前组 4 台（z=-0.34，全部矢量斜置：同时提供 surge/sway/heave/roll/pitch/yaw）
    { id: 'thruster_f_r1', position: [0.34, 0.12, -0.34], direction: [0.5, -0.7, 0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    { id: 'thruster_f_l1', position: [-0.34, 0.12, -0.34], direction: [-0.5, -0.7, 0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    { id: 'thruster_f_r2', position: [0.34, -0.12, -0.34], direction: [0.5, 0.7, 0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    { id: 'thruster_f_l2', position: [-0.34, -0.12, -0.34], direction: [-0.5, 0.7, 0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    // 后组 4 台（z=0.34，镜像）
    { id: 'thruster_b_r1', position: [0.34, 0.12, 0.34], direction: [0.5, -0.7, -0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    { id: 'thruster_b_l1', position: [-0.34, 0.12, 0.34], direction: [-0.5, -0.7, -0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    { id: 'thruster_b_r2', position: [0.34, -0.12, 0.34], direction: [0.5, 0.7, -0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
    { id: 'thruster_b_l2', position: [-0.34, -0.12, 0.34], direction: [-0.5, 0.7, -0.5], maxForce: 270, minForce: -270, ductRadius: 0.08 },
  ],
  controllableAxes: ['surge', 'sway', 'heave', 'roll', 'pitch', 'yaw'],
  lights: [
    { id: 'left', position: [-0.18, 0.06, -0.3], intensity: 6, range: 50, angle: 45 * DEG, color: 0xfff8e8 },
    { id: 'right', position: [0.18, 0.06, -0.3], intensity: 6, range: 50, angle: 45 * DEG, color: 0xfff8e8 },
  ],
  povOffset: [0, 0.08, -0.32],
};
