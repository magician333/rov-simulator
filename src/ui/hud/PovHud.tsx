/**
 * PovHud：第一视角 HUD。
 * corner：左下角单一大框（姿态 + 深度/温度/俯仰/横滚/速度）+ 顶部罗盘（圆盘/刻度）
 * hud：顶部罗盘刻度条 / 左深度刻度(0 顶) / 右俯仰刻度 / 中央横滚圈 / 外圈测距 / 底部信息条 / 左下姿态
 * 元素避开顶栏与底部状态栏；刻度条半透明、飞机 HUD 风格（无底无边框）。
 */

import type { HudSnapshot } from '../../core/rov/ROVState';
import { tr, type DictKey } from '../../i18n';
import { useAppStore } from '../../state/store';
import { fmtDepth, fmtTemp, UNIT_MARKS, type UnitSystem } from '../../utils/unitsUI';
import { AttitudeIndicatorView } from './AttitudeIndicatorView';
import { Compass } from './Compass';

type Um = { depth: string; dist: string; temp: string };

/** 距离显示：接触/极近（<0.6m）显示 0 */
function fmtDistVal(v: number | null, units: UnitSystem): { val: string; unit: string } {
  if (v === null) return { val: '80+', unit: units === 'imperial' ? 'ft' : 'm' };
  if (v < 0.6) return { val: '0.0', unit: units === 'imperial' ? 'ft' : 'm' };
  return { val: fmtDepth(v, units), unit: units === 'imperial' ? 'ft' : 'm' };
}

function Readout(props: { label: string; value: string; unit?: string; warn?: boolean; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <div style={{ fontSize: 10, color: '#7fb3c9', letterSpacing: 1 }}>{props.label}</div>
      <div
        style={{
          fontSize: props.size ?? 22,
          color: props.warn ? '#ff7043' : '#e8f8ff',
          fontFamily: 'Consolas, Menlo, monospace',
          textShadow: '0 0 6px rgba(0,0,0,.9)',
        }}
      >
        {props.value}
        {props.unit && <span style={{ fontSize: 11, color: '#8ad5f5', marginLeft: 3 }}>{props.unit}</span>}
      </div>
    </div>
  );
}

export function PovHud({ layout }: { layout?: 'corner' | 'hud' }) {
  const hud = useAppStore((s) => s.hud);
  const units = useAppStore((s) => s.units);
  const language = useAppStore((s) => s.language);
  const axisMode = useAppStore((s) => s.axisMode);
  const powerLevel = useAppStore((s) => s.powerLevel);
  if (!hud) return null;
  const um: Um = UNIT_MARKS[units];
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);
  const depthWarn = hud.depthMeters > 300;

  const frameTxt = t(axisMode === 'body' ? 'val_body' : 'val_world');
  const powerTxt = `${Math.round(powerLevel * 100)}%`;

  return (
    <div style={rootStyle}>
      {layout === 'hud' ? (
        <HudLayout
          hud={hud}
          depthWarn={depthWarn}
          frameTxt={frameTxt}
          powerTxt={powerTxt}
          t={t}
          um={um}
          units={units}
          depthM={hud.depthMeters}
        />
      ) : (
        <CornerLayout
          hud={hud}
          depthWarn={depthWarn}
          frameTxt={frameTxt}
          powerTxt={powerTxt}
          t={t}
          um={um}
          units={units}
        />
      )}
    </div>
  );
}

/** 角落布局：左下单一大框（姿态 + 全部参数），顶部罗盘 */
function CornerLayout(props: {
  hud: HudSnapshot;
  depthWarn: boolean;
  frameTxt: string;
  powerTxt: string;
  t: (k: DictKey, vars?: Record<string, string | number>) => string;
  um: Um;
  units: UnitSystem;
}) {
  const { hud, depthWarn, t, um, units } = props;
  const u = units;
  return (
    <>
      {/* 顶部中央：罗盘（避开顶栏） */}
      <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)' }}>
        <Compass headingDeg={hud.headingDeg} />
      </div>

      {/* 左下角：单一大框（姿态 + 深度/温度/俯仰/横滚/速度） */}
      <div style={{ ...cornerBoxStyle, bottom: 56, left: 16, width: 340 }}>
        <div style={{ fontSize: 11, color: '#7fb3c9', letterSpacing: 1, textAlign: 'center', marginBottom: 2 }}>
          {t('val_attitude')}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <AttitudeIndicatorView quaternion={hud.attitude} size={128} />
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', paddingBottom: 4 }}>
            <Readout label={t('hud_depth')} value={fmtDepth(hud.depthMeters, u)} unit={um.depth} warn={depthWarn} size={18} />
            <Readout label={t('hud_temp')} value={fmtTemp(hud.temperatureC, u)} unit={um.temp} size={18} />
            <Readout label={t('hud_pitch')} value={hud.pitchDeg.toFixed(1)} unit="°" size={18} />
            <Readout label={t('hud_roll')} value={hud.rollDeg.toFixed(1)} unit="°" size={18} />
            <Readout label={t('hud_speed')} value={hud.speedKnots.toFixed(1)} unit="kn" size={18} />
            <Readout
              label={t('hud_motor')}
              value={hud.motorLocked ? t('motor_locked') : t('motor_unlocked')}
              size={16}
              warn={hud.motorLocked}
            />
          </div>
        </div>
      </div>

      {/* 底部中央：定距声纳（六向测距，机身表面） */}
      {hud.distanceSonar && <DistPanel sonar={hud.distanceSonar} t={t} units={units} />}

      {/* 左上角小标签 */}
      <div style={{ position: 'absolute', top: 64, left: 20, fontSize: 12, color: '#5b93ab', letterSpacing: 2 }}>
        VIEW: {t('view_pov')} · {props.frameTxt} · {props.powerTxt}
      </div>
    </>
  );
}

/** HUD 布局：刻度条居中半透明、中央横滚圈、外圈测距、底部信息条 */
function HudLayout(props: {
  hud: HudSnapshot;
  depthWarn: boolean;
  frameTxt: string;
  powerTxt: string;
  t: (k: DictKey, vars?: Record<string, string | number>) => string;
  um: Um;
  units: UnitSystem;
  depthM: number;
}) {
  const { hud, depthWarn, t, um, units, depthM } = props;
  return (
    <>
      {/* 顶部：罗盘刻度条（避开顶栏，无底无边框） */}
      <div style={{ position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)' }}>
        <Compass headingDeg={hud.headingDeg} />
      </div>

      {/* 前/后测距（顶部罗盘下方两侧） */}
      {hud.distanceSonar && (
        <div style={{ position: 'absolute', top: 132, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 240 }}>
          <EdgeDist label={t('dir_fwd')} v={hud.distanceSonar.fwd} units={units} />
          <EdgeDist label={t('dir_back')} v={hud.distanceSonar.back} units={units} />
        </div>
      )}

      {/* 左侧：深度刻度（垂直条，0 顶 → max 底，半透明） */}
      <DepthScale depthM={depthM} maxM={Math.max(60, Math.ceil((depthM * 1.2) / 10) * 10)} depthWarn={depthWarn} um={um} t={t} />

      {/* 右侧：俯仰刻度（垂直条，半透明） */}
      <PitchScale pitchDeg={hud.pitchDeg} t={t} />


      {/* 上/下/左/右 测距（屏幕四边最外侧，半透明） */}
      {hud.distanceSonar && (
        <>
          <EdgeDist label={t('dir_up')} v={hud.distanceSonar.up} units={units} style={{ position: 'absolute', top: 190, left: '50%', transform: 'translateX(-50%)' }} />
          <EdgeDist label={t('dir_down')} v={hud.distanceSonar.down} units={units} style={{ position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)' }} />
          <EdgeDist label={t('dir_left')} v={hud.distanceSonar.left} units={units} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <EdgeDist label={t('dir_right')} v={hud.distanceSonar.right} units={units} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }} />
        </>
      )}

      {/* 下方：信息条（半透明，避开状态栏） */}
      <div style={infoBarStyle}>
        <InfoItem label={t('hud_speed')} value={`${hud.speedKnots.toFixed(1)} kn`} />
        <InfoItem label={t('hud_temp')} value={`${fmtTemp(hud.temperatureC, units)} ${um.temp}`} />
        <InfoItem label={t('hud_frame')} value={props.frameTxt} />
        <InfoItem label={t('hud_power')} value={props.powerTxt} />
      </div>

      {/* 底部：横滚弧形刻度（大圆盘仅上方 120° 扇形） */}
      <div style={{ position: 'absolute', bottom: 192, left: '50%', transform: 'translateX(-50%)' }}>
        <RollArc rollDeg={hud.rollDeg} t={t} />
      </div>

      {/* 左下角：姿态小模型 */}
      <div style={{ ...cornerBoxStyle, bottom: 56, left: 16, width: 170 }}>
        <div style={{ fontSize: 11, color: '#7fb3c9', letterSpacing: 1, textAlign: 'center', marginBottom: 2 }}>
          {t('val_attitude')}
        </div>
        <AttitudeIndicatorView quaternion={hud.attitude} size={148} />
      </div>
    </>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 90 }}>
      <span style={{ fontSize: 10, color: '#7fb3c9', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 17, color: '#e8f8ff', fontFamily: 'Consolas, Menlo, monospace', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>{value}</span>
    </div>
  );
}

/** 深度刻度：垂直条，0m 顶部 → maxM 底部 */
function DepthScale(props: { depthM: number; maxM: number; depthWarn: boolean; um: Um; t: (k: DictKey) => string }) {
  const { depthM, maxM, depthWarn, um, t } = props;
  const H = 340;
  const ratio = Math.min(1, depthM / maxM);
  const y = 8 + ratio * (H - 30);
  const marks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({ y: 8 + r * (H - 30), v: (maxM * r).toFixed(0) }));
  return (
    <div style={{ position: 'absolute', left: 58, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 10, color: '#7fb3c9', letterSpacing: 1, marginBottom: 4, textAlign: 'center' }}>
        {t('hud_depth')} ({um.depth})
      </span>
      <div style={{ position: 'relative', width: 70, height: H }}>
        {marks.map((m, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: m.y, borderTop: '1px solid rgba(90,147,171,.35)' }}>
            <span style={{ position: 'absolute', right: 4, top: -8, fontSize: 9, color: '#5b93ab' }}>{m.v}</span>
          </div>
        ))}
        {/* 指针 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: `2px solid ${depthWarn ? '#ff7043' : '#4fc3f7'}` }}>
          <span
            style={{
              position: 'absolute', left: 4, top: -9,
              fontSize: 13, color: depthWarn ? '#ff7043' : '#e8f8ff',
              fontFamily: 'Consolas, Menlo, monospace',
              textShadow: '0 0 6px rgba(0,0,0,.9)',
            }}
          >
            {depthM.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 俯仰刻度：垂直条（+90 顶 → -90 底） */
function PitchScale(props: { pitchDeg: number; t: (k: DictKey) => string }) {
  const { pitchDeg, t } = props;
  const H = 340;
  const y = H / 2 - (Math.max(-90, Math.min(90, pitchDeg)) / 180) * (H - 30);
  return (
    <div style={{ position: 'absolute', right: 58, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 10, color: '#7fb3c9', letterSpacing: 1, marginBottom: 4, textAlign: 'center' }}>{t('hud_pitch')} (°)</span>
      <div style={{ position: 'relative', width: 70, height: H }}>
        {[90, 60, 30, 0, -30, -60, -90].map((v) => {
          const yy = H / 2 - (v / 180) * (H - 30);
          return (
            <div key={v} style={{ position: 'absolute', left: 0, right: 0, top: yy, borderTop: v === 0 ? '1px solid rgba(79,195,247,.6)' : '1px solid rgba(90,147,171,.35)' }}>
              <span style={{ position: 'absolute', right: 4, top: -8, fontSize: 9, color: '#5b93ab' }}>{v}</span>
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: '2px solid #ffd54f' }}>
          <span
            style={{
              position: 'absolute', left: 4, top: -9,
              fontSize: 13, color: '#ffd54f', fontFamily: 'Consolas, Menlo, monospace',
              textShadow: '0 0 6px rgba(0,0,0,.9)',
            }}
          >
            {pitchDeg.toFixed(1)}°
          </span>
        </div>
      </div>
    </div>
  );
}

/** 横滚弧形刻度：底部大圆盘，仅显示上方 120° 扇形区域（飞机 HUD bank 指示器） */
function RollArc(props: { rollDeg: number; t: (k: DictKey) => string }) {
  const { rollDeg, t } = props;
  const W = 460;
  const H = 150;
  const cx = W / 2;
  const cy = H + 90;
  const R = 300;
  const a = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const px = (deg: number, r: number) => cx + r * Math.cos(a(deg));
  const py = (deg: number, r: number) => cy + r * Math.sin(a(deg));
  const ticks = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.9 }}>
      <span style={{ fontSize: 10, color: '#7fb3c9', letterSpacing: 1, marginBottom: 2 }}>{t('hud_roll')} (°)</span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* 弧线（上方 120° 扇形边界） */}
        <path
          d={`M ${px(-60, R - 2)} ${py(-60, R - 2)} A ${R - 2} ${R - 2} 0 0 1 ${px(60, R - 2)} ${py(60, R - 2)}`}
          fill="none"
          stroke="rgba(90,147,171,0.55)"
          strokeWidth={1.5}
        />
        {/* 刻度盘（随 -roll 旋转） */}
        <g transform={`rotate(${-rollDeg} ${cx} ${cy})`}>
          {ticks.map((deg) => {
            const isMajor = Math.abs(deg) % 30 === 0;
            const len = isMajor ? 14 : 7;
            const x1 = px(deg, R - len - 4);
            const y1 = py(deg, R - len - 4);
            const x2 = px(deg, R - 4);
            const y2 = py(deg, R - 4);
            return (
              <g key={deg}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={isMajor ? '#bde7f7' : 'rgba(90,147,171,0.7)'} strokeWidth={isMajor ? 2 : 1} />
                {deg !== 0 && (
                  <text
                    x={px(deg, R - 30)}
                    y={py(deg, R - 30)}
                    fill="#8ad5f5"
                    fontSize={10}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {deg}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={px(0, R - 2)} y1={py(0, R - 2)} x2={px(0, R - 90)} y2={py(0, R - 90)} stroke="rgba(255,213,79,0.5)" strokeWidth={1.5} />
        </g>
        {/* 固定中央基准三角 */}
        <polygon points={`${cx},${cy - R + 26} ${cx - 7},${cy - R + 12} ${cx + 7},${cy - R + 12}`} fill="#ffd54f" />
        <text x={cx} y={cy - 34} fill="#e8f8ff" fontSize={18} fontFamily="Consolas, Menlo, monospace" textAnchor="middle">
          {rollDeg.toFixed(0)}°
        </text>
      </svg>
    </div>
  );
}

function EdgeDist({ label, v, units, style }: { label: string; v: number | null; units: UnitSystem; style?: React.CSSProperties }) {
  const { val, unit } = fmtDistVal(v, units);
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        background: 'rgba(3,22,34,0.25)',
        borderRadius: 6,
        padding: '3px 8px',
        minWidth: 58,
      }}
    >
      <span style={{ fontSize: 10, color: '#7fb3c9' }}>{label}</span>
      <span style={{ fontSize: 14, fontFamily: 'Consolas, Menlo, monospace', color: v !== null && v < 3 ? '#ff7043' : '#e8f8ff', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
        {val} <span style={{ fontSize: 9, color: '#5b93ab' }}>{unit}</span>
      </span>
    </div>
  );
}

function DistPanel({ sonar, t, units }: { sonar: HudSnapshot['distanceSonar']; t: (k: DictKey) => string; units: UnitSystem }) {
  return (
    <div style={distPanelStyle}>
      <div style={{ fontSize: 11, color: '#7fb3c9', letterSpacing: 2, marginBottom: 4, textAlign: 'center' }}>
        {t('dme')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '3px 16px', justifyContent: 'center' }}>
        <DistItem label={t('dir_fwd')} v={sonar?.fwd ?? null} units={units} />
        <DistItem label={t('dir_back')} v={sonar?.back ?? null} units={units} />
        <DistItem label={t('dir_left')} v={sonar?.left ?? null} units={units} />
        <DistItem label={t('dir_right')} v={sonar?.right ?? null} units={units} />
        <DistItem label={t('dir_up')} v={sonar?.up ?? null} units={units} />
        <DistItem label={t('dir_down')} v={sonar?.down ?? null} units={units} />
      </div>
    </div>
  );
}

function DistItem({ label, v, units }: { label: string; v: number | null; units: UnitSystem }) {
  const { val, unit } = fmtDistVal(v, units);
  const warn = v !== null && v < 3;
  return (
    <div style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ color: '#8ad5f5', width: 26 }}>{label}</span>
      <span style={{ fontFamily: 'Consolas, Menlo, monospace', color: warn ? '#ff7043' : '#e8f8ff' }}>
        {val}
      </span>
      <span style={{ color: '#5b93ab', fontSize: 10 }}>{unit}</span>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 20,
  userSelect: 'none',
};

const cornerBoxStyle: React.CSSProperties = {
  position: 'absolute',
  background: 'rgba(3, 22, 34, 0.55)',
  border: '1px solid rgba(42, 109, 143, 0.6)',
  borderRadius: 10,
  padding: 6,
};

const distPanelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 120,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(3, 22, 34, 0.45)',
  border: '1px solid rgba(42, 109, 143, 0.5)',
  borderRadius: 8,
  padding: '6px 16px',
};

const infoBarStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 62,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 30,
  padding: '8px 22px',
};
