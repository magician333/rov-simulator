/**
 * VisibilityBlur：低能见度/高浊度时**距离相关**的视觉效果（模拟真实水体）。
 * - 近处（< 能见度距离）保持清晰
 * - 远处逐渐高斯模糊 + 叠加浑浊纯色遮罩
 * 通过渲染目标深度纹理计算每个像素到相机的距离，模糊/遮罩强度随距离衰减。
 * blur=0 时跳过（直接渲染，零开销）。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** 距离感知模糊+遮罩 shader（单 pass） */
const VisibilityShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uBlur: { value: 0 },      // 全局模糊强度 0..1（能见度/浊度驱动）
    uOverlay: { value: 0 },   // 全局遮罩透明度 0..1
    uColor: { value: new THREE.Color(0x16261c) },
    uVisM: { value: 5 },      // 能见度（米）：该距离内保持清晰
    uNear: { value: 0.1 },
    uFar: { value: 300 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uBlur;
    uniform float uOverlay;
    uniform vec3 uColor;
    uniform float uVisM;
    uniform float uNear;
    uniform float uFar;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // 深度缓冲（非线性 0..1）→ 到相机距离（米，正值）
    float linearDist(float d) {
      return (uNear * uFar) / (uFar - d * (uFar - uNear));
    }

    void main() {
      float depth = texture2D(tDepth, vUv).r;
      float dist = linearDist(depth);
      // 清晰度：距离 < 0.4×能见度 → 清晰；> 1.8×能见度 → 完全模糊/遮罩
      float clarity = 1.0 - smoothstep(uVisM * 0.4, uVisM * 1.8, dist);

      float strength = uBlur * (1.0 - clarity);
      vec4 tex;
      if (strength < 0.004) {
        tex = texture2D(tDiffuse, vUv);
      } else {
        float sigma = 1.0 + strength * 12.0; // 模糊像素半径
        float reach = 1.0 + strength * 2.0;
        // 水平 7-tap（偏移按纹素尺寸）
        vec4 sumH = vec4(0.0);
        float wH = 0.0;
        for (int i = -3; i <= 3; i++) {
          float fi = float(i);
          float w = exp(-fi * fi / (2.0 * sigma * sigma));
          sumH += texture2D(tDiffuse, vUv + vec2(fi * uResolution.x * reach, 0.0)) * w;
          wH += w;
        }
        // 垂直 7-tap
        vec4 sumV = vec4(0.0);
        float wV = 0.0;
        for (int i = -3; i <= 3; i++) {
          float fi = float(i);
          float w = exp(-fi * fi / (2.0 * sigma * sigma));
          sumV += texture2D(tDiffuse, vUv + vec2(0.0, fi * uResolution.y * reach)) * w;
          wV += w;
        }
        tex = (sumH / wH + sumV / wV) * 0.5;
      }

      // 遮罩：远处浑浊纯色覆盖（透明度随距离）
      float overlay = uOverlay * (1.0 - clarity);
      gl_FragColor = mix(tex, vec4(uColor, 1.0), clamp(overlay, 0.0, 1.0));
    }
  `,
};

export class VisibilityBlur {
  private composer: EffectComposer | null = null;
  private pass: ShaderPass;
  private blur = 0;
  private depthTex: THREE.DepthTexture | null = null;

  constructor(
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.rendererDomWidth = _renderer.domElement.width || 1;
    this.rendererDomHeight = _renderer.domElement.height || 1;
    this.composer = new EffectComposer(_renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new ShaderPass(VisibilityShader as never);
    this.pass.renderToScreen = true;
    this.pass.uniforms['uNear'].value = camera.near;
    this.pass.uniforms['uFar'].value = camera.far;
    this.composer.addPass(this.pass);
    this.ensureDepthTexture();
  }

  /** 渲染目标挂载深度纹理（供 shader 计算像素距离） */
  private ensureDepthTexture(): void {
    if (!this.composer) return;
    const w = this.composer.renderTarget1.width;
    const h = this.composer.renderTarget1.height;
    if (this.depthTex && this.depthTex.image.width === w && this.depthTex.image.height === h) return;
    if (this.depthTex) this.depthTex.dispose();
    this.depthTex = new THREE.DepthTexture(w, h);
    this.depthTex.type = THREE.UnsignedIntType;
    this.composer.renderTarget1.depthTexture = this.depthTex;
    this.composer.renderTarget2.depthTexture = this.depthTex;
    this.pass.uniforms['tDepth'].value = this.depthTex;
  }

  /** 设置模糊/遮罩强度与能见度距离（米） */
  setBlur(amount: number, overlayOpacity = 0, visM = 5): void {
    this.blur = Math.max(0, Math.min(1, amount));
    this.pass.uniforms['uBlur'].value = this.blur;
    this.pass.uniforms['uOverlay'].value = Math.max(0, Math.min(1, overlayOpacity));
    this.pass.uniforms['uVisM'].value = Math.max(0.2, visM);
    // 纹素尺寸（UV 偏移单位）
    const w = this.rendererDomWidth || 1;
    const h = this.rendererDomHeight || 1;
    (this.pass.uniforms['uResolution'].value as THREE.Vector2).set(1 / w, 1 / h);
  }

  private rendererDomWidth = 1;
  private rendererDomHeight = 1;

  get active(): boolean {
    return this.blur > 0.002;
  }

  render(): void {
    this.ensureDepthTexture();
    this.composer?.render();
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h);
    this.rendererDomWidth = w;
    this.rendererDomHeight = h;
    // 尺寸变化后重建（先释放旧深度纹理）
    this.depthTex?.dispose();
    this.depthTex = null;
    this.ensureDepthTexture();
  }

  dispose(): void {
    this.depthTex?.dispose();
    this.depthTex = null;
    this.composer?.dispose();
    this.composer = null;
  }
}
