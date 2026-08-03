/**
 * 各场景默认任务定义（docs/06-机型场景与任务.md §4.1）。
 * 步骤模式：导航 → 靠近 → 动作（按住空格）。
 */

import type { TaskDefinition } from './TaskDefinition';
import { distToTarget } from './TaskDefinition';

export const TASKS: Record<string, TaskDefinition> = {
  // 水下打捞
  salvage: {
    id: 'salvage_default',
    sceneId: 'salvage',
    name: '水下打捞作业',
    brief: '在沉船残骸附近发现目标集装箱并完成打捞（模拟）。目标位置已由声纳标记。',
    steps: [
      {
        id: 'navigate',
        title: '导航至目标',
        description: '驾驶 ROV 前往沉船残骸区域（目标 12m 内）',
        check: (ctx) => distToTarget(ctx, 'target_crate') < 12,
      },
      {
        id: 'approach',
        title: '接近目标',
        description: '靠近集装箱至 2.5m 内，减速至 1.5 节以下',
        check: (ctx) => distToTarget(ctx, 'target_crate') < 2.5 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'salvage',
        title: '执行打捞',
        description: '对准目标，按住空格键 3 秒（模拟机械臂动作）',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 大坝检测
  dam: {
    id: 'dam_default',
    sceneId: 'dam',
    name: '大坝坝面检测',
    brief: '坝前水流较急，保持稳定接近坝面裂缝标记区，近距离检查裂缝。',
    steps: [
      {
        id: 'navigate',
        title: '导航至坝面',
        description: '前往坝面裂缝标记区（目标 15m 内）',
        check: (ctx) => distToTarget(ctx, 'target_crack') < 15,
      },
      {
        id: 'approach',
        title: '贴近坝面',
        description: '靠近裂缝区至 3m 内，减速至 1.5 节以下（注意水流）',
        check: (ctx) => distToTarget(ctx, 'target_crack') < 3 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查裂缝',
        description: '对准裂缝标记，按住空格 3 秒完成检查',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 船舶检测
  ship: {
    id: 'ship_default',
    sceneId: 'ship',
    name: '船体与螺旋桨检测',
    brief: '沿船体检查，重点检查螺旋桨区域，确认附着物情况。',
    steps: [
      {
        id: 'navigate',
        title: '导航至船尾',
        description: '前往船尾螺旋桨区域（目标 15m 内）',
        check: (ctx) => distToTarget(ctx, 'target_propeller') < 15,
      },
      {
        id: 'check_port',
        title: '检查左舷检查点',
        description: '接近左舷检查点（5m 内）',
        check: (ctx) => distToTarget(ctx, 'check_port') < 5,
      },
      {
        id: 'check_starboard',
        title: '检查右舷检查点',
        description: '接近右舷检查点（5m 内）',
        check: (ctx) => distToTarget(ctx, 'check_starboard') < 5,
      },
      {
        id: 'approach',
        title: '接近螺旋桨',
        description: '靠近螺旋桨至 3m 内',
        check: (ctx) => distToTarget(ctx, 'target_propeller') < 3 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查螺旋桨',
        description: '对准螺旋桨，按住空格 3 秒完成检测',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 桥梁检测
  bridge: {
    id: 'bridge_default',
    sceneId: 'bridge',
    name: '桥墩冲刷检测',
    brief: '桥墩周围水流复杂，接近桥墩底部冲刷区，检查淘空情况。',
    steps: [
      {
        id: 'navigate',
        title: '导航至桥墩',
        description: '前往桥墩冲刷区（目标 15m 内），注意局部急流',
        check: (ctx) => distToTarget(ctx, 'target_scour') < 15,
      },
      {
        id: 'approach',
        title: '贴近冲刷区',
        description: '靠近桥墩底部至 3m 内，减速至 1.5 节以下',
        check: (ctx) => distToTarget(ctx, 'target_scour') < 3 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查冲刷',
        description: '对准冲刷区标记，按住空格 3 秒完成检测',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 离岸油气平台
  oilrig: {
    id: 'oilrig_default',
    sceneId: 'oilrig',
    name: '油气平台检查',
    brief: '下潜至四腿平台水下部分，检查管汇节点与平台腿。',
    steps: [
      {
        id: 'navigate',
        title: '导航至平台',
        description: '驾驶 ROV 前往平台水下区域（目标 15m 内）',
        check: (ctx) => distToTarget(ctx, 'target_manifold') < 15,
      },
      {
        id: 'approach',
        title: '贴近管汇',
        description: '靠近管汇架至 3m 内，减速至 1.5 节以下',
        check: (ctx) => distToTarget(ctx, 'target_manifold') < 3 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查管汇',
        description: '对准管汇节点，按住空格 3 秒完成检测',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 管道外巡检
  pipeline_ext: {
    id: 'pipeline_ext_default',
    sceneId: 'pipeline_ext',
    name: '管道外巡检',
    brief: '沿海底管道检查，重点检查目标法兰连接处。',
    steps: [
      {
        id: 'navigate',
        title: '导航至管道',
        description: '前往管道法兰区域（目标 15m 内）',
        check: (ctx) => distToTarget(ctx, 'target_flange') < 15,
      },
      {
        id: 'approach',
        title: '贴近法兰',
        description: '靠近法兰至 2.5m 内，减速至 1.5 节以下',
        check: (ctx) => distToTarget(ctx, 'target_flange') < 2.5 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查法兰',
        description: '对准法兰，按住空格 3 秒完成检测',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 管道内巡检
  pipeline_int: {
    id: 'pipeline_int_default',
    sceneId: 'pipeline_int',
    name: '管道内巡检',
    brief: '进入大口径管道内部，检查内壁焊缝区域。',
    steps: [
      {
        id: 'navigate',
        title: '导航至管道入口',
        description: '前往管道入口（目标 12m 内），准备进入',
        check: (ctx) => distToTarget(ctx, 'target_weld') < 12,
      },
      {
        id: 'enter',
        title: '进入管道',
        description: '进入管道内部并靠近焊缝（目标 3m 内）',
        check: (ctx) => distToTarget(ctx, 'target_weld') < 3 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查焊缝',
        description: '对准焊缝，按住空格 3 秒完成检测',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },

  // 网箱检测
  aquaculture: {
    id: 'aquaculture_default',
    sceneId: 'aquaculture',
    name: '网箱检测',
    brief: '下潜至养殖网箱，检查网衣破损区域。',
    steps: [
      {
        id: 'navigate',
        title: '导航至网箱',
        description: '前往网箱区域（目标 15m 内）',
        check: (ctx) => distToTarget(ctx, 'target_net_break') < 15,
      },
      {
        id: 'approach',
        title: '贴近网衣',
        description: '靠近破损网衣至 2.5m 内，减速至 1.5 节以下',
        check: (ctx) => distToTarget(ctx, 'target_net_break') < 2.5 && ctx.rov.speedKnots < 1.5,
      },
      {
        id: 'inspect',
        title: '检查破损',
        description: '对准破损区域，按住空格 3 秒完成检测',
        check: (ctx) => ctx.actionHoldSec > 3,
      },
    ],
  },
};
