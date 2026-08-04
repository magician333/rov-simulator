/**
 * ShipScene：船舶检测场景。
 * 半潜船体 + 螺旋桨（目标）+ 左右检查点。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker } from './BaseScene';
import type { QualityLevel } from '../environment/UnderwaterEffects';

class ShipSceneImpl implements SceneDefinition {
  readonly id = 'ship';
  readonly name = '船舶检测';
  readonly description = '集装箱货船船底、螺旋桨区域';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 2, currentDirectionDeg: 0, turbulence: 0.1, visibility: 15, turbidity: 0.25 };
  readonly spawn = { position: [0, -1.2, 30] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(0, -2.5, 0), halfExtents: new THREE.Vector3(4.6, 3.6, 21) }, // 船体
    { type: 'box' as const, position: new THREE.Vector3(0, -2.5, -25.5), halfExtents: new THREE.Vector3(4, 2.6, 4.5) }, // 船艏（含球鼻艏）
    { type: 'sphere' as const, position: new THREE.Vector3(0, -4, 21.5), radius: 2.6 }, // 螺旋桨
  ];
  readonly localFlowZones = [
    {
      position: new THREE.Vector3(0, -6, 18),
      radius: 12,
      strength: 0.5,
      directionDeg: 0,
      decay: 1,
    },
  ];


  private root: THREE.Group | null = null;
  private marker: THREE.Mesh | null = null;

  build(world: THREE.Scene, quality: QualityLevel = 'high'): void {
    const root = new THREE.Group();
    root.name = 'scene_ship';

    const hullMat = boxMaterial(0x3a3f47, { roughness: 0.75, metalness: 0.4, texture: 'plate' });
    const hullMatRust = boxMaterial(0x4a4440, { roughness: 0.8, metalness: 0.45, texture: 'rusty' });

    // ===== 主船体（半潜：甲板略露水面）=====
    // 水下主体
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 5.4, 34), hullMat);
    hull.position.set(0, -3.3, 0);
    root.add(hull);

    // 船艏：两段收窄 + 球鼻艏（流线型）
    const bow1 = new THREE.Mesh(new THREE.BoxGeometry(7, 4.4, 7), hullMat);
    bow1.position.set(0, -3.3, -20.2);
    bow1.rotation.x = -0.16;
    root.add(bow1);
    const bow2 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3, 4.5), hullMat);
    bow2.position.set(0, -2.8, -25.2);
    bow2.rotation.x = -0.28;
    root.add(bow2);
    // 球鼻艏（水线下方前突）
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 24), hullMatRust);
    bulb.scale.set(1, 0.7, 1.4);
    bulb.position.set(0, -5.4, -24.6);
    root.add(bulb);

    // 船艉（方艉）
    const stern = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 3), hullMat);
    stern.position.set(0, -3.6, 18.4);
    root.add(stern);

    // 甲板（水面略露）
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.5, 40), boxMaterial(0x5c6670, { roughness: 0.7, metalness: 0.3, texture: 'plate' }));
    deck.position.set(0, 0.05, 0);
    root.add(deck);

    // 舷墙（船侧矮围栏）
    const railMat = boxMaterial(0x4a5056, { roughness: 0.7, metalness: 0.4, texture: 'plate' });
    for (const x of [-4.7, 4.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 38), railMat);
      rail.position.set(x, 0.65, -1);
      root.add(rail);
    }

    // 上层建筑（舰桥 + 烟囱 + 桅杆）
    const superMat = boxMaterial(0x4d535c, { roughness: 0.75, metalness: 0.35, texture: 'plate' });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 8), superMat);
    bridge.position.set(0, 2.4, 8);
    root.add(bridge);
    const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 8.1), boxMaterial(0x2c333b, { roughness: 0.4, metalness: 0.3 }));
    bridgeWin.position.set(0, 3.2, 8);
    root.add(bridgeWin);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 24), boxMaterial(0x6a3a3a, { roughness: 0.7, metalness: 0.3 }));
    funnel.position.set(0, 4.9, 9.5);
    root.add(funnel);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 24), boxMaterial(0x33383e, { roughness: 0.6, metalness: 0.5 }));
    mast.position.set(0, 6.2, 9.5);
    root.add(mast);

    // 舷窗列（船侧两列）
    const portholeMat = boxMaterial(0x1f2d38, { roughness: 0.3, metalness: 0.7 });
    for (let z = -14; z <= 14; z += 7) {
      for (const x of [-4.6, 4.6]) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 24), portholeMat);
        hole.rotation.z = Math.PI / 2;
        hole.position.set(x, -1.4, z);
        root.add(hole);
      }
    }

    // 吃水线（红色防污漆带）
    const waterline = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.45, 41), boxMaterial(0x8a2a2a, { roughness: 0.85, metalness: 0.15 }));
    waterline.position.set(0, -5.1, 0);
    root.add(waterline);

    // 甲板集装箱堆（2 列 × 2 层，货船特征）
    const crateColors = [0xc0392b, 0x2471a3, 0x229954, 0x9a7d0a, 0x7b2e8e, 0xd35400];
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 6; row++) {
        const cx = col === 0 ? -3.2 : 3.2;
        const cz = -14 + row * 4.6;
        for (let layer = 0; layer < 2; layer++) {
          const cont = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 2.4, 4.4),
            boxMaterial(crateColors[(row + col * 6 + layer * 3) % crateColors.length], { roughness: 0.6, metalness: 0.3, texture: 'plate' }),
          );
          cont.position.set(cx, 0.8 + layer * 2.4, cz);
          root.add(cont);
        }
      }
    }

    // 船底：龙骨 + 肋条 + 水密隔舱（中/高画质）
    if (quality !== 'low') {
      const keelMat = boxMaterial(0x2b2f35, { roughness: 0.7, metalness: 0.5, texture: 'rusty' });
      const keel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 38), keelMat);
      keel.position.set(0, -6.1, 0);
      root.add(keel);
      for (let i = 0; i < 12; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.3, 0.4), boxMaterial(0x464c54, { roughness: 0.8, metalness: 0.4 }));
        rib.position.set(0, -5.9, -17.5 + i * 3.2);
        root.add(rib);
      }
      // 水密隔舱（可见于船底开口处）
      for (let z = -16; z <= 16; z += 8) {
        const bulk = new THREE.Mesh(new THREE.BoxGeometry(8.6, 4.4, 0.3), boxMaterial(0x4a5056, { roughness: 0.85, metalness: 0.35 }));
        bulk.position.set(0, -4.8, z);
        root.add(bulk);
      }
    }

    // ===== 螺旋桨（目标，精细化：轴 + 锥形轮毂 + 4 桨叶 + 舵）=====
    const propGroup = new THREE.Group();
    propGroup.position.set(0, -4.2, 19.6);
    // 桨轴（从船尾伸出）
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 24), boxMaterial(0x6b6f76, { roughness: 0.4, metalness: 0.8, texture: 'deepmetal' }));
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0, 1.0);
    propGroup.add(shaft);
    // 锥形轮毂（前锥 + 后锥）
    const hubF = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 24), boxMaterial(0xc9a227, { roughness: 0.35, metalness: 0.8 }));
    hubF.rotation.x = Math.PI / 2;
    hubF.position.set(0, 0, -0.55);
    propGroup.add(hubF);
    const hubR = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 24), boxMaterial(0xc9a227, { roughness: 0.35, metalness: 0.8 }));
    hubR.rotation.x = -Math.PI / 2;
    hubR.position.set(0, 0, 0.55);
    propGroup.add(hubR);
    // 4 桨叶（带螺距角）
    const bladeMat = boxMaterial(0x8d8d99, { roughness: 0.35, metalness: 0.8, texture: 'deepmetal' });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.55), bladeMat);
      blade.position.set(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0);
      blade.rotation.z = a;
      blade.rotation.y = 0.35; // 螺距角（真实螺旋桨）
      propGroup.add(blade);
      // 叶尖
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), bladeMat);
      tip.position.set(Math.cos(a) * 2.35, Math.sin(a) * 2.35, 0);
      propGroup.add(tip);
    }
    // 舵（垂直平板）
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 1.6), boxMaterial(0x4a5056, { roughness: 0.6, metalness: 0.5 }));
    rudder.position.set(0, 0, 1.9);
    propGroup.add(rudder);
    root.add(propGroup);
    markTarget(propGroup, 'target_propeller', 4);

    const marker = createTargetMarker(5, 0x4fc3f7);
    marker.position.set(0, -4.2, 19.6);
    root.add(marker);
    this.marker = marker;

    // 检查点（左右船舷）
    for (const [x, z, id] of [[7, -5, 'check_port'], [-7, 8, 'check_starboard']] as const) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x8ad5f5, transparent: true, opacity: 0.8 }),
      );
      p.position.set(x, -3, z);
      root.add(p);
      markTarget(p, id, 1.5);
    }

    this.root = root;
    world.add(root);
  }

  update(dt: number, time: number): void {
    if (this.marker) {
      this.marker.rotation.y += dt * 1.2;
      this.marker.position.y = -4 + Math.sin(time * 1.0) * 0.1;
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

export const ShipScene: SceneDefinition = new ShipSceneImpl();
