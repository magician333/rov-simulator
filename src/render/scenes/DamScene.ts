/**
 * DamScene：大坝检测场景。
 * 巨型混凝土坝面 + 裂缝标记区 + 闸门；坝前局部急流。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';
import type { QualityLevel } from '../environment/UnderwaterEffects';
import { seabedHeight } from '../../core/terrain';

class DamSceneImpl implements SceneDefinition {
  readonly id = 'dam';
  readonly name = '大坝检测';
  readonly description = '巨大混凝土坝面，裂缝与闸门目标';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 0, currentDirectionDeg: 0, turbulence: 0.3, visibility: 30, turbidity: 0.15 };
  readonly spawn = { position: [0, -1.2, 28] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(0, 3, -15), halfExtents: new THREE.Vector3(55, 18, 2.6) }, // 坝体
    { type: 'box' as const, position: new THREE.Vector3(30, -8, -12.4), halfExtents: new THREE.Vector3(1.8, 3.1, 0.6) }, // 闸门（对齐视觉 gate 3.4×6×0.5）
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

  build(world: THREE.Scene, quality: QualityLevel = 'high'): void {
    const root = new THREE.Group();
    root.name = 'scene_dam';

    // 坝体（从海底到坝顶）
    const dam = new THREE.Mesh(
      new THREE.BoxGeometry(110, 36, 5),
      boxMaterial(0x9aa3a8, { roughness: 0.92, metalness: 0.05, texture: 'concrete' }),
    );
    dam.position.set(0, 3, -15); // y: -15..21（坝顶露出水面）
    root.add(dam);

    // 伸缩缝与更多裂缝（中/高画质）
    if (quality !== 'low') {
      const seamMat = boxMaterial(0x6e777d, { roughness: 0.9 });
      for (let x = -40; x <= 40; x += 20) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 36, 0.18), seamMat);
        seam.position.set(x, 3, -12.42);
        root.add(seam);
      }
      // 坝面额外两处裂缝装饰（非目标）
      const extraCrackMat = boxMaterial(0x4a3a35, { roughness: 0.95 });
      for (const [cx, cy] of [[-15, -4], [12, -9]] as const) {
        const g = new THREE.Group();
        g.position.set(cx, cy, -12.3);
        for (let i = 0; i < 4; i++) {
          const cw = 0.08 + Math.random() * 0.12;
          const ch = 1.2 + Math.random() * 2.2;
          const crack = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.24), extraCrackMat);
          crack.position.set((i - 1.5) * 0.7, (Math.random() - 0.5) * 1.5, 0);
          crack.rotation.z = (Math.random() - 0.5) * 0.7;
          g.add(crack);
        }
        root.add(g);
      }
    }

    // 泄洪/坝顶细节（中/高画质）
    if (quality !== 'low') {
      // 泄洪闸门滑道（坝面竖条）
      const slideMat = boxMaterial(0x6e777d, { roughness: 0.8, metalness: 0.3 });
      for (const x of [-31, -27, -23, 27, 31]) {
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.4, 20, 0.3), slideMat);
        slide.position.set(x, -5, -12.4);
        root.add(slide);
      }
      // 泄洪闸门金属门板（滑道间）
      const gateMat = boxMaterial(0x5a6a78, { roughness: 0.5, metalness: 0.6, texture: 'deepmetal' });
      for (const x of [-29, 29]) {
        const gate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, 0.5), gateMat);
        gate.position.set(x, -8, -12.4);
        root.add(gate);
      }

      // 坝顶栏杆（细柱 + 横杆）
      const railMat = boxMaterial(0x8a8f94, { roughness: 0.6, metalness: 0.5 });
      for (let x = -52; x <= 52; x += 4) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 24), railMat);
        post.position.set(x, 20.6, -12.6);
        root.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(108, 0.1, 0.1), railMat);
      rail.position.set(0, 21.1, -12.6);
      root.add(rail);
      // 坝前消力墩（泄洪区底部方块阵列）
      const dentMat = boxMaterial(0x8a8f94, { roughness: 0.85 });
      for (let x = -18; x <= 18; x += 3.5) {
        const dent = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), dentMat);
        dent.position.set(x, seabedHeight(x, -17) + 0.8, -17);
        root.add(dent);
      }
    }

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
