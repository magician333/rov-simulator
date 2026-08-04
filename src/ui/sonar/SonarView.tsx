/**
 * SonarView：多波束扇面声纳面板（真实 FLS 质感）。
 * - 扇形视角 + 探测距离环 + 低频/高频切换（真实频率语义）
 * - 点阵化渲染（回波散点，模拟真实声纳）
 * - 调色板：红黄（默认）/ 蓝绿 / 黑白
 * - 全屏 / 小窗口切换，小窗可拖拽
 */

import { useEffect, useRef, useState } from 'react';
import { SonarSampler } from '../../render/sonar/SonarSampler';
import { SonarSimulator } from '../../core/sonar/SonarSimulator';
import {
  DEFAULT_SONAR_PARAMS,
  FREQ_PRESETS,
  SONAR_RANGES,
  type SonarFreqMode,
  type SonarParams,
} from '../../core/sonar/SonarParams';
import type { Engine } from '../../render/Engine';
import { useAppStore } from '../../state/store';
import { tr, type DictKey } from '../../i18n';
import { fmtDepth } from '../../utils/unitsUI';
import { deg2rad } from '../../utils/units';

type Palette = 'fire' | 'cool' | 'gray';

const SMALL_W = 420;
const SMALL_H = 320;
const FULL_W = 820;
const FULL_H = 620;

function applyPalette(v: number, palette: Palette): [number, number, number] {
  if (palette === 'fire') return [Math.min(255, v * 1.3), v * 0.6, v * 0.16];
  if (palette === 'cool') return [v * 0.1, v * 0.72, Math.min(255, v * 1.18)];
  return [v, v, v];
}

/** 航向/深度只读行（独立订阅 hud，避免整棵 SonarView 每 100ms 重渲染） */
function MetaReadout(): React.JSX.Element {
  const language = useAppStore((s) => s.language);
  const units = useAppStore((s) => s.units);
  const hud = useAppStore((s) => s.hud);
  const t = (k: DictKey) => tr(language, k);
  return (
    <span style={styles.meta}>
      {t('sonar_meta_heading')} {hud ? Math.round(hud.headingDeg) : '—'}° · {t('sonar_meta_depth')}{' '}
      {hud ? fmtDepth(hud.depthMeters, units) : '—'}
      {units === 'imperial' ? 'ft' : 'm'}
    </span>
  );
}

export function SonarView({ engineRef }: { engineRef: React.MutableRefObject<Engine | null> }) {
  const language = useAppStore((s) => s.language);
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplerRef = useRef<SonarSampler | null>(null);
  const simulatorRef = useRef<SonarSimulator | null>(null);
  const [params, setParams] = useState<SonarParams>({ ...DEFAULT_SONAR_PARAMS });
  // 频段由全局 store 驱动（键盘/手柄 Back 长按可切换）
  const freq = useAppStore((s) => s.sonarFreq);
  const setSonarFreq = useAppStore((s) => s.setSonarFreq);
  const [palette, setPalette] = useState<Palette>('fire');
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const paramsRef = useRef(params);
  const paletteRef = useRef(palette);
  useEffect(() => {
    paramsRef.current = params;
    simulatorRef.current?.updateParams(params);
    samplerRef.current?.setParams(params);
  }, [params]);
  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

  // 频率切换：低频 = 远程低分辨率；高频 = 近程高分辨率
  const switchFreq = (mode: SonarFreqMode) => {
    setSonarFreq(mode);
  };
  // 频段变化 → 应用预设参数（键盘/手柄 Back 长按与面板按钮统一生效）
  useEffect(() => {
    setParams((p) => ({ ...FREQ_PRESETS[freq], gain: p.gain, noise: p.noise }));
  }, [freq]);

  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const sampler = new SonarSampler(engine.scene, paramsRef.current);
    const simulator = new SonarSimulator(paramsRef.current);
    samplerRef.current = sampler;
    simulatorRef.current = simulator;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let refreshCount = 0;
    let frameCounter = 0;

    const interval = window.setInterval(() => {
      // 引擎场景可能已重建（换训练会话/重开）：scene 引用变化时重建 sampler
      const eng = engineRef.current;
      if (!eng || !eng.scene) return;
      if (!samplerRef.current || samplerRef.current.scene !== eng.scene) {
        samplerRef.current = new SonarSampler(eng.scene, paramsRef.current);
      }
      const sim = eng.simulationEngine;
      if (!sim || !ctx) return;
      // 定期刷新采样目标（场景切换后生效）
      refreshCount++;
      if (refreshCount % 6 === 0) samplerRef.current?.refreshTargets();
      const snap = sim.getRenderSnapshot();
      const pos = engine.getSonarOrigin(snap);
      const yaw = deg2rad(snap.euler.yaw);
      // 低画质降波束（省 raycast）+ 分帧扫描（每帧只扫 1/3，滚动平滑）
      const q = useAppStore.getState().graphicsQuality;
      const sampler0 = samplerRef.current;
      if (sampler0) sampler0.setBeamScale(q === 'low' ? 0.6 : 1);
      const env = sim.environment.get();
      if (sampler0) {
        const total = sampler0.getBeamCount();
        // 分帧 6 份：每帧只扫 1/6 波束，图像滚动更平滑（更精细）
        const sliceN = Math.max(1, Math.ceil(total / 6));
        const startBeam = (frameCounter % 6) * sliceN;
        const count = Math.min(sliceN, total - startBeam);
        const beams = sampler0.sample(pos, yaw, startBeam, count, { pitchRad: deg2rad(snap.euler.pitch), rollRad: deg2rad(snap.euler.roll) });
        simulator.renderFrame(beams, startBeam, { turbidity: env.turbidity, visibility: env.visibility });
        frameCounter++;
      }
      const p = simulator.getParams();
      drawSonar(ctx, simulator.image, p, paletteRef.current, canvas.width, canvas.height);
    }, Math.max(120, 1000 / paramsRef.current.updateHz));

    return () => {
      window.clearInterval(interval);
      samplerRef.current = null;
      simulatorRef.current = null;
    };
  }, [engineRef]);

  const cw = fullscreen ? FULL_W : SMALL_W;
  const ch = fullscreen ? FULL_H : SMALL_H;

  const onDragStart = (e: React.PointerEvent) => {
    if (fullscreen || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const base = pos ?? { x: window.innerWidth - cw - 20, y: window.innerHeight - ch - 100 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.min(window.innerWidth - 80, Math.max(8, d.baseX + (e.clientX - d.startX))),
      y: Math.min(window.innerHeight - 80, Math.max(8, d.baseY + (e.clientY - d.startY))),
    });
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };

  const rootStyle: React.CSSProperties = fullscreen
    ? { ...styles.root, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '82%', maxWidth: 900 }
    : { ...styles.root, ...(pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 64 }), width: cw + 20 };

  return (
    <div style={rootStyle}>
      <div
        style={styles.header}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span style={styles.title}>SONAR {t(freq === 'low' ? 'sonar_freq_low' : 'sonar_freq_high')}·{params.rangeM}m</span>
        <MetaReadout />
      </div>
      {/* 按钮统一第二行（避免量程字符宽度差异导致换行） */}
      <div style={styles.btnRow}>
        <button onClick={() => switchFreq(freq === 'low' ? 'high' : 'low')} style={styles.btn}>
          {freq === 'low' ? t('sonar_switch_to_high') : t('sonar_switch_to_low')}
        </button>
        <button onClick={() => setPalette(palette === 'fire' ? 'cool' : palette === 'cool' ? 'gray' : 'fire')} style={styles.btn}>
          {t('sonar_palette')}:{palette === 'fire' ? t('palette_fire') : palette === 'cool' ? t('palette_cool') : t('palette_gray')}
        </button>
        <button onClick={() => setFullscreen(!fullscreen)} style={styles.btn}>
          {fullscreen ? t('sonar_min') : t('sonar_expand')}
        </button>
        <button onClick={() => setShowControls(!showControls)} style={styles.btn}>{showControls ? t('sonar_collapse') : t('sonar_settings')}</button>
      </div>

      <canvas
        ref={canvasRef}
        width={cw}
        height={ch}
        style={{ width: '100%', height: 'auto', imageRendering: 'pixelated', background: '#02121e' }}
      />

      {showControls && (
        <div style={styles.controls}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>{t('sonar_range')}</span>
            <input type="range" min={SONAR_RANGES.rangeM.min} max={freq === 'high' ? 40 : 120} step={SONAR_RANGES.rangeM.step}
              value={params.rangeM} onChange={(e) => setParams((p) => ({ ...p, rangeM: Number(e.target.value) }))} style={styles.slider} />
            <span style={styles.value}>{params.rangeM}m</span>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>{t('sonar_sector')}</span>
            <input type="range" min={SONAR_RANGES.sectorDeg.min} max={freq === 'high' ? 80 : 120} step={SONAR_RANGES.sectorDeg.step}
              value={params.sectorDeg} onChange={(e) => setParams((p) => ({ ...p, sectorDeg: Number(e.target.value) }))} style={styles.slider} />
            <span style={styles.value}>{params.sectorDeg}°</span>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>{t('sonar_gain')}</span>
            <input type="range" min={SONAR_RANGES.gain.min} max={SONAR_RANGES.gain.max} step={SONAR_RANGES.gain.step}
              value={params.gain} onChange={(e) => setParams((p) => ({ ...p, gain: Number(e.target.value) }))} style={styles.slider} />
            <span style={styles.value}>{params.gain.toFixed(2)}</span>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>{t('sonar_noise')}</span>
            <input type="range" min={SONAR_RANGES.noise.min} max={SONAR_RANGES.noise.max} step={SONAR_RANGES.noise.step}
              value={params.noise} onChange={(e) => setParams((p) => ({ ...p, noise: Number(e.target.value) }))} style={styles.slider} />
            <span style={styles.value}>{params.noise.toFixed(2)}</span>
          </label>
          <div style={styles.hint}>{t('sonar_hint')}</div>
        </div>
      )}
    </div>
  );
}

/** 点阵扇形绘制：亮度 buffer + 回波 2×2 放大（轮廓加粗）+ 底噪稀疏 + 调色板 */
function drawSonar(
  ctx: CanvasRenderingContext2D,
  image: Uint8ClampedArray,
  p: SonarParams,
  palette: Palette,
  W: number,
  H: number,
): void {
  ctx.fillStyle = '#02121e';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H - 26;
  const rangePx = Math.min(W, H) * 0.72;
  const half = (p.sectorDeg / 2) * (Math.PI / 180);
  const { beamCount, rangeBins, rangeM } = p;
  const rnd = Math.random;

  // 1+2) 写入亮度 + 调色板映射（单次遍历，复用 ImageData）
  if (!imageDataBuf || imageDataBuf.width !== W || imageDataBuf.height !== H) imageDataBuf = ctx.createImageData(W, H);
  const data = imageDataBuf.data;
  data.fill(0); // 清空残留像素（切换高低频后避免旧扇形残留）
  for (let py = 0; py < H; py++) {
    const dy = py - cy;
    for (let px = 0; px < W; px++) {
      const dx = px - cx;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 10 || r > rangePx) continue;
      let theta = Math.atan2(dx, -dy);
      if (theta < -Math.PI + half) theta += Math.PI * 2;
      if (Math.abs(theta) > half) continue;

      const bin = Math.min(rangeBins - 1, Math.max(0, Math.round((r / rangePx) * rangeBins)));
      // beam 方向校正：采样 off>0 为绕 Y 逆时针（左侧）；屏幕右侧对应世界右侧 → 反转映射
      const beamRaw = Math.round(((theta + half) / (2 * half)) * (beamCount - 1));
      const beam = Math.min(beamCount - 1, Math.max(0, beamCount - 1 - beamRaw));
      const v = image[beam * rangeBins + bin] ?? 0;
      const idx = py * W + px;
      let finalV: number;
      if (v < 40) {
        if (rnd() > 0.18) continue; // 底噪 18% 稀疏点
        finalV = v * 0.7;
      } else {
        finalV = Math.min(255, v); // 回波全亮
      }
      if (finalV <= 1) continue;
      const [rr, gg, bb] = applyPalette(finalV, palette);
      const o = idx * 4;
      data[o] = rr;
      data[o + 1] = gg;
      data[o + 2] = bb;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(imageDataBuf, 0, 0);

  // 3) 叠加层：扇面边界、距离环、刻度
  ctx.strokeStyle = 'rgba(120, 200, 220, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rangePx * frac, -Math.PI / 2 - half, -Math.PI / 2 + half);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const sign of [-1, 1]) {
    const a = -Math.PI / 2 + sign * half;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rangePx * Math.cos(a), cy + rangePx * Math.sin(a));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(160, 210, 230, 0.85)';
  ctx.font = '12px Consolas, monospace';
  ctx.fillText('0', cx + 8, cy - 8);
  for (const frac of [0.5, 1]) {
    ctx.fillText(`${Math.round(rangeM * frac)}m`, cx + 8, cy - rangePx * frac - 4);
  }
  ctx.fillStyle = '#8ad5f5';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 200, 220, 0.7)';
  ctx.font = '11px Consolas, monospace';
  ctx.fillText(`beam ×${beamCount} · bin ×${rangeBins} · ${p.sectorDeg}°`, 8, H - 8);
}

/** ImageData 缓存（避免每帧分配） */
let imageDataBuf: ImageData | null = null;

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    zIndex: 20,
    background: 'rgba(3, 22, 34, 0.8)',
    border: '1px solid #2a6d8f',
    borderRadius: 10,
    padding: 10,
    color: '#d7eef8',
  },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'move', userSelect: 'none', flexWrap: 'wrap' },
  title: { fontWeight: 700, color: '#4fc3f7', fontSize: 13, letterSpacing: 1, whiteSpace: 'nowrap' },
  meta: { fontSize: 12, color: '#9cc5d9', flex: 1, whiteSpace: 'nowrap' },
  btnRow: {
    display: 'flex',
    gap: 6,
    padding: '4px 8px',
    flexWrap: 'wrap',
    background: 'rgba(2, 18, 30, 0.55)',
  },
  btn: {
    background: 'rgba(79,195,247,.15)', color: '#d7eef8', border: '1px solid #2a6d8f',
    borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
  },
  controls: { marginTop: 8, borderTop: '1px solid #1a4a63', paddingTop: 8 },
  field: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 12 },
  fieldLabel: { flex: '0 0 56px', color: '#9cc5d9' },
  slider: { flex: 1, accentColor: '#4fc3f7' },
  value: { flex: '0 0 48px', textAlign: 'right', fontFamily: 'Consolas, monospace' },
  hint: { fontSize: 11, color: '#5b93ab', marginTop: 6 },
};
