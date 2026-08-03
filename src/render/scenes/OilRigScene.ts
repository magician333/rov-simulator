/**
 * OilRigScene：离岸油气平台检测场景。
 * 四腿钢制平台 + 水下管汇架 + 阳极块；检查平台腿/管汇节点。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';
import type { QualityLevel } from '../environment/UnderwaterEffects';
import { seabedHeight } from '../../core/terrain';

class OilRigSceneImpl implements SceneDefinition {
  readonly id = 'oilrig';
  readonly name = '离岸油气平台';
  readonly description = '四腿钢制平台，检查平台腿与管汇节点';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 3, currentDirectionDeg: 0, turbulence: 0.2, visibility: 22, turbidity: 0.2 };
  readonly spawn = { position: [0, -1.2, 45] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    // 四根斜腿（box 近似圆柱，从海底到水面）
    { type: 'box' as const, position: new THREE.Vector3(-8, -5, -4), halfExtents: new THREE.Vector3(1.2, 7.5, 1.2) },
    { type: 'box' as const, position: new THREE.Vector3(8, -5, -4), halfExtents: new THREE.Vector3(1.2, 7.5, 1.2) },
    { type: 'box' as const, position: new THREE.Vector3(-8, -5, 6), halfExtents: new THREE.Vector3(1.2, 7.5, 1.2) },
    { type: 'box' as const, position: new THREE.Vector3(8, -5, 6), halfExtents: new THREE.Vector3(1.2, 7.5, 1.2) },
    // 管汇架
    { type: 'box' as const, position: new THREE.Vector3(0, -10.5, 0), halfExtents: new THREE.Vector3(5, 1.2, 3) },
  ];
  readonly localFlowZones = [
    { position: new THREE.Vector3(0, -6, 1), radius: 14, strength: 0.5, directionDeg: 90, decay: 2 },
  ];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  private markerY = -9;

  build(world: THREE.Scene, quality: QualityLevel = 'high'): void {
    const root = new THREE.Group();
    root.name = 'scene_oilrig';

    const legMat = boxMaterial(0x6a4a2f, { roughness: 0.85, metalness: 0.5, texture: 'rusty' });
    // 四根斜腿（从平台腿顶部到海底）
    for (const [x, z] of [[-8, -4], [8, -4], [-8, 6], [8, 6]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 20, 24), legMat);
      leg.position.set(x, -1.5, z);
      root.add(leg);
    }

    // 腿与斜撑连接节点（K 型球节点，真实导管架细节）
    if (quality !== 'low') {
      const nodeMat = boxMaterial(0x6a4a2f, { roughness: 0.8, metalness: 0.5, texture: 'rusty' });
      for (let i = 0; i < 3; i++) {
        const y = -4 - i * 3;
        for (const [x, z] of [[-8, -4], [8, -4], [-8, 6], [8, 6]] as const) {
          const node = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 24), nodeMat);
          node.position.set(x, y, z);
          root.add(node);
        }
      }
    }

    // 交叉支撑（X 型）
    const braceMat = boxMaterial(0x5a4030, { roughness: 0.8, metalness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const y = -4 - i * 3;
      for (const [a, b] of [[[-8, -4], [8, 6]], [[8, -4], [-8, 6]]] as const) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.35, 0.35), braceMat);
        brace.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
        brace.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
        root.add(brace);
      }
    }

    // 底部基座桩 + 甲板下横梁（中/高画质）
    if (quality !== 'low') {
      const pileMat = boxMaterial(0x3f3a35, { roughness: 0.9, metalness: 0.5 });
      for (const [x, z] of [[-8, -4], [8, -4], [-8, 6], [8, 6]] as const) {
        const pile = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), pileMat);
        pile.position.set(x, -12.6, z);
        root.add(pile);
      }
      // 甲板下方交叉主梁
      const beamMat = boxMaterial(0x5a4030, { roughness: 0.8, metalness: 0.4 });
      for (const [a, b] of [[[-8, -4], [8, 6]], [[8, -4], [-8, 6]]] as const) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 0.6), beamMat);
        beam.position.set((a[0] + b[0]) / 2, 0.2, (a[1] + b[1]) / 2);
        beam.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
        root.add(beam);
      }
    }

    // 管汇管线 + 防沉板（中/高画质）
    if (quality !== 'low') {
      const pipeMat2 = boxMaterial(0x8a2f2f, { roughness: 0.7, metalness: 0.45 });
      // 管汇架上多根管线
      for (let i = 0; i < 4; i++) {
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 11, 24), pipeMat2);
        line.rotation.z = Math.PI / 2;
        line.position.set(-2 + i * 1.4, -9.6 + (i % 2) * 0.8, 0);
        root.add(line);
      }
      // 立管（管汇架角落上升）
      for (const [x, z] of [[-4, -2], [4, 2]] as const) {
        const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 24), pipeMat2);
        riser.position.set(x, -7, z);
        root.add(riser);
      }
      // 防沉板（海底格栅）
      const plateMat = boxMaterial(0x3f3a35, { roughness: 0.9, metalness: 0.5 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 9), plateMat);
      plate.position.set(0, seabedHeight(0, 0) + 0.15, 1);
      root.add(plate);
    }

    // 水下管汇架（目标区域）
    const manifoldMat = boxMaterial(0x7a2f2f, { roughness: 0.75, metalness: 0.5, texture: 'rusty' });
    const manifold = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 6), manifoldMat);
    manifold.position.set(0, -10.5, 0);
    root.add(manifold);
    // 管汇上的管线
    for (let i = 0; i < 4; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 10, 24), boxMaterial(0x8a8a8f, { roughness: 0.5, metalness: 0.6 }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, -10.5 + 0.5 + i * 0.5, -1.5 + i);
      root.add(pipe);
    }
    markTarget(manifold, 'target_manifold', 5);

    const marker = createTargetMarker(5, 0xffd54f);
    marker.position.set(0, this.markerY, 0);
    root.add(marker);
    this.marker = marker;

    // 海草点缀
    addSeaweed(root, 14, -8, 10);
    addSeaweed(root, -14, 2, 8);

    this.root = root;
    world.add(root);
  }

  update(dt: number, time: number): void {
    if (this.marker) {
      this.marker.rotation.y += dt * 1.1;
      this.marker.position.y = this.markerY + Math.sin(time * 0.8) * 0.12;
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

export const OilRigScene: SceneDefinition = new OilRigSceneImpl();
