/**
 * Engine：Three.js 渲染核心（命令式封装，docs/02-系统架构.md）。
 * 职责：
 * - renderer/scene/camera 生命周期与渲染循环
 * - resize 处理
 * - 加载场景内容（海底地形、ROV 模型、水下效果）
 * - 每帧从 SimulationEngine 读取快照并同步 ROV 位姿
 * - CameraRig 管理三视角（chase Blender 中键 / pov / sonar）
 */

import * as THREE from 'three';
import type { SimulationEngine } from '../core/SimulationEngine';
import { GeneratedROVModel } from './rov/GeneratedROVModel';
import { RovGltfModel } from './rov/RovGltfModel';
import { UnderwaterEffects, type QualityLevel } from './environment/UnderwaterEffects';
import { CameraRig, type ViewMode } from './camera/CameraRig';
import { SceneManager } from './SceneManager';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getScene, type SceneDefinition, disposeObject } from './scenes/BaseScene';
import { fbm3 } from '../utils/noise';
import { seabedHeight } from '../core/terrain';
import { getTexture } from './textures';
import { useAppStore } from '../state/store';

/** 当前视角模式（Engine 循环读，避免类内依赖 store 渲染流程） */
function viewModeNow(): 'chase' | 'pov' {
  return useAppStore.getState().viewMode;
}

export interface EngineOptions {
  quality?: QualityLevel;
}

/** ROV 可视化模型统一接口（代码生成 / GLTF 两类实现） */
export interface ROVVisual {
  readonly root: THREE.Group;
  setLightsOn(on: boolean): void;
  setThrusterAnimations(commands: number[]): void;
  /** 光束锥显隐（第三视角隐藏） */
  setLightConesVisible?(visible: boolean): void;
  /** 机械臂夹爪开合（0=闭合，1=全开，连续角度） */
  setGripper?(open: number): void;
  /** 机械臂整体显隐 */
  setArmVisible?(visible: boolean): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly cameraRig: CameraRig;
  readonly sceneManager: SceneManager;

  private effects: UnderwaterEffects;
  private simulation: SimulationEngine | null = null;
  private rov: ROVVisual | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private container: HTMLElement;
  private disposed = false;
  private simTime = 0;

  constructor(container: HTMLElement, options: EngineOptions = {}) {
    this.container = container;
    const quality = options.quality ?? 'medium';
    this.quality = quality;

    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04131f);
    // 环境反射贴图（金属/塑料/玻璃真实高光，大幅提升写实度）
    if (quality !== 'low') {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(7, -3, 8);

    // 第三视角默认偏移（后上方）由 ChaseCamera 初始化覆盖
    this.cameraRig = new CameraRig(this.camera, [0, 0.18, -0.55]);
    this.sceneManager = new SceneManager(this.scene, (zones) => this.simulation?.applySceneLocalFlow(zones));
    this.sceneManager.quality = quality;
    this.bindPointerEvents();

    this.effects = new UnderwaterEffects(this.scene, quality);

    this.buildSeabed();
    this.buildWaterSurface();
    this.buildSkyLight();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** 挂载仿真核心（GLTF 机型异步加载，加载前用生成模型占位） */
  attachSimulation(sim: SimulationEngine): void {
    this.simulation = sim;
    const lightsOn = sim.getRenderSnapshot().lightsOn;
    const cfg = sim.rovConfig;
    this.removeRov();

    if (cfg.model.type === 'gltf') {
      this.rov = new GeneratedROVModel(cfg, { lightsOn }); // 占位
      this.rov.root.userData.sonarExclude = true;
      this.scene.add(this.rov.root);
      RovGltfModel.load(cfg)
        .then((gltfRov) => {
          if (this.disposed || this.simulation !== sim) return;
          this.removeRov();
          gltfRov.setLightsOn(lightsOn);
          this.rov = gltfRov;
          this.scene.add(gltfRov.root);
          // 模型提供 pov_cam 锚点（且非原点标记）时覆盖相机偏移
          if (gltfRov.povAnchor && gltfRov.povAnchor.position.lengthSq() > 0.0001) {
            const p = gltfRov.povAnchor.position;
            this.cameraRig.pov.setPovOffset([p.x, p.y, p.z]);
          }
        })
        .catch((e) => console.warn('[Engine] GLTF 机型加载失败，使用生成模型：', e));
    } else {
      this.rov = new GeneratedROVModel(cfg, { lightsOn });
      this.rov.root.userData.sonarExclude = true;
      this.scene.add(this.rov.root);
    }
    this.rov.root.position.copy(this.simulation.getRenderSnapshot().position);

    // 相机轨道初始位置对准 ROV
    const s = sim.getRenderSnapshot();
    const pos = new THREE.Vector3(s.position.x, s.position.y, s.position.z);
    const yaw = (s.euler.yaw * Math.PI) / 180;
    this.cameraRig.chase.reset(pos, yaw);
  }

  private removeRov(): void {
    if (this.rov) {
      this.rov.root.removeFromParent();
      disposeObject(this.rov.root);
      this.rov = null;
    }
  }

  setViewMode(mode: ViewMode): void {
    this.cameraRig.setMode(mode);
  }

  /** 机械臂夹爪开合（0=闭合，1=全开） */
  setGripper(open: number): void {
    this.rov?.setGripper?.(open);
  }

  /** 机械臂整体显隐（打捞场景挂载，其余不挂载） */
  setArmVisible(visible: boolean): void {
    this.rov?.setArmVisible?.(visible);
  }

  /** 滚轮功能：'camera'=相机缩放；'gripper'=夹爪开合 */
  wheelMode: 'camera' | 'gripper' = 'camera';
  /** 夹爪滚轮回调（TrainingScreen 设置） */
  onGripperWheel: ((deltaY: number) => void) | null = null;

  /** 加载作业场景（构建 + 局部流区 + 环境默认值 + 重置 ROV 到出生点） */


  loadScene(sceneId: string): SceneDefinition | null {
    const def = getScene(sceneId);
    if (!def) return null;
    this.sceneManager.load(def);
    this.simulation?.environment.reset(def.environmentDefaults);
    this.simulation?.setSceneColliders(def.colliders ?? []);
    this.simulation?.reset({
      position: new THREE.Vector3(...def.spawn.position),
      yawDeg: def.spawn.yawDeg,
    });
    // 机械臂仅打捞场景挂载
    this.rov?.setArmVisible?.(sceneId === 'salvage');
    const s = this.simulation?.getRenderSnapshot();
    if (s) {
      this.cameraRig.chase.reset(
        new THREE.Vector3(s.position.x, s.position.y, s.position.z),
        (s.euler.yaw * Math.PI) / 180,
      );
    }
    return def;
  }

  /** 场景目标物（任务系统） */
  getSceneTargets(): Map<string, { position: { x: number; y: number; z: number }; radius: number }> {
    return this.sceneManager.getTargets();
  }

  /** 声纳采样起点：与 POV 摄像头同位置（ROV 位置 + povOffset 旋转变换） */
  getSonarOrigin(snapshot: ReturnType<SimulationEngine['getRenderSnapshot']>): THREE.Vector3 {
    const off = this.cameraRig.pov.getPovOffset();
    const q = new THREE.Quaternion(snapshot.quaternion.x, snapshot.quaternion.y, snapshot.quaternion.z, snapshot.quaternion.w);
    return new THREE.Vector3(off[0], off[1], off[2]).applyQuaternion(q).add(
      new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z),
    );
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.sceneManager.quality = q;
    this.effects.setQuality(q);
    // low→high 切换时补建环境反射贴图（金属/塑料高光）
    if (q !== 'low' && !this.scene.environment) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** 访问仿真核心（声纳采样等需要） */
  get simulationEngine(): SimulationEngine | null {
    return this.simulation;
  }

  // ---- 鼠标交互（Blender 风格：中键旋转/缩放/平移）----

  private bindPointerEvents(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';

    el.addEventListener('pointerdown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.cameraRig.onPointerDown(e.clientX, e.clientY, 1, e.shiftKey);
        el.setPointerCapture(e.pointerId);
        el.style.cursor = e.shiftKey ? 'grabbing' : 'grabbing';
      }
    });
    el.addEventListener('pointermove', (e) => {
      this.cameraRig.onPointerMove(e.clientX, e.clientY, e.buttons);
    });
    el.addEventListener('pointerup', () => {
      this.cameraRig.onPointerUp();
      el.style.cursor = 'grab';
    });
    el.addEventListener('pointercancel', () => {
      this.cameraRig.onPointerUp();
      el.style.cursor = 'grab';
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.wheelMode === 'gripper') {
        this.onGripperWheel?.(e.deltaY);
      } else if (this.cameraRig.mode === 'chase') {
        this.cameraRig.onWheel(e.deltaY);
      }
    }, { passive: false });
    // 禁止中键点击的浏览器自动滚动
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private loop(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const rawDt = this.clock.getDelta();
    const dt = Math.min(Math.max(rawDt, 0), 0.1); // 切后台回来防大跳

    // 物理步进
    this.simulation?.step(dt);

    // 同步 ROV 位姿与灯光
    let snap: ReturnType<SimulationEngine['getRenderSnapshot']> | null = null;
    if (this.simulation && this.rov) {
      snap = this.simulation.getRenderSnapshot();
      this.rov.root.position.set(snap.position.x, snap.position.y, snap.position.z);
      this.rov.root.quaternion.set(snap.quaternion.x, snap.quaternion.y, snap.quaternion.z, snap.quaternion.w);
      this.rov.setLightsOn(snap.lightsOn);
      // 光锥仅第一视角（POV）可见；第三视角隐藏
      this.rov.setLightConesVisible?.(viewModeNow() === 'pov');
      this.rov.setThrusterAnimations(snap.thrusterCommands);
    }

    // 水下环境同步 + 场景每帧动画
    this.simTime += dt;
    this.effects.update(this.simulation?.environment.get() ?? {
      envModel: 'custom' as const, seaState: 0, riverKnots: 0,
      currentSpeed: 0, currentDirectionDeg: 0, turbulence: 0.2,
      visibility: 25, temperatureC: 8, turbidity: 0.15, sunlight: 0.8, lightFlicker: 0.2,
    }, dt, this.simTime);
    this.sceneManager.update(dt, this.simTime);

    // 相机（三视角）
    if (snap) {
      this.cameraRig.update(snap, dt);
    }

    this.updateWater(dt);

    this.renderer.render(this.scene, this.camera);
  }

  private quality: QualityLevel = 'medium';
  /** 脐带缆渲染：浮标 + 缆绳线 */

  /** 水面（y=0）：半透明蓝绿面 + 涟漪顶点动画（与天空亮蓝区分） */
  private waterMesh: THREE.Mesh | null = null;
  private waterBaseY: Float32Array | null = null;
  private waterPhase = 0;

  private buildWaterSurface(): void {
    // 细分平面（±200m 覆盖活动范围），顶点动画做涟漪
    const geo = new THREE.PlaneGeometry(400, 400, 64, 64);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.waterBaseY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.waterBaseY[i] = pos.getY(i);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x5fb8d8,
      transparent: true,
      opacity: 0.55,
      roughness: 0.12,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = 0.04;
    water.name = 'water_surface';
    water.renderOrder = 10;
    (water.userData as Record<string, unknown>).sonarExclude = true; // 声纳不遍历水面大网格
    this.waterMesh = water;
    this.scene.add(water);
  }

  /** 涟漪：顶点正弦波动画（低频涌 + 高频细波） */
  private waterTick = 0;

  private updateWater(dt: number): void {
    if (this.quality === 'low') return; // 低画质关闭涟漪
    if (!this.waterMesh || !this.waterBaseY) return;
    // 隔帧更新（30Hz 视觉足够，省一半顶点计算）
    this.waterTick = 1 - this.waterTick;
    if (this.waterTick !== 1) return;
    this.waterPhase += dt;
    const t = this.waterPhase;
    const pos = this.waterMesh.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.waterBaseY;
    const mesh = this.waterMesh;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y =
        Math.sin(x * 0.25 + t * 1.1) * Math.sin(z * 0.2 + t * 0.9) * 0.09 +
        Math.sin(x * 0.8 + z * 0.6 + t * 2.2) * 0.035;
      pos.setY(i, base[i] + y);
    }
    pos.needsUpdate = true;
    this.waterMesh.geometry.computeVertexNormals();
    void mesh;
  }

  /** 天空（水面上方）：亮蓝天 + 太阳光斑 + 白云，与半透明水面明显区分 */
  private buildSkyLight(): void {
    const geo = new THREE.PlaneGeometry(5000, 5000);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xdcefff,
      side: THREE.DoubleSide,
      fog: false, // 不受水下雾影响，始终明亮
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.rotation.x = Math.PI / 2;
    sky.position.y = 80;
    sky.name = 'sky_light';
    (sky.userData as Record<string, unknown>).sonarExclude = true;
    this.scene.add(sky);

    // 太阳光斑（更亮，靠上）
    const sunGeo = new THREE.PlaneGeometry(260, 260);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff7d6,
      side: THREE.DoubleSide,
      fog: false,
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.rotation.x = Math.PI / 2;
    sun.position.set(-900, 85, 300);
    sun.name = 'sky_sun';
    (sun.userData as Record<string, unknown>).sonarExclude = true;
    this.scene.add(sun);

    // 白云（几个半透明白平面）
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      fog: false,
    });
    const cloudSpecs: [number, number, number, number][] = [
      [200, 82, 340, 130], [600, 83, -260, 110], [-350, 82, 120, 150], [150, 84, 700, 90],
    ];
    for (const [cx, cy, cz, cw] of cloudSpecs) {
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(cw, cw * 0.42), cloudMat);
      cloud.rotation.x = Math.PI / 2;
      cloud.position.set(cx, cy, cz);
      cloud.name = 'sky_cloud';
      (cloud.userData as Record<string, unknown>).sonarExclude = true;
      this.scene.add(cloud);
    }
  }

  /** 海底地形（程序化生成，M1 基础版；M5 由各场景覆盖） */
  private buildSeabed(): void {
    const size = 400;
    const segs = 64; // 64×64 ≈ 8k 三角形：声纳 Raycaster 采样性能与渲染精度折中
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = seabedHeight(x, z);
      pos.setY(i, y);
    }
    // 顶点色：高处沙亮色、低处泥暗色（地形层次更明显）
    const cSand = new THREE.Color(0xc2ab7c);
    const cMud = new THREE.Color(0x59472f);
    const cTmp = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((y + 14.2) / 4.6, 0, 1);
      cTmp.copy(cMud).lerp(cSand, t);
      colors[i * 3] = cTmp.r;
      colors[i * 3 + 1] = cTmp.g;
      colors[i * 3 + 2] = cTmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
      vertexColors: true,
      map: getTexture('mud'),
    });
    const seabed = new THREE.Mesh(geo, mat);
    seabed.receiveShadow = true;
    seabed.name = 'seabed';
    seabed.userData.sonarGround = true; // 声纳采样：海底用解析 ray-march，不 raycast 大网格
    this.scene.add(seabed);

    // 环境点缀：岩石
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x44505a, roughness: 0.9, flatShading: true });
    const rng = (i: number) => {
      const x = (Math.sin(i * 127.1) * 43758.5453) % 1;
      return Math.abs(x);
    };
    for (let i = 0; i < 40; i++) {
      const x = (rng(i) - 0.5) * size * 0.8;
      const z = (rng(i + 100) - 0.5) * size * 0.8;
      const y = -12 + fbm3(x * 0.02, z * 0.02, 3, 4) * 2.2;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.6 + rng(i + 200) * 2.2;
      rock.scale.set(s, s * 0.7, s);
      rock.position.set(x, y - s * 0.25, z);
      rock.rotation.set(rng(i + 300) * Math.PI, rng(i + 400) * Math.PI, 0);
      this.scene.add(rock);
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.sceneManager.dispose();
    this.scene.environment?.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
