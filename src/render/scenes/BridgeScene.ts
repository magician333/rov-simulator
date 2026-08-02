/**
 * BridgeScene：桥梁检测场景。
 * 桥墩 + 承台 + 桥底；桥墩两侧局部涡流。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';
import { seabedHeight } from '../../core/terrain';

class BridgeSceneImpl implements SceneDefinition {
  readonly id = 'bridge';
  readonly name = '桥梁检测';
  readonly description = '桥墩、承台，强水流区域';
  readonly environmentDefaults = { envModel: 'river' as const, riverKnots: 2, currentDirectionDeg: 0, turbulence: 0.2, visibility: 12, turbidity: 0.3 };
  readonly spawn = { position: [0, -1.2, 30] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(-15, 1.5, -10), halfExtents: new THREE.Vector3(3.2, 13.5, 3.5) },
    { type: 'box' as const, position: new THREE.Vector3(0, 1.5, -10), halfExtents: new THREE.Vector3(3.2, 13.5, 3.5) },
    { type: 'box' as const, position: new THREE.Vector3(15, 1.5, -10), halfExtents: new THREE.Vector3(3.2, 13.5, 3.5) },
  ];
  readonly localFlowZones = [
    // 中墩两侧涡流（左旋/右旋）
    {
      position: new THREE.Vector3(4, -8, -10),
      radius: 9,
      strength: 0.7,
      directionDeg: 90,
      decay: 2,
    },
    {
      position: new THREE.Vector3(-4, -8, -10),
      radius: 9,
      strength: -0.7,
      directionDeg: 270,
      decay: 2,
    },
  ];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;

  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_bridge';

    const pierMat = boxMaterial(0x8f8f96, { roughness: 0.85, metalness: 0.1 });
    const pillarGeo = new THREE.CylinderGeometry(3, 3.4, 27, 14);

    // 三根桥墩（基座接触水底：墩底 = seabedHeight）
    for (const x of [-15, 0, 15]) {
      const bedY = seabedHeight(x, -10);
      const pier = new THREE.Mesh(pillarGeo, pierMat);
      pier.position.set(x, bedY + 13.5, -10); // 墩底贴地，顶部 bedY+27
      root.add(pier);
    }

    // 承台（连接墩顶）
    const capBedY = seabedHeight(0, -10);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(42, 3, 10),
      boxMaterial(0x7d7d84, { roughness: 0.85 }),
    );
    cap.position.set(0, capBedY + 15, -10);
    root.add(cap);

    // 桥底面板
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(50, 1.2, 16),
      boxMaterial(0x6b6b72, { roughness: 0.8 }),
    );
    deck.position.set(0, capBedY + 16.5, -10);
    root.add(deck);

    // 冲刷区（中墩底部，目标，贴地）
    const scour = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.6, 0.6, 14),
      boxMaterial(0x4a3a35, { roughness: 0.95, emissive: 0x332211, emissiveIntensity: 0.3 }),
    );
    scour.position.set(0, capBedY + 0.3, -10);
    root.add(scour);
    markTarget(scour, 'target_scour', 4);

    const marker = createTargetMarker(5, 0xffd54f);
    marker.position.set(0, capBedY + 4, -10);
    root.add(marker);
    this.marker = marker;

    // 桥墩周围护石
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = boxMaterial(0x59656b, { roughness: 0.95 });
    for (let i = 0; i < 30; i++) {
      const x = Math.abs((Math.sin(i * 127.1) * 43758.5453) % 1);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.5 + x * 2;
      rock.scale.set(s, s * 0.8, s);
      const pierX = [-15, 0, 15][i % 3];
      const rx = pierX + (x - 0.5) * 10;
      const rz = -10 + (x - 0.5) * 10;
      rock.position.set(rx, seabedHeight(rx, rz) + s * 0.35, rz); // 石头底贴地
      rock.rotation.set(x * 3, x * 5, 0);
      root.add(rock);
    }

    // 海草点缀
    addSeaweed(root, 8, -4, 5);
    addSeaweed(root, -8, 2, 5);

    this.root = root;
    world.add(root);
  }

  update(dt: number, time: number): void {
    if (this.marker) {
      this.marker.rotation.y += dt * 1.4;
      this.marker.position.y = -8 + Math.sin(time * 1.1) * 0.15;
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

export const BridgeScene: SceneDefinition = new BridgeSceneImpl();
