/**
 * Freezes the newest built release into content/world/published/<releaseId>/ so it can never change
 * again. Run it when a release is published; later builds copy frozen releases byte for byte.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildWorld } from './build';

const root = new URL('../..', import.meta.url).pathname;
const world = buildWorld(root);
if (world.errors.length) {
  console.error(`World content has problems; nothing frozen:\n  ${world.errors.join('\n  ')}`);
  process.exit(1);
}
const target = join(root, 'content/world/published', world.releaseId);
if (existsSync(target)) {
  console.error(`${world.releaseId} is already frozen. Published releases never change; add a new release instead.`);
  process.exit(1);
}
let count = 0;
for (const [path, body] of world.files) {
  if (!path.startsWith(`${world.releaseId}/`)) continue;
  const file = join(root, 'content/world/published', path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  count++;
}
console.log(`Froze ${world.releaseId}: ${count} files in content/world/published/${world.releaseId}/`);
