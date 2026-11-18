/** Builds the farm and forest in Node and hands the simulation their collision data. */
import './headless-dom';
import { buildWorld } from '../src/game/world';
import { buildForest } from '../src/game/forest';
import type { SimMaps } from '../src/game/sim/types';

export function headlessMaps(): SimMaps {
  const world = buildWorld();
  return {
    farm: { colliders: world.colliders, edibles: world.edibles },
    loadForest: () => ({ colliders: buildForest().colliders }),
  };
}
