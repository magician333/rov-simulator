/**
 * PipelineExtScene：海底管道外巡检场景。
 * 长输气管道沿 z 方向铺设（海底上方），检查法兰/支架。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';
import { seabedHeight } from '../../core/terrain';

class PipelineExtSceneImpl implements SceneDefinition {
  readonly id = 'pipeline_ext';
  readonly name = '管道外巡检';
  readonly description = '海底输气管道，沿管检查法兰与支架';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 1, currentDirectionDeg: 0, turbulence: 0.05, visibility: 20, turbidity: 0.2 };
  readonly spawn = { position: [0, -1.2, 38] as [number, number, number], yawDeg: 180 };
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(0, -10.2, 0), halfExtents: new THREE.Vector3(2.5, 0.9, 32) }, // 管道本体
  ];
  readonly localFlowZones = [];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  private markerY = -8.6;

  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_pipeline_ext';

    const pipeMat = boxMaterial(0x8a7a55, { roughness: 0.75, metalness: 0.5 });
    // 主管道（z 从 -30 到 30，海底上方约 1m）
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 14), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0, seabedHeight(0, 0) + 1.1, 0);
    root.add(pipe);
    this.markerY = pipe.position.y + 0.2;

    // 法兰（每 10m 一个）
    const flangeMat = boxMaterial(0x9a5a3a, { roughness: 0.6, metalness: 0.6 });
    for (let z = -25; z <= 25; z += 10) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.5, 14), flangeMat);
      flange.rotation.x = Math.PI / 2;
      flange.position.set(0, pipe.position.y, z);
      root.add(flange);
    }
    // 目标法兰（z=0，加亮）
    const targetFlange = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.55, 14), boxMaterial(0xb06a2a, { roughness: 0.6, metalness: 0.6, emissive: 0x552200, emissiveIntensity: 0.25 }));
    targetFlange.rotation.x = Math.PI / 2;
    targetFlange.position.set(0, pipe.position.y, 0);
    root.add(targetFlange);
    markTarget(targetFlange, 'target_flange', 4);

    const marker = createTargetMarker(4, 0xffd54f);
    marker.position.set(0, this.markerY + 1.2, 0);
    root.add(marker);
    this.marker = marker;

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
