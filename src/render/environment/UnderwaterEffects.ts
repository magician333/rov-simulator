/**
 * UnderwaterEffects：水下视觉环境。
 * - 水下雾（FogExp2，随能见度/浊度）
 * - 太阳光（平行光，随 sunlight / lightFlicker 闪烁）
 * - 环境光（随浊度着色）
 * - 悬浮物粒子（Marine Snow）：数量/密度随浊度实时变化，受水流漂移
 * 性能策略：不启用后处理，用雾+灯光+粒子组合模拟。
 */

import * as THREE from 'three';
import type { EnvironmentParams } from '../../core/environment/EnvironmentState';
import { deg2rad } from '../../utils/units';

const FOG_COLOR = new THREE.Color(0x0a2433);
const SUN_DIR = new THREE.Vector3(-0.35, 0.85, -0.35).normalize();

export type QualityLevel = 'low' | 'medium' | 'high';

const PARTICLE_POOL = 2000;
const PARTICLE_X = 170;
const PARTICLE_Z = 170;
const PARTICLE_HALF_Y = 13;
const PARTICLE_CENTER_Y = -9;

export class UnderwaterEffects {
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  private fog: THREE.FogExp2;
  private flickerPhase = 0;
  private quality: QualityLevel;
  /** 底部淤泥浑浊度 0..1（ROV 触底/近底时由 Engine 更新） */
  private sediment = 0;

  // 悬浮物粒子
  private particlePoints: THREE.Points;
  private particlePos: Float32Array;
  private readonly particleGeo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, quality: QualityLevel = 'medium') {
    this.quality = quality;

    this.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.03);
    scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xbfd9ff, 1.4);
    this.sun.position.copy(SUN_DIR).multiplyScalar(300);
    this.sun.castShadow = quality !== 'low';
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.camera.near = 10;
      this.sun.shadow.camera.far = 700;
      this.sun.shadow.camera.left = -60;
      this.sun.shadow.camera.right = 60;
      this.sun.shadow.camera.top = 60;
      this.sun.shadow.camera.bottom = -60;
    }
    scene.add(this.sun);

    this.ambient = new THREE.AmbientLight(0x446688, 0.55);
    scene.add(this.ambient);

    // 悬浮物粒子池
    this.particlePos = new Float32Array(PARTICLE_POOL * 3);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      this.particlePos[i * 3] = (Math.random() - 0.5) * 2 * PARTICLE_X;
      this.particlePos[i * 3 + 1] = PARTICLE_CENTER_Y + (Math.random() - 0.5) * 2 * PARTICLE_HALF_Y;
      this.particlePos[i * 3 + 2] = (Math.random() - 0.5) * 2 * PARTICLE_Z;
    }
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb8d4e0,
      size: 0.11,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particlePoints = new THREE.Points(this.particleGeo, mat);
    this.particlePoints.frustumCulled = false;
    scene.add(this.particlePoints);
  }

  /** 每帧根据环境参数同步视觉（雾/光/粒子） */
  update(env: Readonly<EnvironmentParams>, dt: number, time: number): void {
    // 触底淤泥：近底翻起的沉积物使视野浑浊（叠加在雾上）
    this.fog.density = this.fogDensity(env) + this.sediment * 0.22;

    this.flickerPhase += dt;
    const wave = 0.5 + 0.5 * Math.sin(this.flickerPhase * 1.9) * Math.sin(this.flickerPhase * 0.53);
    const flicker = 1 - env.lightFlicker * 0.35 * wave;
    const turbidityDim = 1 - env.turbidity * 0.45;
    this.sun.intensity = 1.4 * env.sunlight * flicker * turbidityDim;
    this.sun.color.setHSL(0.58, 0.35, 0.9 - env.turbidity * 0.3);
    this.ambient.intensity = 0.55 * (0.5 + 0.5 * env.sunlight);

    this.updateParticles(env, dt, time);
  }

  /** 粒子数量/漂移随浊度与水流变化 */
  private updateParticles(env: Readonly<EnvironmentParams>, dt: number, time: number): void {
    // 数量：浊度 0 → 250（基础悬浮物），浊度 1 → 1950；质量档位缩放
    const qualityScale = this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.7 : 0.4;
    // 低能见度（<5m）与触底淤泥时粒子大幅增多（充满悬浮物）
    const visBoost = env.visibility < 5 ? (1 - env.visibility / 5) * 900 : 0;
    const sedBoost = this.sediment * 600;
    const target = Math.min(PARTICLE_POOL, Math.round((250 + env.turbidity * 1700 + visBoost + sedBoost) * qualityScale));
    this.particleGeo.setDrawRange(0, target);
    // 粒子尺寸：低能见度/触底时放大（更密更实的悬浮感）
    const mat = this.particlePoints.material as THREE.PointsMaterial;
    const visSize = env.visibility < 5 ? (1 - env.visibility / 5) * 0.1 : 0;
    mat.size = 0.11 + visSize + this.sediment * 0.06;

    // 水流漂移（世界系基准流 + 扰动）
    const speed = env.currentSpeed;
    const rad = deg2rad(env.currentDirectionDeg);
    const dx = Math.sin(rad) * speed;
    const dz = Math.cos(rad) * speed;
    const turb = env.turbulence;

    const pos = this.particlePos;
    for (let i = 0; i < target; i++) {
      const ix = i * 3;
      pos[ix] += (dx + Math.sin(time * 0.7 + i * 0.13) * 0.06 * turb) * dt;
      pos[ix + 1] += (Math.sin(time * 0.5 + i * 0.31) * 0.05 * turb + (turb > 0.1 ? 0.04 : 0.0)) * dt;
      pos[ix + 2] += (dz + Math.cos(time * 0.6 + i * 0.17) * 0.06 * turb) * dt;

      // 回卷（torus 环绕）
      if (pos[ix] > PARTICLE_X) pos[ix] = -PARTICLE_X;
      else if (pos[ix] < -PARTICLE_X) pos[ix] = PARTICLE_X;
      if (pos[ix + 1] > PARTICLE_CENTER_Y + PARTICLE_HALF_Y) pos[ix + 1] = PARTICLE_CENTER_Y - PARTICLE_HALF_Y;
      else if (pos[ix + 1] < PARTICLE_CENTER_Y - PARTICLE_HALF_Y) pos[ix + 1] = PARTICLE_CENTER_Y + PARTICLE_HALF_Y;
      if (pos[ix + 2] > PARTICLE_Z) pos[ix + 2] = -PARTICLE_Z;
      else if (pos[ix + 2] < -PARTICLE_Z) pos[ix + 2] = PARTICLE_Z;
    }
    this.particleGeo.attributes.position.needsUpdate = true;
  }

  /** 触底淤泥浑浊度（0=无，1=完全翻起）；驱动雾密度与近底粒子 */
  setSediment(level: number): void {
    this.sediment = Math.max(0, Math.min(1, level));
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.sun.castShadow = q !== 'low';
    // low→high 切换时补配阴影相机与分辨率（构造时仅 high 初始化）
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.camera.near = 10;
      this.sun.shadow.camera.far = 700;
      this.sun.shadow.camera.left = -60;
      this.sun.shadow.camera.right = 60;
      this.sun.shadow.camera.top = 60;
      this.sun.shadow.camera.bottom = -60;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
  }

  /**
   * 能见度/浊度 → 雾密度。
   * 浊度渐进失效：有效能见度 = visibility × (1 - turbidity×0.7)
   * 浊度 0 → 视距 ~35m；0.5 → ~19m；1.0 → ~8m（逐渐无法看清，但仍可作业）
   */
  private fogDensity(env: Readonly<EnvironmentParams>): number {
    // 支持最低 0.2m 能见度：密度标准 = 在"能见度距离"处衰减到约 16%（低能见度时几乎看不见远处轮廓）
    const v = Math.max(0.2, env.visibility);
    const effV = Math.max(0.15, v * (1 - env.turbidity * 0.7));
    return (1 / (effV * 0.55)) * (1 + env.turbidity * 0.35);
  }
}
