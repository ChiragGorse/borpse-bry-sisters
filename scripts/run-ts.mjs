// Runs a TypeScript entry point in Node without extra dependencies: bundles it with the esbuild that
// ships with Vite, then imports the bundle. Usage: node scripts/run-ts.mjs scripts/sim-soak.ts [args...]
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [entry, ...rest] = process.argv.slice(2);
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <file.ts> [args...]');
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'borpse-'));
const out = join(dir, 'bundle.mjs');
try {
  await build({ entryPoints: [resolve(entry)], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: out, logLevel: 'warning' });
  process.argv = [process.argv[0], resolve(entry), ...rest];
  await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
