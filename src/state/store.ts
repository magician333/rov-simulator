/**
 * Zustand 全局 store：桥接 UI 层与仿真/渲染核心（docs/02-系统架构.md §4）。
 * - 高频数据（HUD）由渲染循环节流写入（~10Hz）
 * - 环境参数实时写入并同步到 EnvironmentState
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EnvironmentParams } from '../core/environment/EnvironmentState';
import { DEFAULT_ENV_PARAMS } from '../core/environment/EnvironmentState';
import type { HudSnapshot } from '../core/rov/ROVState';
import type { TaskStateView } from '../core/task/TaskRunner';

export type Screen = 'menu' | 'training';
export type ViewMode = 'chase' | 'pov';
export type AxisMode = 'body' | 'world';
export type GraphicsQuality = 'low' | 'medium' | 'high';
export type WheelMode = 'camera' | 'gripper';
export type PowerCurve = 'linear' | 'ease';
export type GamepadMode = 'jp' | 'us';
export type PowerLevel = 0.25 | 0.5 | 0.75 | 1;
export type HudLayout = 'corner' | 'hud';
export type CompassStyle = 'disk' | 'ticks';
export type GamepadSensitivity = 'low' | 'medium' | 'high';
export type Lang = 'zh' | 'en' | 'es';

/** 根据浏览器默认语言检测界面语言（不支持时默认英文） */
export function detectLanguage(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const lang = (navigator.language || navigator.languages?.[0] || 'en').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}
export type UnitSystem = 'metric' | 'imperial';

export interface RovControlState {
  lightsOn: boolean;
  maxSpeedKnots: number;
}

interface AppState {
  screen: Screen;
  selectedRovId: string;
  selectedSceneId: string;
  viewMode: ViewMode;
  /** 声纳面板独立开关（任意主视角下可显示/拖动） */
  sonarVisible: boolean;
  /** 声纳频段（手柄 Back 长按切换；不持久化） */
  sonarFreq: 'high' | 'low';
  axisMode: AxisMode;
  envParams: EnvironmentParams;
  rovControls: RovControlState;
  hud: HudSnapshot | null;
  paused: boolean;
  taskState: TaskStateView | null;
  taskResult: 'completed' | 'failed' | null;
  taskDurationSec: number;
  graphicsQuality: GraphicsQuality;
  /** 滚轮功能：相机缩放 / 机械臂夹爪开合 */
  wheelMode: WheelMode;
  /** 动力曲线 */
  powerCurve: PowerCurve;
  /** 手柄操作模式：jp=日本手（左摇杆平移/右摇杆转向升降）；us=美国手 */
  gamepadMode: GamepadMode;
  /** 动力输出百分比 */
  powerLevel: PowerLevel;
  /** 第一视角 HUD 布局：corner=角落（默认）；hud=中央 HUD 模式 */
  hudLayout: HudLayout;
  /** 罗盘样式：disk=圆盘（默认）；ticks=刻度条 */
  compassStyle: CompassStyle;
  /** 界面语言 */
  language: Lang;
  /** 单位制 */
  units: UnitSystem;
  /** 设置菜单开关（手柄菜单键/顶栏按钮） */
  settingsOpen: boolean;
  /** 手柄摇杆灵敏度 */
  gamepadSensitivity: GamepadSensitivity;
  /** DVL 多普勒测速（悬停保持 + 洋流削弱） */
  dvlEnabled: boolean;
  /** 脐带缆（浮力线）开关 */

  // actions
  gotoMenu(): void;
  startTraining(): void;
  selectRov(id: string): void;
  selectScene(id: string): void;
  setViewMode(mode: ViewMode): void;
  setSonarVisible(v: boolean): void;
  setSonarFreq(f: 'high' | 'low'): void;
  setAxisMode(mode: AxisMode): void;
  setTaskState(state: TaskStateView | null): void;
  setTaskResult(result: 'completed' | 'failed' | null, durationSec?: number): void;
  setGraphicsQuality(q: GraphicsQuality): void;
  setWheelMode(m: WheelMode): void;
  setPowerCurve(c: PowerCurve): void;
  setGamepadMode(m: GamepadMode): void;
  setPowerLevel(l: PowerLevel): void;
  setHudLayout(l: HudLayout): void;
  setCompassStyle(s: CompassStyle): void;
  setLanguage(l: Lang): void;
  setUnits(u: UnitSystem): void;
  setSettingsOpen(v: boolean): void;
  setGamepadSensitivity(v: GamepadSensitivity): void;
  setDvlEnabled(v: boolean): void;
  setEnvParam<K extends keyof EnvironmentParams>(key: K, value: number): void;
  resetEnvParams(): void;
  setLightsOn(on: boolean): void;
  setMaxSpeedKnots(kn: number): void;
  setHud(hud: HudSnapshot | null): void;
  setPaused(p: boolean): void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      screen: 'menu',
  selectedRovId: 'rov_6dof_standard',
  selectedSceneId: 'salvage',
  viewMode: 'chase',
  sonarVisible: false,
  sonarFreq: 'high',
  axisMode: 'body',
  envParams: { ...DEFAULT_ENV_PARAMS },
  rovControls: { lightsOn: false, maxSpeedKnots: 4.5 },
  hud: null,
  paused: false,
  taskState: null,
  taskResult: null,
  taskDurationSec: 0,
  graphicsQuality: 'medium',
  wheelMode: 'camera',
  powerCurve: 'linear',
  gamepadMode: 'jp',
  powerLevel: 1,
  hudLayout: 'corner',
  compassStyle: 'ticks',
  language: detectLanguage(),
  units: 'metric',
  settingsOpen: false,
  gamepadSensitivity: 'high',
  dvlEnabled: false,

  gotoMenu: () => set({ screen: 'menu', hud: null, paused: false, taskState: null, taskResult: null }),
  startTraining: () => set({ screen: 'training', paused: false, taskResult: null }),
  selectRov: (id) => set({ selectedRovId: id }),
  selectScene: (id) => set({ selectedSceneId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSonarVisible: (sonarVisible) => set({ sonarVisible }),
  setSonarFreq: (sonarFreq) => set({ sonarFreq }),
  setAxisMode: (mode) => set({ axisMode: mode }),
  setTaskState: (taskState) => set({ taskState }),
  setTaskResult: (taskResult, durationSec) => set({ taskResult, taskDurationSec: durationSec ?? 0 }),
  setGraphicsQuality: (graphicsQuality) => set({ graphicsQuality }),
  setWheelMode: (wheelMode) => set({ wheelMode }),
  setPowerCurve: (powerCurve) => set({ powerCurve }),
  setGamepadMode: (gamepadMode) => set({ gamepadMode }),
  setPowerLevel: (powerLevel) => set({ powerLevel }),
  setHudLayout: (hudLayout) => set({ hudLayout }),
  setCompassStyle: (compassStyle) => set({ compassStyle }),
  setLanguage: (language) => set({ language }),
  setUnits: (units) => set({ units }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setGamepadSensitivity: (gamepadSensitivity) => set({ gamepadSensitivity }),
  setDvlEnabled: (dvlEnabled) => set({ dvlEnabled }),
  setEnvParam: (key, value) =>
    set((s) => ({ envParams: { ...s.envParams, [key]: value } })),
  resetEnvParams: () => set({ envParams: { ...DEFAULT_ENV_PARAMS } }),
  setLightsOn: (on) => set((s) => ({ rovControls: { ...s.rovControls, lightsOn: on } })),
  setMaxSpeedKnots: (kn) => set((s) => ({ rovControls: { ...s.rovControls, maxSpeedKnots: kn } })),
  setHud: (hud) => set({ hud }),
  setPaused: (paused) => set({ paused }),
    }),
    {
      name: 'rov-sim-persist',
      storage: createJSONStorage(() => localStorage),
      // 版本 5：罗盘样式不再持久化；浮力线已取消（强制关闭旧缓存值）
      version: 5,
      migrate: (persistedState, version) => {
        const s = persistedState as { state?: { compassStyle?: string } } | undefined;
        if (s?.state) {
          const state = { ...s.state };
          if ((version ?? 0) < 5) {
            delete (state as Record<string, unknown>).compassStyle;
          }
          return { ...s, state };
        }
        return persistedState;
      },
      partialize: (s) => ({
        screen: s.screen,
        selectedRovId: s.selectedRovId,
        selectedSceneId: s.selectedSceneId,
        viewMode: s.viewMode,
        sonarVisible: s.sonarVisible,
        axisMode: s.axisMode,
        rovControls: s.rovControls,
        graphicsQuality: s.graphicsQuality,
        wheelMode: s.wheelMode,
        powerCurve: s.powerCurve,
        gamepadMode: s.gamepadMode,
        powerLevel: s.powerLevel,
        hudLayout: s.hudLayout,
        language: s.language,
        units: s.units,
        gamepadSensitivity: s.gamepadSensitivity,
        dvlEnabled: s.dvlEnabled,
      }),
    },
  ),
);

// ---- envParams 节流持久化（滑块拖动不频繁写 localStorage） ----
const ENV_KEY = 'rov-sim-env';
let envTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<EnvironmentParams>;
      useAppStore.setState({ envParams: { ...useAppStore.getState().envParams, ...saved } });
    }
  } catch {
    // ignore
  }
  useAppStore.subscribe((s, prev) => {
    if (s.envParams === prev.envParams) return;
    if (envTimer) clearTimeout(envTimer);
    envTimer = setTimeout(() => {
      try {
        localStorage.setItem(ENV_KEY, JSON.stringify(useAppStore.getState().envParams));
      } catch {
        // ignore
      }
    }, 500);
  });
}
