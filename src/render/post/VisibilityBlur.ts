/**
 * VisibilityBlur：低能见度/高浊度时的高斯模糊后处理。
 * 水平 + 垂直分离高斯（three 官方 HorizontalBlurShader / VerticalBlurShader）。
 * blur ∈ [0,1]：0 = 不模糊（跳过渲染），1 = 最强模糊。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

export class VisibilityBlur {
  private composer: EffectComposer | null = null;
  private passH: ShaderPass;
  private passV: ShaderPass;
  private blur = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.passH = new ShaderPass(HorizontalBlurShader);
    this.passV = new ShaderPass(VerticalBlurShader);
    this.passH.uniforms['h'].value = 0;
    this.passV.uniforms['v'].value = 0;
    // 两个 pass 共享 renderToScreen：最后一个 pass 输出到屏幕
    this.passV.renderToScreen = true;
    this.composer.addPass(this.passH);
    this.composer.addPass(this.passV);
  }

  /** 设置模糊强度 0..1（低能见度/浊度驱动） */
  setBlur(amount: number): void {
    this.blur = Math.max(0, Math.min(1, amount));
    // 偏移按分辨率归一化：blur=1 → 约 8px
    const w = this.renderer.domElement.width || 1;
    const h = this.renderer.domElement.height || 1;
    const px = this.blur * 8;
    this.passH.uniforms['h'].value = px / w;
    this.passV.uniforms['v'].value = px / h;
  }

  get active(): boolean {
    return this.blur > 0.002;
  }

  render(): void {
    this.composer?.render();
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h);
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}
