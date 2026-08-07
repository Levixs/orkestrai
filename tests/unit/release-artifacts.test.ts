import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { latestChangelogSection } from '../../scripts/release-notes.mjs';
import { validateReleaseArtifacts } from '../../scripts/validate-release-artifacts.mjs';

const VERSION = '1.2.3';
const requiredAssets = [
  `Orkestrai-${VERSION}-arm64.dmg`,
  `Orkestrai-${VERSION}-arm64.dmg.blockmap`,
  `Orkestrai-${VERSION}-arm64-mac.zip`,
  `Orkestrai-${VERSION}-arm64-mac.zip.blockmap`,
  `Orkestrai-${VERSION}.dmg`,
  `Orkestrai-${VERSION}.dmg.blockmap`,
  `Orkestrai-${VERSION}-mac.zip`,
  `Orkestrai-${VERSION}-mac.zip.blockmap`,
  `Orkestrai Setup ${VERSION}.exe`,
  `Orkestrai Setup ${VERSION}.exe.blockmap`,
  `Orkestrai-${VERSION}.AppImage`,
  `Orkestrai-${VERSION}.AppImage.blockmap`,
];

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function checksum(file: string) {
  return createHash('sha512').update(readFileSync(file)).digest('base64');
}

function manifestEntry(directory: string, filename: string) {
  const file = path.join(directory, filename);
  return { url: filename, sha512: checksum(file), size: readFileSync(file).length };
}

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'orkestrai-release-'));
  temporaryDirectories.push(directory);
  for (const filename of requiredAssets) writeFileSync(path.join(directory, filename), `fixture:${filename}`);

  writeFileSync(
    path.join(directory, 'latest-mac.yml'),
    stringify({
      version: VERSION,
      files: [
        manifestEntry(directory, `Orkestrai-${VERSION}-arm64-mac.zip`),
        manifestEntry(directory, `Orkestrai-${VERSION}-mac.zip`),
      ],
    }),
  );
  writeFileSync(
    path.join(directory, 'latest.yml'),
    stringify({ version: VERSION, files: [manifestEntry(directory, `Orkestrai Setup ${VERSION}.exe`)] }),
  );
  writeFileSync(
    path.join(directory, 'latest-linux.yml'),
    stringify({ version: VERSION, files: [manifestEntry(directory, `Orkestrai-${VERSION}.AppImage`)] }),
  );
  return directory;
}

describe('release artifact validation', () => {
  it('accepts complete cross-platform artifacts with valid manifests', () => {
    const files = validateReleaseArtifacts(fixture(), VERSION);
    expect(files).toContain('latest-mac.yml');
    expect(files).toHaveLength(requiredAssets.length + 3);
  });

  it('rejects a manifest checksum that does not match the installer', () => {
    const directory = fixture();
    writeFileSync(path.join(directory, `Orkestrai-${VERSION}.AppImage`), 'corrupted');
    expect(() => validateReleaseArtifacts(directory, VERSION)).toThrow(/invalid sha512/);
  });

  it('rejects a macOS manifest without an Intel update ZIP', () => {
    const directory = fixture();
    writeFileSync(
      path.join(directory, 'latest-mac.yml'),
      stringify({ version: VERSION, files: [manifestEntry(directory, `Orkestrai-${VERSION}-arm64-mac.zip`)] }),
    );
    expect(() => validateReleaseArtifacts(directory, VERSION)).toThrow(/Intel update ZIP/);
  });
});

describe('release notes', () => {
  it('extracts the complete newest dated changelog section', () => {
    const changelog = '# Changelog\n\n## 2026-08-07\n\n**Title**\n- First\n- Second\n\n## 2026-08-06\n\n- Old\n';
    expect(latestChangelogSection(changelog)).toBe('## 2026-08-07\n\n**Title**\n- First\n- Second');
  });
});
