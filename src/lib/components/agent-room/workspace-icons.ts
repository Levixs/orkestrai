import {
  Bot, Boxes, Briefcase, Cloud, CodeXml, Coffee, Cpu, Database, Flame, Folder, Gamepad2, Gem,
  Globe, Heart, Home, Leaf, Music, Palette, Plane, Rocket, Shield, ShoppingBag, Star, Wrench, Zap,
} from '@lucide/svelte';

/**
 * Icones de workspace (lucide). O campo Workspace.icon guarda o NOME do icone
 * (ex.: 'rocket'). Valores legados (emoji) continuam renderizando como texto —
 * ver WorkspaceIcon.svelte.
 */
export const WORKSPACE_ICONS = [
  { name: 'rocket', component: Rocket },
  { name: 'zap', component: Zap },
  { name: 'bot', component: Bot },
  { name: 'code', component: CodeXml },
  { name: 'briefcase', component: Briefcase },
  { name: 'globe', component: Globe },
  { name: 'database', component: Database },
  { name: 'cloud', component: Cloud },
  { name: 'cpu', component: Cpu },
  { name: 'shield', component: Shield },
  { name: 'gem', component: Gem },
  { name: 'flame', component: Flame },
  { name: 'star', component: Star },
  { name: 'heart', component: Heart },
  { name: 'home', component: Home },
  { name: 'leaf', component: Leaf },
  { name: 'palette', component: Palette },
  { name: 'music', component: Music },
  { name: 'gamepad', component: Gamepad2 },
  { name: 'coffee', component: Coffee },
  { name: 'plane', component: Plane },
  { name: 'shopping', component: ShoppingBag },
  { name: 'wrench', component: Wrench },
  { name: 'boxes', component: Boxes },
] as const;

export type WorkspaceIconName = (typeof WORKSPACE_ICONS)[number]['name'];

const BY_NAME = new Map(WORKSPACE_ICONS.map((icon) => [icon.name, icon.component]));

/** Componente do icone pelo nome (null = Folder padrao; nao-lucide = null). */
export function workspaceIconComponent(name: string | null | undefined) {
  if (!name) return Folder;
  return BY_NAME.get(name as WorkspaceIconName) ?? null;
}

/** true quando o valor e um emoji legado (nao um nome lucide conhecido). */
export function isLegacyEmojiIcon(value: string | null | undefined): boolean {
  return Boolean(value) && !BY_NAME.has(value as WorkspaceIconName);
}
