/**
 * RovGltfModel：外部 GLTF 机型模型（docs/06-机型场景与任务.md §2.3）。
 * 模型规范：根节点前向 -Z、单位米、Y 向上；命名锚点节点：
 *   - light_{id}（补光灯挂载点，或 fallback light_0/light_main）
 *   - pov_cam（第一视角相机锚点，覆盖 ROVConfig.povOffset）
 *   - thruster_N（推进器转子动画节点，可选）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ROVConfig } from '../../core/rov/ROVConfig';

const MAT_LAMP_EMISSIVE = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 2,
});

export class RovGltfModel {
  readonly root: THREE.Group;
  /** 第一视角相机锚点（若模型提供） */
  readonly povAnchor: THREE.Object3D | null;

  private lights: THREE.SpotLight[] = [];
  private lampBulbs: THREE.Mesh[] = [];
  private rotors: THREE.Object3D[] = [];
  private readonly lightAnchors: THREE.Object3D[] = [];
  private clawL: THREE.Object3D | null = null;
  private clawR: THREE.Object3D | null = null;

  private constructor(
    private cfg: ROVConfig,
    root: THREE.Group,
  ) {
    this.root = root;
    this.root.userData.sonarExclude = true;
    this.root.rotation.order = 'YXZ';
    this.povAnchor = this.findAnchor('pov_cam');
    this.findAnchors();
    this.attachLights();
    this.setLightsOn(false);
  }

  /** 异步加载 GLTF 机型（应用可选的 scale/rotation transform） */
  static async load(cfg: ROVConfig): Promise<RovGltfModel> {
    if (cfg.model.type !== 'gltf') throw new Error('机型未配置 GLTF 模型');
    const gltf = await new GLTFLoader().loadAsync(cfg.model.url);
    const root = gltf.scene;
    if (cfg.model.scale !== undefined) {
      if (typeof cfg.model.scale === 'number') root.scale.setScalar(cfg.model.scale);
      else root.scale.set(...cfg.model.scale);
    }
    if (cfg.model.rotation) root.rotation.set(...cfg.model.rotation);
    return new RovGltfModel(cfg, root);
  }

  private findAnchor(name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.root.traverse((obj) => {
      if (obj.name === name) found = obj;
    });
    return found;
  }

  private findAnchors(): void {
    this.root.traverse((obj) => {
      if (obj.name.startsWith('light_')) this.lightAnchors.push(obj);
      // 转子动画只针对有实际位置偏移的推进器节点（原点标记节点无动画意义）
      if (/^thruster_\d+$/.test(obj.name) && obj.position.lengthSq() > 0.0001) this.rotors.push(obj);
      if (obj.name === 'claw_left') this.clawL = obj;
      if (obj.name === 'claw_right') this.clawR = obj;
    });
  }

  /** 夹爪开合动画（claw_left / claw_right 节点绕 Z 旋转，open ∈ [0,1]，明显张角） */
  setGripper(open: number): void {
    const a = 0.1 + open * 0.5;
    if (this.clawL) this.clawL.rotation.z = -a;
    if (this.clawR) this.clawR.rotation.z = a;
  }

  /** 按锚点挂载补光灯（锚点缺失或位于原点时用配置位置） */
  private attachLights(): void {
    this.cfg.lights.forEach((l, i) => {
      const anchor =
        this.lightAnchors.find((n) => n.name === `light_${l.id}`) ??
        this.lightAnchors.find((n) => n.name === 'light_main') ??
        this.lightAnchors[i] ??
        null;
      const anchorPos = anchor && anchor.position.lengthSq() > 0.0001 ? anchor.position : null;
      const pos = anchorPos ?? new THREE.Vector3(...l.position);

      const spot = new THREE.SpotLight(l.color, 0, l.range, l.angle, 0.45, 0.8);
      spot.position.copy(pos);
      spot.target.position.copy(pos).add(new THREE.Vector3(0, 0, -20));
      this.root.add(spot);
      this.root.add(spot.target);
      this.lights.push(spot);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), MAT_LAMP_EMISSIVE);
      bulb.position.copy(pos);
      this.root.add(bulb);
      this.lampBulbs.push(bulb);
    });
  }

  setLightsOn(on: boolean): void {
    this.cfg.lights.forEach((l, i) => {
      this.lights[i].intensity = on ? l.intensity : 0;
      this.lampBulbs[i].visible = on;
    });
  }

  setThrusterAnimations(commands: number[]): void {
    this.rotors.forEach((r, i) => {
      const c = Math.abs(commands[i] ?? 0);
      r.rotation.y += c * 0.35;
    });
  }
}
