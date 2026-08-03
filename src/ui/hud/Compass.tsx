/**
 * Compass：水平滚动刻度条罗盘（唯一模式）。
 * 固定世界网格精确渲染（视窗内必显示 30° 节点数字 + E/W/S/N 方位字母）；
 * 缩小版、半透明、中央航向指针朝下（游标式）。
 */

import { memo } from 'react';

const CARDINALS: Record<number, string> = {
  0: 'N',
  90: 'E',
  180: 'S',
  270: 'W',
};

export const Compass = memo(function Compass({ headingDeg }: { headingDeg: number }) {
  const W = 380;
  const H = 58;
  const center = W / 2;
  const pxPerDeg = 1.3; // 视窗 ±146°
  const heading = ((headingDeg % 360) + 360) % 360;

  const ticks: React.ReactNode[] = [];
  const start10 = Math.floor((heading - 146) / 10) * 10;
  const end10 = heading + 146;
  for (let w10 = start10; w10 <= end10; w10 += 10) {
    const world = ((w10 % 360) + 360) % 360;
    const off = w10 - heading;
    const x = center + off * pxPerDeg;
    const isCardinal = world % 90 === 0;
    const isMajor = world % 30 === 0;
    const cardinal = CARDINALS[world];
    const len = isCardinal ? 13 : isMajor ? 11 : 8;
    ticks.push(
      <line
        key={`l${w10}`}
        x1={x}
        y1={H - 20}
        x2={x}
        y2={H - 20 - len}
        stroke={isCardinal ? '#ffd54f' : isMajor ? '#bde7f7' : '#7fb3c9'}
        strokeWidth={isMajor ? 2 : 1.4}
      />,
    );
    if (cardinal) {
      ticks.push(
        <text key={`t${w10}`} x={x} y={H - 40} fill={world === 0 ? '#ffd54f' : '#e8f8ff'} fontSize={16} fontWeight={800} textAnchor="middle">
          {cardinal}
        </text>,
      );
    } else if (isMajor) {
      ticks.push(
        <text key={`n${w10}`} x={x} y={H - 30} fill="#8ad5f5" fontSize={11} fontWeight={700} textAnchor="middle">
          {Math.round(world)}°
        </text>,
      );
    }
  }

  return (
    <div style={{ position: 'relative', opacity: 0.78 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {ticks}
        {/* 中央航向游标：倒三角（尖朝下） */}
        <polygon points={`${center},14 ${center - 7},2 ${center + 7},2`} fill="#ffd54f" />
        <line x1={center} y1={14} x2={center} y2={H - 20} stroke="rgba(255,213,79,0.35)" strokeWidth={1} />
      </svg>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0 5px',
          fontSize: 14,
          color: '#e8f8ff',
          fontFamily: 'Consolas, Menlo, monospace',
          textShadow: '0 0 6px rgba(0,0,0,.9)',
        }}
      >
        {Math.round(heading)}°
      </div>
    </div>
  );
});
