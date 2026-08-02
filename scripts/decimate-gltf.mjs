/**
 * 离线模型处理脚本：CHASING X GLB 减面（顶点聚类）+ 缩放 + 方向校正（烘焙进 GLB）。
 *
 * 背景（docs/09-模型规范.md）：
 * - 模型 553 万面（主体 540 万）→ 浏览器卡顿，需减面
 * - 尺寸 20.6×34.5×16.2m → 目标 ~1.2m（scale = 1/28.5）
 * - 机头（机械臂/camera）朝模型 -Y → 绕 X +90° 使机头朝 -Z（文档约定前向）
 *
 * 算法：Vertex Clustering（O(n)）——顶点按空间网格聚类取代表，跳过退化三角形。
 *
 * 用法：node scripts/decimate-gltf.mjs
 * 输出：public/models/ROV/chasing_x_rov.glb（首次运行备份原文件为 _raw.glb）
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';

const CURRENT = 'public/models/ROV/chasing_x_rov.glb';
const RAW = 'public/models/ROV/chasing_x_rov_raw.glb';
const OUT = CURRENT;

const CELL = { body: 0.14, part: 0.09, small: 0.045 };
const SCALE = 1 / 28.5;
const ROT_X_90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // 绕 X +90° 四元数

function readGlb(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = buf.subarray(20 + jsonLen + 8);
  return { gltf, bin };
}

function accessorData(gltf, bin, accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const off = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Float32Array(acc.count * compCount);
  const dv = new DataView(bin.buffer, bin.byteOffset + off);
  for (let i = 0; i < acc.count * compCount; i++) out[i] = dv.getFloat32(i * compSize, true);
  return out;
}

function readIndex(gltf, bin, prim, vertexCount) {
  if (prim.indices == null) return Array.from({ length: vertexCount }, (_, i) => i);
  const acc = gltf.accessors[prim.indices];
  const bv = gltf.bufferViews[acc.bufferView];
  const compSize = { 5121: 1, 5123: 2, 5125: 4 }[acc.componentType];
  const off = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, bin.byteOffset + off);
  const arr = new Uint32Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    if (compSize === 2) arr[i] = dv.getUint16(i * 2, true);
    else if (compSize === 4) arr[i] = dv.getUint32(i * 4, true);
    else arr[i] = dv.getUint8(i);
  }
  return arr;
}

/** 顶点聚类减面 */
function clusterSimplify(pos, index, cellSize) {
  const invCell = 1 / cellSize;
  const map = new Map();
  const newPos = [];
  const getIdx = (vi) => {
    const k = `${Math.round(pos[vi * 3] * invCell)},${Math.round(pos[vi * 3 + 1] * invCell)},${Math.round(pos[vi * 3 + 2] * invCell)}`;
    let ni = map.get(k);
    if (ni === undefined) {
      ni = newPos.length / 3;
      newPos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      map.set(k, ni);
    }
    return ni;
  };
  const newIndex = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = getIdx(index[t]);
    const b = getIdx(index[t + 1]);
    const c = getIdx(index[t + 2]);
    if (a === b || b === c || a === c) continue;
    newIndex.push(a, b, c);
  }
  return { position: new Float32Array(newPos), index: new Uint32Array(newIndex) };
}

/** 手动组装 GLB */
function writeGlb(entries, outPath) {
  const binParts = [];
  const accessors = [];
  const bufferViews = [];
  const meshes = [];
  const nodes = [];
  let byteOffset = 0;

  const push = (buf) => {
    while (byteOffset % 4 !== 0) byteOffset++;
    const start = byteOffset;
    binParts.push(buf);
    byteOffset += buf.length;
    return { start, length: buf.length };
  };

  for (const e of entries) {
    const pb = push(Buffer.from(e.position.buffer, e.position.byteOffset, e.position.byteLength));
    bufferViews.push({ buffer: 0, byteOffset: pb.start, byteLength: pb.length });
    const posAcc = accessors.length;
    accessors.push({ bufferView: bufferViews.length - 1, byteOffset: 0, componentType: 5126, count: e.position.length / 3, type: 'VEC3' });
    const ib = push(Buffer.from(e.index.buffer, e.index.byteOffset, e.index.byteLength));
    bufferViews.push({ buffer: 0, byteOffset: ib.start, byteLength: ib.length });
    accessors.push({ bufferView: bufferViews.length - 1, byteOffset: 0, componentType: 5125, count: e.index.length, type: 'SCALAR' });
    meshes.push({ primitives: [{ attributes: { POSITION: posAcc }, indices: posAcc + 1, material: 0 }] });
    nodes.push({ name: e.name, mesh: meshes.length - 1 });
  }

  nodes.push({ name: 'chasing_x_rov', children: nodes.map((_, i) => i), scale: [SCALE, SCALE, SCALE], rotation: ROT_X_90 });

  const gltf = {
    asset: { version: '2.0', generator: 'rov-simulator decimate script' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [nodes.length - 1] }],
    nodes,
    meshes,
    materials: [
      { name: 'default_dark_gray', pbrMetallicRoughness: { baseColorFactor: [0.23, 0.24, 0.26, 1], metallicFactor: 0.4, roughnessFactor: 0.7 } },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const json = Buffer.from(JSON.stringify(gltf));
  const total = 12 + 8 + json.length + 8 + byteOffset;
  const out = Buffer.alloc(total);
  out.write('glTF', 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(json.length, 12);
  out.write('JSON', 16);
  json.copy(out, 20);
  const binStart = 20 + json.length;
  out.writeUInt32LE(byteOffset, binStart);
  out.write('BIN', binStart + 4);
  let o = binStart + 8;
  for (const b of binParts) {
    b.copy(out, o);
    o += b.length;
  }
  writeFileSync(outPath, out);
}

const isBody = (name) => /body|hull|main/i.test(name);
const isPart = (name) => /thruster/i.test(name);
const isSmall = (name) => /claw|pov_cam|light/i.test(name);

function main() {
  if (!existsSync(RAW)) {
    if (!existsSync(CURRENT)) { console.error('源文件不存在:', CURRENT); process.exit(1); }
    copyFileSync(CURRENT, RAW);
    console.log('首次运行：已备份原文件 →', RAW);
  }
  console.log('处理源 →', RAW);

  const { gltf, bin } = readGlb(RAW);
  const meshes = gltf.meshes ?? [];
  const nodes = gltf.nodes ?? [];
  const sceneNodes = gltf.scenes?.[0]?.nodes ?? nodes.map((_, i) => i);

  const used = new Set();
  const entries = [];
  let totalBefore = 0;
  let totalAfter = 0;
  for (const ni of sceneNodes) {
    if (used.has(ni)) continue;
    used.add(ni);
    const n = nodes[ni];
    const name = n.name ?? `node_${ni}`;
    const prim = meshes[n.mesh]?.primitives?.[0];
    if (!prim) continue;
    const pos = accessorData(gltf, bin, prim.attributes.POSITION);
    const index = readIndex(gltf, bin, prim, pos.length / 3);
    const before = index.length / 3;
    const cell = isBody(name) ? CELL.body : isPart(name) ? CELL.part : isSmall(name) ? CELL.small : CELL.part;
    const simplified = clusterSimplify(pos, index, cell);
    entries.push({ name, position: simplified.position, index: simplified.index });
    totalBefore += before;
    totalAfter += simplified.index.length / 3;
    console.log(`  ${name}: ${Math.round(before)} → ${Math.round(simplified.index.length / 3)} tris`);
  }

  console.log(`总面数: ${Math.round(totalBefore)} → ${Math.round(totalAfter)} (${((totalAfter / totalBefore) * 100).toFixed(2)}%)`);
  writeGlb(entries, OUT);
  console.log('已写出 →', OUT);
}

main();
