/**
 * ThrusterAllocator：推进器推力分配（docs/03-物理仿真.md §3）。
 * 由 ROVConfig.thrusters 自动生成配置矩阵 B（6×n）：
 *   第 i 列：t_i = [ f_i;  r_i × f_i ]，其中 f_i = -direction_i（产生的力方向）
 * 分配：u = B^T (B·B^T)^-1 · cmd（右伪逆），clamp 到推进器能力，饱和按比例缩放。
 */

import type { ROVConfig, ThrusterSpec } from '../rov/ROVConfig';
import * as THREE from 'three';

export interface AllocationResult {
  /** 各推进器推力幅值（N） */
  thrust: number[];
  /** 归一化指令 -1..1（渲染动画用） */
  norm: number[];
  /** 是否发生饱和（钳位） */
  saturated: boolean;
}

/** 小型矩阵运算（仅本模块使用） */
namespace Mat {
  export function mul(a: number[][], b: number[][]): number[][] {
    const m = a.length;
    const n = b[0].length;
    const k = b.length;
    const r: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let t = 0; t < k; t++) s += a[i][t] * b[t][j];
        r[i][j] = s;
      }
    }
    return r;
  }

  export function transpose(a: number[][]): number[][] {
    const m = a.length;
    const n = a[0].length;
    const r: number[][] = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) r[j][i] = a[i][j];
    return r;
  }

  export function matVec(a: number[][], v: number[]): number[] {
    return a.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));
  }

  /** 6×6 矩阵求逆（高斯-约当消元），不可逆返回 null */
  export function inv6(a: number[][]): number[][] | null {
    const n = 6;
    const aug = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
      }
      if (Math.abs(aug[pivot][col]) < 1e-10) return null;
      [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
      const pv = aug[col][col];
      for (let j = 0; j < 2 * n; j++) aug[col][j] /= pv;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row][col];
        if (Math.abs(factor) < 1e-14) continue;
        for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }
    return aug.map((row) => row.slice(n));
  }
}

export class ThrusterAllocator {
  /** 配置矩阵 B（6×n） */
  private readonly B: number[][];
  /** 右伪逆 B_pinv = B^T (B·B^T)^-1（n×6） */
  private readonly Bpinv: number[][];
  private readonly n: number;
  private readonly maxForce: number[];
  private readonly minForce: number[];

  constructor(config: ROVConfig) {
    this.n = config.thrusters.length;
    this.maxForce = config.thrusters.map((t) => t.maxForce);
    this.minForce = config.thrusters.map((t) => t.minForce);

    // 构建 B
    this.B = Array.from({ length: 6 }, () => new Array(this.n).fill(0));
    config.thrusters.forEach((t, i) => this.fillColumn(t, i));

    // 右伪逆
    const Bt = Mat.transpose(this.B);
    const BBt = Mat.mul(this.B, Bt);
    const inv = Mat.inv6(BBt);
    if (!inv) {
      throw new Error(`推进器配置矩阵不可逆（无法覆盖 6 自由度）：${config.id}`);
    }
    this.Bpinv = Mat.mul(Bt, inv);
  }

  private fillColumn(t: ThrusterSpec, i: number): void {
    // 产生的力方向 = -推水方向
    const fx = -t.direction[0];
    const fy = -t.direction[1];
    const fz = -t.direction[2];
    const [px, py, pz] = t.position;
    // r × f
    const tx = py * fz - pz * fy;
    const ty = pz * fx - px * fz;
    const tz = px * fy - py * fx;
    this.B[0][i] = fx;
    this.B[1][i] = fy;
    this.B[2][i] = fz;
    this.B[3][i] = tx;
    this.B[4][i] = ty;
    this.B[5][i] = tz;
  }

  /** 分配：cmd6 = [F_x, F_y, F_z, τ_x, τ_y, τ_z]（体坐标系，N/N·m） */
  allocate(cmd6: readonly number[]): AllocationResult {
    const u = Mat.matVec(this.Bpinv, [...cmd6]);

    // clamp 到推进器能力
    let saturated = false;
    let scale = Infinity;
    for (let i = 0; i < this.n; i++) {
      const max = this.maxForce[i];
      const min = this.minForce[i];
      if (u[i] > max || u[i] < min) saturated = true;
      const cap = u[i] > 0 ? max : Math.abs(min);
      scale = Math.min(scale, cap / Math.max(Math.abs(u[i]), 1e-9));
    }
    if (saturated && scale < 1) {
      for (let i = 0; i < this.n; i++) u[i] *= scale;
    }

    const norm = u.map((v, i) => {
      const cap = v > 0 ? this.maxForce[i] : Math.abs(this.minForce[i]);
      return Math.max(-1, Math.min(1, v / cap));
    });
    return { thrust: u, norm, saturated };
  }

  /** 将推力向量 u 合成为体坐标系合力/合力矩：B·u → (F, τ) */
  applyThrust(u: readonly number[], outF: THREE.Vector3, outTau: THREE.Vector3): void {
    outF.set(0, 0, 0);
    outTau.set(0, 0, 0);
    for (let i = 0; i < this.n; i++) {
      outF.x += this.B[0][i] * u[i];
      outF.y += this.B[1][i] * u[i];
      outF.z += this.B[2][i] * u[i];
      outTau.x += this.B[3][i] * u[i];
      outTau.y += this.B[4][i] * u[i];
      outTau.z += this.B[5][i] * u[i];
    }
  }
}
