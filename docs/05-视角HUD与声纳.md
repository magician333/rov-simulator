# 05 — 视角、HUD 与声纳

## 1. 三种视角（需求 R3）

### 1.1 视角状态

```ts
export type ViewMode = 'chase' | 'pov' | 'sonar';
```

- 快捷键 `V` 循环切换；`1`/`2`/`3` 直接切换；UI 按钮亦可。
- 切换在 `CameraRig` 中瞬时完成（不淡入淡出，第一版）。

### 1.2 第三视角 Chase（Blender 风格，需求 R3）

- 相机围绕 ROV 在**球面轨道**上运动（Orbit）：
  - 目标点：ROV 位置（可偏移到重心上方少许）。
  - 球坐标参数：`radius`（默认 6m）、`azimuth`（方位角）、`polar`（仰角）。
- **鼠标中键拖动**：修改 `azimuth`/`polar`（中键拖 = 旋转视角，Blender 的 MMB 习惯）。
- **滚轮**：缩放 `radius`（clamp 2..30m）。
- **Shift+中键拖动**：平移轨道中心（pan，Blender 中键+Shift 语义）；第一版可简化跳过。
- 相机默认从 ROV 后上方（azimuth 使相机在 -Z 后侧、polar 约 60°）观察。
- 相机不跟随机身旋转（Orbit 模式），仅跟随位置——保证学员看到稳定的机体姿态。

实现要点：
```ts
// ChaseCamera
state: { azimuth: number; polar: number; radius: number; center: Vector3 }
onMouseMove(dx, dy, buttons) {
  if (buttons === MIDDLE) { this.azimuth -= dx * 0.01; this.polar -= dy * 0.01; clampPolar(0.05, Math.PI - 0.05); }
}
onWheel(delta) { this.radius = clamp(this.radius * (1 + delta * 0.001), 2, 30); }
update(targetPos) {
  this.center.lerp(targetPos, 0.1);
  camera.position = center + sphericalToCartesian(radius, azimuth, polar);
  camera.lookAt(center);
}
```

### 1.3 第一视角 POV（需求 R3/R5）

- 相机固定在 ROV 头部（`povOffset`，如 `(0, 0.15, -0.4)` 体系——前向 -Z，向前偏出机头一点）。
- 相机朝向与 ROV 完全一致（`camera.quaternion.copy(rov.quaternion)`），无惯性延迟（第一版）。
- 相机近平面 0.05，FOV 约 70°，模拟广角摄像头。
- 若该机型有云台相机（可倾斜），预留 `povTilt` 参数（第一版固定）。

### 1.4 声纳视角 Sonar（需求 R3）

- **覆盖式视图**：在全屏 3D 视图上叠加（或切换为全屏）2D 扇形声纳图像面板；第一版采用**同屏分块**：右侧/下方固定区域显示声纳画布（`<canvas>`），主 3D 视图保持当前视角。
- 声纳数据由 `SonarSimulator` 生成（§3），UI 以 `<canvas>` 绘制（不占 WebGL 资源）。
- 声纳视角激活时，POV HUD 隐藏，显示声纳专用 HUD（航向、深度、声纳增益/量程）。

## 2. POV HUD（需求 R5）

第一视角下 HUD 必须显示 7 项参数。布局建议（左下/右下列）：

| 项 | 来源 | 显示 |
|----|------|------|
| 机身姿态模型 | `hud.attitude`（四元数） | 迷你 3D 姿态指示器（§2.1） |
| 罗盘 | `hud.headingDeg` | 环形罗盘条 + 数字（§2.2） |
| 俯仰角度 | `hud.pitchDeg` | 数字 + 刻度条 |
| 机身速度（节） | `hud.speedKnots` | 数字 + 仪表 |
| 横滚角度 | `hud.rollDeg` | 数字 + 刻度条 |
| 当前深度 | `hud.depthMeters` | 数字（m）+ 深度刻度 |
| 当前温度 | `hud.temperatureC` | 数字（℃） |

### 2.1 迷你姿态模型（AttitudeIndicator）

- 一个**独立的小 WebGL 画布**（`<canvas>`，约 240×240 CSS px），内部运行一个微型 Three.js 场景：ROV 线框/简化模型 + 地平线参考环（人工水平仪）。
- 用 `hud.attitude` 驱动模型旋转；渲染独立循环（30Hz 足够）。
- 画布随 POV 一起显示/隐藏；性能：单对象、无阴影、无雾，开销可忽略。
- 若 WebGL 上下文数受限，可用 SVG/CSS 2D 姿态指示器兜底（`utils/fallback`），第一版主推 WebGL 小画布。

### 2.2 罗盘

- 环形刻度条：0-360°，每 30° 主刻度 + 数字，当前航向高亮在中心。
- 用 CSS transform 旋转环或 SVG 绘制；从 `hud.headingDeg` 更新。

## 3. 声纳系统（多波束扇面 2D 图像声纳）

### 3.1 实现原理

- **多波束扇面采样**：ROV 位置沿水平扇面发射射线（每条波束含水平 0° 与 -6° 俯角子射线），返回多条回波（物体前缘/后缘/内部 + 海底回波段）。
- **性能**：海底用解析 ray-march（高度场，~30 采样/射线），raycast 排除 ROV/海底/粒子 Points；低频 80 波束、高频 160 波束。
- **显示**：点阵化渲染（回波高概率亮点、底噪稀疏点）模拟真实 FLS 散点；距离环/扇面边界/波束数标注。

### 3.2 真实声纳要素

| 要素 | 实现 |
|------|------|
| 扇形视角 | sectorDeg 扇面角（60-180° 可调） |
| 探测距离 | rangeM 量程 + 距离环刻度（可调） |
| 低频/高频 | `FREQ_PRESETS`：低频 = 60m/120°/80 波束/5Hz（远程低分辨率）；高频 = 25m/90°/160 波束/10Hz（近程高分辨率） |
| 颜色方案 | 调色板：红黄（默认热图）/ 蓝绿 / 黑白，一键切换 |
| 全屏/小窗 | 小窗可拖拽；全屏居中大画面（820×620 像素风） |
| 底噪/多径 | 稀疏噪点 + 回波拖尾（多径伪影） |

### 3.3 模块

- `core/sonar/SonarParams.ts`：参数 + 频率预设
- `core/sonar/SonarSimulator.ts`：成像（底噪/回波/拖尾，gamma 压缩）
- `render/sonar/SonarSampler.ts`：扇面采样（多回波 + 海底 ray-march）
- `ui/sonar/SonarView.tsx`：面板（点阵/调色/频率/全屏小窗/拖拽）
- `render/sonar/DistanceSonar.ts` + `sonarUtils.ts`：DME 定距测距（POV HUD）

## 4. UI 布局总览（训练界面）

```
┌────────────────────────────────────────────────┐
│ 顶部栏：场景名 / 任务进度 / 时间 / 暂停按钮      │
├──────────────────────┬─────────────────────────┤
│ 3D 视图（Canvas）     │ 右侧面板（可折叠）        │
│  ├ 声纳画布（声纳模式  │ 环境控制（实时调节）      │
│  │  时叠加）          │ ROV 控制（灯光/航速/水平）│
│  └ POV HUD（POV 模式）│ 任务面板                  │
│                       │ 帮助（按键表）            │
└──────────────────────┴─────────────────────────┘
底部提示条：当前视角 / 快捷键提示
```

- 右侧面板默认折叠，避免遮挡训练视野；环境调节打开时展开。
- 所有数字用等宽字体（monospace），水下 HUD 风格：青色/白色半透明底。
