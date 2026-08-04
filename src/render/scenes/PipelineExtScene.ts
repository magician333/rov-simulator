/**
 * PipelineExtScene：海底管道外巡检场景。
 * 长输气管道沿 z 方向铺设（海底上方），检查法兰/支架。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';
import { seabedHeight } from '../../core/terrain';
import type { QualityLevel } from '../environment/UnderwaterEffects';

class PipelineExtSceneImpl implements SceneDefinition {
  readonly id = 'pipeline_ext';
  readonly name = '管道外巡检';
  readonly description = '海底输气管道，沿管检查法兰与支架';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 1, currentDirectionDeg: 0, turbulence: 0.05, visibility: 20, turbidity: 0.2 };
  readonly spawn = { position: [0, -1.2, 38] as [number, number, number], yawDeg: 180 };
  readonly colliders = [
    // 管道本体（y 随地形与视觉 seabedHeight(0,0)+1.1 一致）
    { type: 'box' as const, position: new THREE.Vector3(0, seabedHeight(0, 0) + 1.1, 0), halfExtents: new THREE.Vector3(2.5, 0.9, 32) },
    // 支撑墩（与视觉 ±2.2 对齐）
    { type: 'box' as const, position: new THREE.Vector3(2.2, -11.5, 0), halfExtents: new THREE.Vector3(0.8, 1.2, 30) },
    { type: 'box' as const, position: new THREE.Vector3(-2.2, -11.5, 0), halfExtents: new THREE.Vector3(0.8, 1.2, 30) },
  ];
  readonly localFlowZones = [];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  private markerY = -8.6;

  build(world: THREE.Scene, quality: QualityLevel = 'high'): void {
    const root = new THREE.Group();
    root.name = 'scene_pipeline_ext';

    const pipeMat = boxMaterial(0x8a7a55, { roughness: 0.8, metalness: 0.55, texture: 'rusty' });
    // 主管道（z 从 -30 到 30，海底上方约 1m）
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 24), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0, seabedHeight(0, 0) + 1.1, 0);
    root.add(pipe);
    this.markerY = pipe.position.y + 0.2;

    // 两端立管弯头（中/高画质：模拟管道转弯上浮到立管）
    if (quality !== 'low') {
      const bendMat = boxMaterial(0x7a6a48, { roughness: 0.75, metalness: 0.5 });
      const pipeR = 1.1;
      for (const dir of [-1, 1]) {
        const bend = new THREE.Mesh(
          new THREE.TorusGeometry(pipeR, 0.3, 16, 24, Math.PI / 2),
          bendMat,
        );
        bend.position.set(0, pipe.position.y, dir * 30);
        bend.rotation.x = dir === 1 ? Math.PI : 0;
        root.add(bend);
        const riser = new THREE.Mesh(new THREE.CylinderGeometry(pipeR, pipeR, 5, 24), bendMat);
        riser.position.set(0, pipe.position.y + 3.2, dir * 30);
        root.add(riser);
      }
    }

    // 法兰（每 10m 一个）
    const flangeMat = boxMaterial(0x9a5a3a, { roughness: 0.65, metalness: 0.6, texture: 'rusty' });
    for (let z = -25; z <= 25; z += 10) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.5, 24), flangeMat);
      flange.rotation.x = Math.PI / 2;
      flange.position.set(0, pipe.position.y, z);
      root.add(flange);
    }
    // 焊接环（中/高画质：管道表面环形焊缝带）
    if (quality !== 'low') {
      const weldMat = boxMaterial(0x6a5a3a, { roughness: 0.8, metalness: 0.5 });
      for (let z = -27.5; z <= 27.5; z += 5) {
        if (z % 10 === 0) continue; // 法兰位置跳过
        const weldRing = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.22, 14), weldMat);
        weldRing.rotation.x = Math.PI / 2;
        weldRing.position.set(0, pipe.position.y, z);
        root.add(weldRing);
      }
    }

    // 目标法兰（z=0，加亮）
    const targetFlange = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.55, 24), boxMaterial(0xb06a2a, { roughness: 0.6, metalness: 0.6, emissive: 0x552200, emissiveIntensity: 0.25 }));
    targetFlange.rotation.x = Math.PI / 2;
    targetFlange.position.set(0, pipe.position.y, 0);
    root.add(targetFlange);
    markTarget(targetFlange, 'target_flange', 4);

    const marker = createTargetMarker(4, 0xffd54f);
    marker.position.set(0, this.markerY + 1.2, 0);
    root.add(marker);
    this.marker = marker;

    // 阳极块 + 海底卵石（中/高画质）
    if (quality !== 'low') {
      const anodeMat = boxMaterial(0x2a6d8f, { roughness: 0.7, metalness: 0.3 });
      for (const z of [-24, -8, 8, 24]) {
        const anode = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), anodeMat);
        anode.position.set(0, pipe.position.y - 1.1, z);
        root.add(anode);
      }
      const stoneMat = boxMaterial(0x7d7668, { roughness: 0.95 });
      for (let i = 0; i < 14; i++) {
        const x = (Math.random() - 0.5) * 22;
        const z = (Math.random() - 0.5) * 52;
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0), stoneMat);
        stone.position.set(x, seabedHeight(x, z) + 0.2, z);
        stone.rotation.set(Math.random(), Math.random(), Math.random());
        root.add(stone);
      }
    }

    // 支架（管道两侧支撑墩）
    const standMat = boxMaterial(0x6b6b72, { roughness: 0.85 });
    for (let z = -28; z <= 28; z += 14) {
      for (const x of [-2.2, 2.2]) {
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), standMat);
        stand.position.set(x, seabedHeight(x, z) + 0.7, z);
        root.add(stand);
      }
    }

    // 海草点缀
    addSeaweed(root, 8, -10, 12);
    addSeaweed(root, -8, 10, 10);

    this.root = root;
    world.add(root);
  }

  update(dt: number, time: number): void {
    if (this.marker) {
      this.marker.rotation.y += dt * 1.3;
      this.marker.position.y = this.markerY + 1.2 + Math.sin(time * 1) * 0.15;
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

export const PipelineExtScene: SceneDefinition = new PipelineExtSceneImpl();
