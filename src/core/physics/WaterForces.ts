/**
 * WaterForces：水动力/重力/浮力计算（docs/03-物理仿真.md §2.4）。
 * 输出体坐标系合力 F_body 与合力矩 τ_body（由调用方转世界系做平动积分）。
 * 注意：本模块对 forceOut/tauOut 采用「累加」语义（推进器力由调用方预先写入）。
 */

import * as THREE from 'three';
import type { ROVConfig } from '../rov/ROVConfig';
import type { RigidBody6 } from './RigidBody6';
import { SEAWATER_DENSITY, GRAVITY } from '../../utils/units';

export class WaterForces {
  /** 浮力（世界系 +Y 方向） */
  private readonly buoyancyWorld: THREE.Vector3;
  /** CoG → CoB 向量（体坐标系） */
  private readonly cogToCob: THREE.Vector3;

  private readonly gBody = new THREE.Vector3();
  private readonly bBody = new THREE.Vector3();
  private readonly tauTmp = new THREE.Vector3();
  private readonly vRel = new THREE.Vector3();
  private readonly invQuat = new THREE.Quaternion();

  constructor(private config: ROVConfig) {
    const f = SEAWATER_DENSITY * config.displacementM3 * GRAVITY;
    this.buoyancyWorld = new THREE.Vector3(0, f, 0);
    const [cx, cy, cz] = config.cogOffset;
    const [bx, by, bz] = config.cobOffset;
    this.cogToCob = new THREE.Vector3(bx - cx, by - cy, bz - cz);
  }

  /**
   * 将重力/浮力/阻尼「累加」到 forceOut/tauOut（体坐标系）。
   * @param body 刚体
   * @param currentWorld 水流速度（世界系，含湍流）
   * @param forceOut 输入输出：累加合力（体坐标系）
   * @param tauOut 输入输出：累加合力矩（体坐标系）
   */
  compute(
    body: RigidBody6,
    currentWorld: THREE.Vector3,
    forceOut: THREE.Vector3,
    tauOut: THREE.Vector3,
  ): void {
    const cfg = this.config;
    this.invQuat.copy(body.quaternion).invert();

    // 1) 重力（世界系 (0,-mg,0) → 体）累加
    this.gBody.set(0, -cfg.massKg * GRAVITY, 0).applyQuaternion(this.invQuat);
    forceOut.add(this.gBody);

    // 2) 浮力（世界系 +Y → 体）作用于浮心 → 恢复力矩，累加
    this.bBody.copy(this.buoyancyWorld).applyQuaternion(this.invQuat);
    forceOut.add(this.bBody);
    this.tauTmp.crossVectors(this.cogToCob, this.bBody);
    tauOut.add(this.tauTmp);

    // 3) 平动阻尼（相对水流速度，二次阻尼）F = -0.5ρ·CdA·|v_rel|·v_rel，累减
    body.relativeVelocityBody(currentWorld, this.vRel);
    const lin = cfg.dragCoeffs.lin;
    forceOut.x -= 0.5 * SEAWATER_DENSITY * lin[0] * Math.abs(this.vRel.x) * this.vRel.x;
    forceOut.y -= 0.5 * SEAWATER_DENSITY * lin[1] * Math.abs(this.vRel.y) * this.vRel.y;
    forceOut.z -= 0.5 * SEAWATER_DENSITY * lin[2] * Math.abs(this.vRel.z) * this.vRel.z;

    // 4) 角阻尼（二次 + 线性）：τ = -D_ang·ω|ω| - D_lin·ω，累减
    const ang = cfg.dragCoeffs.ang;
    const angLin = cfg.dragCoeffs.angLin ?? [0, 0, 0];
    const w = body.omegaBody;
    tauOut.x -= ang[0] * Math.abs(w.x) * w.x + angLin[0] * w.x;
    tauOut.y -= ang[1] * Math.abs(w.y) * w.y + angLin[1] * w.y;
    tauOut.z -= ang[2] * Math.abs(w.z) * w.z + angLin[2] * w.z;
  }
}
