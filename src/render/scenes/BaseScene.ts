/**
 * BaseScene：场景接口、注册表与公共工具（docs/04-渲染与水下环境.md §3）。
 * 场景通过注册表扩展；核心引擎只认 SceneDefinition 接口。
 */

import * as THREE from 'three';
import type { EnvironmentParams } from '../../core/environment/EnvironmentState';
import type { LocalFlowZone } from '../../core/environment/CurrentField';
import type { ColliderShape } from '../../core/physics/Collider';
import { seabedHeight } from '../../core/terrain';

export interface SceneSpawn {
  position: [number, number, number];
  yawDeg: number;
}

/** 场景外部模型（GLTF）：船舶/桥梁等结构体，后续由建模方提供 */
export interface SceneGltfModel {
  /** 逻辑名（日志/调试用） */
  name: string;
  /** 模型地址（public/models/scenes/...） */
  url: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface SceneDefinition {
  id: string;
  name: string;
  description: string;
  /** 场景默认环境参数 */
  environmentDefaults: Partial<EnvironmentParams>;
  /** ROV 出生点 */
  spawn: SceneSpawn;
  /** 局部水流增强区 */
  localFlowZones: LocalFlowZone[];
  /** 外部 GLTF 模型（可选，异步加载，加载完成后显示） */
  gltfModels?: SceneGltfModel[];
  /** 碰撞体（球/盒），ROV 不可穿过；海底高度场碰撞始终启用 */
  colliders?: ColliderShape[];
  /** 构建场景物体（程序化几何 + 目标物标记） */
  build(world: THREE.Scene): void;
  /** 每帧动画（目标标记旋转等） */
  update?(dt: number, time: number): void;
  /** 清理场景物体 */
  dispose(): void;
}

// ---- 注册表 ----

const registry = new Map<string, SceneDefinition>();

export function registerScene(def: SceneDefinition): void {
  registry.set(def.id, def);
}

export function getScene(id: string): SceneDefinition | undefined {
  return registry.get(id);
}

export function listScenes(): SceneDefinition[] {
  return [...registry.values()];
}

// ---- 公共工具 ----

/** 标记目标物（任务系统读取 userData.taskTarget） */
export function markTarget(obj: THREE.Object3D, id: string, radius: number): void {
  (obj.userData as Record<string, unknown>).taskTarget = { id, radius };
}

/** 标记可夹取道具（机械臂夹取系统读取 userData.grabbable / gripSize） */
export function markGrabbable(obj: THREE.Object3D, name: string, gripSize = 0.2): void {
  obj.name = name;
  const u = obj.userData as Record<string, unknown>;
  u.grabbable = true;
  u.gripSize = gripSize;
}

/** 查找场景中的目标物（递归） */
export function findTargets(world: THREE.Scene): Map<string, { position: { x: number; y: number; z: number }; radius: number }> {
  const result = new Map<string, { position: { x: number; y: number; z: number }; radius: number }>();
  world.traverse((obj) => {
    const t = (obj.userData as { taskTarget?: { id: string; radius: number } }).taskTarget;
    if (t && !result.has(t.id)) {
      obj.updateWorldMatrix(true, false);
      const p = obj.getWorldPosition(new THREE.Vector3());
      result.set(t.id, { position: { x: p.x, y: p.y, z: p.z }, radius: t.radius });
    }
  });
  return result;
}

/** 递归释放几何与材质 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh.material as THREE.Material | THREE.Material[] | undefined);
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

/** 通用材质工厂（场景共用，避免重复创建） */
export function boxMaterial(color: number, opts: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

/** 创建带目标标记环的辅助：返回 { mesh, marker } */
export function createTargetMarker(radius: number, color: number): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.08, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
  );
  marker.rotation.x = Math.PI / 2;
  return marker;
}

/** 海草/水草点缀（场景细节）：在海底 (x,z) 附近随机几丛 */
export function addSeaweed(root: THREE.Object3D, x: number, z: number, count = 6): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 });
  const mat2 = new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.8 });
  for (let i = 0; i < count; i++) {
    const h = 0.6 + Math.random() * 1.0;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, h, 0.07),
      i % 2 === 0 ? mat : mat2,
    );
    const bx = x + (Math.random() - 0.5) * 2.4;
    const bz = z + (Math.random() - 0.5) * 2.4;
    blade.position.set(bx, seabedHeight(bx, bz) + h / 2, bz);
    blade.rotation.z = (Math.random() - 0.5) * 0.5;
    blade.rotation.x = (Math.random() - 0.5) * 0.3;
    (blade.userData as Record<string, unknown>).sonarExclude = true; // 细装饰不入声纳采样
    root.add(blade);
  }
}
