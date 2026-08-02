/**
 * DamScene：大坝检测场景。
 * 巨型混凝土坝面 + 裂缝标记区 + 闸门；坝前局部急流。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';

class DamSceneImpl implements SceneDefinition {
  readonly id = 'dam';
  readonly name = '大坝检测';
  readonly description = '巨大混凝土坝面，裂缝与闸门目标';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 0, currentDirectionDeg: 0, turbulence: 0.3, visibility: 30, turbidity: 0.15 };
  readonly spawn = { position: [0, -1.2, 28] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(0, 3, -15), halfExtents: new THREE.Vector3(55, 18, 2.6) }, // 坝体
    { type: 'box' as const, position: new THREE.Vector3(30, -5, -12), halfExtents: new THREE.Vector3(4, 5, 1) }, // 闸门
  ];
  readonly localFlowZones = [
    {
      position: new THREE.Vector3(0, -8, -12),
      radius: 20,
      strength: 0.8,
      directionDeg: 180, // 朝坝（-Z = 北）
      decay: 1,
    },
  ];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  private markerY = -7;

  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_dam';

    // 坝体（从海底到坝顶）
    const dam = new THREE.Mesh(
      new THREE.BoxGeometry(110, 36, 5),
      boxMaterial(0x9aa3a8, { roughness: 0.9, metalness: 0.05 }),
    );
    dam.position.set(0, 3, -15); // y: -15..21（坝顶露出水面）
    root.add(dam);

    // 坝面细节：分层线
    for (let i = 0; i < 5; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(110, 0.12, 0.15),
        boxMaterial(0x7d868c, { roughness: 0.9 }),
      );
      line.position.set(0, 2 + i * 4, -12.45);
      root.add(line);
    }

    // 裂缝标记区（目标）：坝面 3 块深色条 + 龟裂细纹
    const crackY = -7;
    const crackMat = boxMaterial(0x4a3a35, { roughness: 0.95, emissive: 0x332211, emissiveIntensity: 0.25 });
    const crackGroup = new THREE.Group();
    for (const [dx, dw, dh] of [[0, 1.2, 4], [2.2, 0.8, 3], [-2.4, 1, 3.4]] as const) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.3), crackMat);
      crack.position.set(dx, 0, 0);
      crack.rotation.z = 0.15 * (dx > 0 ? 1 : -1);
      crackGroup.add(crack);
    }
    // 龟裂细纹（多根细长条，模拟裂缝延伸）
    const hairMat = boxMaterial(0x2c201c, { roughness: 0.95 });
    const hairSpecs: [number, number, number, number][] = [
      [0.6, 2.1, 0.1, 0.7], [1.1, -1.2, 0.08, 0.9], [-0.8, 1.8, 0.07, -0.8],
      [0.3, -2.3, 0.09, 1.2], [-1.5, -0.6, 0.06, -1.1], [1.8, 0.9, 0.09, 0.5],
    ];
    for (const [hx, hy, hw, hz] of hairSpecs) {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.5, 0.22), hairMat);
      hair.position.set(hx, hy, 0);
      hair.rotation.z = hz * 0.3;
      crackGroup.add(hair);
    }
    crackGroup.position.set(3, crackY, -12.3);
    root.add(crackGroup);
    markTarget(crackGroup, 'target_crack', 4);
    this.markerY = crackY;

    const marker = createTargetMarker(5, 0xffd54f);
    marker.position.set(3, crackY, -10.5);
    root.add(marker);
    this.marker = marker;

    // 闸门（右侧）
    const gate = new THREE.Mesh(
      new THREE.BoxGeometry(8, 10, 1.5),
      boxMaterial(0x6b3a2a, { roughness: 0.6, metalness: 0.5 }),
    );
    gate.position.set(30, -5, -12);
    root.add(gate);

    // 坝前底部碎石
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = boxMaterial(0x59656b, { roughness: 0.95 });
    for (let i = 0; i < 40; i++) {
      const x = Math.abs((Math.sin(i * 127.1) * 43758.5453) % 1);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.4 + x * 2;
      rock.scale.set(s, s * 0.8, s);
      rock.position.set((x - 0.5) * 90, -11.2 - x * 1.5, -14 + (x - 0.5) * 10);
      rock.rotation.set(x * 3, x * 5, 0);
      root.add(rock);
    }

    // 海草点缀
    addSeaweed(root, 20, -4, 5);
    addSeaweed(root, -25, 2, 5);

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

export const DamScene: SceneDefinition = new DamSceneImpl();
