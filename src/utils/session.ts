/**
 * 训练会话持久化：浏览器刷新后恢复作业（ROV 位姿 + 已用时间）。
 * 设置与选择已由 store persist（rov-sim-persist）保存。
 */

export interface SessionData {
  sceneId: string;
  rovId: string;
  pos: [number, number, number];
  quat: [number, number, number, number];
  elapsedSec: number;
  savedAt: number;
}

const KEY = 'rov-sim-session';

export function saveSession(data: Omit<SessionData, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // 忽略（隐私模式等）
  }
}

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SessionData;
    return d && d.sceneId && Array.isArray(d.pos) ? d : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
