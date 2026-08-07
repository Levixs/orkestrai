import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';

export function disableMacAutomaticRollout(manifestPath) {
  const manifest = parse(readFileSync(manifestPath, 'utf8'));
  manifest.stagingPercentage = 0;
  writeFileSync(manifestPath, stringify(manifest));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error('Usage: set-mac-update-policy.mjs <latest-mac.yml>');
  disableMacAutomaticRollout(manifestPath);
  console.log(`Disabled automatic macOS rollout in ${manifestPath}`);
}
