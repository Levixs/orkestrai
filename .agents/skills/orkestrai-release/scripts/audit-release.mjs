#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const version = process.argv[2] ?? '';
const repository = 'beeblock/orkestrai-releases';
const tag = `v${version}`;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Usage: audit-release.mjs <major.minor.patch>');
}

/** @param {string[]} args */
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

/** @param {unknown} condition @param {string} message */
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const release = JSON.parse(
  gh(['release', 'view', tag, '--repo', repository, '--json', 'tagName,name,isDraft,isPrerelease,url,assets']),
);

requireCondition(release.tagName === tag, `Expected tag ${tag}`);
requireCondition(release.isDraft === false, `${tag} is still a draft`);
requireCondition(release.isPrerelease === false, `${tag} is marked as a prerelease`);

const latestTag = gh(['api', `repos/${repository}/releases/latest`, '--jq', '.tag_name']);
requireCondition(latestTag === tag, `Latest release is ${latestTag}, not ${tag}`);

const requiredAssets = [
  'latest-linux.yml',
  'latest-mac.yml',
  'latest.yml',
  `Orkestrai-${version}-arm64-mac.zip`,
  `Orkestrai-${version}-arm64-mac.zip.blockmap`,
  `Orkestrai-${version}-arm64.dmg`,
  `Orkestrai-${version}-arm64.dmg.blockmap`,
  `Orkestrai-${version}-mac.zip`,
  `Orkestrai-${version}-mac.zip.blockmap`,
  `Orkestrai-${version}.AppImage`,
  `Orkestrai-${version}.dmg`,
  `Orkestrai-${version}.dmg.blockmap`,
  `Orkestrai-Setup-${version}.exe`,
  `Orkestrai-Setup-${version}.exe.blockmap`,
];

const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
for (const name of requiredAssets) requireCondition(assets.has(name), `Missing public asset ${name}`);

const manifests = ['latest-mac.yml', 'latest.yml', 'latest-linux.yml'];
for (const manifestName of manifests) {
  const manifestUrl = `https://github.com/${repository}/releases/latest/download/${manifestName}`;
  const response = await fetch(manifestUrl, { redirect: 'follow' });
  requireCondition(response.ok, `${manifestName} returned HTTP ${response.status}`);
  const manifest = parse(await response.text());
  requireCondition(String(manifest.version) === version, `${manifestName} has version ${manifest.version}`);
  requireCondition(Array.isArray(manifest.files) && manifest.files.length > 0, `${manifestName} has no files`);

  for (const entry of manifest.files) {
    const asset = assets.get(String(entry.url));
    requireCondition(asset, `${manifestName} references missing public asset ${entry.url}`);
    if (entry.size != null) {
      requireCondition(Number(entry.size) === Number(asset.size), `${manifestName} size mismatch for ${entry.url}`);
    }
    requireCondition(typeof entry.sha512 === 'string' && entry.sha512.length > 0, `${manifestName} lacks SHA-512 for ${entry.url}`);

    const assetUrl = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(String(entry.url))}`;
    const head = await fetch(assetUrl, { method: 'HEAD', redirect: 'follow' });
    requireCondition(head.ok, `${entry.url} returned HTTP ${head.status}`);
  }
}

console.log(`Audited Orkestrai ${version}: ${release.assets.length} public assets, all update feeds reachable.`);
console.log(release.url);
