/**
 * SceneManager：场景加载/卸载/更新（docs/04-渲染与水下环境.md §3）。
 * 支持场景外部 GLTF 模型（gltfModels）异步加载与清理。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LocalFlowZone } from '../core/environment/CurrentField';
import type { SceneDefinition, SceneGltfModel } from './scenes/BaseScene';
import { disposeObject, findTargets } from './scenes/BaseScene';

export class SceneManager {
  private current: SceneDefinition | null = null;
  private gltfRoots: THREE.Group[] = [];
  private loader = new GLTFLoader();

  constructor(
    private world: THREE.Scene,
    private onZonesChanged: (zones: LocalFlowZone[]) => void,
  ) {}

  /** 加载场景（自动卸载旧场景并更新局部流区；外部模型异步加载） */
  load(def: SceneDefinition): void {
    this.dispose();
    def.build(this.world);
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
        root.name = `${def.id}_model_${spec.name}`;
        root.position.set(...(spec.position ?? [0, 0, 0]));
        root.rotation.set(...(spec.rotation ?? [0, 0, 0]));
        root.scale.set(...(spec.scale ?? [1, 1, 1]));
        this.world.add(root);
        this.gltfRoots.push(root);
      } catch (e) {
        console.warn(`[SceneManager] 场景模型加载失败 ${spec.url}:`, e);
      }
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
