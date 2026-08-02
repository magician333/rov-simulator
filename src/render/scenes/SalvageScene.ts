/**
 * SalvageScene：水下打捞场景。
 * 沉船残骸 + 集装箱堆 + 目标集装箱（target_crate）。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, markGrabbable, disposeObject, boxMaterial, createTargetMarker, addSeaweed } from './BaseScene';
import { seabedHeight } from '../../core/terrain';

class SalvageSceneImpl implements SceneDefinition {
  readonly id = 'salvage';
  readonly name = '水下打捞';
  readonly description = '平坦泥地，沉船残骸与集装箱目标';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 1, currentDirectionDeg: 0, turbulence: 0.05, visibility: 20, turbidity: 0.3 };
  readonly spawn = { position: [0, -1.2, 18] as [number, number, number], yawDeg: 0 };
  readonly localFlowZones = [];
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(-6, -9.5, -20), halfExtents: new THREE.Vector3(3.2, 2.2, 11) }, // 沉船
    { type: 'sphere' as const, position: new THREE.Vector3(2, -9.6, -24), radius: 2.6 }, // 目标红箱
    { type: 'sphere' as const, position: new THREE.Vector3(-1, -9.2, -27), radius: 2.6 },
    { type: 'sphere' as const, position: new THREE.Vector3(4, -9.4, -21), radius: 2.6 },
    { type: 'sphere' as const, position: new THREE.Vector3(1.5, -8.6, -19), radius: 2.6 },
  ];

  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;
  private markerY = -9.6;

  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_salvage';

    // 沉船残骸（倾斜船体 + 桅杆）
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(5, 3.5, 22),
      boxMaterial(0x5d4a3a, { roughness: 0.9, metalness: 0.15 }),
    );
    hull.position.set(-6, -9.5, -20);
    hull.rotation.z = 0.55;
    hull.rotation.x = 0.12;
    root.add(hull);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 6, 6),
      boxMaterial(0x8a7565, { roughness: 0.8, metalness: 0.3 }),
    );
    mast.position.set(-6, -7, -27);
    mast.rotation.z = 0.5;
    root.add(mast);

    // 集装箱堆
    const crateColors: [number, number, number, number][] = [
      [0xc0392b, 2, -9.6, -24], // 目标（红）
      [0x2471a3, -1, -9.2, -27], // 蓝
      [0x229954, 4, -9.4, -21], // 绿
      [0x9a7d0a, 1.5, -8.6, -19], // 黄（堆叠）
    ];
    for (const [color, x, y, z] of crateColors) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 6), boxMaterial(color, { roughness: 0.7, metalness: 0.2 }));
      crate.position.set(x, y, z);
      crate.rotation.y = color === 0xc0392b ? 0.1 : 0.2;
      root.add(crate);
      if (color === 0xc0392b) {
        markTarget(crate, 'target_crate', 3);
        markGrabbable(crate, '集装箱', 2.4); // 过大，夹爪无法夹取（教学点）
        this.markerY = y;
      }
    }

    // 可夹取道具：假人 / 行李箱 / 手机（机械臂夹取）
    this.buildProps(root);

    // 目标标记环（旋转动画）
    const marker = createTargetMarker(4, 0x4fc3f7);
    marker.position.set(2, this.markerY, -24);
    root.add(marker);
    this.marker = marker;

    // 散落岩石
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = boxMaterial(0x44505a, { roughness: 0.95 });
    for (let i = 0; i < 30; i++) {
      const x = (Math.sin(i * 127.1) * 43758.5453) % 1;
      const abs = (v: number) => Math.abs(v);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.5 + abs(x) * 1.8;
      rock.scale.set(s, s * 0.7, s);
      rock.position.set((abs(x) - 0.5) * 60, seabedHeight((abs(x) - 0.5) * 60, (abs(x * 7.3) - 0.5) * 60) - abs(x) * 0.4, (abs(x * 7.3) - 0.5) * 60);
      rock.rotation.set(abs(x) * 3, abs(x * 3.1) * 3, 0);
      root.add(rock);
    }

    // 海草点缀
    addSeaweed(root, 10, -5, 8);
    addSeaweed(root, -12, -2, 6);
    addSeaweed(root, 6, 8, 5);

    this.root = root;
    world.add(root);
  }

  private buildProps(root: THREE.Group): void {
    // 假人（潜水员，平躺海底，接触水底）
    const manPos = seabedHeight(8, -30) + 0.06;
    const man = new THREE.Group();
    man.position.set(8, manPos, -30);
    man.rotation.y = 0.6;
    const skinMat = boxMaterial(0xe0b090, { roughness: 0.8 });
    const suitMat = boxMaterial(0xd64545, { roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), skinMat);
    head.position.set(0, 0.12, -0.5);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.22), suitMat);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), suitMat);
    armL.position.set(-0.26, -0.1, -0.25);
    armL.rotation.x = -0.4;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), suitMat);
    armR.position.set(0.26, -0.1, -0.25);
    armR.rotation.x = -0.4;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.55), suitMat);
    legL.position.set(-0.11, -0.32, 0.15);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.55), suitMat);
    legR.position.set(0.11, -0.32, 0.15);
    man.add(head, torso, armL, armR, legL, legR);
    markGrabbable(man, '潜水员假人', 0.2);
    root.add(man);

    // 行李箱（接触水底）
    const suitcase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.3), boxMaterial(0x2e86ab, { roughness: 0.6 }));
    suitcase.position.set(-9, seabedHeight(-9, -15) + 0.05, -15);
    suitcase.rotation.y = 0.9;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), boxMaterial(0x1a5276));
    handle.position.set(0, 0.46, 0);
    suitcase.add(handle);
    markGrabbable(suitcase, '行李箱', 0.3);
    root.add(suitcase);

    // 手机（贴水底）
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.15), boxMaterial(0x111418, { roughness: 0.3, metalness: 0.4 }));
    phone.position.set(4.5, seabedHeight(4.5, -18) + 0.02, -18);
    phone.rotation.y = -0.4;
    phone.rotation.z = 0.3;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x3dd1ff }),
    );
    screen.rotation.x = -Math.PI / 2;
    screen.position.z = 0.012;
    phone.add(screen);
    markGrabbable(phone, '手机', 0.08);
    root.add(phone);
  }

  update(dt: number, time: number): void {
    if (this.marker) {
      this.marker.rotation.y += dt * 1.5;
      this.marker.position.y = this.markerY + Math.sin(time * 1.2) * 0.15;
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

export const SalvageScene: SceneDefinition = new SalvageSceneImpl();
