/**
 * Usage: tsx scripts/check-assets.ts [--public]
 * Validates assets/registry.json and the files in assets/public. --public applies the release rules.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { validateContract } from '../src/core/contracts/validate';
import { checkAssets } from './lib/asset-gate';

const root = new URL('..', import.meta.url).pathname;
const publicDir = join(root, 'assets/public');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(relative(publicDir, full).split(sep).join('/'));
  }
  return out;
}

const mode = process.argv.includes('--public') ? 'public' : 'development';
const parsed = validateContract('asset-rights', JSON.parse(readFileSync(join(root, 'assets/registry.json'), 'utf8')));
if (!parsed.ok) {
  console.error(`assets/registry.json is invalid:\n  ${parsed.errors.join('\n  ')}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const result = checkAssets(parsed.value, listFiles(publicDir), mode, today);
if (result.standIns.length > 0) {
  console.warn(`Development stand-ins in this build (${result.standIns.length}): ${result.standIns.join(', ')}`);
}
if (!result.ok) {
  console.error(`Asset check failed (${mode}):\n  ${result.errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`Asset check passed (${mode}): ${parsed.value.assets.length} registered assets.`);
