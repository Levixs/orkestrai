#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const version = process.argv[2] ?? '';
const primaryRepository = 'beeblock/orkestrai';
const legacyRepository = 'beeblock/orkestrai-releases';
const legacyTransitionVersion = '0.1.4';
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

async function auditRepository(repository) {
  const release = JSON.parse(
    gh(['release', 'view', tag, '--repo', repository, '--json', 'tagName,name,isDraft,isPrerelease,url,assets']),
  );

  requireCondition(release.tagName === tag, `${repository}: expected tag ${tag}`);
  requireCondition(release.isDraft === false, `${repository}: ${tag} is still a draft`);
  requireCondition(release.isPrerelease === false, `${repository}: ${tag} is marked as a prerelease`);

  const latestTag = gh(['api', `repos/${repository}/releases/latest`, '--jq', '.tag_name']);
  requireCondition(latestTag === tag, `${repository}: latest release is ${latestTag}, not ${tag}`);

  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  for (const name of requiredAssets) {
    requireCondition(assets.has(name), `${repository}: missing public asset ${name}`);
  }

  const manifests = ['latest-mac.yml', 'latest.yml', 'latest-linux.yml'];
  for (const manifestName of manifests) {
    const manifestUrl = `https://github.com/${repository}/releases/latest/download/${manifestName}`;
    const response = await fetch(manifestUrl, { redirect: 'follow' });
    requireCondition(response.ok, `${repository}: ${manifestName} returned HTTP ${response.status}`);
    const manifest = parse(await response.text());
    requireCondition(String(manifest.version) === version, `${repository}: ${manifestName} has version ${manifest.version}`);
    requireCondition(Array.isArray(manifest.files) && manifest.files.length > 0, `${repository}: ${manifestName} has no files`);

    for (const entry of manifest.files) {
      const asset = assets.get(String(entry.url));
      requireCondition(asset, `${repository}: ${manifestName} references missing public asset ${entry.url}`);
      if (entry.size != null) {
        requireCondition(
          Number(entry.size) === Number(asset.size),
          `${repository}: ${manifestName} size mismatch for ${entry.url}`,
        );
      }
      requireCondition(
        typeof entry.sha512 === 'string' && entry.sha512.length > 0,
        `${repository}: ${manifestName} lacks SHA-512 for ${entry.url}`,
      );

      const assetUrl = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(String(entry.url))}`;
      const head = await fetch(assetUrl, { method: 'HEAD', redirect: 'follow' });
      requireCondition(head.ok, `${repository}: ${entry.url} returned HTTP ${head.status}`);
    }
  }

  console.log(`Audited ${repository} at Orkestrai ${version}: ${release.assets.length} public assets.`);
  console.log(release.url);
}

await auditRepository(primaryRepository);
if (version === legacyTransitionVersion) await auditRepository(legacyRepository);
