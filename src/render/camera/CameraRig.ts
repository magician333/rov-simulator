/**
 * CameraRig：三种视角管理（docs/05-视角HUD与声纳.md §1）。
 * - chase：第三视角（Blender 风格中键操作）
 * - pov：第一视角（随 ROV 位姿）
 * - sonar：声纳视角（M4 实现相机逻辑；当前保持 chase 相机 + UI 覆盖层）
 * 鼠标交互仅作用于 chase 模式。
 */

import * as THREE from 'three';
import type { ROVSnapshot } from '../../core/rov/ROVState';
import { ChaseCamera } from './ChaseCamera';
import { POVCamera } from './POVCamera';
import { deg2rad } from '../../utils/units';

export type ViewMode = 'chase' | 'pov';

export class CameraRig {
  mode: ViewMode = 'chase';
  readonly chase: ChaseCamera;
  readonly pov: POVCamera;

  private readonly rovPos = new THREE.Vector3();
  private readonly rovQuat = new THREE.Quaternion();
  private drag: { mode: 'orbit' | 'pan'; lastX: number; lastY: number } | null = null;

  constructor(camera: THREE.PerspectiveCamera, povOffset: [number, number, number]) {
    this.chase = new ChaseCamera(camera);
    this.pov = new POVCamera(camera, povOffset);
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.drag = null;
  }

  /** 每帧更新活动相机 */
  update(snapshot: ROVSnapshot, dt: number): void {
    this.rovPos.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    this.rovQuat.set(snapshot.quaternion.x, snapshot.quaternion.y, snapshot.quaternion.z, snapshot.quaternion.w);

    switch (this.mode) {
      case 'chase':
        this.chase.update(this.rovPos, deg2rad(snapshot.euler.yaw), dt);
        break;
      case 'pov':
        this.pov.update(this.rovPos, this.rovQuat);
        break;
    }
  }

  // ---- 鼠标交互（仅 chase 模式）----

  onPointerDown(x: number, y: number, button: number, shiftKey: boolean): void {
    if (this.mode !== 'chase') return;
    if (button === 1) {
      // 中键：Shift = 平移，否则旋转
      this.drag = { mode: shiftKey ? 'pan' : 'orbit', lastX: x, lastY: y };
    }
  }

  onPointerMove(x: number, y: number, buttons: number): void {
    if (!this.drag || this.mode !== 'chase') return;
    if (!(buttons & 4)) {
      this.drag = null;
      return;
    }
    const dx = x - this.drag.lastX;
    const dy = y - this.drag.lastY;
    this.drag.lastX = x;
    this.drag.lastY = y;
    if (this.drag.mode === 'orbit') this.chase.rotate(dx, dy);
    else this.chase.pan(dx, dy);
  }

  onPointerUp(): void {
    this.drag = null;
  }

  onWheel(deltaY: number): void {
    if (this.mode !== 'chase') return;
    this.chase.zoom(deltaY);
  }
}
