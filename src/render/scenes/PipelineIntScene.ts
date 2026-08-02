/**
 * PipelineIntScene：管道内巡检场景。
 * 大口径管道（直径 3m）沿 z 铺设，ROV 从入口进入管内检查内壁焊缝。
 * 管道外壳半透明，内部清晰可见。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker } from './BaseScene';

const PIPE_R = 1.5; // 半径
const PIPE_LEN = 44; // 全长（z -22..22）
const PIPE_Y = -5; // 管道中心深度

class PipelineIntSceneImpl implements SceneDefinition {
  readonly id = 'pipeline_int';
  readonly name = '管道内巡检';
  readonly description = '大口径管道，进入管内检查内壁焊缝';
  readonly environmentDefaults = { envModel: 'river' as const, riverKnots: 1, currentDirectionDeg: 0, turbulence: 0.08, visibility: 18, turbidity: 0.2 };
  readonly spawn = { position: [0, -1.2, 18] as [number, number, number], yawDeg: 180 };
  readonly colliders = [
    // 管道壁：上下左右四面长板近似圆筒
    { type: 'box' as const, position: new THREE.Vector3(0, PIPE_Y + PIPE_R + 0.2, 0), halfExtents: new THREE.Vector3(PIPE_R + 0.8, 0.2, PIPE_LEN / 2) },
    { type: 'box' as const, position: new THREE.Vector3(0, PIPE_Y - PIPE_R - 0.2, 0), halfExtents: new THREE.Vector3(PIPE_R + 0.8, 0.2, PIPE_LEN / 2) },
    { type: 'box' as const, position: new THREE.Vector3(PIPE_R + 0.2, PIPE_Y, 0), halfExtents: new THREE.Vector3(0.2, PIPE_R + 0.6, PIPE_LEN / 2) },
    { type: 'box' as const, position: new THREE.Vector3(-PIPE_R - 0.2, PIPE_Y, 0), halfExtents: new THREE.Vector3(0.2, PIPE_R + 0.6, PIPE_LEN / 2) },
  ];
  readonly localFlowZones = [];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_pipeline_int';

    // 半透明外壳（可看到内部）
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x8a8a95,
      transparent: true,
      opacity: 0.35,
      roughness: 0.6,
      metalness: 0.4,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R + 0.3, PIPE_R + 0.3, PIPE_LEN, 24, 1, true), shellMat);
    shell.rotation.x = Math.PI / 2;
    shell.position.set(0, PIPE_Y, 0);
    root.add(shell);

    // 内壁：分段环（焊缝标记区）
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6f6f76, roughness: 0.7, metalness: 0.35, side: THREE.DoubleSide });
    const segLen = 4;
    for (let z = -20; z < 20; z += segLen) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R - 0.08, PIPE_R - 0.08, segLen - 0.1, 20, 1, true), wallMat);
      seg.rotation.x = Math.PI / 2;
      seg.position.set(0, PIPE_Y, z + segLen / 2);
      root.add(seg);
    }

    // 目标：内壁焊缝区（z=0，加亮环）
    const weld = new THREE.Mesh(
      new THREE.CylinderGeometry(PIPE_R - 0.12, PIPE_R - 0.12, 1.2, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xb06a2a, roughness: 0.5, metalness: 0.5, emissive: 0x552200, emissiveIntensity: 0.3, side: THREE.DoubleSide }),
    );
    weld.rotation.x = Math.PI / 2;
    weld.position.set(0, PIPE_Y, 0);
    root.add(weld);
    markTarget(weld, 'target_weld', 4);

    // 入口/出口端面
    const endMat = boxMaterial(0x7d7d84, { roughness: 0.8 });
    for (const z of [-PIPE_LEN / 2, PIPE_LEN / 2]) {
      const end = new THREE.Mesh(new THREE.RingGeometry(PIPE_R - 0.2, PIPE_R + 0.4, 20), endMat);
      end.rotation.x = Math.PI / 2;
      end.position.set(0, PIPE_Y, z);
      root.add(end);
    }

    const marker = createTargetMarker(4, 0xffd54f);
    marker.position.set(0, PIPE_Y, 0);
    root.add(marker);
    this.marker = marker;

    this.root = root;
    world.add(root);
  }

  update(dt: number, time: number): void {
    void time;
    if (this.marker) {
      this.marker.rotation.y += dt * 1.2;
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

export const PipelineIntScene: SceneDefinition = new PipelineIntSceneImpl();
