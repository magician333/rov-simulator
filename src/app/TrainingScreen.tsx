/**
 * TrainingScreen：训练主界面（M5）。
 * - 全屏 WebGL 画布（Engine）+ 作业场景加载
 * - 键盘控制 / 坐标轴切换 / 视角切换 / 环境调节
 * - 任务系统：TaskRunner + Space 动作键 + 任务面板 + 完成/失败弹窗 + 成绩保存
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '../render/Engine';
import { SimulationEngine } from '../core/SimulationEngine';
import { useAppStore } from '../state/store';
import { useTrainingStore, type TrainingRecord } from '../state/trainingStore';
import type { ControlInput } from '../core/rov/ROVController';
import { EMPTY_INPUT } from '../core/rov/ROVController';
import { PovHud } from '../ui/hud/PovHud';
import { SonarView } from '../ui/sonar/SonarView';
import { DistanceSonar } from '../render/sonar/DistanceSonar';
import * as THREE from 'three';
import type { DistanceReadings } from '../core/rov/ROVState';
import { TASKS } from '../core/task/tasks';
import type { TaskDefinition } from '../core/task/TaskDefinition';
import { getRov } from '../core/rov/registry';
import { TaskRunner, type TaskStateView } from '../core/task/TaskRunner';
import { SettingsMenu, settingsNavRef } from '../ui/settings/SettingsMenu';
import { tr, type DictKey, type Lang } from '../i18n';

// 高频 interval 内复用的临时对象（避免每 tick 堆分配）
const TMP_VEC = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();

/** 按语言本地化任务文本（主初始化与“再来一次”共用，避免重开时回退中文） */
function localizeTask(task: TaskDefinition, lang: Lang): TaskDefinition {
  const k = (s: string) => s as DictKey;
  return {
    ...task,
    name: tr(lang, k(`task_${task.sceneId}_name`)),
    brief: tr(lang, k(`task_${task.sceneId}_brief`)),
    steps: task.steps.map((st) => ({
      ...st,
      title: tr(lang, k(`task_${task.sceneId}_step_${st.id}_title`)),
      description: tr(lang, k(`task_${task.sceneId}_step_${st.id}_desc`)),
    })),
  };
}

import { fmtDepth, fmtTemp, UNIT_MARKS } from '../utils/unitsUI';
import { saveSession, loadSession } from '../utils/session';
import type { TaskContext } from '../core/task/TaskDefinition';

/** 按键映射（docs/03 §4.1） */
const KEYMAP: Record<string, { axis: keyof ControlInput; dir: 1 | -1 }> = {
  KeyW: { axis: 'surge', dir: 1 },
  KeyS: { axis: 'surge', dir: -1 },
  KeyA: { axis: 'sway', dir: -1 },
  KeyD: { axis: 'sway', dir: 1 },
  KeyQ: { axis: 'heave', dir: 1 },
  KeyE: { axis: 'heave', dir: -1 },
  ArrowLeft: { axis: 'yaw', dir: -1 },
  ArrowRight: { axis: 'yaw', dir: 1 },
  ArrowUp: { axis: 'pitch', dir: 1 },
  ArrowDown: { axis: 'pitch', dir: -1 },
  KeyR: { axis: 'roll', dir: 1 },
  KeyF: { axis: 'roll', dir: -1 },
};

const VIEW_ORDER = ['chase', 'pov'] as const;


export function TrainingScreen() {
  const mountRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimulationEngine | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [envDirty, setEnvDirty] = useState(false);

  const selectedRovId = useAppStore((s) => s.selectedRovId);
  const selectedSceneId = useAppStore((s) => s.selectedSceneId);
  const envParams = useAppStore((s) => s.envParams);
  const rovControls = useAppStore((s) => s.rovControls);
  const paused = useAppStore((s) => s.paused);
  const gotoMenu = useAppStore((s) => s.gotoMenu);
  const setEnvParam = useAppStore((s) => s.setEnvParam);
  const resetEnvParams = useAppStore((s) => s.resetEnvParams);
  const setHud = useAppStore((s) => s.setHud);
  const setPaused = useAppStore((s) => s.setPaused);
  const viewMode = useAppStore((s) => s.viewMode);
  const axisMode = useAppStore((s) => s.axisMode);
  const taskState = useAppStore((s) => s.taskState);
  const setTaskState = useAppStore((s) => s.setTaskState);
  const sonarVisible = useAppStore((s) => s.sonarVisible);
  const taskResult = useAppStore((s) => s.taskResult);
  const setTaskResult = useAppStore((s) => s.setTaskResult);
  const graphicsQuality = useAppStore((s) => s.graphicsQuality);
  const addRecord = useTrainingStore((s) => s.addRecord);

  // 任务状态
  const taskRunnerRef = useRef(new TaskRunner());
  const actionDownRef = useRef(false);
  const actionHoldRef = useRef(0);
  const trainTimeRef = useRef(0);
  const notifiedRef = useRef(false);
  const maxDepthRef = useRef(0);
  const speedSumRef = useRef(0);
  const speedCountRef = useRef(0);
  // 定距声纳
  const distSonarRef = useRef<DistanceSonar | null>(null);
  // 机械臂夹取：{ 被抓物体, 机械臂末端体坐标偏移 }
  const grabbedRef = useRef<{ obj: THREE.Object3D; offsetBody: THREE.Vector3 } | null>(null);
  const [grabbedName, setGrabbedName] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // 夹爪开合角度 [0,1]：滚轮（夹爪模式）调节
  const gripperOpenRef = useRef(0.5);
  const [gripperOpen, setGripperOpen] = useState(0.5);
  const hudLayout = useAppStore((s) => s.hudLayout);
  const powerCurve = useAppStore((s) => s.powerCurve);
  const powerLevel = useAppStore((s) => s.powerLevel);
  const language = useAppStore((s) => s.language);
  const units = useAppStore((s) => s.units);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const dvlEnabled = useAppStore((s) => s.dvlEnabled);
  const t = useCallback((k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars), [language]);

  // 创建仿真 + 渲染引擎 + 加载场景 + 启动任务
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const sim = new SimulationEngine({ rovId: selectedRovId });
    sim.setMaxSpeedKnots(useAppStore.getState().rovControls.maxSpeedKnots);
    sim.setPowerCurve(useAppStore.getState().powerCurve);
    sim.setPowerLevel(useAppStore.getState().powerLevel);
    sim.setDvl(useAppStore.getState().dvlEnabled);
    const engine = new Engine(mount, { quality: useAppStore.getState().graphicsQuality });
    engine.attachSimulation(sim);
    engine.loadScene(selectedSceneId);
    // 恢复上次作业会话（浏览器刷新后继续）
    const sess = loadSession();
    if (sess && sess.sceneId === selectedSceneId && sess.rovId === selectedRovId) {
      sim.teleport(
        new THREE.Vector3(sess.pos[0], sess.pos[1], sess.pos[2]),
        new THREE.Quaternion(sess.quat[0], sess.quat[1], sess.quat[2], sess.quat[3]),
      );
      trainTimeRef.current = sess.elapsedSec;
    }
    simRef.current = sim;
    engineRef.current = engine;
    distSonarRef.current = new DistanceSonar(
      engine.scene,
      80,
      (() => {
        const cfg = getRov(selectedRovId);
        const d = cfg?.dimensions ?? { width: 0.9, height: 0.7, length: 1 };
        return new THREE.Vector3(d.width / 2, d.height / 2, d.length / 2);
      })(),
    );
    // 滚轮 → 夹爪开合（夹爪模式）
    engine.onGripperWheel = (dy) => {
      const next = Math.min(1, Math.max(0, gripperOpenRef.current + dy * 0.0015));
      gripperOpenRef.current = next;
      setGripperOpen(next);
      engine.setGripper(next);
    };
    engine.wheelMode = useAppStore.getState().wheelMode;

    // 任务（按当前语言本地化文本）
    const task = TASKS[selectedSceneId];
    taskRunnerRef.current.abort();
    if (task) {
      taskRunnerRef.current.start(localizeTask(task, useAppStore.getState().language));
    }
    actionHoldRef.current = 0;
    trainTimeRef.current = 0;
    notifiedRef.current = false;
    maxDepthRef.current = 0;
    speedSumRef.current = 0;
    speedCountRef.current = 0;
    setTaskState(taskRunnerRef.current.getView());
    setTaskResult(null);

    // HUD + 任务循环（10Hz）；定距声纳同步采样（持续显示不闪烁）
    const hudTimer = window.setInterval(() => {
      let distanceSonar: DistanceReadings | undefined;
      if (distSonarRef.current) {
        const snap = sim.getRenderSnapshot();
        TMP_VEC.set(snap.position.x, snap.position.y, snap.position.z);
        TMP_QUAT.set(snap.quaternion.x, snap.quaternion.y, snap.quaternion.z, snap.quaternion.w);
        distanceSonar = distSonarRef.current.sample(TMP_VEC, TMP_QUAT);
      }
      setHud({ ...sim.getHudSnapshot(), distanceSonar });

      // 任务推进
      if (taskRunnerRef.current.currentPhase === 'active') {
        trainTimeRef.current += 0.1;
        actionHoldRef.current = actionDownRef.current && !useAppStore.getState().paused
          ? actionHoldRef.current + 0.1
          : 0;
        const snap = sim.getRenderSnapshot();
        maxDepthRef.current = Math.max(maxDepthRef.current, snap.depthMeters);
        speedSumRef.current += snap.speedKnots;
        speedCountRef.current++;
        const ctx: TaskContext = {
          rov: snap,
          env: sim.environment.get(),
          targets: engine.getSceneTargets(),
          actionHoldSec: actionHoldRef.current,
          time: trainTimeRef.current,
        };
        taskRunnerRef.current.update(ctx);
        const view = taskRunnerRef.current.getView();
        setTaskState(view);

        const phase = view?.phase;
        if ((phase === 'completed' || phase === 'failed') && !notifiedRef.current) {
          notifiedRef.current = true;
          // 保存成绩
          const record: TrainingRecord = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            rovId: selectedRovId,
            sceneId: selectedSceneId,
            taskId: TASKS[selectedSceneId]?.id ?? '',
            completed: phase === 'completed',
            durationSec: trainTimeRef.current,
            maxDepthM: maxDepthRef.current,
            avgSpeedKnots: speedCountRef.current > 0 ? speedSumRef.current / speedCountRef.current : 0,
          };
          addRecord(record);
          setTaskResult(phase === 'completed' ? 'completed' : 'failed', record.durationSec);
          setPaused(true);
        }
      }
    }, 100);

    // 机械臂夹取跟随（33Hz 平滑）
    const grabTimer = window.setInterval(() => {
      const g = grabbedRef.current;
      const sim = simRef.current;
      if (!g || !sim) return;
      const snap = sim.getRenderSnapshot();
      TMP_QUAT.set(snap.quaternion.x, snap.quaternion.y, snap.quaternion.z, snap.quaternion.w);
      TMP_VEC.set(snap.position.x, snap.position.y, snap.position.z);
      g.obj.position.copy(g.offsetBody).applyQuaternion(TMP_QUAT).add(TMP_VEC);
      g.obj.quaternion.copy(TMP_QUAT);
    }, 33);

    // 训练会话持久化（每 3s 保存位姿与用时，刷新后恢复）
    const sessionTimer = window.setInterval(() => {
      const s = simRef.current;
      if (!s || useAppStore.getState().screen !== 'training') return;
      const snap = s.getRenderSnapshot();
      saveSession({
        sceneId: selectedSceneId,
        rovId: selectedRovId,
        pos: [snap.position.x, snap.position.y, snap.position.z],
        quat: [snap.quaternion.x, snap.quaternion.y, snap.quaternion.z, snap.quaternion.w],
        elapsedSec: trainTimeRef.current,
      });
    }, 3000);

    // Xbox 手柄（Gamepad API，30Hz）
    const prevBtns = new Array(16).fill(false);
    let padActiveUntil = 0;
    let backStart = 0;
    let xStart = 0;
    let yStart = 0;
    let navLy = 0;
    let lastNavLR = 0;
    let menuWasOpen = false;
    const padTimer = window.setInterval(() => {
      const pads = (navigator as Navigator).getGamepads?.();
      const pad = pads?.[0];
      if (!pad || !pad.connected) return;
      const ax = (v: number | undefined) => (v === undefined || Math.abs(v) < 0.12 ? 0 : v);
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const menuOpen = useAppStore.getState().settingsOpen;
      const sens = useAppStore.getState().gamepadSensitivity === 'low' ? 0.5 : useAppStore.getState().gamepadSensitivity === 'medium' ? 0.75 : 1;
      // 菜单状态变化时重置摇杆触发沿基线，避免打开瞬间误触发；打开瞬间清空 ROV 输入
      if (menuOpen !== menuWasOpen) {
        navLy = ax(-pad.axes[1]);
        menuWasOpen = menuOpen;
        if (menuOpen) simRef.current?.clearControlInput();
      }

      if (menuOpen) {
        // 菜单导航：主导轴判断（斜推不误触）；上/下 = 触发沿；左/右 = 连发节流
        const nav = settingsNavRef.current;
        const ly = ax(-pad.axes[1]);
        const lx = ax(pad.axes[0]);
        const mainY = Math.abs(ly) >= Math.abs(lx) ? ly : 0;
        const mainX = Math.abs(lx) > Math.abs(ly) ? lx : 0;
        const trigUp = mainY > 0.5 && navLy <= 0.5;
        const trigDown = mainY < -0.5 && navLy >= -0.5;
        navLy = mainY;
        if (trigUp || (b(12) && !prevBtns[12])) nav?.up();
        else if (trigDown || (b(13) && !prevBtns[13])) nav?.down();
        // 左/右：按住持续触发（节流 130ms）
        const wantLeft = mainX < -0.5 || b(14);
        const wantRight = mainX > 0.5 || b(15);
        if ((wantLeft || wantRight) && Date.now() - lastNavLR > 130) {
          lastNavLR = Date.now();
          if (wantLeft) nav?.left();
          else nav?.right();
        }
        // LB / RB 切换 tab
        if (b(4) && !prevBtns[4]) nav?.tabPrev();
        if (b(5) && !prevBtns[5]) nav?.tabNext();
        if (b(0) && !prevBtns[0]) nav?.confirm();
        if (b(1) && !prevBtns[1]) nav?.back();
        if (b(8) && !prevBtns[8]) nav?.back();
        if (b(9) && !prevBtns[9]) useAppStore.getState().setSettingsOpen(false);
        for (let i = 0; i < 16; i++) prevBtns[i] = b(i);
        return;
      }

      const input: ControlInput = {
        // 两模式左摇杆 X = 旋转（yaw）、右摇杆 X = 平移（sway）
        // Y 轴按模式：日本手左=前后/右=升降；美国手对调
        // 灵敏度：low=0.5 / medium=0.75 / high=1.0（缩放摇杆输入）
        surge: ax(useAppStore.getState().gamepadMode === 'us' ? -pad.axes[3] : -pad.axes[1]) * sens,
        sway: ax(pad.axes[2]) * sens,
        heave: ax(useAppStore.getState().gamepadMode === 'us' ? -pad.axes[1] : -pad.axes[3]) * sens,
        yaw: ax(pad.axes[0]) * sens,
        // 十字键：上/下 = 俯仰（上=低头，下=抬头）；左/右 = 横滚（右=左倾，左=右倾）
        pitch: ((b(12) ? 1 : 0) - (b(13) ? 1 : 0)) * sens,
        roll: ((b(14) ? 1 : 0) - (b(15) ? 1 : 0)) * sens,
      };
      // 肩键：LB = 夹爪闭合、RB = 夹爪张开（按住连续开合）
      if (b(4) || b(5)) {
        const next = Math.max(0, Math.min(1, gripperOpenRef.current + (b(5) ? 0.04 : -0.04)));
        if (Math.abs(next - gripperOpenRef.current) > 0.0005) {
          gripperOpenRef.current = next;
          const eng = engineRef.current;
          if (eng) eng.setGripper(next);
          setGripperOpen(next);
        }
      }
      const anyInput =
        Math.abs(pad.axes[1]) > 0.12 || Math.abs(pad.axes[0]) > 0.12 ||
        Math.abs(pad.axes[3]) > 0.12 || Math.abs(pad.axes[2]) > 0.12 ||
        input.pitch !== 0 || input.roll !== 0;
      if (anyInput) padActiveUntil = Date.now() + 1200;
      // 电机锁定状态收到手柄运动输入 → 提示先解锁
      if (anyInput) {
        const sim = simRef.current;
        if (sim && sim.getMotorLocked()) hintUnlock();
      }
      // 手柄活跃期间覆盖键盘输入
      if (Date.now() < padActiveUntil) {
        simRef.current?.setControlInput(input);
      }
      // 按钮事件（下降沿 / 长按判定）
      // A = 空格动作（长按完成打捞/检查）；短按（<400ms）= 解锁/加锁电机
      if (b(0) && !prevBtns[0]) {
        aDownAtRef.current = Date.now();
        actionDownRef.current = true;
      }
      if (!b(0) && prevBtns[0]) {
        actionDownRef.current = false;
        actionHoldRef.current = 0;
        if (Date.now() - aDownAtRef.current < 400) {
          const sim = simRef.current;
          if (sim) sim.setMotorLocked(!sim.getMotorLocked());
        }
      }
      if (b(1) && !prevBtns[1]) {
        // B 补光灯（短按）
        useAppStore.getState().setLightsOn(!useAppStore.getState().rovControls.lightsOn);
      }
      // X：短按 = 视角切换；长按(≥400ms) = 切换 HUD/角落模式
      if (b(2) && !prevBtns[2]) xStart = Date.now();
      if (!b(2) && prevBtns[2]) {
        if (Date.now() - xStart < 400) {
          useAppStore.getState().setViewMode(useAppStore.getState().viewMode === 'chase' ? 'pov' : 'chase');
        } else {
          const cur = useAppStore.getState().hudLayout;
          useAppStore.getState().setHudLayout(cur === 'corner' ? 'hud' : 'corner');
        }
      }
      // Y：短按 = 一键水平；长按(≥400ms) = 切换控制坐标系
      if (b(3) && !prevBtns[3]) yStart = Date.now();
      if (!b(3) && prevBtns[3]) {
        if (Date.now() - yStart < 400) {
          simRef.current?.levelAttitude();
        } else {
          const cur = useAppStore.getState().axisMode;
          useAppStore.getState().setAxisMode(cur === 'body' ? 'world' : 'body');
        }
      }
      if (b(9) && !prevBtns[9]) useAppStore.getState().setSettingsOpen(true); // Start 打开菜单
      // Back：短按 = 声纳开关；长按(≥400ms) = 声纳高低频切换
      if (b(8) && !prevBtns[8]) backStart = Date.now();
      if (!b(8) && prevBtns[8]) {
        if (Date.now() - backStart < 400) {
          useAppStore.getState().setSonarVisible(!useAppStore.getState().sonarVisible);
        } else {
          const cur = useAppStore.getState().sonarFreq;
          useAppStore.getState().setSonarFreq(cur === 'high' ? 'low' : 'high');
        }
      }
      for (let i = 0; i < 16; i++) prevBtns[i] = b(i);
    }, 33);

    return () => {
      window.clearInterval(hudTimer);
      window.clearInterval(grabTimer);
      window.clearInterval(padTimer);
      window.clearInterval(sessionTimer);
      useAppStore.getState().setSonarVisible(false); // 每次进入场景默认关闭声纳
      engine.dispose();
      sim.dispose();
      simRef.current = null;
      engineRef.current = null;
      distSonarRef.current = null;
      setHud(null);
      setTaskState(null);
      if (unlockMsgTimerRef.current) window.clearTimeout(unlockMsgTimerRef.current);
    };
  }, [selectedRovId, selectedSceneId, setHud, setTaskState, setTaskResult, addRecord]);

  // 键盘控制
  useEffect(() => {
    const pressed = new Set<string>();

    const recomputeInput = () => {
      const sim = simRef.current;
      if (!sim) return;
      if (useAppStore.getState().paused) {
        sim.clearControlInput();
        return;
      }
      const input: ControlInput = { ...EMPTY_INPUT };
      for (const [code, { axis, dir }] of Object.entries(KEYMAP)) {
        if (pressed.has(code)) input[axis] += dir;
      }
      (Object.keys(input) as (keyof ControlInput)[]).forEach((k) => {
        input[k] = Math.max(-1, Math.min(1, input[k]));
      });
      // 电机锁定状态收到运动输入 → 提示先解锁
      if (sim.getMotorLocked() && (Math.abs(input.surge) > 0.01 || Math.abs(input.sway) > 0.01 || Math.abs(input.heave) > 0.01 || Math.abs(input.yaw) > 0.01 || Math.abs(input.pitch) > 0.01 || Math.abs(input.roll) > 0.01)) {
        hintUnlock();
      }
      sim.setControlInput(input);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (useAppStore.getState().settingsOpen) return; // 设置菜单打开时键盘仅菜单导航
      const code = e.code;
      if (code === 'Space') {
        e.preventDefault();
        spaceDownAtRef.current = Date.now();
        actionDownRef.current = true;
        return;
      }
      if (code in KEYMAP) {
        e.preventDefault();
        pressed.add(code);
        recomputeInput();
        return;
      }
      switch (code) {
        case 'KeyX':
          tryGrabRef.current();
          break;
        case 'KeyL':
          useAppStore.getState().setLightsOn(!useAppStore.getState().rovControls.lightsOn);
          break;
        case 'KeyB':
          simRef.current?.levelAttitude();
          break;
        case 'KeyG':
          useAppStore.getState().setAxisMode(useAppStore.getState().axisMode === 'body' ? 'world' : 'body');
          break;
        case 'KeyV': {
          const cur = useAppStore.getState().viewMode;
          const next = VIEW_ORDER[(VIEW_ORDER.indexOf(cur as (typeof VIEW_ORDER)[number]) + 1) % VIEW_ORDER.length];
          useAppStore.getState().setViewMode(next);
          break;
        }
        case 'Digit1':
          useAppStore.getState().setViewMode('chase');
          break;
        case 'Digit2':
          useAppStore.getState().setViewMode('pov');
          break;
        case 'KeyI':
          useAppStore.getState().setSonarVisible(!useAppStore.getState().sonarVisible);
          break;
        case 'Escape':
          useAppStore.getState().setPaused(!useAppStore.getState().paused);
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (useAppStore.getState().settingsOpen) return;
      if (e.code === 'Space') {
        actionDownRef.current = false;
        actionHoldRef.current = 0;
        // 短按（<400ms）= 解锁/加锁电机；长按 = 动作（打捞/检查）
        if (Date.now() - spaceDownAtRef.current < 400) {
          const sim = simRef.current;
          if (sim) sim.setMotorLocked(!sim.getMotorLocked());
        }
        return;
      }
      if (e.code in KEYMAP) {
        pressed.delete(e.code);
        recomputeInput();
      }
    };

    const onBlur = () => {
      pressed.clear();
      actionDownRef.current = false;
      actionHoldRef.current = 0;
      recomputeInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // 环境参数 → 仿真核心
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.environment.apply(envParams);
    setEnvDirty(true);
    const t = window.setTimeout(() => setEnvDirty(false), 1200);
    return () => window.clearTimeout(t);
  }, [envParams]);

  // ROV 控制
  useEffect(() => {
    simRef.current?.setLightsOn(rovControls.lightsOn);
  }, [rovControls.lightsOn]);

  useEffect(() => {
    simRef.current?.setMaxSpeedKnots(rovControls.maxSpeedKnots);
  }, [rovControls.maxSpeedKnots]);

  // 视角 / 坐标系 → 引擎
  useEffect(() => {
    engineRef.current?.setViewMode(viewMode);
  }, [viewMode]);

  // 动力曲线 / 输出百分比 → 仿真核心
  useEffect(() => {
    const sim = simRef.current;
    sim?.setPowerCurve(powerCurve);
    sim?.setPowerLevel(powerLevel);
  }, [powerCurve, powerLevel]);

  // DVL → 仿真核心
  useEffect(() => {
    simRef.current?.setDvl(dvlEnabled);
  }, [dvlEnabled]);

  // 图形质量 → 引擎（训练中也可切换）
  useEffect(() => {
    engineRef.current?.setQuality(graphicsQuality);
  }, [graphicsQuality]);

  useEffect(() => {
    simRef.current?.setAxisMode(axisMode);
  }, [axisMode]);

  // 暂停时清除输入
  useEffect(() => {
    if (paused) simRef.current?.clearControlInput();
  }, [paused]);

  // 机械臂夹取：X 键触发（useRef 保存最新闭包，避免 useEffect 闭包失效）
  const tryGrabRef = useRef<() => void>(() => {});
  const [grabMsg, setGrabMsg] = useState<string | null>(null);
  const grabMsgTimerRef = useRef<number | null>(null);
  const [unlockMsg, setUnlockMsg] = useState(false);
  const unlockMsgTimerRef = useRef<number | null>(null);
  const spaceDownAtRef = useRef(0);
  const aDownAtRef = useRef(0);
  /** 电机锁定提示（锁定状态收到运动输入） */
  const hintUnlock = useCallback(() => {
    if (useAppStore.getState().paused) return;
    setUnlockMsg(true);
    if (unlockMsgTimerRef.current) window.clearTimeout(unlockMsgTimerRef.current);
    unlockMsgTimerRef.current = window.setTimeout(() => setUnlockMsg(false), 2500);
  }, []);
  tryGrabRef.current = () => {
    const sim = simRef.current;
    const engine = engineRef.current;
    if (!sim || !engine) return;
    if (grabbedRef.current) {
      // 释放：夹爪回到当前设定开合
      grabbedRef.current = null;
      engine.setGripper(gripperOpenRef.current);
      setGrabbedName(null);
      setGrabMsg(null);
      return;
    }
    const snap = sim.getRenderSnapshot();
    TMP_QUAT.set(snap.quaternion.x, snap.quaternion.y, snap.quaternion.z, snap.quaternion.w);
    const tip = new THREE.Vector3(0, -0.3, -0.95).applyQuaternion(TMP_QUAT).add(
      TMP_VEC.set(snap.position.x, snap.position.y, snap.position.z),
    );
    const tmp = new THREE.Vector3();
    let best: { obj: THREE.Object3D; dist: number; gripSize: number } | null = null;
    engine.scene.traverse((o) => {
      const u = o.userData as { grabbable?: boolean; gripSize?: number };
      if (!u.grabbable) return;
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(tmp);
      const d = tmp.distanceTo(tip);
      if (d < 0.9 && (!best || d < best.dist)) best = { obj: o, dist: d, gripSize: u.gripSize ?? 0.2 };
    });
    if (best !== null) {
      const b = best as { obj: THREE.Object3D; dist: number; gripSize: number };
      // 夹爪当前开口能否包住目标：开口 ≈ maxGap × open（0.45m 最大开口）
      const gap = 0.45 * gripperOpenRef.current;
      if (b.gripSize > gap) {
        setGrabMsg(t('grab_gap', { name: b.obj.name || t('val_item'), need: b.gripSize.toFixed(1), gap: gap.toFixed(2) }));
        if (grabMsgTimerRef.current) window.clearTimeout(grabMsgTimerRef.current);
        grabMsgTimerRef.current = window.setTimeout(() => setGrabMsg(null), 4000);
        return;
      }
      grabbedRef.current = { obj: b.obj, offsetBody: new THREE.Vector3(0, -0.3, -0.95) };
      gripperOpenRef.current = 0; // 夹爪闭合
      setGripperOpen(0);
      engine.setGripper(0);
      setGrabbedName(b.obj.name || '道具');
      setGrabMsg(null);
    } else {
      setGrabMsg(t('grab_too_far'));
      if (grabMsgTimerRef.current) window.clearTimeout(grabMsgTimerRef.current);
      grabMsgTimerRef.current = window.setTimeout(() => setGrabMsg(null), 3000);
    }
  };

  const handleLevel = useCallback(() => {
    simRef.current?.levelAttitude();
  }, []);

  const handleRestart = useCallback(() => {
    const engine = engineRef.current;
    if (engine) engine.loadScene(selectedSceneId);
    distSonarRef.current?.refreshTargets(); // 场景切换后刷新 DME 采样目标
    const task = TASKS[selectedSceneId];
    taskRunnerRef.current.abort();
    if (task) taskRunnerRef.current.start(localizeTask(task, useAppStore.getState().language));
    actionHoldRef.current = 0;
    trainTimeRef.current = 0;
    notifiedRef.current = false;
    maxDepthRef.current = 0;
    speedSumRef.current = 0;
    speedCountRef.current = 0;
    setTaskState(taskRunnerRef.current.getView());
    setTaskResult(null);
    setPaused(false);
    // 清理夹取状态（场景重载后旧道具已销毁）
    grabbedRef.current = null;
    setGrabbedName(null);
    setGrabMsg(null);
  }, [selectedSceneId, setTaskState, setTaskResult, setPaused]);

  const sceneName = t('scene_' + selectedSceneId + '_name' as DictKey);

  return (
    <div style={styles.root}>
      <div ref={mountRef} style={styles.canvas} />

      <div style={styles.topBar}>
        <button onClick={gotoMenu} style={styles.btn}>{t('training_menu')}</button>
        <span style={styles.sceneName}>{sceneName}</span>
        <span style={styles.rovName}>{simRef.current?.rovConfig.name ?? ''}</span>
        <span style={{ flex: 1 }} />
        {envDirty && <span style={styles.envDirty}>{t('env_dirty')}</span>}
        {/* 参数信息展示（仅展示，不可调） */}
        <span style={styles.infoChip}>{t('set_hud_layout')}: {t(hudLayout === 'corner' ? 'val_corner' : 'val_hud')}</span>
        <span style={styles.infoChip}>{units === 'imperial' ? 'ft / ℉' : 'm / ℃'}</span>
        <button
          onClick={() => setHelpOpen(!helpOpen)}
          style={{ ...styles.btn, ...(helpOpen ? styles.btnActive : {}) }}
          title={t('help_title')}
        >
          {t('help_title')}
        </button>
        <button onClick={() => setSettingsOpen(true)} style={styles.btn}>{t('training_settings')}</button>
      </div>

      {/* 任务面板 */}
      {taskState && taskState.phase === 'active' && <TaskPanel state={taskState} />}

      <div style={styles.statusBar}>
        <HudStatusBar />
        <span style={{ color: dvlEnabled ? '#4fc3f7' : '#6f9db5', fontWeight: dvlEnabled ? 700 : 400 }}>
          DVL {dvlEnabled ? t('val_on') : t('val_off')}
        </span>
        <span style={{ color: grabbedName ? '#ffd54f' : '#6f9db5' }}>
          {grabbedName
            ? `🤖 ${t('help_grab')}：${grabbedName}`
            : `${t('help_grab')} · ${t('grip_open')} ${Math.round(gripperOpen * 100)}%`}
        </span>
        {grabMsg && <span style={{ color: '#ff8a65' }}>{grabMsg}</span>}
        <span style={styles.infoChip}>{t('set_hud_layout')}: {t(hudLayout === 'corner' ? 'val_corner' : 'val_hud')}</span>
        <span style={styles.infoChip}>{units === 'imperial' ? 'ft / ℉' : 'm / ℃'}</span>
      </div>

      {viewMode === 'pov' && <PovHud layout={hudLayout} />}
      {viewMode === 'pov' && rovControls.lightsOn && <div style={styles.lightPool} />}
      {sonarVisible && <SonarView engineRef={engineRef} />}

      <SettingsMenu
        onLevel={handleLevel}
        envParams={envParams}
        onEnvParam={setEnvParam}
        onResetEnv={resetEnvParams}
      />

      {/* 电机锁定提示 toast（半透明弹窗，居中） */}
      {unlockMsg && (
        <div style={styles.toastOverlay}>
          <div style={styles.toastBox}>{t('hint_unlock_first')}</div>
        </div>
      )}

      {helpOpen && <HelpPanel t={t} onClose={() => setHelpOpen(false)} />}

      {paused && !taskResult && (
        <div style={styles.pauseOverlay}>
          <div style={styles.pauseBox}>
            <div style={styles.pauseTitle}>{t('training_paused')}</div>
            <button onClick={() => setPaused(false)} style={styles.btn}>{t('training_resume')}</button>
            <button onClick={gotoMenu} style={styles.btn}>{t('training_menu')}</button>
          </div>
        </div>
      )}

      {taskResult && (
        <div style={styles.pauseOverlay}>
          <div style={styles.pauseBox}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>
              {taskResult === 'completed' ? '🎉' : '⏱️'}
            </div>
            <div style={styles.pauseTitle}>
              {taskResult === 'completed' ? t('training_completed') : t('training_failed')}
            </div>
            <div style={{ color: '#9cc5d9', fontSize: 14, marginBottom: 12 }}>
              {t('training_elapsed', { s: useAppStore.getState().taskDurationSec.toFixed(1) })}
              {taskResult === 'completed' && t('training_recorded')}
            </div>
            <button onClick={handleRestart} style={styles.btn}>{t('training_restart')}</button>
            <button onClick={gotoMenu} style={styles.btn}>{t('training_menu')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 底部状态栏参数（独立订阅 hud，避免每 100ms 全树重渲染） */
function HudStatusBar() {
  const hud = useAppStore((s) => s.hud);
  const units = useAppStore((s) => s.units);
  const language = useAppStore((s) => s.language);
  const um = UNIT_MARKS[units];
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);
  return (
    <>
      {/* 电机锁定状态（锁定 = 加粗重点，位于速度前） */}
      {hud && (
        <span style={hud.motorLocked ? { color: '#ff7043', fontWeight: 800, letterSpacing: 1 } : { color: '#4fc3f7', fontWeight: 400 }}>
          {t(hud.motorLocked ? 'motor_locked' : 'motor_unlocked')}
        </span>
      )}
      <span>{t('hud_depth')} {hud ? fmtDepth(hud.depthMeters, units) : '—'} {um.depth}</span>
      <span>{t('hud_speed')} {hud ? hud.speedKnots.toFixed(2) : '—'} kn</span>
      <span>{t('hud_heading')} {hud ? Math.round(hud.headingDeg) : '—'}°</span>
      <span>{t('hud_pitch')} {hud ? hud.pitchDeg.toFixed(1) : '—'}°</span>
      <span>{t('hud_roll')} {hud ? hud.rollDeg.toFixed(1) : '—'}°</span>
      <span>{t('hud_temp')} {hud ? fmtTemp(hud.temperatureC, units) : '—'} {um.temp}</span>
    </>
  );
}

/** 操作帮助面板（顶栏帮助按钮展开，右侧区域） */
/** 操作帮助：键盘 / 手柄 双 tab */
function HelpPanel({ t, onClose }: { t: (k: DictKey, vars?: Record<string, string | number>) => string; onClose: () => void }) {
  const [tab, setTab] = useState<'keys' | 'pad'>('keys');
  const keyRows: [string, string][] = [
    ['W / S', t('help_fwd')],
    ['A / D', t('help_left')],
    ['E / Q', t('help_up')],
    ['←→ / R / F', t('help_rot')],
    ['V / 1·2', t('help_view')],
    ['X', t('help_grab')],
    ['G', t('help_coord')],
    ['B', t('help_level')],
    ['L', t('set_lights')],
    ['I', t('help_sonar')],
    ['Space', t('help_motor')],
    ['Esc', t('help_pause')],
  ];
  const padRows: [string, string][] = [
    ['L-Stick', t('help_pad_lstick')],
    ['R-Stick', t('help_pad_rstick')],
    ['D-Pad', t('help_pad_dpad')],
    ['LB / RB', t('help_pad_bumpers')],
    ['A', t('help_pad_a')],
    ['B', t('help_pad_b')],
    ['X', t('help_pad_x')],
    ['Y', t('help_pad_y')],
    ['Start', t('help_pad_start')],
    ['Back', t('help_pad_back')],
  ];
  const rows = tab === 'keys' ? keyRows : padRows;
  const tabBtn = (id: 'keys' | 'pad', label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        ...styles.btn,
        ...(tab === id ? { background: 'rgba(79, 195, 247, 0.25)', borderColor: '#4fc3f7' } : {}),
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={styles.helpPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#a9d3e8', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('help_title')}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9cc5d9', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {tabBtn('keys', '⌨ ' + t('help_tab_keys'))}
        {tabBtn('pad', '🎮 ' + t('help_tab_pad'))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(([k, d]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
            <span style={{ color: '#4fc3f7', fontFamily: 'Consolas, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{k}</span>
            <span style={{ color: '#9cc5d9', textAlign: 'right' }}>{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskPanel({ state }: { state: TaskStateView }) {
  const language = useAppStore((s) => s.language);
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);
  return (
    <div style={styles.taskPanel}>
      <div style={styles.taskTitle}>{state.name}</div>
      <div style={{ fontSize: 12, color: '#7fb3c9', marginBottom: 8 }}>
        {t('task_used')} {state.elapsedSec.toFixed(0)}s{state.timeoutSeconds > 0 && ` / ${state.timeoutSeconds}s`}
      </div>
      {state.completedSteps.map((s) => (
        <div key={s.id} style={{ fontSize: 12, color: '#4caf50' }}>✓ {s.title}</div>
      ))}
      <div style={{ fontSize: 13, color: '#ffd54f', fontWeight: 600, marginTop: 4 }}>
        ▶ {state.stepTitle}
      </div>
      <div style={{ fontSize: 12, color: '#9cc5d9' }}>{state.stepDescription}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: 'relative', width: '100%', height: '100%', background: '#04121a' },
  canvas: { position: 'absolute', inset: 0 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', gap: 22,
    padding: '10px 16px', background: 'rgba(4, 18, 26, 0.55)',
    color: '#d7eef8', zIndex: 10,
  },
  sceneName: { fontWeight: 600, fontSize: 16 },
  rovName: { fontSize: 13, color: '#9cc5d9' },
  envDirty: { fontSize: 12, color: '#ffe082' },
  infoChip: {
    fontSize: 12, color: '#9cc5d9',
    whiteSpace: 'nowrap',
  },
  toastOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 300,
  },
  toastBox: {
    marginTop: '16vh',
    background: 'rgba(10, 25, 34, 0.78)',
    border: '1px solid rgba(255, 112, 67, 0.5)',
    color: '#ffab91',
    fontWeight: 700,
    fontSize: 15,
    padding: '12px 22px',
    borderRadius: 10,
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
    letterSpacing: 1,
  },
  helpPanelStyle: {
    position: 'absolute', top: 56, right: 12, zIndex: 15, width: 330,
    background: 'rgba(4, 18, 26, 0.9)', border: '1px solid #1a4a63',
    borderRadius: 10, padding: 14, color: '#d7eef8',
  },
  btnActive: { background: 'rgba(79,195,247,.45)', borderColor: '#4fc3f7' },
  btn: {
    background: 'rgba(79,195,247,.15)', color: '#d7eef8',
    border: '1px solid #2a6d8f', borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
  },
  statusBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    display: 'flex', gap: 20, padding: '8px 16px',
    background: 'rgba(4, 18, 26, 0.55)', color: '#d7eef8', fontSize: 13,
    fontFamily: 'Consolas, Menlo, monospace', zIndex: 10,
  },
  panel: { position: 'absolute', top: 56, right: 12, zIndex: 10, width: 300 },
  panelToggle: {
    float: 'right', background: 'rgba(79,195,247,.15)', color: '#d7eef8',
    border: '1px solid #2a6d8f', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
  },
  panelBody: {
    marginTop: 34, background: 'rgba(4, 18, 26, 0.82)', border: '1px solid #1a4a63',
    borderRadius: 10, padding: 14, color: '#d7eef8',
  },
  tabBar: { display: 'flex', gap: 6, marginBottom: 10 },
  segBtn: {
    flex: 1, background: 'rgba(79,195,247,.1)', color: '#b7d9ea',
    border: '1px solid #1f5878', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', fontSize: 12,
  },
  segActive: { background: 'rgba(79,195,247,.4)', color: '#eafaff', borderColor: '#4fc3f7' },
  panelSection: { marginBottom: 14 },
  panelTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#a9d3e8' },
  field: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 },
  fieldLabel: { flex: '0 0 96px', color: '#9cc5d9' },
  slider: { flex: 1, accentColor: '#4fc3f7' },
  fieldValue: { flex: '0 0 44px', textAlign: 'right', fontFamily: 'Consolas, monospace', color: '#d7eef8' },
  smallBtn: {
    marginTop: 4, background: 'rgba(79,195,247,.12)', color: '#d7eef8',
    border: '1px solid #2a6d8f', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12,
  },
  miniBtn: {
    marginLeft: 8, background: 'transparent', color: '#9cc5d9',
    border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
  },
  helpGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  helpRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12 },
  helpKey: { color: '#4fc3f7', fontFamily: 'Consolas, monospace', fontWeight: 600 },
  helpDesc: { color: '#9cc5d9' },
  lightPool: {
    position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none',
    background:
      'radial-gradient(ellipse 55% 42% at 50% 38%, rgba(255, 248, 220, 0.32) 0%, rgba(255, 248, 220, 0.12) 38%, transparent 68%)',
  },
  taskPanel: {
    position: 'absolute', top: 60, left: 16, zIndex: 15,
    background: 'rgba(3, 22, 34, 0.72)', border: '1px solid #2a6d8f', borderRadius: 10,
    padding: '12px 16px', minWidth: 260, maxWidth: 340,
  },
  taskTitle: { fontSize: 15, fontWeight: 700, color: '#4fc3f7', marginBottom: 4 },
  pauseOverlay: {
    position: 'absolute', inset: 0, zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(2, 10, 16, 0.75)',
  },
  pauseBox: {
    display: 'flex', flexDirection: 'column', gap: 12,
    background: 'rgba(10, 40, 60, 0.95)', border: '1px solid #1a4a63',
    borderRadius: 12, padding: 32, minWidth: 280, textAlign: 'center',
  },
  pauseTitle: { fontSize: 22, fontWeight: 700, color: '#d7eef8', marginBottom: 8 },
};
