/**
 * 任务系统类型（docs/06-机型场景与任务.md §4）。
 */

import type { ROVSnapshot } from '../rov/ROVState';
import type { EnvironmentParams } from '../environment/EnvironmentState';

export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface TaskTargetInfo {
  position: { x: number; y: number; z: number };
  radius: number;
}

export interface TaskContext {
  rov: ROVSnapshot;
  env: Readonly<EnvironmentParams>;
  /** 场景内目标物 */
  targets: Map<string, TaskTargetInfo>;
  /** 任务动作键（空格）按住时长（秒） */
  actionHoldSec: number;
  /** 当前累计时间（秒） */
  time: number;
}

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  check(ctx: TaskContext): boolean;
  optional?: boolean;
}

export interface TaskDefinition {
  id: string;
  sceneId: string;
  name: string;
  brief: string;
  steps: TaskStep[];
  /** 限时（秒，0=不限） */
  timeoutSeconds?: number;
  onComplete?(ctx: TaskContext): void;
  onFail?(ctx: TaskContext): void;
}

/** 距离目标距离（米） */
export function distToTarget(ctx: TaskContext, targetId: string): number {
  const t = ctx.targets.get(targetId);
  if (!t) return Infinity;
  const r = ctx.rov.position;
  const dx = r.x - t.position.x;
  const dy = r.y - t.position.y;
  const dz = r.z - t.position.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
