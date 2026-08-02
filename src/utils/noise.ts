/**
 * 轻量 3D Value Noise（无外部依赖）。
 * 用于：海底地形生成、M2 湍流扰动场、水面闪烁。
 * 固定实现，保证可复现（无需全局随机状态）。
 */

function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1440662683;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295; // 0..1
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 3D Value Noise，输出约 [-1, 1] */
export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const u = smooth(xf);
  const v = smooth(yf);
  const w = smooth(zf);

  const n000 = hash3(xi, yi, zi);
  const n100 = hash3(xi + 1, yi, zi);
  const n010 = hash3(xi, yi + 1, zi);
  const n110 = hash3(xi + 1, yi + 1, zi);
  const n001 = hash3(xi, yi, zi + 1);
  const n101 = hash3(xi + 1, yi, zi + 1);
  const n011 = hash3(xi, yi + 1, zi + 1);
  const n111 = hash3(xi + 1, yi + 1, zi + 1);

  const nx00 = n000 + (n100 - n000) * u;
  const nx10 = n010 + (n110 - n010) * u;
  const nx01 = n001 + (n101 - n001) * u;
  const nx11 = n011 + (n111 - n011) * u;

  const nxy0 = nx00 + (nx10 - nx00) * v;
  const nxy1 = nx01 + (nx11 - nx01) * v;

  return (nxy0 + (nxy1 - nxy0) * w) * 2 - 1;
}

/** 分形布朗运动：叠加多倍频，输出约 [-1, 1] */
export function fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
