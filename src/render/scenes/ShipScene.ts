/**
 * ShipScene：船舶检测场景。
 * 半潜船体 + 螺旋桨（目标）+ 左右检查点。
 */

import * as THREE from 'three';
import type { SceneDefinition } from './BaseScene';
import { markTarget, disposeObject, boxMaterial, createTargetMarker } from './BaseScene';

class ShipSceneImpl implements SceneDefinition {
  readonly id = 'ship';
  readonly name = '船舶检测';
  readonly description = '集装箱货船船底、螺旋桨区域';
  readonly environmentDefaults = { envModel: 'sea' as const, seaState: 2, currentDirectionDeg: 0, turbulence: 0.1, visibility: 15, turbidity: 0.25 };
  readonly spawn = { position: [0, -1.2, 30] as [number, number, number], yawDeg: 0 };
  readonly colliders = [
    { type: 'box' as const, position: new THREE.Vector3(0, -2.5, 0), halfExtents: new THREE.Vector3(4.6, 3.6, 21) }, // 船体
    { type: 'box' as const, position: new THREE.Vector3(0, -2.5, -21), halfExtents: new THREE.Vector3(4, 2.6, 3) }, // 船艏
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

  build(world: THREE.Scene): void {
    const root = new THREE.Group();
    root.name = 'scene_ship';

    // 船体（半潜：水面 0，甲板略露）——集装箱货船
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(10, 7, 42),
      boxMaterial(0x3a3f47, { roughness: 0.8, metalness: 0.4 }),
    );
    hull.position.set(0, -2.5, 0);
    root.add(hull);

    // 船底龙骨（纵贯船底）
    const keel = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 40),
      boxMaterial(0x2b2f35, { roughness: 0.7, metalness: 0.5 }),
    );
    keel.position.set(0, -6.2, 0);
    root.add(keel);

    // 船底板肋条
    for (let i = 0; i < 12; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.3, 0.4),
        boxMaterial(0x464c54, { roughness: 0.8, metalness: 0.4 }),
      );
      rib.position.set(0, -6.0, -18 + i * 3.2);
      root.add(rib);
    }

    // 甲板（露出水面部分）
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.6, 41),
      boxMaterial(0x5c6670, { roughness: 0.7, metalness: 0.3 }),
    );
    deck.position.set(0, 1.2, 0);
    root.add(deck);

    // 集装箱堆（货船甲板，2 列 × 2 层）
    const containerColors = [0xc0392b, 0x2471a3, 0x229954, 0x9a7d0a, 0x7b2e8e, 0xd35400];
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 8; row++) {
        const cx = col === 0 ? -3.2 : 3.2;
        const cz = -16 + row * 4.5;
        for (let layer = 0; layer < 2; layer++) {
          const cont = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 2.4, 4.4),
            boxMaterial(containerColors[(row + col * 8 + layer * 3) % containerColors.length], { roughness: 0.6, metalness: 0.2 }),
          );
          cont.position.set(cx, 3 + layer * 2.4, cz);
          root.add(cont);
        }
      }
    }

    // 船艏（前段）
    const bow = new THREE.Mesh(
      new THREE.BoxGeometry(8, 4, 4),
      boxMaterial(0x3a3f47, { roughness: 0.8, metalness: 0.4 }),
    );
    bow.position.set(0, -1.5, -22);
    bow.rotation.x = -0.15;
    root.add(bow);

    // 螺旋桨（目标）
    const propGroup = new THREE.Group();
    propGroup.position.set(0, -4, 21.5);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10),
      boxMaterial(0xc9a227, { roughness: 0.4, metalness: 0.8 }),
    );
    hub.rotation.x = Math.PI / 2;
    propGroup.add(hub);
    const bladeMat = boxMaterial(0x8d8d99, { roughness: 0.4, metalness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.9), bladeMat);
      const a = (i * Math.PI) / 2;
      blade.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
      blade.rotation.z = a;
      propGroup.add(blade);
    }
    root.add(propGroup);
    markTarget(propGroup, 'target_propeller', 4);

    const marker = createTargetMarker(5, 0x4fc3f7);
    marker.position.set(0, -4, 21.5);
    root.add(marker);
    this.marker = marker;

    // 检查点（左右船舷）——用小型发光球标记
    for (const [x, z, id] of [[7, -5, 'check_port'], [-7, 8, 'check_starboard']] as const) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x8ad5f5, transparent: true, opacity: 0.8 }),
      );
      p.position.set(x, -3, z);
      root.add(p);
      markTarget(p, id, 1.5);
    }

    // 锚链（船艏）
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 16, 6),
      boxMaterial(0x444444, { roughness: 0.6, metalness: 0.7 }),
    );
    chain.position.set(-3, -8, -18);
    chain.rotation.z = 0.6;
    root.add(chain);

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
