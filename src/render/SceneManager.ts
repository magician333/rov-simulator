/**
 * SceneManager：场景加载/卸载/更新（docs/04-渲染与水下环境.md §3）。
 * 支持场景外部 GLTF 模型（gltfModels）异步加载与清理。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LocalFlowZone } from '../core/environment/CurrentField';
import type { SceneDefinition, SceneGltfModel } from './scenes/BaseScene';
import { disposeObject, findTargets } from './scenes/BaseScene';
import type { QualityLevel } from './environment/UnderwaterEffects';

export class SceneManager {
  private current: SceneDefinition | null = null;
  private gltfRoots: THREE.Group[] = [];
  private loader = new GLTFLoader();
  /** 图形质量（决定场景细节密度） */
  quality: QualityLevel = 'high';

  constructor(
    private world: THREE.Scene,
    private onZonesChanged: (zones: LocalFlowZone[]) => void,
  ) {}

  /** 加载场景（自动卸载旧场景并更新局部流区；外部模型异步加载） */
  load(def: SceneDefinition): void {
    this.dispose();
    def.build(this.world, this.quality);
    this.onZonesChanged(def.localFlowZones);
    this.current = def;
    if (def.gltfModels?.length) {
      void this.loadGltfModels(def);
    }
  }

  private async loadGltfModels(def: SceneDefinition): Promise<void> {
    for (const spec of def.gltfModels ?? []) {
      try {
        const root = await this.loadGltf(spec);
        // 竞态守卫：加载期间已切换场景则丢弃（避免模型串场）
        if (this.current !== def) {
          disposeObject(root);
          return;
        }
        root.name = `${def.id}_model_${spec.name}`;
        this.applyGltfTransform(root, spec);
        this.world.add(root);
        this.gltfRoots.push(root);
      } catch (e) {
        console.warn(`[SceneManager] 场景模型加载失败 ${spec.url}:`, e);
      }
    }
  }

  /** 应用显式变换 + 自适应放置（fit：水平化 + 缩放 + 底部对齐） */
  private applyGltfTransform(root: THREE.Group, spec: SceneGltfModel): void {
    if (spec.fit) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      // 长轴在 Y（模型立着）→ 绕 X 转水平（长轴 → Z）
      if (size.y > size.x && size.y > size.z) root.rotation.x = -Math.PI / 2;
      root.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(root);
      const s2 = box2.getSize(new THREE.Vector3());
      const scale = spec.fit.targetLength / Math.max(0.01, s2.z);
      root.scale.setScalar(scale);
      root.updateMatrixWorld(true);
      const box3 = new THREE.Box3().setFromObject(root);
      root.position.y += spec.fit.bottomY - box3.min.y; // 底部对齐目标水深
      const c = box3.getCenter(new THREE.Vector3());
      root.position.x -= c.x;
      root.position.z -= c.z;
      root.updateMatrixWorld(true);
    } else {
      root.position.set(...(spec.position ?? [0, 0, 0]));
      root.rotation.set(...(spec.rotation ?? [0, 0, 0]));
      root.scale.set(...(spec.scale ?? [1, 1, 1]));
    }
  }

  private async loadGltf(spec: SceneGltfModel): Promise<THREE.Group> {
    const gltf = await this.loader.loadAsync(spec.url);
    return gltf.scene;
  }

  update(dt: number, time: number): void {
    this.current?.update?.(dt, time);
  }

  /** 场景目标物（任务系统读取） */
  getTargets(): Map<string, { position: { x: number; y: number; z: number }; radius: number }> {
    return findTargets(this.world);
  }

  get currentScene(): SceneDefinition | null {
    return this.current;
  }

  dispose(): void {
    this.current?.dispose();
    this.current = null;
    this.onZonesChanged([]);
    for (const r of this.gltfRoots) {
      disposeObject(r);
      r.removeFromParent();
    }
    this.gltfRoots = [];
  }
}
