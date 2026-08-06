/**
 * SettingsMenu：局内设置菜单（多 tab）。
 * 支持手柄（摇杆/十字键 + A/B）与键盘（方向键 + Enter/Esc）导航。
 * 导航 API 通过 settingsNavRef 暴露给 TrainingScreen 的手柄循环。
 * tab 顺序：显示 / 环境 / 操作 / 其他（语言单位）。
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { getRov } from '../../core/rov/registry';
import { tr, type DictKey } from '../../i18n';
import { ENV_RANGES, type EnvironmentParams } from '../../core/environment/EnvironmentState';

export type SettingsNav = {
  up: () => void;
  down: () => void;
  left: () => void;
  right: () => void;
  confirm: () => void;
  back: () => void;
  tabNext: () => void;
  tabPrev: () => void;
};

export const settingsNavRef: { current: SettingsNav | null } = { current: null };

type TabId = 'disp' | 'env' | 'op' | 'unit';

interface MenuItem {
  id: string;
  label: string;
  kind: 'seg' | 'slider' | 'toggle' | 'action';
  valueLabel: string;
  options?: string[];
  cur?: number;
  onPick?: (i: number) => void;
  min?: number;
  max?: number;
  step?: number;
  curValue?: number;
  onValue?: (v: number) => void;
  onLeft?: () => void;
  onRight?: () => void;
  onConfirm?: () => void;
}

export function SettingsMenu(props: {
  onLevel: () => void;
  envParams: EnvironmentParams;
  onEnvParam: (key: keyof typeof ENV_RANGES, v: number) => void;
  onResetEnv: () => void;
}) {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  // 菜单关闭时零 hook 开销（惰性渲染）
  if (!settingsOpen) return null;
  return <SettingsMenuInner {...props} />;
}

function SettingsMenuInner(props: {
  onLevel: () => void;
  envParams: EnvironmentParams;
  onEnvParam: (key: keyof typeof ENV_RANGES, v: number) => void;
  onResetEnv: () => void;
}) {
  const [tab, setTab] = useState<TabId>('disp');
  const selectedRovId = useAppStore((s) => s.selectedRovId);
  // 航速滑块上限 = 机型硬限速（缺省 4.5）
  const speedCap = getRov(selectedRovId)?.hardMaxSpeedKnots ?? 4.5;
  const [focus, setFocus] = useState(0);

  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const language = useAppStore((s) => s.language);
  const units = useAppStore((s) => s.units);
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);

  const axisMode = useAppStore((s) => s.axisMode);
  const setAxisMode = useAppStore((s) => s.setAxisMode);
  const wheelMode = useAppStore((s) => s.wheelMode);
  const setWheelMode = useAppStore((s) => s.setWheelMode);
  const powerCurve = useAppStore((s) => s.powerCurve);
  const setPowerCurve = useAppStore((s) => s.setPowerCurve);
  const powerLevel = useAppStore((s) => s.powerLevel);
  const setPowerLevel = useAppStore((s) => s.setPowerLevel);
  const gamepadMode = useAppStore((s) => s.gamepadMode);
  const setGamepadMode = useAppStore((s) => s.setGamepadMode);
  const gamepadSensitivity = useAppStore((s) => s.gamepadSensitivity);
  const setGamepadSensitivity = useAppStore((s) => s.setGamepadSensitivity);
  const maxSpeedKnots = useAppStore((s) => s.rovControls.maxSpeedKnots);
  const setMaxSpeedKnots = useAppStore((s) => s.setMaxSpeedKnots);
  const hudLayout = useAppStore((s) => s.hudLayout);
  const setHudLayout = useAppStore((s) => s.setHudLayout);
  const sonarVisible = useAppStore((s) => s.sonarVisible);
  const setSonarVisible = useAppStore((s) => s.setSonarVisible);
  const graphicsQuality = useAppStore((s) => s.graphicsQuality);
  const setGraphicsQuality = useAppStore((s) => s.setGraphicsQuality);
  const setUnits = useAppStore((s) => s.setUnits);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const dvlEnabled = useAppStore((s) => s.dvlEnabled);
  const setDvlEnabled = useAppStore((s) => s.setDvlEnabled);

  const envLabels: Record<string, string> = {
    currentSpeed: t('set_flow'),
    currentDirectionDeg: t('set_flow_dir'),
    turbulence: t('set_turb'),
    visibility: t('set_vis'),
    temperatureC: t('set_temp'),
    turbidity: t('set_turbidity'),
    sunlight: t('set_sun'),
    lightFlicker: t('set_flicker'),
  };

  const mkSeg = (label: string, value: string, options: { v: string; label: string }[], set: (v: string) => void): MenuItem => {
    const idx = options.findIndex((o) => o.v === value);
    return {
      id: label,
      label,
      kind: 'seg',
      valueLabel: options[idx]?.label ?? '',
      options: options.map((o) => o.label),
      cur: Math.max(0, idx),
      onPick: (i) => set(options[i].v),
      onLeft: () => set(options[(idx - 1 + options.length) % options.length].v),
      onRight: () => set(options[(idx + 1) % options.length].v),
      onConfirm: () => set(options[(idx + 1) % options.length].v),
    };
  };

  const items: MenuItem[] = useMemo(() => {
    const list: MenuItem[] = [];
    if (tab === 'disp') {
      list.push(
        {
          id: 'sonar',
          label: t('set_sonar'),
          kind: 'toggle',
          valueLabel: sonarVisible ? t('val_on') : t('val_off'),
          onLeft: () => setSonarVisible(!sonarVisible),
          onRight: () => setSonarVisible(!sonarVisible),
          onConfirm: () => setSonarVisible(!sonarVisible),
        },
        mkSeg(t('set_hud_layout'), hudLayout, [
          { v: 'corner', label: t('val_corner') },
          { v: 'hud', label: t('val_hud') },
        ], (v) => setHudLayout(v as 'corner' | 'hud')),
        mkSeg(t('set_quality'), graphicsQuality, [
          { v: 'low', label: t('val_low') },
          { v: 'medium', label: t('val_mid') },
          { v: 'high', label: t('val_high') },
        ], (v) => setGraphicsQuality(v as 'low' | 'medium' | 'high')),
      );
    } else if (tab === 'env') {
      const envModel = props.envParams.envModel ?? 'custom';
      // 环境模式选择
      list.push(
        mkSeg(t('env_model'), envModel, [
          { v: 'sea', label: t('val_sea') },
          { v: 'river', label: t('val_river') },
          { v: 'custom', label: t('val_custom') },
        ], (v) => props.onEnvParam('envModel' as never, v as never)),
      );
      if (envModel === 'sea') {
        // 海况等级 0-4
        list.push(
          mkSeg(t('sea_state'), String(Math.round(props.envParams.seaState ?? 0)), [
            { v: '0', label: '0' },
            { v: '1', label: '1' },
            { v: '2', label: '2' },
            { v: '3', label: '3' },
            { v: '4', label: '4' },
          ], (v) => props.onEnvParam('seaState' as never, Number(v) as never)),
        );
      } else if (envModel === 'river') {
        const cur = props.envParams.riverKnots ?? 0;
        list.push({
          id: 'riverKnots',
          label: t('river_speed'),
          kind: 'slider',
          valueLabel: cur.toFixed(1),
          min: 0, max: 4, step: 0.1,
          curValue: cur,
          onValue: (v) => props.onEnvParam('riverKnots' as never, v as never),
          onLeft: () => props.onEnvParam('riverKnots' as never, Math.max(0, cur - 0.1) as never),
          onRight: () => props.onEnvParam('riverKnots' as never, Math.min(4, cur + 0.1) as never),
        });
      }
      // 通用/自定义滑杆（sea/river 模式隐藏由模式推导的 currentSpeed/turbulence）
      const hidden = envModel === 'custom' ? ['envModel', 'seaState', 'riverKnots'] : envModel === 'sea' ? ['envModel', 'seaState', 'riverKnots', 'currentSpeed', 'turbulence'] : ['envModel', 'seaState', 'riverKnots', 'currentSpeed', 'turbulence'];
      (Object.keys(ENV_RANGES) as (keyof typeof ENV_RANGES)[]).forEach((key) => {
        if (hidden.includes(key as string)) return;
        const cur = Number(props.envParams[key] ?? ENV_RANGES[key].min);
        list.push({
          id: key,
          label: envLabels[key] ?? key,
          kind: 'slider',
          valueLabel: cur.toFixed(2),
          min: ENV_RANGES[key].min,
          max: ENV_RANGES[key].max,
          step: ENV_RANGES[key].step,
          curValue: cur,
          onValue: (v) => props.onEnvParam(key, v),
          onLeft: () => props.onEnvParam(key, Math.max(ENV_RANGES[key].min, cur - ENV_RANGES[key].step)),
          onRight: () => props.onEnvParam(key, Math.min(ENV_RANGES[key].max, cur + ENV_RANGES[key].step)),
        });
      });
      list.push({
        id: 'reset',
        label: t('set_reset_env'),
        kind: 'action',
        valueLabel: '↺',
        onConfirm: () => props.onResetEnv(),
      });
    } else if (tab === 'op') {
      list.push(
        {
          id: 'dvl',
          label: t('set_dvl'),
          kind: 'toggle',
          valueLabel: dvlEnabled ? t('val_on') : t('val_off'),
          onLeft: () => setDvlEnabled(!dvlEnabled),
          onRight: () => setDvlEnabled(!dvlEnabled),
          onConfirm: () => setDvlEnabled(!dvlEnabled),
        },
        mkSeg(t('set_coord'), axisMode, [
          { v: 'body', label: t('val_body') },
          { v: 'world', label: t('val_world') },
        ], (v) => setAxisMode(v as 'body' | 'world')),
        mkSeg(t('set_wheel'), wheelMode, [
          { v: 'camera', label: t('val_camera') },
          { v: 'gripper', label: t('val_gripper') },
        ], (v) => setWheelMode(v as 'camera' | 'gripper')),
        mkSeg(t('set_curve'), powerCurve, [
          { v: 'linear', label: t('val_linear') },
          { v: 'ease', label: t('val_ease') },
        ], (v) => setPowerCurve(v as 'linear' | 'ease')),
        mkSeg(t('set_power'), String(powerLevel), [
          { v: '0.25', label: '25%' },
          { v: '0.5', label: '50%' },
          { v: '0.75', label: '75%' },
          { v: '1', label: '100%' },
        ], (v) => setPowerLevel(Number(v) as 0.25 | 0.5 | 0.75 | 1)),
        mkSeg(t('set_gamepad'), gamepadMode, [
          { v: 'jp', label: t('val_jp') },
          { v: 'us', label: t('val_us') },
        ], (v) => setGamepadMode(v as 'jp' | 'us')),
        mkSeg(t('set_sensitivity'), gamepadSensitivity, [
          { v: 'low', label: t('val_low') },
          { v: 'medium', label: t('val_mid') },
          { v: 'high', label: t('val_high') },
        ], (v) => setGamepadSensitivity(v as 'low' | 'medium' | 'high')),
        {
          id: 'maxspeed',
          label: t('set_maxspeed'),
          kind: 'slider',
          valueLabel: Math.min(maxSpeedKnots, speedCap).toFixed(1),
          min: 0.5,
          max: speedCap,
          step: 0.1,
          curValue: Math.min(maxSpeedKnots, speedCap),
          onValue: (v) => setMaxSpeedKnots(v),
          onLeft: () => setMaxSpeedKnots(Math.max(0.5, Math.min(speedCap, Math.round((maxSpeedKnots - 0.1) * 10) / 10))),
          onRight: () => setMaxSpeedKnots(Math.min(speedCap, Math.round((maxSpeedKnots + 0.1) * 10) / 10)),
        },
      );
    } else {
      list.push(
        mkSeg(t('set_units'), units, [
          { v: 'metric', label: t('val_metric') },
          { v: 'imperial', label: t('val_imperial') },
        ], (v) => setUnits(v as 'metric' | 'imperial')),
        mkSeg(t('set_language'), language, [
          { v: 'zh', label: '简体中文' },
          { v: 'en', label: 'English' },
          { v: 'es', label: 'Español' },
        ], (v) => setLanguage(v as 'zh' | 'en' | 'es')),
      );
    }
    return list;
  }, [tab, language, axisMode, wheelMode, powerCurve, powerLevel, gamepadMode, maxSpeedKnots, hudLayout, sonarVisible, graphicsQuality, units, dvlEnabled, gamepadSensitivity, speedCap, props.envParams]);

  const nav: SettingsNav = useMemo(() => {
    const clamp = (f: number) => Math.max(0, Math.min(items.length - 1, f));
    const TAB_ORDER: TabId[] = ['disp', 'env', 'op', 'unit'];
    const switchTab = (dir: number) => {
      setTab(TAB_ORDER[(TAB_ORDER.indexOf(tab) + dir + TAB_ORDER.length) % TAB_ORDER.length]);
      setFocus(0);
    };
    return {
      up: () => setFocus((f) => clamp(f - 1)),
      down: () => setFocus((f) => clamp(f + 1)),
      left: () => items[focus]?.onLeft?.(),
      right: () => items[focus]?.onRight?.(),
      confirm: () => {
        const it = items[focus];
        it?.onConfirm?.();
      },
      back: () => setSettingsOpen(false),
      tabNext: () => switchTab(1),
      tabPrev: () => switchTab(-1),
    };
  }, [items, focus, setSettingsOpen, tab]);
  settingsNavRef.current = settingsOpen ? nav : null;

  // 键盘导航
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp') { e.preventDefault(); nav.up(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); nav.down(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); nav.left(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); nav.right(); }
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); nav.confirm(); }
      else if (e.code === 'Escape') { setSettingsOpen(false); }
      else if (e.code === 'Tab') {
        e.preventDefault();
        const order: TabId[] = ['disp', 'env', 'op', 'unit'];
        setTab(order[(order.indexOf(tab) + 1) % order.length]);
        setFocus(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, settingsOpen, setSettingsOpen, tab]);

  if (!settingsOpen) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'disp', label: t('tab_disp') },
    { id: 'env', label: t('tab_env') },
    { id: 'op', label: t('tab_op') },
    { id: 'unit', label: t('tab_other') },
  ];

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#a9d3e8', marginBottom: 12 }}>
          {t('settings_title')}
          <span style={{ float: 'right', fontSize: 12, color: '#5b93ab', fontWeight: 400 }}>
            {t('settings_nav_hint')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => {
                setTab(tb.id);
                setFocus(0);
              }}
              style={{ ...tabBtnStyle, ...(tab === tb.id ? tabActiveStyle : {}) }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '58vh', overflowY: 'auto' }}>
          {items.map((it, i) => {
            const focused = i === focus;
            return (
              <div key={it.id} onClick={() => setFocus(i)} style={{ ...rowStyle, ...(focused ? rowFocusStyle : {}) }}>
                <span style={{ fontSize: 13, color: focused ? '#eafaff' : '#b7d9ea', flex: '0 0 120px' }}>{it.label}</span>
                {it.kind === 'seg' && it.options ? (
                  <select
                    value={it.cur}
                    onChange={(e) => it.onPick?.(Number(e.target.value))}
                    style={selectStyle}
                  >
                    {it.options.map((o, j) => (
                      <option key={o} value={j}>{o}</option>
                    ))}
                  </select>
                ) : it.kind === 'slider' && it.onValue !== undefined ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range"
                      min={it.min}
                      max={it.max}
                      step={it.step}
                      value={it.curValue}
                      onChange={(e) => it.onValue?.(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#4fc3f7' }}
                    />
                    <span style={{ fontSize: 12, color: '#8ad5f5', fontFamily: 'Consolas, monospace', minWidth: 40, textAlign: 'right' }}>
                      {it.valueLabel}
                    </span>
                  </div>
                ) : it.kind === 'toggle' ? (
                  <span style={{ fontSize: 14, color: '#4fc3f7', fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{it.valueLabel}</span>
                ) : (
                  <span style={{ fontSize: 14, color: '#4fc3f7', fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{it.valueLabel}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 90,
  background: 'rgba(2, 10, 16, 0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(8, 32, 48, 0.97)',
  border: '1px solid #1a4a63',
  borderRadius: 12,
  padding: 20,
  minWidth: 460,
  maxWidth: 600,
  width: '66%',
  color: '#d7eef8',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(79,195,247,.1)',
  color: '#b7d9ea',
  border: '1px solid #1f5878',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  fontSize: 13,
};

const tabActiveStyle: React.CSSProperties = {
  background: 'rgba(79,195,247,.4)',
  color: '#eafaff',
  borderColor: '#4fc3f7',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '7px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  gap: 10,
};

const rowFocusStyle: React.CSSProperties = {
  background: 'rgba(79,195,247,.12)',
  boxShadow: 'inset 3px 0 0 #4fc3f7',
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'transparent',
  color: '#e8f8ff',
  border: 'none',
  borderBottom: '1px solid #2a6d8f',
  padding: '5px 2px',
  fontSize: 13,
  cursor: 'pointer',
  outline: 'none',
};
