# GLOSSARY — 词汇表

## ROV / 水下作业术语

| 术语 | 英文 | 说明 |
|------|------|------|
| ROV | Remotely Operated Vehicle | 遥控水下机器人 |
| 六自由度 | 6 Degrees of Freedom (6DOF) | 3 平动（surge/sway/heave）+ 3 转动（roll/pitch/yaw） |
| 纵荡 | Surge | 沿机身前后方向的平动（本项目中模型前向 -Z） |
| 横荡 | Sway | 沿机身左右方向的平动 |
| 垂荡 | Heave | 沿机身上下方向的平动（上浮/下潜） |
| 横滚 | Roll | 绕机身前后轴的转动（右侧下沉为正） |
| 俯仰 | Pitch | 绕机身左右轴的转动（抬头为正） |
| 偏航 | Yaw | 绕竖直轴的转动（航向） |
| 节 | Knot (kn) | 航速单位，1 kn = 0.514444 m/s |
| 浮力 | Buoyancy | 水对物体的上托力；微正浮力 = 浮力略大于重力 |
| 浮心 | Center of Buoyancy (CoB) | 浮力作用点，高于重心时提供静态稳定 |
| 重心 | Center of Gravity (CoG) | 重力作用点 |
| 排水体积 | Displacement | 排开水的体积，决定浮力大小 |
| 推进器 | Thruster | 产生推力的螺旋桨单元 |
| 配置矩阵 | Thruster Configuration Matrix | 推进器推力 → 6DOF 力/力矩的映射矩阵 |
| 前视声纳 | Forward-Looking Sonar (FLS) | 水平扇面扫描声纳，显示回波强度图像 |
| 声纳量程 | Sonar Range | 声纳有效探测距离 |
| 衰减系数 | Attenuation Coefficient | 光/声在水中随距离的衰减参数 |
| 补光灯 | Floodlight / LED Light | ROV 作业照明 |
| 中性浮力 | Neutral Buoyancy | 浮力 ≈ 重力 |
| 附件/锚点 | Anchor | GLTF 模型中的命名空节点，用于挂载灯光/相机/推进器等动态对象 |

## 系统 / 架构术语

| 术语 | 英文 | 说明 |
|------|------|------|
| 仿真核心 | Simulation Core | 纯 TS 物理/控制/任务模块，与渲染解耦 |
| 渲染层 | Render Layer | Three.js 场景构建与绘制 |
| 固定步长 | Fixed Timestep | 物理积分采用恒定 dt（1/120s）保证稳定 |
| 追赶模式 | Accumulator Pattern | 渲染循环中累积时间差、按固定步长多次追赶物理 |
| 姿态指示器 | Attitude Indicator | HUD 中显示机身姿态的迷你模型/人工水平仪 |
| 罗盘 | Compass | 显示航向的仪表 |
| POV | Point of View | 第一视角（驾驶舱视角） |
| 第三视角 | Chase View / Orbit View | 从外部跟随观察 ROV 的视角 |
| 注册表 | Registry | 场景/机型/任务的扩展注册机制 |
| 任务状态机 | Task State Machine | 任务步骤推进与完成/失败判定 |
| ADR | Architecture Decision Record | 架构决策记录 |
| 环境参数 | EnvironmentParams | 水流/光线/温度/能见度等可调参数集合 |

## 换算速查

- `1 kn = 0.514444 m/s`；`4.5 kn ≈ 2.315 m/s`
- 海水密度 `ρ = 1025 kg/m³`
- `g = 9.81 m/s²`
- 深度（米） = `-worldY`（Three.js Y 向上）
