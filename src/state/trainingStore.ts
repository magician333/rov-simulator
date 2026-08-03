/**
 * trainingStore：训练成绩记录（docs/06-机型场景与任务.md §4.4）。
 * localStorage 持久化（zustand persist）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TrainingRecord {
  id: string;
  date: string;
  rovId: string;
  sceneId: string;
  taskId: string;
  completed: boolean;
  durationSec: number;
  maxDepthM: number;
  avgSpeedKnots: number;
}

interface TrainingStore {
  records: TrainingRecord[];
  addRecord(r: TrainingRecord): void;
  clearRecords(): void;
}

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set) => ({
      records: [],
      addRecord: (r) => set((s) => ({ records: [r, ...s.records].slice(0, 300) })),
      clearRecords: () => set({ records: [] }),
    }),
    { name: 'rov-training-records' },
  ),
);

/** 导出成绩 JSON（触发浏览器下载） */
export function exportRecords(records: TrainingRecord[]): void {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rov-training-records-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
