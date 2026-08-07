#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @param {string} changelog */
export function latestChangelogSection(changelog) {
  const headings = [...changelog.matchAll(/^## \d{4}-\d{2}-\d{2}$/gm)];
  if (headings.length === 0) throw new Error('CHANGELOG.md does not contain a dated release section');
  const start = headings[0].index;
  const end = headings[1]?.index ?? changelog.length;
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

  const section = latestChangelogSection(readFileSync(changelogPath, 'utf8'));
  const notes = `${section}\n\nDownloads for macOS, Windows and Linux are attached below.\n`;
  writeFileSync(outputPath, notes);
  console.log(`Prepared release notes for Orkestrai ${version}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [version = '', changelogPath = '', outputPath = ''] = process.argv.slice(2);
  writeReleaseNotes(version, changelogPath, outputPath);
}
