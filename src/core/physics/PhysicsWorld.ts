/**
 * PhysicsWorld：六自由度物理总装（docs/03-物理仿真.md）。
 * 每步流程：控制指令 → 推进器分配 → 合力/力矩 → 数值积分。
 * 固定步长由 SimulationEngine 的 accumulator 控制（FIXED_DT = 1/120）。
 */

import * as THREE from 'three';
import type { ROVConfig } from '../rov/ROVConfig';
import type { EnvironmentState } from '../environment/EnvironmentState';
import { RigidBody6 } from './RigidBody6';
import { WaterForces } from './WaterForces';
import { ThrusterAllocator } from './ThrusterAllocator';
import { CurrentField, type LocalFlowZone } from '../environment/CurrentField';
import { resolveCollisions, type ColliderShape } from './Collider';
import { ROVController, EMPTY_INPUT, type ControlInput } from '../rov/ROVController';
import { integrateLinear, integrateQuaternion } from './integrator';

export interface PhysicsStepResult {
  /** 各推进器归一化指令 -1..1（渲染动画） */
  thrusterNorm: number[];
  /** 一键水平进行中 */
  levelActive: boolean;
}

/** 水面（世界 Y=0 为海面，ROV 不允许高于水面） */
export const WATER_SURFACE_Y = 0;

export class PhysicsWorld {
  readonly body: RigidBody6;
  /** 控制输入（由 SimulationEngine/UI 更新） */
  input: ControlInput = { ...EMPTY_INPUT };

  private readonly water: WaterForces;
  private readonly allocator: ThrusterAllocator;
  private readonly current: CurrentField;
  private readonly controller: ROVController;

  private time = 0;
  private readonly cmd6: number[] = [0, 0, 0, 0, 0, 0];
  private readonly fBody = new THREE.Vector3();
  private readonly tauBody = new THREE.Vector3();
  private readonly fWorld = new THREE.Vector3();
  private readonly currentWorld = new THREE.Vector3();
  private readonly invQuat = new THREE.Quaternion();
  private lastNorm: number[] = [];

  /** ROV 碰撞半径（m） */
  private readonly rovRadius: number;
  /** 场景碰撞体（场景加载时注册） */
  private colliders: ColliderShape[] = [];

  constructor(config: ROVConfig, env: EnvironmentState) {
    this.body = new RigidBody6(config);
    this.water = new WaterForces(config);
    this.allocator = new ThrusterAllocator(config);
    this.current = new CurrentField(env);
    this.controller = new ROVController(config);
    this.lastNorm = new Array(config.thrusters.length).fill(0);
    const { length, width, height } = config.dimensions;
    this.rovRadius = Math.sqrt(length * length + width * width + height * height) * 0.55;
  }

  /** 注册场景碰撞体（场景切换时替换） */
  setSceneColliders(colliders: ColliderShape[]): void {
    this.colliders = colliders;
  }

  get controllerRef(): ROVController {
    return this.controller;
  }

  private dvlOn = false;
  private dvlAnchor = new THREE.Vector3();
  private dvlActive = false;

  /** 开启/关闭 DVL（多普勒测速）：悬停保持 + 洋流削弱 */
  setDvl(on: boolean): void {
    this.dvlOn = on;
    this.dvlActive = false;
  }

  setLocalFlowZones(zones: LocalFlowZone[]): void {
    this.current.clearZones();
    for (const z of zones) this.current.addZone(z);
  }

  setPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.body.setPose(position, quaternion);
  }

  /** 单物理步（dt = FIXED_DT） */
  step(dt: number): PhysicsStepResult {
    this.time += dt;

    // 1) 控制指令 → 6DOF（体坐标系）
    this.controller.computeCmd6(this.input, this.body, this.cmd6);

    // 2) 推进器分配
    const alloc = this.allocator.allocate(this.cmd6);
    this.lastNorm = alloc.norm;

    // 3) 合力（体坐标系）：推进器 + 水力
    this.allocator.applyThrust(alloc.thrust, this.fBody, this.tauBody);

    // 4) 水流（世界系）；DVL 开启时洋流削弱（移动受干扰更小）
    this.current.velocityAt(this.body.position, this.time, this.currentWorld);
    if (this.dvlOn) this.currentWorld.multiplyScalar(0.3);

    // 5) 水力（重力/浮力/阻尼）累加
    this.water.compute(this.body, this.currentWorld, this.fBody, this.tauBody);

    // 6) 积分
    // 平动：F_world = R·F_body；a = F/m
    this.invQuat.copy(this.body.quaternion).invert();
    this.fWorld.copy(this.fBody).applyQuaternion(this.body.quaternion);
    const accelWorld = this.fWorld.divideScalar(this.body.config.massKg);
    integrateLinear(this.body.position, this.body.velocityWorld, accelWorld, dt);

    // 转动：α = I⁻¹(τ - ω×Iω)
    const alpha = this.body.angularAcceleration(this.tauBody);
    this.body.omegaBody.addScaledVector(alpha, dt);
    integrateQuaternion(this.body.quaternion, this.body.omegaBody, dt);

    // DVL 悬停保持：无控制输入时锁定位置（PD 反馈 + 速度阻尼）
    if (this.dvlOn) {
      const inp = this.input;
      const idle =
        inp.surge === 0 && inp.sway === 0 && inp.heave === 0 &&
        inp.yaw === 0 && inp.pitch === 0 && inp.roll === 0;
      if (idle) {
        if (!this.dvlActive) {
          this.dvlAnchor.copy(this.body.position);
          this.dvlActive = true;
        }
        // 位置误差反馈（回拉）+ 速度阻尼（快速停）
        const k = 1.8;
        this.body.velocityWorld.x += (this.dvlAnchor.x - this.body.position.x) * k * dt;
        this.body.velocityWorld.z += (this.dvlAnchor.z - this.body.position.z) * k * dt;
        this.body.velocityWorld.y += (this.dvlAnchor.y - this.body.position.y) * k * dt;
        const damp = Math.exp(-dt * 3);
        this.body.velocityWorld.multiplyScalar(damp);
      } else {
        this.dvlActive = false;
      }
    }

    // 水面边界：深度不能大于 0（不能高于水面）
    if (this.body.position.y > WATER_SURFACE_Y) {
      this.body.position.y = WATER_SURFACE_Y;
      if (this.body.velocityWorld.y > 0) this.body.velocityWorld.y = 0;
    }

    // 碰撞解析：海底高度场 + 场景球体
    resolveCollisions(this.body.position, this.body.velocityWorld, this.rovRadius, this.colliders);

    return { thrusterNorm: this.lastNorm, levelActive: this.controller.levelActive };
  }
}
