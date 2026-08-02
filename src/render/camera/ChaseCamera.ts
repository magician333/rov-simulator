/**
 * ChaseCamera：第三视角（Blender 风格，docs/05-视角HUD与声纳.md §1.2）。
 * - 球坐标轨道围绕 ROV；默认从后上方观察
 * - 中键拖动：旋转视角（Blender MMB 习惯）
 * - 滚轮：缩放（radius 2..30m）
 * - Shift+中键拖动：平移轨道中心（pan）
 * - 相机跟随 ROV 偏航（保持始终从后方观察），中键旋转是相对偏移角
 */

import * as THREE from 'three';

const MIN_RADIUS = 2;
const MAX_RADIUS = 30;
const MIN_POLAR = 0.1;
const MAX_POLAR = Math.PI - 0.1;

export class ChaseCamera {
  /** 轨道半径（m） */
  radius = 6.5;
  /** 与 ROV 偏航的偏移方位角（rad，0 = 正后方） */
  azimuthOffset = 0;
  /** 极角（与竖直 Y 轴的夹角；小 = 俯视） */
  polar = 0.38;
  /** 轨道中心（跟随 ROV 位置，平滑） */
  readonly target = new THREE.Vector3(0, -8, 0);

  private readonly camPos = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** 中键拖动：旋转视角（dx/dy 为像素增量） */
  rotate(dxPx: number, dyPx: number): void {
    this.azimuthOffset -= dxPx * 0.008;
    this.polar = THREE.MathUtils.clamp(this.polar - dyPx * 0.008, MIN_POLAR, MAX_POLAR);
  }

  /** 滚轮缩放：deltaY > 0 缩小 */
  zoom(deltaY: number): void {
    const factor = 1 + deltaY * 0.0012;
    this.radius = THREE.MathUtils.clamp(this.radius * factor, MIN_RADIUS, MAX_RADIUS);
  }

  private lastPanAt = 0;

  /** Shift+中键平移轨道中心（dx/dy 像素） */
  pan(dxPx: number, dyPx: number): void {
    this.lastPanAt = performance.now();
    // 世界系水平右方向（与用户方位角垂直）
    const az = this.azimuthOffset;
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    // 上方向近似世界 Y（限制在水平面 pan）
    const k = this.radius * 0.0016;
    this.target.addScaledVector(right, -dxPx * k);
    this.target.y += dyPx * k;
  }

  /** 每帧更新（仅中心点跟随 ROV 位置；相机方位完全由用户中键旋转控制，不随 ROV 姿态/yaw 变化） */
  update(rovPos: THREE.Vector3, rovYawRad: number, dt: number): void {
    void rovYawRad; // 相机不随 ROV 姿态/偏航变化（仅中心点跟随）
    // 平滑跟随 ROV 位置：水平快、竖直慢（俯仰/升降引起的纵向位移不立即拉动视角）
    // 用户刚 pan 后 1s 内保持手动偏移（不拉回），但相机位置继续基于当前 target 更新
    if (performance.now() - this.lastPanAt < 1000) {
      // 保持 target 偏移（竖直仍轻微跟随，避免 ROV 升降后目标脱离）
      this.target.y += (rovPos.y - this.target.y) * (1 - Math.exp(-dt * 2));
    } else {
      const smooth = 1 - Math.exp(-dt * 5);
      const smoothY = 1 - Math.exp(-dt * 1.6);
      this.target.x += (rovPos.x - this.target.x) * smooth;
      this.target.y += (rovPos.y - this.target.y) * smoothY;
      this.target.z += (rovPos.z - this.target.z) * smooth;
    }

    // 相机方位 = 用户控制的角度（不叠加 ROV 偏航，避免翻转时万向锁跳变）
    const az = this.azimuthOffset;
    const sp = Math.sin(this.polar);
    const cp = Math.cos(this.polar);
    this.camPos.set(
      this.target.x + this.radius * sp * Math.sin(az),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.cos(az),
    );
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.target);
  }

  /** 重置轨道（换场景/重置时） */
  reset(target: THREE.Vector3, yawRad: number): void {
    this.target.copy(target);
    this.azimuthOffset = 0;
    this.radius = 6.5;
    this.polar = 0.38;
    this.update(target, yawRad, 1);
  }
}
