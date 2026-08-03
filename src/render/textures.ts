/**
 * 程序化纹理工具：CanvasTexture 生成写实材质贴图（缓存复用）。
 * 所有纹理用重复平铺（RepeatWrapping），配合 material.color 作为主色调。
 */

import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function make(name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(name);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(name, tex);
  return tex;
}

/** 混凝土：灰底 + 噪点 + 少量气泡坑 */
export function concreteTexture(): THREE.CanvasTexture {
  return make('concrete', 256, 256, (ctx) => {
    ctx.fillStyle = '#9aa3a8';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.5 ? `rgba(110,118,124,${v * 0.4})` : `rgba(190,196,200,${(1 - v) * 0.4})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5 + Math.random() * 2.5, 1.5 + Math.random() * 2.5);
    }
    // 气泡坑
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(70,76,82,0.55)';
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 生锈金属：底色 + 锈斑 + 划痕 */
export function rustyMetalTexture(): THREE.CanvasTexture {
  return make('rusty', 256, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#6b6b6b');
    g.addColorStop(0.5, '#7a7468');
    g.addColorStop(1, '#6b6b6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // 锈斑
    for (let i = 0; i < 90; i++) {
      const r = Math.random() * 60 + 15;
      const rr = 8 + Math.random() * 34;
      const grad = ctx.createRadialGradient(Math.random() * 256, Math.random() * 256, 1, Math.random() * 256, Math.random() * 256, rr);
      grad.addColorStop(0, `rgba(150,80,30,${0.25 + Math.random() * 0.4})`);
      grad.addColorStop(1, 'rgba(150,80,30,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      void r;
    }
    // 划痕
    ctx.strokeStyle = 'rgba(40,40,45,0.35)';
    for (let i = 0; i < 30; i++) {
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      const y = Math.random() * 256;
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + (Math.random() - 0.5) * 30);
      ctx.stroke();
    }
  });
}

/** 波纹板（集装箱/船板）：纵向波纹 + 噪点 */
export function plateTexture(): THREE.CanvasTexture {
  return make('plate', 256, 256, (ctx) => {
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(0, 0, 256, 256);
    // 波纹
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = x % 16 === 0 ? 'rgba(70,76,82,0.35)' : 'rgba(210,214,220,0.28)';
      ctx.fillRect(x, 0, 8, 256);
    }
    // 噪点
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(120,126,132,0.3)' : 'rgba(210,214,220,0.25)';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  });
}

/** 泥砂（海底）：棕灰噪点 */
export function mudTexture(): THREE.CanvasTexture {
  return make('mud', 256, 256, (ctx) => {
    ctx.fillStyle = '#6b5f4d';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3200; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.5 ? `rgba(90,80,62,${v * 0.5})` : `rgba(130,120,95,${(1 - v) * 0.5})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  });
}

/** 深海金属（管道内壁/耐压壳）：冷灰拉丝 */
export function deepMetalTexture(): THREE.CanvasTexture {
  return make('deepmetal', 256, 256, (ctx) => {
    ctx.fillStyle = '#5c6066';
    ctx.fillRect(0, 0, 256, 256);
    // 拉丝
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(140,146,154,${0.06 + Math.random() * 0.12})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.2;
      ctx.beginPath();
      const x = Math.random() * 256;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 40, 256);
      ctx.stroke();
    }
    // 污渍
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(30,34,40,${0.08 + Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 40, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 纹理类型注册表 */
export type TexKind = 'concrete' | 'rusty' | 'plate' | 'mud' | 'deepmetal';

export function getTexture(kind: TexKind): THREE.CanvasTexture {
  switch (kind) {
    case 'concrete':
      return concreteTexture();
    case 'rusty':
      return rustyMetalTexture();
    case 'plate':
      return plateTexture();
    case 'mud':
      return mudTexture();
    case 'deepmetal':
      return deepMetalTexture();
  }
}
