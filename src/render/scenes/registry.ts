/**
 * 场景注册表：内置作业场景注册。
 */
import type { SceneDefinition } from './BaseScene';
import { registerScene } from './BaseScene';
import { SalvageScene } from './SalvageScene';
import { DamScene } from './DamScene';
import { ShipScene } from './ShipScene';
import { BridgeScene } from './BridgeScene';
import { OilRigScene } from './OilRigScene';
import { PipelineExtScene } from './PipelineExtScene';
import { PipelineIntScene } from './PipelineIntScene';
import { AquacultureScene } from './AquacultureScene';

const SCENES: SceneDefinition[] = [SalvageScene, DamScene, ShipScene, BridgeScene, OilRigScene, PipelineExtScene, PipelineIntScene, AquacultureScene];
for (const s of SCENES) registerScene(s);

export { SCENES };
