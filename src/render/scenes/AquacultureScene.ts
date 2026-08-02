/**
 * AquacultureScene：网箱养殖检测场景。
 * 方形网箱（立柱 + 浮圈 + 网衣），检查网衣破损区。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';

const CAGE = 8; // 网箱半宽
const CAGE_DEPTH = 6; // 网箱深度
const CAGE_TOP = -0.8; // 网箱顶部深度

class AquacultureSceneImpl implements SceneDefinition {
  readonly id = 'aquaculture';
  readonly name = '网箱检测';
  readonly description = '养殖网箱，检查网衣破损区';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 1, currentDirectionDeg: 0, turbulence: 0.05, visibility: 22, turbidity: 0.18 };
  readonly spawn = { position: [0, -1.2, 22] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    // 四根立柱
    { type: 'box' as const, position: new THREE.Vector3(CAGE, CAGE_TOP - CAGE_DEPTH / 2, CAGE), halfExtents: new THREE.Vector3(0.4, CAGE_DEPTH / 2, 0.4) },
    { type: 'box' as const, position: new THREE.Vector3(-CAGE, CAGE_TOP - CAGE_DEPTH / 2, CAGE), halfExtents: new THREE.Vector3(0.4, CAGE_DEPTH / 2, 0.4) },
    { type: 'box' as const, position: new THREE.Vector3(CAGE, CAGE_TOP - CAGE_DEPTH / 2, -CAGE), halfExtents: new THREE.Vector3(0.4, CAGE_DEPTH / 2, 0.4) },
    { type: 'box' as const, position: new THREE.Vector3(-CAGE, CAGE_TOP - CAGE_DEPTH / 2, -CAGE), halfExtents: new THREE.Vector3(0.4, CAGE_DEPTH / 2, 0.4) },
  ];
  readonly localFlowZones = [];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  private markerY = CAGE_TOP - CAGE_DEPTH / 2;

  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_aquaculture';
    const c = CAGE;

    // 四根立柱
    const poleMat = boxMaterial(0x2a6d8f, { roughness: 0.5, metalness: 0.3 });
    for (const [x, z] of [[c, c], [-c, c], [c, -c], [-c, -c]] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, CAGE_DEPTH, 8), poleMat);
      pole.position.set(x, CAGE_TOP - CAGE_DEPTH / 2, z);
      root.add(pole);
    }

    // 顶部浮圈（4 段浮筒）
    const buoyMat = boxMaterial(0xf2c94c, { roughness: 0.6 });
    const bLen = c * 2;
    const mkBuoy = (x: number, z: number, len: number, rotY: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.5), buoyMat);
      b.position.set(x, CAGE_TOP, z);
      b.rotation.y = rotY;
      root.add(b);
    };
    mkBuoy(0, c, bLen, 0);
    mkBuoy(0, -c, bLen, 0);
    mkBuoy(c, 0, bLen, Math.PI / 2);
    mkBuoy(-c, 0, bLen, Math.PI / 2);

    // 网衣（4 面半透明网格线）
    const netLineMat = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5 });
    for (const z of [c, -c]) {
      const geo = new THREE.BufferGeometry();
      const pts: number[] = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const y = CAGE_TOP - CAGE_DEPTH + (CAGE_DEPTH * i) / N;
        pts.push(-c, y, z, c, y, z);
        const x = -c + (2 * c * i) / N;
        pts.push(x, CAGE_TOP, z, x, CAGE_TOP - CAGE_DEPTH, z);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      root.add(new THREE.LineSegments(geo, netLineMat));
    }
    for (const x of [c, -c]) {
      const geo = new THREE.BufferGeometry();
      const pts: number[] = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const y = CAGE_TOP - CAGE_DEPTH + (CAGE_DEPTH * i) / N;
        pts.push(x, y, -c, x, y, c);
        const z = -c + (2 * c * i) / N;
        pts.push(x, CAGE_TOP, z, x, CAGE_TOP - CAGE_DEPTH, z);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      root.add(new THREE.LineSegments(geo, netLineMat));
    }
    // 底部网格
    const botGeo = new THREE.BufferGeometry();
    const botPts: number[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const x = -c + (2 * c * i) / N;
      botPts.push(x, CAGE_TOP - CAGE_DEPTH, -c, x, CAGE_TOP - CAGE_DEPTH, c);
      const z = -c + (2 * c * i) / N;
      botPts.push(-c, CAGE_TOP - CAGE_DEPTH, z, c, CAGE_TOP - CAGE_DEPTH, z);
    }
    botGeo.setAttribute('position', new THREE.Float32BufferAttribute(botPts, 3));
    root.add(new THREE.LineSegments(botGeo, netLineMat));

    // 目标：网衣破损区（一侧网面，加亮网格）
    const breakMat = new THREE.LineBasicMaterial({ color: 0xffb74d, transparent: true, opacity: 0.9 });
    const bGeo = new THREE.BufferGeometry();
    const bp: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const y = CAGE_TOP - CAGE_DEPTH + (CAGE_DEPTH * i) / 6;
      bp.push(-c + 0.6, y, c, c - 0.6, y, c);
    }
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    const breakNet = new THREE.LineSegments(bGeo, breakMat);
    root.add(breakNet);
    markTarget(breakNet, 'target_net_break', 4);

    const marker = createTargetMarker(4, 0xffd54f);
    marker.position.set(0, this.markerY, c + 1.2);
    root.add(marker);
    this.marker = marker;

    // 海草点缀
    addSeaweed(root, 12, -6, 14);
    addSeaweed(root, -12, 6, 12);

    this.root = root;
    world.add(root);
  }

  update(dt: number, time: number): void {
    if (this.marker) {
      this.marker.rotation.y += dt * 1.2;
      this.marker.position.y = this.markerY + Math.sin(time * 0.9) * 0.12;
    }
  }

  dispose(): void {
    if (this.root) {
      disposeObject(this.root);
      this.root.removeFromParent();
      this.root = null;
    }
  }
}

export const AquacultureScene: SceneDefinition = new AquacultureSceneImpl();
