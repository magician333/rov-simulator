/**
 * TaskRunner：任务状态机（docs/06-机型场景与任务.md §4.3）。
 * Phase: Idle → Active → Complete / Failed
 * 步骤顺序推进，全部完成 → Complete；超时 → Failed。
 * 时间由外部通过 TaskContext.time（训练累计秒）驱动。
 */

import type { TaskContext, TaskDefinition } from './TaskDefinition';

export type RunnerPhase = 'idle' | 'active' | 'completed' | 'failed';

export interface TaskStateView {
  phase: RunnerPhase;
  taskId: string;
  name: string;
  brief: string;
  stepIndex: number;
  stepTitle: string;
  stepDescription: string;
  completedSteps: { id: string; title: string }[];
  elapsedSec: number;
  timeoutSeconds: number;
}

export class TaskRunner {
  private phase: RunnerPhase = 'idle';
  private def: TaskDefinition | null = null;
  private stepIndex = 0;
  private lastElapsedSec = 0;

  get currentPhase(): RunnerPhase {
    return this.phase;
  }

  get currentTaskId(): string | null {
    return this.def?.id ?? null;
  }

  /** 启动任务（返回 false 表示已在运行） */
  start(def: TaskDefinition): boolean {
    if (this.phase === 'active') return false;
    this.def = def;
    this.phase = 'active';
    this.stepIndex = 0;
    this.lastElapsedSec = 0;
    return true;
  }

  /** 每帧更新 */
  update(ctx: TaskContext): void {
    this.lastElapsedSec = ctx.time;
    if (this.phase !== 'active' || !this.def) return;

    if (this.def.timeoutSeconds && ctx.time > this.def.timeoutSeconds) {
      this.fail(ctx);
      return;
    }

    const step = this.def.steps[this.stepIndex];
    if (!step) {
      this.complete(ctx);
      return;
    }
    if (step.check(ctx)) {
      this.stepIndex++;
      if (this.stepIndex >= this.def.steps.length) {
        this.complete(ctx);
      }
    }
  }

  getView(): TaskStateView | null {
    if (!this.def) return null;
    const step = this.def.steps[Math.min(this.stepIndex, this.def.steps.length - 1)];
    return {
      phase: this.phase,
      taskId: this.def.id,
      name: this.def.name,
      brief: this.def.brief,
      stepIndex: this.stepIndex,
      stepTitle: step?.title ?? '',
      stepDescription: step?.description ?? '',
      completedSteps: this.def.steps.slice(0, this.stepIndex).map((s) => ({ id: s.id, title: s.title })),
      elapsedSec: this.lastElapsedSec,
      timeoutSeconds: this.def.timeoutSeconds ?? 0,
    };
  }

  private complete(ctx: TaskContext): void {
    this.phase = 'completed';
    this.def?.onComplete?.(ctx);
  }

  private fail(ctx: TaskContext): void {
    this.phase = 'failed';
    this.def?.onFail?.(ctx);
  }

  /** 强制结束（训练重来/离开） */
  abort(): void {
    this.phase = 'idle';
    this.def = null;
  }
}
