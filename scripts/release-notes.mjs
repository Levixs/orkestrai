#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @param {string} changelog @param {string} version */
export function versionChangelogSection(changelog, version) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## ${escapedVersion}\\b.*$`, 'm').exec(changelog);
  if (!heading || heading.index == null) {
    throw new Error(`CHANGELOG.md does not contain an English section for ${version}`);
  }

  const start = heading.index;
  const remainder = changelog.slice(start + heading[0].length);
  const nextHeading = /^## /m.exec(remainder);
  const end = nextHeading?.index == null ? changelog.length : start + heading[0].length + nextHeading.index;
  return changelog.slice(start, end).trim();
}

/**
 * @param {string} version
 * @param {string} changelogPath
 * @param {string} outputPath
 */
export function writeReleaseNotes(version, changelogPath, outputPath) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`Invalid release version: ${version ?? ''}`);
  if (!changelogPath || !outputPath) throw new Error('Usage: release-notes.mjs <version> <changelog> <output>');

  const section = versionChangelogSection(readFileSync(changelogPath, 'utf8'), version);
  const notes = `${section}\n\nDownloads for macOS, Windows and Linux are attached below.\n`;
  writeFileSync(outputPath, notes);
  console.log(`Prepared release notes for Orkestrai ${version}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [version = '', changelogPath = '', outputPath = ''] = process.argv.slice(2);
  writeReleaseNotes(version, changelogPath, outputPath);
}
