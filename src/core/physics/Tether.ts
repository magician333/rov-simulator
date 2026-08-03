/**
 * Tether：脐带缆（浮力线）模拟。
 * - 水面锚点固定（XZ = ROV 出生点上方，y=0），缆绳从锚点垂到 ROV。
 * - 张力：水平距离超过松弛长度后产生弹性拉力（弹簧 + 阻尼），指向锚点。
 * - 缠绕：累计缆绳方向角变化（ROV 绕锚点公转），每满 2π 记 1 圈；
 *   缠绕圈数使张力增强、并施加抵抗继续旋转的 yaw 阻尼（模拟缆绳绞紧）。
 */

import * as THREE from 'three';

export class Tether {
  enabled = true;
  /** 水面锚点（y≈0） */
  readonly anchor = new THREE.Vector3(0, 0.02, 0);
  /** 松弛长度（m）：超过才开始拉紧 */
  slackLength = 60;
  /** 弹簧刚度 N/m */
  stiffness = 42;
  /** 缠绕圈数（只增不减，reset 清空） */
  wrapTurns = 0;
  /** 当前张力 N */
  tension = 0;

  private wrapAngle = 0;
  private prevTheta: number | null = null;
  readonly forceOut = new THREE.Vector3();
  torqueY = 0;

  /** 重设锚点（场景切换 / 重置） */
  reset(anchor: THREE.Vector3, slack?: number): void {
    this.anchor.copy(anchor);
    this.anchor.y = 0.02;
    if (slack !== undefined) this.slackLength = slack;
    this.wrapAngle = 0;
    this.wrapTurns = 0;
    this.tension = 0;
    this.prevTheta = null;
    this.forceOut.set(0, 0, 0);
    this.torqueY = 0;
  }

  /** 每物理步：更新张力与缠绕，输出世界系拉力 + yaw 力矩 */
  step(pos: THREE.Vector3, omegaY: number): void {
    this.forceOut.set(0, 0, 0);
    this.torqueY = 0;
    this.tension = 0;
    if (!this.enabled) return;

    const dx = this.anchor.x - pos.x;
    const dz = this.anchor.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) {
      this.prevTheta = null;
      return;
    }

    // 缠绕累计（缆绳方向角最近路径变化）
    const theta = Math.atan2(dx, dz);
    if (this.prevTheta !== null) {
      let d = theta - this.prevTheta;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.wrapAngle += d;
    }
    this.prevTheta = theta;
    this.wrapTurns = Math.floor(Math.abs(this.wrapAngle) / (Math.PI * 2));

    if (dist > this.slackLength) {
      const stretch = dist - this.slackLength;
      this.tension = this.stiffness * stretch * (1 + 0.35 * this.wrapTurns);
      this.forceOut.set((dx / dist) * this.tension, 0, (dz / dist) * this.tension);
      // 缠绕后抵抗继续旋转（绞紧感）
      this.torqueY = -6 * this.wrapTurns * omegaY;
    } else if (this.wrapTurns > 0) {
      // 松弛但已缠绕：轻微旋转阻力
      this.torqueY = -3 * this.wrapTurns * omegaY;
    }
  }
}
