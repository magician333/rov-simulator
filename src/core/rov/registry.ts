import type { ROVConfig } from './ROVConfig';
import { DEFAULT_ROV_CONFIG, CHASING_M2_CONFIG } from './ROVConfig';

const registry = new Map<string, ROVConfig>();

export function registerRov(cfg: ROVConfig): void {
  registry.set(cfg.id, cfg);
}

export function getRov(id: string): ROVConfig | undefined {
  return registry.get(id);
}

export function listRovs(): ROVConfig[] {
  return [...registry.values()];
}

// 内置机型注册
registerRov(DEFAULT_ROV_CONFIG);
registerRov(CHASING_M2_CONFIG);
