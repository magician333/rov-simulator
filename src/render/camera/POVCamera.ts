/**
 * POVCamera：第一视角（docs/05-视角HUD与声纳.md §1.3）。
 * 相机固定在 ROV 头部（povOffset 体坐标系），位置与朝向完全跟随 ROV。
 */

import * as THREE from 'three';

export class POVCamera {
  private readonly camPos = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private povOffset: [number, number, number],
  ) {}

  /** 每帧更新（世界系 ROV 位置 + 四元数） */
  update(rovPos: THREE.Vector3, rovQuat: THREE.Quaternion): void {
    this.camPos.set(this.povOffset[0], this.povOffset[1], this.povOffset[2]);
    this.camPos.applyQuaternion(rovQuat).add(rovPos);
    this.camera.position.copy(this.camPos);
    this.camera.quaternion.copy(rovQuat);
  }

  setPovOffset(offset: [number, number, number]): void {
    this.povOffset = offset;
  }

  getPovOffset(): [number, number, number] {
    return this.povOffset;
  }
}
