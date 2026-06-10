import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectInfo } from '../domain/types.js';
import { listProjectDirectories, projectsRoot, slugifyProjectName } from '../infrastructure/workspace.js';

export function listProjects(): ProjectInfo[] {
  return listProjectDirectories();
}

export function createProject(name: string): ProjectInfo {
  const baseSlug = slugifyProjectName(name);
  let slug = baseSlug;
  let index = 2;
  let path = resolve(projectsRoot, slug);

  while (existsSync(path)) {
    slug = `${baseSlug}-${index}`;
    path = resolve(projectsRoot, slug);
    index += 1;
  }

  mkdirSync(path, { recursive: true });

  return {
    name: slug,
    path,
    createdAt: new Date().toISOString(),
  };
}
