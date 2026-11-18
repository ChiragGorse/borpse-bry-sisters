/**
 * Just enough of `document` for the map builders (world.ts, forest.ts) to run in Node.
 * Canvas contexts come back as null, so procedural textures are skipped; every collider, crop and
 * landmark the simulation needs is still built exactly as in the browser.
 */
const g = globalThis as unknown as { document?: unknown; window?: unknown };
if (typeof g.document === 'undefined') {
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => null, toDataURL: () => '' });
  g.document = { createElement: (tag: string) => (tag === 'canvas' ? canvas() : { style: {} }) };
}
export {};
