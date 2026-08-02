/**
 * AttitudeIndicatorView：迷你姿态模型的 React 包装（独立 WebGL 小画布）。
 * 30Hz 渲染；接收四元数（来自 HUD 快照）。
 */

import { useEffect, useRef } from 'react';
import { AttitudeIndicator } from '../../render/hud/AttitudeIndicator';

interface Props {
  quaternion: { x: number; y: number; z: number; w: number };
  size?: number;
}

export function AttitudeIndicatorView({ quaternion, size = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiRef = useRef<AttitudeIndicator | null>(null);
  const qRef = useRef(quaternion);

  useEffect(() => {
    qRef.current = quaternion;
  }, [quaternion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ai = new AttitudeIndicator(canvas);
    aiRef.current = ai;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      if (now - last >= 33) {
        ai.setAttitude(qRef.current);
        ai.render();
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ai.dispose();
      aiRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        border: '2px solid rgba(42, 109, 143, 0.9)',
        boxShadow: '0 0 12px rgba(0, 0, 0, 0.5)',
        background: 'rgba(3, 22, 34, 0.55)',
      }}
    >
      <canvas ref={canvasRef} width={240} height={240} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
