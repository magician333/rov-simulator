/**
 * ROV 状态快照：渲染层与 UI 的唯一读入口。
 * 由 SimulationEngine 每帧生成（M2 由物理引擎驱动；M1 为静态快照）。
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ROVSnapshot {
  /** 世界系位置（米，Three.js Y-up） */
  position: Vec3Like;
  /** 姿态四元数 */
  quaternion: { x: number; y: number; z: number; w: number };
  /** 欧拉角（rad，YXZ 约定：x=pitch, y=yaw, z=roll） */
  euler: { roll: number; pitch: number; yaw: number };
  /** 世界系线速度 m/s */
  velocityWorld: Vec3Like;
  /** 机身速度（节） */
  speedKnots: number;
  /** 深度（正 = 水深，米） */
  depthMeters: number;
  /** 航向 0-360° */
  headingDeg: number;
  /** 各推进器归一化指令 -1..1 */
  thrusterCommands: number[];
  /** 补光灯开关 */
  lightsOn: boolean;
  /** 一键水平进行中 */
  attitudeHoldActive: boolean;
}

export interface DistanceReadings {
  /** 前/后/左/右/上/下 最近距离（米），未命中（超出量程）为 null */
  fwd: number | null;
  back: number | null;
  left: number | null;
  right: number | null;
  up: number | null;
  down: number | null;
}

export interface HudSnapshot {
  speedKnots: number;
  depthMeters: number;
  headingDeg: number;
  /** 度 */
  pitchDeg: number;
  /** 度 */
  rollDeg: number;
  /** 摄氏度 */
  temperatureC: number;
  /** 供迷你姿态模型使用（四元数） */
  attitude: ROVSnapshot['quaternion'];
  /** 脐带缆缠绕圈数（0 = 未缠绕） */
  tetherWrapTurns: number;
  /** 脐带缆张力 N */
  tetherTension: number;
  /** POV 定距声纳（6 向测距，5Hz 更新） */
  distanceSonar?: DistanceReadings;
}
