import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Workspace } from '../../domain/types.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

const SKILLS_SH_BASE = 'https://skills.sh';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Diretorios de skills convencionais dos agentes — o mesmo conjunto que a
 * ponte usa para a skill "orkestrai" (menos ".orkestrai/", que é o fallback
 * portavel sem convencao de skill por diretorio).
 */
const SKILL_DIRS = ['.claude/skills', '.cline/skills', '.devin/skills', '.agents/skills'] as const;

export type SkillSearchResult = {
  /** "<owner>/<repo>/<skillId>" */
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
};

export type InstalledSkill = {
  skillId: string;
  name: string;
  description: string;
};

type DownloadedSkillFile = { path: string; contents: string };

/**
 * Curadoria de skills populares (installs reais em skills.sh), usada quando
 * a busca esta vazia — o endpoint publico de busca exige pelo menos 2
 * caracteres e nao tem "listar tudo"/"em alta", entao sem isso a tela
 * ficaria vazia no primeiro acesso.
 */
const CURATED: SkillSearchResult[] = [
  { id: 'anthropics/skills/frontend-design', skillId: 'frontend-design', name: 'frontend-design', source: 'anthropics/skills', installs: 813657 },
  { id: 'vercel-labs/agent-skills/web-design-guidelines', skillId: 'web-design-guidelines', name: 'web-design-guidelines', source: 'vercel-labs/agent-skills', installs: 571878 },
  { id: 'mattpocock/skills/code-review', skillId: 'code-review', name: 'code-review', source: 'mattpocock/skills', installs: 405051 },
  { id: 'mattpocock/skills/git-guardrails-claude-code', skillId: 'git-guardrails-claude-code', name: 'git-guardrails-claude-code', source: 'mattpocock/skills', installs: 264665 },
  { id: 'obra/superpowers/systematic-debugging', skillId: 'systematic-debugging', name: 'systematic-debugging', source: 'obra/superpowers', installs: 235601 },
  { id: 'obra/superpowers/requesting-code-review', skillId: 'requesting-code-review', name: 'requesting-code-review', source: 'obra/superpowers', installs: 208855 },
  { id: 'obra/superpowers/test-driven-development', skillId: 'test-driven-development', name: 'test-driven-development', source: 'obra/superpowers', installs: 206694 },
  { id: 'anthropics/skills/pdf', skillId: 'pdf', name: 'pdf', source: 'anthropics/skills', installs: 184123 },
  { id: 'anthropics/skills/webapp-testing', skillId: 'webapp-testing', name: 'webapp-testing', source: 'anthropics/skills', installs: 140455 },
];

/**
 * Marketplace de skills do skills.sh: curadoria local + busca no registry
 * publico, instala nos diretorios convencionais dos agentes (SKILL_DIRS) do
 * workspace. Nada vai no pacote do app — tudo sob demanda.
 */
export class SkillMarketService {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  /** Curadoria filtrada + registry (curadoria sempre primeiro). Sem termo: so a curadoria. */
  async search(query: string): Promise<SkillSearchResult[]> {
    const q = query.trim();
    const ql = q.toLowerCase();
    const curated = CURATED.filter((skill) => !ql || `${skill.name} ${skill.skillId} ${skill.source}`.toLowerCase().includes(ql));
    if (!q) return curated;
    try {
      const payload = await this.fetchJson(`${SKILLS_SH_BASE}/api/search?q=${encodeURIComponent(q)}`);
      const remote = Array.isArray(payload?.skills) ? payload.skills : [];
      const seen = new Set(curated.map((skill) => skill.id));
      const deduped: SkillSearchResult[] = [];
      for (const skill of remote as Record<string, unknown>[]) {
        if (!skill?.id || !skill?.skillId) continue;
        const id = String(skill.id);
        if (seen.has(id)) continue;
        seen.add(id);
        deduped.push({
          id,
          skillId: String(skill.skillId),
          name: String(skill.name ?? skill.skillId),
          source: String(skill.source ?? ''),
          installs: Number(skill.installs ?? 0),
        });
      }
      return [...curated, ...deduped];
    } catch {
      return curated; // skills.sh fora do ar: curadoria sempre funciona
    }
  }

  /** Catalogo de curadoria completo (para testes e listagem sem busca). */
  curated(): SkillSearchResult[] {
    return CURATED;
  }

  /** Skills instaladas no workspace (varre .claude/skills/<id>/SKILL.md). */
  async listInstalled(workspaceId: string): Promise<InstalledSkill[]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const root = resolve(workspace.workingDir, '.claude', 'skills');
    if (!existsSync(root)) return [];
    const installed: InstalledSkill[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = resolve(root, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      const { name, description } = parseFrontmatter(readFileSync(skillFile, 'utf8'));
      installed.push({ skillId: entry.name, name: name || entry.name, description });
    }
    return installed.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Baixa a skill do registry e grava nos diretorios dos agentes. */
  async install(workspaceId: string, input: { source: string; skillId: string }): Promise<InstalledSkill> {
    const workspace = await this.requireWorkspace(workspaceId);
    const source = input.source.trim();
    const skillId = input.skillId.trim();
    if (!source || !skillId) throw new Error('Informe source e skillId da skill.');
    if (!/^[\w.-]+\/[\w.-]+$/.test(source)) throw new Error('Source invalido (esperado owner/repo).');
    if (!/^[\w.-]+$/.test(skillId)) throw new Error('skillId invalido.');

    const payload = await this.fetchJson(`${SKILLS_SH_BASE}/api/download/${source}/${skillId}`);
    const files = (Array.isArray(payload?.files) ? payload.files : []) as DownloadedSkillFile[];
    if (!files.some((file) => file.path === 'SKILL.md')) {
      throw new Error('Skill sem SKILL.md no registry.');
    }

    for (const base of SKILL_DIRS) {
      const target = resolve(workspace.workingDir, base, skillId);
      rmSync(target, { recursive: true, force: true });
      for (const file of files) {
        const safePath = file.path.replace(/(\.\.[/\\])+/g, '');
        const destination = resolve(target, safePath);
        if (!destination.startsWith(target)) continue;
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, file.contents);
      }
    }
    this.excludeFromGit(workspace, skillId);

    const { name, description } = parseFrontmatter(files.find((file) => file.path === 'SKILL.md')!.contents);
    return { skillId, name: name || skillId, description };
  }

  /** Remove a skill dos diretorios dos agentes. */
  async uninstall(workspaceId: string, skillId: string): Promise<{ removed: boolean }> {
    const workspace = await this.requireWorkspace(workspaceId);
    if (!/^[\w.-]+$/.test(skillId)) throw new Error('skillId invalido.');
    for (const base of SKILL_DIRS) {
      rmSync(resolve(workspace.workingDir, base, skillId), { recursive: true, force: true });
    }
    return { removed: true };
  }

  private async requireWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return workspace;
  }

  /** Mantem as skills instaladas fora do git status (como a skill da ponte). */
  private excludeFromGit(workspace: Workspace, skillId: string) {
    try {
      const gitDir = resolve(workspace.workingDir, '.git');
      if (!existsSync(gitDir)) return;
      const excludePath = resolve(gitDir, 'info', 'exclude');
      const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
      const additions = SKILL_DIRS.map((base) => `${base}/${skillId}/`).filter((entry) => !current.includes(entry));
      if (!additions.length) return;
      mkdirSync(resolve(gitDir, 'info'), { recursive: true });
      writeFileSync(excludePath, `${current.replace(/\n?$/, '\n')}${additions.join('\n')}\n`);
    } catch {
      // conveniencia; nao bloqueia a instalacao
    }
  }

  private async fetchJson(url: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`skills.sh respondeu HTTP ${response.status}.`);
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('skills.sh demorou demais para responder. Tente de novo.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Extrai name/description do frontmatter YAML simples do SKILL.md. */
export function parseFrontmatter(contents: string): { name: string; description: string } {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: '', description: '' };
  const name = match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return { name, description };
}

export const skillMarketService = new SkillMarketService();
