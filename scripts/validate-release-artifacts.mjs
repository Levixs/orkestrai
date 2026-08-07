#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

/** @typedef {{ url: string, sha512: string, size?: number }} ManifestEntry */
/** @typedef {{ version: string, files: ManifestEntry[] }} UpdateManifest */

/** @param {string} message */
function fail(message) {
  throw new Error(message);
}

/** @param {string} value */
function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string[]} files
 * @param {RegExp} pattern
 * @param {string} description
 */
function requireFile(files, pattern, description) {
  const match = files.find((file) => pattern.test(file));
  if (!match) fail(`Missing ${description}`);
  return match;
}

/** @param {string} file */
function sha512(file) {
  return createHash('sha512').update(readFileSync(file)).digest('base64');
}

/**
 * @param {UpdateManifest} manifest
 * @param {string} manifestName
 */
function manifestFiles(manifest, manifestName) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail(`${manifestName} does not contain a files list`);
  }
  return manifest.files;
}

/**
 * @param {string} directory
 * @param {string} manifestName
 * @param {string} version
 * @returns {UpdateManifest}
 */
function validateManifest(directory, manifestName, version) {
  const manifestPath = path.join(directory, manifestName);
  if (!existsSync(manifestPath)) fail(`Missing ${manifestName}`);

  /** @type {UpdateManifest} */
  const manifest = parse(readFileSync(manifestPath, 'utf8'));
  if (String(manifest.version) !== version) {
    fail(`${manifestName} version ${manifest.version ?? '<missing>'} does not match ${version}`);
  }

  for (const entry of manifestFiles(manifest, manifestName)) {
    if (!entry?.url || !entry?.sha512) fail(`${manifestName} contains an incomplete file entry`);
    const filename = path.basename(decodeURIComponent(String(entry.url)));
    const artifactPath = path.join(directory, filename);
    if (!existsSync(artifactPath)) fail(`${manifestName} references missing asset ${filename}`);
    if (sha512(artifactPath) !== entry.sha512) fail(`${manifestName} has an invalid sha512 for ${filename}`);
    if (entry.size != null && statSync(artifactPath).size !== Number(entry.size)) {
      fail(`${manifestName} has an invalid size for ${filename}`);
    }
  }

  return manifest;
}

/**
 * @param {string} directory
 * @param {string} version
 */
export function validateReleaseArtifacts(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`Invalid release version: ${version}`);
  if (!existsSync(directory)) fail(`Artifact directory does not exist: ${directory}`);

  const files = readdirSync(directory).filter((file) => statSync(path.join(directory, file)).isFile()).sort();
  const v = escaped(version);

  /** @type {Array<[RegExp, string]>} */
  const required = [
    [new RegExp(`^Orkestrai-${v}-arm64\\.dmg$`), 'Apple Silicon DMG'],
    [new RegExp(`^Orkestrai-${v}-arm64\\.dmg\\.blockmap$`), 'Apple Silicon DMG blockmap'],
    [new RegExp(`^Orkestrai-${v}-arm64-mac\\.zip$`), 'Apple Silicon update ZIP'],
    [new RegExp(`^Orkestrai-${v}-arm64-mac\\.zip\\.blockmap$`), 'Apple Silicon ZIP blockmap'],
    [new RegExp(`^Orkestrai-${v}\\.dmg$`), 'Intel macOS DMG'],
    [new RegExp(`^Orkestrai-${v}\\.dmg\\.blockmap$`), 'Intel macOS DMG blockmap'],
    [new RegExp(`^Orkestrai-${v}-mac\\.zip$`), 'Intel macOS update ZIP'],
    [new RegExp(`^Orkestrai-${v}-mac\\.zip\\.blockmap$`), 'Intel macOS ZIP blockmap'],
    [new RegExp(`^Orkestrai Setup ${v}\\.exe$`), 'Windows NSIS installer'],
    [new RegExp(`^Orkestrai Setup ${v}\\.exe\\.blockmap$`), 'Windows NSIS blockmap'],
    [new RegExp(`^Orkestrai-${v}\\.AppImage$`), 'Linux AppImage'],
    [new RegExp(`^Orkestrai-${v}\\.AppImage\\.blockmap$`), 'Linux AppImage blockmap'],
  ];
  for (const [pattern, description] of required) requireFile(files, pattern, description);

  const mac = validateManifest(directory, 'latest-mac.yml', version);
  const windows = validateManifest(directory, 'latest.yml', version);
  const linux = validateManifest(directory, 'latest-linux.yml', version);

  const macUrls = manifestFiles(mac, 'latest-mac.yml').map((entry) => String(entry.url));
  if (!macUrls.some((url) => url.endsWith('-arm64-mac.zip'))) {
    fail('latest-mac.yml does not contain the Apple Silicon update ZIP');
  }
  if (!macUrls.some((url) => url.endsWith('-mac.zip') && !url.includes('-arm64-'))) {
    fail('latest-mac.yml does not contain the Intel update ZIP');
  }

  const windowsUrls = manifestFiles(windows, 'latest.yml').map((entry) => String(entry.url));
  if (!windowsUrls.some((url) => url.endsWith('.exe'))) fail('latest.yml does not contain the NSIS installer');

  const linuxUrls = manifestFiles(linux, 'latest-linux.yml').map((entry) => String(entry.url));
  if (!linuxUrls.some((url) => url.endsWith('.AppImage'))) fail('latest-linux.yml does not contain the AppImage');

  console.log(`Validated ${files.length} release assets for Orkestrai ${version}.`);
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , directory = 'release', version = ''] = process.argv;
  try {
    validateReleaseArtifacts(path.resolve(directory), version);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
