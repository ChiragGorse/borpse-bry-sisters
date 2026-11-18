/**
 * Map data for simulations running in Node. The farm and forest are built once (with a tiny DOM stand-in,
 * see headless-dom.ts) and every room gets its own copy of the colliders and crops, because the
 * simulation switches colliders on and off as crops are eaten.
 */
import './headless-dom';
import { buildWorld } from '../src/game/world';
import { buildForest } from '../src/game/forest';
import type { Collider } from '../src/game/layout';
import type { EdibleSpec, SimMaps } from '../src/game/sim/types';

let farm: { colliders: Collider[]; edibles: EdibleSpec[] } | null = null;
let forest: Collider[] | null = null;

export function headlessMaps(): SimMaps {
  if (!farm) {
    const w = buildWorld();
    farm = { colliders: w.colliders, edibles: w.edibles.map((e) => ({ id: e.id, name: e.name, x: e.x, z: e.z, r: e.r, hp: e.hp, maxHp: e.maxHp, crumb: e.crumb, collider: e.collider })) };
  }
  const copies = new Map<Collider, Collider>();
  const colliders = farm.colliders.map((c) => {
    const k = { ...c };
    copies.set(c, k);
    return k;
  });
  const edibles = farm.edibles.map((e) => ({ ...e, collider: e.collider ? copies.get(e.collider) : undefined }));
  return {
    farm: { colliders, edibles },
    loadForest: () => {
      forest ??= buildForest().colliders;
      // nothing toggles forest colliders, so rooms can share them
      return { colliders: forest };
    },
  };
}
