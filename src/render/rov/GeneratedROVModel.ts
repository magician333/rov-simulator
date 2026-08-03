/**
 * GeneratedROVModel：代码生成 ROV 模型（参数化，docs/06 §2）。
 * - standard（BlueROV2 参考）：铝管框架 + 双水平耐压舱 + 顶部泡沫 + 护环推进器 + 机械臂
 * - m2（CHASING M2 参考）：紧凑黑色箱式 + 黄色浮力块 + 机械臂
 * 机械臂夹爪可动（setGripper 开合动画）。
 */

import * as THREE from 'three';
import type { ROVConfig, ThrusterSpec } from '../../core/rov/ROVConfig';
import { getTexture } from '../textures';

export interface GeneratedROVModelOptions {
  lightsOn?: boolean;
}

export class GeneratedROVModel {
  readonly root: THREE.Group;
  private cfg: ROVConfig;
  private variant: 'standard' | 'm2';

  private lights: THREE.SpotLight[] = [];
  private lampBulbs: THREE.Mesh[] = [];
  private lightCones: THREE.Mesh[] = [];
  private lightPoints: THREE.PointLight[] = [];
  private rotors: THREE.Object3D[] = [];
  private jawL: THREE.Object3D | null = null;
  private jawR: THREE.Object3D | null = null;
  private armGroup: THREE.Group | null = null;

  // 材质（按 variant）
  private matFrame!: THREE.Material;
  private matBuoyancy!: THREE.Material;
  private matHull!: THREE.Material;
  private matDuct!: THREE.Material;
  private matRotor!: THREE.Material;
  private matArm!: THREE.Material;
  private matGripper!: THREE.Material;

  constructor(cfg: ROVConfig, options: GeneratedROVModelOptions = {}) {
    this.cfg = cfg;
    this.variant = cfg.visualVariant ?? 'standard';
    this.root = new THREE.Group();
    this.root.name = 'ROV_' + cfg.id;
    this.root.rotation.order = 'YXZ';
    this.initMaterials();

    this.buildFrame();
    this.buildBuoyancy();
    this.buildHull();
    this.buildElectronics();
    this.buildThrusters();
    this.buildLights(options.lightsOn ?? false);
    this.buildCamera();
    this.buildArm();
    this.buildDetails();
  }

  private initMaterials(): void {
    if (this.variant === 'm2') {
      // CHASING M2 参考：紧凑黑色箱式 + 黄色浮力块
      this.matFrame = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.55, map: getTexture('deepmetal') });
      this.matBuoyancy = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.55, metalness: 0.15 });
      this.matHull = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.45, metalness: 0.6, map: getTexture('deepmetal') });
      this.matDuct = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.55 });
      this.matRotor = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.65 });
      this.matArm = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.45, metalness: 0.6 });
      this.matGripper = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.5, metalness: 0.3 });
    } else {
      // BlueROV2 参考：黑铝管 + 白色泡沫 + 深蓝耐压舱
      this.matFrame = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.45, metalness: 0.6 });
      this.matBuoyancy = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.6, metalness: 0.05 });
      this.matHull = new THREE.MeshStandardMaterial({ color: 0x17456e, roughness: 0.4, metalness: 0.5, map: getTexture('plate') });
      this.matDuct = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.4, metalness: 0.6 });
      this.matRotor = new THREE.MeshStandardMaterial({ color: 0x8d99ae, roughness: 0.3, metalness: 0.7 });
      this.matArm = new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.45, metalness: 0.6 });
      this.matGripper = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.5, metalness: 0.3 });
    }
  }

  /** 铝管框架（半开放，BlueROV2 风格） */
  private buildFrame(): void {
    const { length, width, height } = this.cfg.dimensions;
    const hx = width / 2;
    const hy = height / 2;
    const hz = length / 2;
    const r = 0.022;
    const seg = 10;
    const makeTube = (len: number, ax: 'x' | 'y' | 'z') => {
      const geo = new THREE.CylinderGeometry(r, r, len, seg);
      const m = new THREE.Mesh(geo, this.matFrame);
      if (ax === 'x') m.rotation.z = Math.PI / 2;
      else if (ax === 'z') m.rotation.x = Math.PI / 2;
      return m;
    };

    // 四角竖管
    for (const sx of [hx, -hx]) {
      for (const sz of [hz, -hz]) {
        const post = makeTube(height, 'y');
        post.position.set(sx, 0, sz);
        this.root.add(post);
      }
    }
    // 上下两层水平管（纵 2 + 横 2）
    for (const sy of [hy - 0.02, -hy + 0.02]) {
      const long1 = makeTube(length, 'z');
      long1.position.set(hx, sy, 0);
      const long2 = long1.clone();
      long2.position.x = -hx;
      const lat1 = makeTube(width, 'x');
      lat1.position.set(0, sy, hz);
      const lat2 = lat1.clone();
      lat2.position.z = -hz;
      this.root.add(long1, long2, lat1, lat2);
    }
  }

  /** 顶部浮力块 */
  private buildBuoyancy(): void {
    const { length, width } = this.cfg.dimensions;
    const blockH = this.variant === 'm2' ? 0.1 : 0.09;
    const blocks = this.variant === 'm2' ? 1 : 2;
    for (let i = 0; i < blocks; i++) {
      const x = this.variant === 'm2' ? 0 : (i === 0 ? width * 0.25 : -width * 0.25);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.36, blockH, length * 0.62),
        this.matBuoyancy,
      );
      block.position.set(x, this.cfg.dimensions.height / 2 + blockH / 2, 0);
      this.root.add(block);
    }
  }

  /** 耐压舱（standard：双水平舱；m2：单主舱） */
  private buildHull(): void {
    const { width, height, length } = this.cfg.dimensions;
    if (this.variant === 'm2') {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.3, width * 0.3, length * 0.55, 24), this.matHull);
      hull.rotation.x = Math.PI / 2;
      hull.position.set(0, 0, 0);
      this.root.add(hull);
      return;
    }
    // BlueROV2：上部主舱（水平）+ 下部传感器舱
    const main = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.2, width * 0.2, length * 0.72, 24), this.matHull);
    main.rotation.x = Math.PI / 2;
    main.position.set(0, height * 0.06, 0);
    this.root.add(main);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.15, width * 0.15, length * 0.42, 24), this.matHull);
    lower.rotation.x = Math.PI / 2;
    lower.position.set(0, -height * 0.28, 0.05);
    this.root.add(lower);
    // 舱端盖
    for (const sz of [length * 0.36, -length * 0.36]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.21, width * 0.21, 0.03, 24), this.matFrame);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(0, height * 0.06, sz);
      this.root.add(cap);
    }
  }

  /** 电子舱小件与附件 */
  private buildElectronics(): void {
    const { width, height } = this.cfg.dimensions;
    const box = new THREE.Mesh(new THREE.BoxGeometry(width * 0.34, 0.05, 0.2), this.matFrame);
    box.position.set(0, -height * 0.16, 0);
    this.root.add(box);
  }

  /** 推进器：导管 + 护环 + 转子 */
  private buildThrusters(): void {
    for (const t of this.cfg.thrusters) this.buildThruster(t);
  }

  private buildThruster(t: ThrusterSpec): void {
    const g = new THREE.Group();
    g.name = t.id;
    g.position.set(...t.position);
    const dir = new THREE.Vector3(...t.direction);
    const radius = t.ductRadius;

    const duct = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, radius * 1.5, 24, 1, true), this.matDuct);
    const ringFront = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.3, radius * 0.15, 16, 24), this.matDuct);
    const ringBack = ringFront.clone();
    // 转子包一层朝向 group：定向四元数在 group 上，内层 mesh 只做自转（避免 Euler 覆盖定向）
    const rotorGroup = new THREE.Group();
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, radius * 0.22, 24), this.matRotor);
    rotorGroup.add(rotor);

    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    duct.quaternion.copy(quat);
    ringFront.quaternion.copy(quat);
    ringBack.quaternion.copy(quat);
    rotorGroup.quaternion.copy(quat);
    const half = radius * 0.75;
    const fwd = dir.clone().multiplyScalar(half);
    ringFront.position.copy(fwd);
    ringBack.position.copy(fwd.clone().multiplyScalar(-1));
    // 前后护栅（十字防护格栅，真实 ROV 推进器）
    const guardLen = radius * 1.5;
    const guardMat = this.matDuct;
    for (const side of [1, -1]) {
      const g1 = new THREE.Mesh(new THREE.BoxGeometry(guardLen, 0.03, 0.03), guardMat);
      const g2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, guardLen, 0.03), guardMat);
      g1.quaternion.copy(quat);
      g2.quaternion.copy(quat);
      const gp = fwd.clone().multiplyScalar(side * 1.06);
      g1.position.copy(gp);
      g2.position.copy(gp);
      g.add(g1, g2);
    }
    g.add(duct, ringFront, ringBack, rotorGroup);
    this.rotors.push(rotor);
    this.root.add(g);
  }

  private buildLights(lightsOn: boolean): void {
    for (const l of this.cfg.lights) {
      const spot = new THREE.SpotLight(l.color, lightsOn ? l.intensity : 0, l.range, l.angle, 0.45, 0.8);
      spot.name = l.id;
      spot.position.set(...l.position);
      spot.target.position.set(0, 0, -20);
      this.root.add(spot);
      this.root.add(spot.target);
      this.lights.push(spot);

      // 光锥（additive）
      const coneLen = 7;
      // 柔和光束锥（低透明度 + 仅照亮区域提示，避免突兀白锥）
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(Math.tan(l.angle) * coneLen, coneLen, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.028, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.set(...l.position);
      cone.rotation.x = -Math.PI / 2;
      cone.visible = lightsOn;
      this.root.add(cone);
      this.lightCones.push(cone);

      const point = new THREE.PointLight(l.color, lightsOn ? 1.0 : 0, 7, 1.4);
      point.position.set(...l.position);
      this.root.add(point);
      this.lightPoints.push(point);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }));
      bulb.position.set(...l.position);
      bulb.visible = lightsOn;
      this.root.add(bulb);
      this.lampBulbs.push(bulb);
    }
  }

  /** POV 相机占位（前下） */
  private buildCamera(): void {
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.12), this.matFrame);
    cam.position.set(...this.cfg.povOffset);
    cam.name = 'pov_cam_placeholder';
    this.root.add(cam);
  }

  /**
   * 机械臂（作业用）：肩基座 → 大臂 → 肘 → 小臂 → 可动夹爪。
   * 安装在机头前下方；夹爪绕 Z 开合（setGripper）。
   */
  private buildArm(): void {
    const arm = new THREE.Group();
    arm.name = 'arm_manipulator';

    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.13, 24), this.matArm);
    shoulder.position.set(0, -0.13, -0.4);
    arm.add(shoulder);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.46), this.matArm);
    upper.position.set(0, -0.12, -0.62);
    arm.add(upper);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 24), this.matArm);
    elbow.position.set(0, -0.13, -0.85);
    arm.add(elbow);

    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.38), this.matArm);
    fore.position.set(0, -0.23, -0.99);
    fore.rotation.x = 0.5;
    arm.add(fore);

    // 可动夹爪：弧形钳口（半圆管）+ 黑色指端，开口可见（绕 Z 开合）
    const fingerTipMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.4 });
    const mkFinger = () => {
      const g = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 24, 1, true, 0, Math.PI), this.matGripper);
      arc.rotation.x = Math.PI / 2;
      g.add(arc);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.18), fingerTipMat);
      tip.position.set(0, 0.075, 0);
      g.add(tip);
      return g;
    };
    const jawL = new THREE.Group();
    jawL.add(mkFinger());
    jawL.position.set(-0.05, -0.32, -1.12);
    jawL.rotation.x = 0.3;
    const jawR = new THREE.Group();
    jawR.add(mkFinger());
    jawR.position.set(0.05, -0.32, -1.12);
    jawR.rotation.x = 0.3;
    arm.add(jawL, jawR);
    this.jawL = jawL;
    this.jawR = jawR;
    this.armGroup = arm;

    this.root.add(arm);
  }

  /** 细节件：天线 / 提手环 / 机械臂液压杆 */
  private buildDetails(): void {
    const { length, height } = this.cfg.dimensions;
    const hy = height / 2;

    // 天线（顶部，无发光球）
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 24), this.matFrame);
    ant.position.set(0, hy + 0.18, 0.08);
    this.root.add(ant);

    // 提手环（顶部两端）
    for (const sz of [length * 0.3, -length * 0.3]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 16, 24), this.matFrame);
      handle.position.set(0, hy + 0.06, sz);
      this.root.add(handle);
    }

    // DVL 多普勒探头（机头下方，前视）
    const dvl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 24), this.matFrame);
    dvl.position.set(0, -height * 0.3, -length * 0.42);
    this.root.add(dvl);
    // 声纳探头（机头下方前斜）
    const sonar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 24), this.matDuct);
    sonar.position.set(0, -height * 0.18, -length * 0.46);
    sonar.rotation.x = 0.6;
    this.root.add(sonar);

    // 机械臂液压杆（肩 → 大臂中段）
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 24), this.matArm);
    rod.position.set(0, -0.18, -0.62);
    rod.rotation.x = 0.9;
    this.armGroup?.add(rod);
  }

  /** 机械臂整体显隐（非打捞场景不挂载机械臂） */
  setArmVisible(visible: boolean): void {
    if (this.armGroup) this.armGroup.visible = visible;
  }

  /** 夹爪开合动画：open ∈ [0,1]（0=闭合，1=全开），连续张角（明显可见） */
  setGripper(open: number): void {
    if (!this.jawL || !this.jawR) return;
    const a = 0.1 + open * 0.6;
    this.jawL.rotation.z = -a;
    this.jawR.rotation.z = a;
  }

  setLightsOn(on: boolean): void {
    this.cfg.lights.forEach((l, i) => {
      this.lights[i].intensity = on ? l.intensity : 0;
      this.lampBulbs[i].visible = on;
      this.lightCones[i].visible = on;
      this.lightPoints[i].intensity = on ? 1.0 : 0;
    });
  }

  /** 光锥显示控制（第三视角隐藏光束锥，仅第一视角可见） */
  setLightConesVisible(visible: boolean): void {
    for (let i = 0; i < this.lightCones.length; i++) {
      this.lightCones[i].visible = visible && this.lights[i].intensity > 0;
    }
  }

  setThrusterAnimations(commands: number[]): void {
    this.rotors.forEach((r, i) => {
      const cmd = Math.abs(commands[i] ?? 0);
      r.rotation.y += cmd * 0.35;
    });
  }
}
