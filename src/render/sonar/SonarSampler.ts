/**
 * SonarSampler：多波束扇面采样（docs/05-视角HUD与声纳.md §3.1）。
 * 从 ROV 位置沿水平扇面发射射线，每条波束含水平 0° 与下俯角两条子射线，
 * 返回多条回波（物体前缘/后缘/内部 + 海底回波段）供轮廓成像。
 * 性能：海底用解析 ray-march（高度场），raycast 排除 ROV/海底/粒子 Points。
 */

import * as THREE from 'three';
import type { SonarParams } from '../../core/sonar/SonarParams';
import type { SonarBeamHit } from '../../core/sonar/SonarSimulator';
import { raycastHits, rayMarchSeafloor, buildSonarTargets } from './sonarUtils';

/** 垂直开角（度）：上仰/水平/下俯三条子射线，覆盖垂直立体角（看到上方螺旋桨、船底与海底） */

/** 每条波束最多保留的物体回波数（轮廓：前缘/后缘/内部结构） */
const MAX_OBJECT_ECHOES = 4;
const ECHO_STRENGTHS = [1.0, 0.75, 0.55, 0.4];

export class SonarSampler {
  /** 采样目标所属场景（重建校验用） */
  readonly scene: THREE.Scene;
  private beamScale = 1;
  private raycaster = new THREE.Raycaster();
  private dir = new THREE.Vector3();
  /** 采样目标（排除海底/ROV/粒子；场景加载后需 refresh） */
  private targets: THREE.Object3D[] = [];

  constructor(
    scene: THREE.Scene,
    private params: SonarParams,
  ) {
    this.scene = scene;
    this.refreshTargets();
  }

  setParams(p: SonarParams): void {
    this.params = p;
  }

  /** 波束缩放（低画质省性能）：0.6 = 60% 波束 */
  setBeamScale(scale: number): void {
    this.beamScale = scale;
  }

  /** 场景加载/切换后刷新采样目标 */
  refreshTargets(): void {
    this.targets = buildSonarTargets(this.scene);
  }

  /** 当前实际波束数（含缩放） */
  getBeamCount(): number {
    return Math.max(1, Math.round(this.params.beamCount * this.beamScale));
  }

  /**
   * 采样（支持分帧：start/count 指定波束范围，count 缺省 = 全量）。
   */
  sample(position: THREE.Vector3, yawRad: number, start = 0, count?: number): SonarBeamHit[][] {
    const beamCount = this.getBeamCount();
    const n = count === undefined ? beamCount : Math.min(count, beamCount - start);
    const { sectorDeg, rangeM } = this.params;
    const half = ((sectorDeg / 2) * Math.PI) / 180;
    const result: SonarBeamHit[][] = new Array(n);
    this.raycaster.far = rangeM;
    // 垂直子射线：按 params.verticalDeg 对称分布（±half、0）
    const vHalf = this.params.verticalDeg / 2;
    const tilts = [-vHalf, 0, vHalf].map((d) => (d * Math.PI) / 180);

    for (let i = 0; i < n; i++) {
      const beamIndex = start + i;
      const off = -half + (beamCount === 1 ? 0 : (beamIndex / (beamCount - 1)) * sectorDeg * (Math.PI / 180));
      const a = yawRad + off;
      const sinA = Math.sin(a);
      const cosA = Math.cos(a);
      const echoes: SonarBeamHit[] = [];

      // 垂直开角内多条子射线（上仰/水平/俯角）
      for (const tilt of tilts) {
        const cosT = Math.cos(tilt);
        const sinT = Math.sin(tilt);
        this.dir.set(-sinA * cosT, sinT, -cosA * cosT);
        this.collectEchoes(echoes, position, rangeM);
        // 向下子射线追加海底回波段（解析 ray-march）
        if (sinT < 0) {
          const sd = rayMarchSeafloor(position, this.dir, rangeM);
          if (sd !== null) {
            echoes.push({ distance: sd, strength: 0.6 });
            echoes.push({ distance: sd + 1.2, strength: 0.4 });
            echoes.push({ distance: sd + 2.4, strength: 0.2 });
          }
        }
      }

      result[i] = echoes
        .filter((e) => e.distance <= rangeM)
        .sort((x, y) => x.distance - y.distance);
    }
    return result;
  }

  private collectEchoes(echoes: SonarBeamHit[], position: THREE.Vector3, rangeM: number): void {
    const hits = raycastHits(this.raycaster, this.targets, position, this.dir);
    for (let k = 0; k < Math.min(MAX_OBJECT_ECHOES, hits.length); k++) {
      const h = hits[k];
      if (h.distance > rangeM) break;
      echoes.push({ distance: h.distance, strength: ECHO_STRENGTHS[k] });
    }
  }
}
