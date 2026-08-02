/**
 * 物理仿真冒烟测试（M2 调参验证）。
 * 运行：npx esbuild scripts/physics-smoke.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke.mjs && node .tmp/smoke.mjs
 */
import { SimulationEngine } from '../src/core/SimulationEngine';

const FIXED = 1 / 120;
const sim = new SimulationEngine({ rovId: 'rov_6dof_standard', startLightsOn: false });
const env = sim.environment;
env.reset();

function run(seconds: number, label: string, input: () => void, sampleEvery = 60): void {
  let steps = Math.round(seconds / FIXED);
  let maxSpeed = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let headingStart: number | null = null;
  let headingEnd = 0;
  const s0 = sim.getRenderSnapshot();
  headingStart = s0.headingDeg;
  for (let i = 0; i < steps; i++) {
    input();
    sim.step(FIXED);
    if (i % sampleEvery === 0) {
      const s = sim.getRenderSnapshot();
      maxSpeed = Math.max(maxSpeed, s.speedKnots);
      minY = Math.min(minY, s.position.y);
      maxY = Math.max(maxY, s.position.y);
    }
  }
  const s = sim.getRenderSnapshot();
  headingEnd = s.headingDeg;
  console.log(
    `[${label}] speed=${s.speedKnots.toFixed(2)}kn max=${maxSpeed.toFixed(2)}kn ` +
      `y=${s.position.y.toFixed(2)} (min ${minY.toFixed(2)} / max ${maxY.toFixed(2)}) ` +
      `depth=${s.depthMeters.toFixed(2)}m heading ${headingStart?.toFixed(1)}°→${headingEnd.toFixed(1)}° ` +
      `roll=${s.euler.roll.toFixed(1)}° pitch=${s.euler.pitch.toFixed(1)}°`,
  );
}

// 1) 无输入：微正浮力应缓慢上浮，姿态自稳
run(5, '空载漂移', () => { sim.clearControlInput(); });

// 2) 全油门前进（surge=1）→ 期望收敛 ≈ 4.4 kn
sim.reset();
sim.setControlInput({ surge: 1 });
run(30, '全油门前进', () => sim.setControlInput({ surge: 1 }));

// 3) 松开 → 阻尼减速
sim.setControlInput({});
run(8, '松手减速', () => sim.clearControlInput());

// 4) 下潜（heave=-1）
sim.reset();
sim.setControlInput({ heave: -1 });
run(10, '下潜指令', () => sim.setControlInput({ heave: -1 }));

// 5) 右转（yaw=1）→ heading 顺时针增加
sim.reset();
sim.setControlInput({ yaw: 1 });
run(6, '右转指令', () => sim.setControlInput({ yaw: 1 }));

// 6) 抬头（pitch=1）
sim.reset();
sim.setControlInput({ pitch: 1 });
run(4, '抬头指令', () => sim.setControlInput({ pitch: 1 }));

// 7) 一键水平：先横滚扰动，再触发
sim.reset();
sim.setControlInput({ roll: 1 });
run(3, '横滚扰动', () => sim.setControlInput({ roll: 1 }));
sim.clearControlInput();
const before = sim.getRenderSnapshot();
console.log(`  一键水平前 roll=${before.euler.roll.toFixed(1)}° pitch=${before.euler.pitch.toFixed(1)}°`);
sim.levelAttitude();
run(8, '一键水平', () => { sim.clearControlInput(); });
const after = sim.getRenderSnapshot();
console.log(`  一键水平后 roll=${after.euler.roll.toFixed(2)}° pitch=${after.euler.pitch.toFixed(2)}° levelActive=${sim.levelActive}`);

// 8) 航速限制：设置 maxSpeedKnots=1 后全油门应不超过 ~1kn
sim.reset();
sim.setMaxSpeedKnots(1.0);
sim.setControlInput({ surge: 1 });
run(20, '限速1节前进', () => sim.setControlInput({ surge: 1 }));

// 9) 水流：朝南（+Z）流速 1 m/s，ROV 应被水流推动 +Z
sim.reset();
env.apply({ currentSpeed: 1, currentDirectionDeg: 0 }); // 0° = 朝南(+Z)
sim.clearControlInput();
run(15, '水流推动', () => sim.clearControlInput());
const s9 = sim.getRenderSnapshot();
console.log(`  水流后位置 z=${s9.position.z.toFixed(2)}（应明显 > 0）`);

// 10) 湍流对姿态的影响
env.apply({ currentSpeed: 0.5, turbulence: 1 });
run(5, '强湍流扰动', () => sim.clearControlInput());

// 11) 姿态保持（Bug2 修复）：操作后松手，角速度衰减后姿态应保持（不自动回正）
sim.reset();
sim.setControlInput({ roll: 1, pitch: -1 });
run(0.3, '横滚+俯仰操作', () => sim.setControlInput({ roll: 1, pitch: -1 }));
sim.clearControlInput();
run(6, '姿态收敛（角速度衰减）', () => sim.clearControlInput());
const hold1 = sim.getRenderSnapshot();
run(5, '姿态保持观察', () => sim.clearControlInput());
const hold2 = sim.getRenderSnapshot();
console.log(
  `  收敛后 roll ${hold1.euler.roll.toFixed(1)}°→${hold2.euler.roll.toFixed(1)}°，pitch ${hold1.euler.pitch.toFixed(1)}°→${hold2.euler.pitch.toFixed(1)}°（应基本不变）`,
);

// 12) 水面边界（Bug1 修复）：持续上浮不应高于水面（y ≤ 0）
sim.reset();
sim.setControlInput({ heave: 1 });
let maxY = -Infinity;
for (let i = 0; i < Math.round(15 / FIXED); i++) {
  sim.step(FIXED);
  const s = sim.getRenderSnapshot();
  maxY = Math.max(maxY, s.position.y);
}
sim.clearControlInput();
console.log(`  持续上浮 15s 后 y=${sim.getRenderSnapshot().position.y.toFixed(3)}（≤0 即未越过水面），过程中最高 y=${maxY.toFixed(3)}`);

// 13) 坐标轴系统：世界模式下机头转向后，W 仍向世界 -Z 前进
sim.reset();
sim.setAxisMode('world');
sim.setControlInput({ yaw: 1 });
run(3, '世界模式先右转90°', () => sim.setControlInput({ yaw: 1 }));
sim.clearControlInput();
const yawed = sim.getRenderSnapshot();
sim.setControlInput({ surge: 1 });
const z0 = sim.getRenderSnapshot().position.z;
run(4, '世界模式前进', () => sim.setControlInput({ surge: 1 }));
sim.clearControlInput();
const z1 = sim.getRenderSnapshot().position.z;
const x1 = sim.getRenderSnapshot().position.x;
console.log(
  `  右转后 heading=${yawed.headingDeg.toFixed(0)}°，前进后 Δz=${(z1 - z0).toFixed(2)}（应 <0，即向世界 -Z）Δx=${x1.toFixed(2)}（应 ≈0）`,
);

// 14) 机身模式对照：同样右转后前进应沿机头方向（-X 世界方向，heading≈270）
sim.reset();
sim.setAxisMode('body');
sim.setControlInput({ yaw: 1 });
run(3, '机身模式先右转90°', () => sim.setControlInput({ yaw: 1 }));
sim.clearControlInput();
const yawed2 = sim.getRenderSnapshot();
sim.setControlInput({ surge: 1 });
const x0 = sim.getRenderSnapshot().position.x;
run(4, '机身模式前进', () => sim.setControlInput({ surge: 1 }));
sim.clearControlInput();
const x2 = sim.getRenderSnapshot().position.x;
console.log(
  `  右转后 heading=${yawed2.headingDeg.toFixed(0)}°，前进后 Δx=${(x2 - x0).toFixed(2)}（机头朝 heading，位移应沿该方向）`,
);

console.log('SMOKE TEST DONE');
