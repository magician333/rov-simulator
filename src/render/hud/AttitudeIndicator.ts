/**
 * AttitudeIndicator：迷你机身姿态模型（docs/05-视角HUD与声纳.md §2.1）。
 * 独立小 WebGL 场景：ROV 简化模型 + 人工水平仪参考环。
 * 由 React 组件（AttitudeIndicatorView）以 ~30Hz 驱动 render()。
 */

import * as THREE from 'three';

const SIZE = 240;

export class AttitudeIndicator {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rovGroup: THREE.Group;
  private horizonRing: THREE.Group;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(SIZE, SIZE, false);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    this.camera.position.set(0, 1.5, 2.7);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 4, 2);
    const fill = new THREE.DirectionalLight(0x88bbff, 0.6);
    fill.position.set(-3, 1, -2);
    const amb = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(key, fill, amb);

    this.rovGroup = this.buildRovModel();
    this.scene.add(this.rovGroup);

    this.horizonRing = this.buildHorizon();
    this.scene.add(this.horizonRing);
  }

  private buildRovModel(): THREE.Group {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.3, 0.68),
      new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.4, metalness: 0.5 }),
    );
    g.add(hull);
    // 浮力块
    const buoy = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.6 }),
    );
    buoy.position.y = 0.2;
    g.add(buoy);
    // 前向指示（头部小天线/箭头）— 模型前向 -Z
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x4fc3f7, emissiveIntensity: 0.8 }),
    );
    nose.rotation.x = Math.PI / 2; // 圆锥尖朝 -Z
    nose.position.set(0, 0, -0.5);
    g.add(nose);
    return g;
  }

  private buildHorizon(): THREE.Group {
    const g = new THREE.Group();
    // 参考环（人工水平仪外环）
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.014, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x8ad5f5, transparent: true, opacity: 0.75 }),
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    // 水平线（两根短线标记水平）
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
    for (const [lx, ly] of [[-0.28, 0], [0.28, 0]] as const) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), lineMat);
      seg.position.set(lx, ly, 0.6);
      g.add(seg);
    }
    // 顶部固定标（航向指示）
    const topMark = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.14, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd54f }),
    );
    topMark.rotation.x = Math.PI;
    topMark.position.set(0, 1.18, 0.6);
    g.add(topMark);
    return g;
  }

  /** 更新姿态（四元数，与主 ROV 相同） */
  setAttitude(q: { x: number; y: number; z: number; w: number }): void {
    this.rovGroup.quaternion.set(q.x, q.y, q.z, q.w);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    this.renderer.dispose();
  }
}
