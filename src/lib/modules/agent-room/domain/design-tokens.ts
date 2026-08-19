import type {
  DesignDocument,
  DesignElement,
  DesignVariable,
  DesignVariableCollection,
  DesignVariableType,
  DesignVariableValue,
} from '../contracts/schemas/designSchemas.js';
import { resolveDesignVariableValue } from './design-variables.js';

export type DesignTokenPreset = 'product' | 'marketing' | 'mobile';

export type ImportedDesignTokens = {
  collection: DesignVariableCollection;
  variables: DesignVariable[];
  warnings: string[];
};

export type DesignSystemAudit = {
  duplicateTokens: Array<{ type: DesignVariableType; value: string; variableIds: string[] }>;
  unusedVariableIds: string[];
  hardcodedValues: Array<{ property: 'fill' | 'stroke' | 'cornerRadius' | 'fontSize' | 'spacing'; value: string; elementIds: string[] }>;
  componentCandidates: Array<{ signature: string; elementIds: string[] }>;
};

type IdFactory = () => string;

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0');
}

function colorValue(value: unknown): string | null {
  if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { colorSpace?: unknown; components?: unknown; alpha?: unknown };
  if (candidate.colorSpace !== 'srgb' || !Array.isArray(candidate.components) || candidate.components.length < 3) return null;
  if (!candidate.components.slice(0, 3).every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  const alpha = typeof candidate.alpha === 'number' ? hexByte(candidate.alpha) : '';
  return `#${candidate.components.slice(0, 3).map((item) => hexByte(Number(item))).join('')}${alpha}`;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|rem)?$/i);
    if (!match) return null;
    const numeric = Number(match[1]);
    return match[2]?.toLowerCase() === 'rem' ? numeric * 16 : numeric;
  }
  if (value && typeof value === 'object') {
    const candidate = value as { value?: unknown; unit?: unknown };
    if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) return null;
    return candidate.unit === 'rem' ? candidate.value * 16 : candidate.value;
  }
  return null;
}

function inferType(name: string, declaredType: unknown, value: unknown): DesignVariableType {
  const declared = String(declaredType ?? '').toLocaleLowerCase();
  const normalized = name.toLocaleLowerCase();
  if (declared === 'color' || colorValue(value)) return 'color';
  if (declared === 'boolean' || typeof value === 'boolean') return 'boolean';
  if (declared === 'fontweight' || normalized.includes('font-weight') || normalized.includes('weight')) return 'font-weight';
  if (declared === 'fontsize' || normalized.includes('font-size') || normalized.includes('text-size')) return 'font-size';
  if (normalized.includes('line-height') || normalized.includes('leading')) return 'line-height';
  if (normalized.includes('radius') || normalized.includes('rounded')) return 'radius';
  if (normalized.includes('opacity') || normalized.includes('alpha')) return 'opacity';
  if (normalized.includes('breakpoint') || normalized.includes('screen')) return 'breakpoint';
  if (declared === 'dimension' || declared === 'number' || numberValue(value) !== null) return 'spacing';
  return typeof value === 'string' ? 'string' : 'string';
}

function typedValue(type: DesignVariableType, value: unknown): DesignVariableValue | null {
  if (type === 'color') {
    const color = colorValue(value);
    return color ? { kind: 'color', value: color } : null;
  }
  if (type === 'boolean') return typeof value === 'boolean' ? { kind: 'boolean', value } : null;
  if (type === 'string') return typeof value === 'string' ? { kind: 'string', value } : null;
  if (type === 'effect') return null;
  const number = numberValue(value);
  return number === null ? null : { kind: 'number', value: number };
}

function defaultValue(type: DesignVariableType, value: string | number | boolean): DesignVariableValue {
  if (type === 'color') return { kind: 'color', value: String(value) };
  if (type === 'string') return { kind: 'string', value: String(value) };
  if (type === 'boolean') return { kind: 'boolean', value: Boolean(value) };
  return { kind: 'number', value: Number(value) };
}

const PRESETS: Record<DesignTokenPreset, {
  name: string;
  modes: string[];
  tokens: Array<{ name: string; type: DesignVariableType; values: Array<string | number | boolean> }>;
}> = {
  product: {
    name: 'Product foundation',
    modes: ['Light', 'Dark'],
    tokens: [
      { name: 'color/background', type: 'color', values: ['#ffffff', '#121316'] },
      { name: 'color/surface', type: 'color', values: ['#f5f6f8', '#1d1f24'] },
      { name: 'color/text', type: 'color', values: ['#17191f', '#f4f5f7'] },
      { name: 'color/accent', type: 'color', values: ['#5b5ce2', '#8b8cf8'] },
      { name: 'color/danger', type: 'color', values: ['#d92d20', '#ff6b62'] },
      { name: 'space/xs', type: 'spacing', values: [4, 4] },
      { name: 'space/sm', type: 'spacing', values: [8, 8] },
      { name: 'space/md', type: 'spacing', values: [16, 16] },
      { name: 'space/lg', type: 'spacing', values: [24, 24] },
      { name: 'radius/sm', type: 'radius', values: [4, 4] },
      { name: 'radius/md', type: 'radius', values: [8, 8] },
      { name: 'type/body', type: 'font-size', values: [16, 16] },
      { name: 'type/title', type: 'font-size', values: [28, 28] },
    ],
  },
  marketing: {
    name: 'Marketing campaign',
    modes: ['Default', 'High contrast'],
    tokens: [
      { name: 'color/canvas', type: 'color', values: ['#faf9f7', '#ffffff'] },
      { name: 'color/ink', type: 'color', values: ['#171717', '#000000'] },
      { name: 'color/brand', type: 'color', values: ['#ef5b38', '#d93611'] },
      { name: 'color/highlight', type: 'color', values: ['#ffda57', '#ffd014'] },
      { name: 'space/section', type: 'spacing', values: [96, 96] },
      { name: 'radius/card', type: 'radius', values: [8, 8] },
      { name: 'type/display', type: 'font-size', values: [64, 64] },
      { name: 'type/body', type: 'font-size', values: [18, 18] },
    ],
  },
  mobile: {
    name: 'Mobile application',
    modes: ['Light', 'Dark'],
    tokens: [
      { name: 'color/background', type: 'color', values: ['#ffffff', '#000000'] },
      { name: 'color/surface', type: 'color', values: ['#f2f2f7', '#1c1c1e'] },
      { name: 'color/label', type: 'color', values: ['#111111', '#ffffff'] },
      { name: 'color/tint', type: 'color', values: ['#007aff', '#0a84ff'] },
      { name: 'space/tap-target', type: 'spacing', values: [44, 44] },
      { name: 'space/safe-edge', type: 'spacing', values: [16, 16] },
      { name: 'radius/control', type: 'radius', values: [10, 10] },
      { name: 'type/body', type: 'font-size', values: [17, 17] },
      { name: 'breakpoint/tablet', type: 'breakpoint', values: [768, 768] },
    ],
  },
};

export function createDesignTokenPreset(preset: DesignTokenPreset, makeId: IdFactory): ImportedDesignTokens {
  const source = PRESETS[preset];
  const modeIds = source.modes.map(() => makeId());
  const collection: DesignVariableCollection = {
    id: makeId(),
    name: source.name,
    modes: source.modes.map((name, index) => ({ id: modeIds[index], name })),
    defaultModeId: modeIds[0],
    order: 0,
    libraryId: null,
    librarySourceId: null,
    codeSource: null,
  };
  return {
    collection,
    variables: source.tokens.map((token, index) => ({
      id: makeId(),
      collectionId: collection.id,
      name: token.name,
      type: token.type,
      description: '',
      values: Object.fromEntries(modeIds.map((modeId, modeIndex) => [modeId, defaultValue(token.type, token.values[modeIndex] ?? token.values[0])])),
      order: index,
      libraryId: null,
      librarySourceId: null,
      codeSourceKey: null,
    })),
    warnings: [],
  };
}

type FlatToken = { path: string; declaredType: unknown; value: unknown; modeValues: Record<string, unknown> };

function flattenDtcg(value: unknown, path: string[] = [], result: FlatToken[] = []): FlatToken[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const record = value as Record<string, unknown>;
  if ('$value' in record) {
    const extension = (record.$extensions as Record<string, unknown> | undefined)?.['com.orkestrai'] as { values?: Record<string, unknown> } | undefined;
    result.push({ path: path.join('/'), declaredType: record.$type, value: record.$value, modeValues: extension?.values ?? {} });
    return result;
  }
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith('$') || key === 'tokens') continue;
    flattenDtcg(child, [...path, key], result);
  }
  if (record.tokens) flattenDtcg(record.tokens, path, result);
  return result;
}

function parseCssTokens(text: string): FlatToken[] {
  const result: FlatToken[] = [];
  const pattern = /--([A-Za-z0-9_-]+)\s*:\s*([^;}{]+)\s*;/g;
  for (const match of text.matchAll(pattern)) result.push({ path: match[1].replace(/-/g, '/'), declaredType: null, value: match[2].trim(), modeValues: {} });
  return result;
}

export function importDesignTokens(text: string, filename: string, makeId: IdFactory): ImportedDesignTokens {
  const warnings: string[] = [];
  let flat: FlatToken[];
  let collectionName = filename.replace(/\.[^.]+$/, '') || 'Imported tokens';
  let modeNames = ['Default'];
  if (filename.toLocaleLowerCase().endsWith('.css')) {
    flat = parseCssTokens(text);
  } else {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const extension = (parsed.$extensions as Record<string, unknown> | undefined)?.['com.orkestrai'] as { collectionName?: string; modes?: string[] } | undefined;
    collectionName = extension?.collectionName?.trim() || collectionName;
    modeNames = extension?.modes?.filter((name) => typeof name === 'string' && name.trim()).slice(0, 16) || modeNames;
    if (!modeNames.length) modeNames = ['Default'];
    flat = flattenDtcg(parsed);
  }
  if (!flat.length) throw new Error('No compatible design tokens were found.');
  const collectionId = makeId();
  const modeIds = modeNames.map(() => makeId());
  const tokenIds = new Map(flat.map((token) => [token.path, makeId()]));
  const variables: DesignVariable[] = [];
  for (const [index, token] of flat.entries()) {
    const alias = typeof token.value === 'string' ? token.value.match(/^\{([^}]+)\}$/)?.[1]?.replace(/\./g, '/') : null;
    const type = inferType(token.path, token.declaredType, token.value);
    const values: Record<string, DesignVariableValue> = {};
    for (const [modeIndex, modeName] of modeNames.entries()) {
      const raw = token.modeValues[modeName] ?? token.value;
      const modeAlias = typeof raw === 'string' ? raw.match(/^\{([^}]+)\}$/)?.[1]?.replace(/\./g, '/') : alias;
      const targetId = modeAlias ? tokenIds.get(modeAlias) : null;
      const parsed = targetId ? { kind: 'alias' as const, variableId: targetId } : typedValue(type, raw);
      if (!parsed) {
        warnings.push(`${token.path}: unsupported value`);
        continue;
      }
      values[modeIds[modeIndex]] = parsed;
    }
    if (!values[modeIds[0]]) continue;
    variables.push({ id: tokenIds.get(token.path)!, collectionId, name: token.path, type, description: '', values, order: index, libraryId: null, librarySourceId: null, codeSourceKey: null });
  }
  if (!variables.length) throw new Error('No compatible design tokens were found.');
  return {
    collection: {
      id: collectionId,
      name: collectionName,
      modes: modeNames.map((name, index) => ({ id: modeIds[index], name })),
      defaultModeId: modeIds[0],
      order: 0,
      libraryId: null,
      librarySourceId: null,
      codeSource: null,
    },
    variables,
    warnings,
  };
}

function nestedToken(target: Record<string, unknown>, path: string[], token: Record<string, unknown>): void {
  let current = target;
  for (const segment of path.slice(0, -1)) current = current[segment] = (current[segment] as Record<string, unknown> | undefined) ?? {};
  current[path.at(-1) ?? 'token'] = token;
}

function dtcgType(type: DesignVariableType): string {
  if (type === 'color' || type === 'boolean' || type === 'string') return type;
  if (type === 'font-weight') return 'fontWeight';
  return type === 'spacing' || type === 'radius' || type === 'font-size' || type === 'breakpoint' ? 'dimension' : 'number';
}

function exportValue(document: DesignDocument, value: DesignVariableValue): unknown {
  if (value.kind === 'alias') {
    const target = document.variables.find((variable) => variable.id === value.variableId);
    return target ? `{${target.name.replace(/\//g, '.')}}` : '';
  }
  if (value.kind === 'number') return value.value;
  if (value.kind === 'effect') return value.value;
  return value.value;
}

export function exportDesignTokensDtcg(document: DesignDocument, collectionId: string): string {
  const collection = document.variableCollections.find((candidate) => candidate.id === collectionId);
  if (!collection) throw new Error('Design variable collection not found.');
  const tokens: Record<string, unknown> = {};
  for (const variable of document.variables.filter((candidate) => candidate.collectionId === collection.id)) {
    const values = Object.fromEntries(collection.modes.map((mode) => [mode.name, exportValue(document, variable.values[mode.id])]));
    nestedToken(tokens, variable.name.split('/').filter(Boolean), {
      $type: dtcgType(variable.type),
      $value: values[collection.modes[0].name],
      $description: variable.description || undefined,
      $extensions: { 'com.orkestrai': { values } },
    });
  }
  return `${JSON.stringify({
    $schema: 'https://tr.designtokens.org/format/',
    $extensions: { 'com.orkestrai': { collectionName: collection.name, modes: collection.modes.map((mode) => mode.name) } },
    tokens,
  }, null, 2)}\n`;
}

function cssName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function cssValue(type: DesignVariableType, value: Exclude<DesignVariableValue, { kind: 'alias' }>): string {
  if (value.kind === 'color' || value.kind === 'string') return value.value;
  if (value.kind === 'boolean') return String(value.value);
  if (value.kind === 'effect') return value.value.map((effect) => effect.type === 'drop-shadow' || effect.type === 'inner-shadow' ? `${effect.x}px ${effect.y}px ${effect.blur}px ${effect.spread}px ${effect.color}` : `blur(${effect.blur}px)`).join(', ');
  if (type === 'spacing' || type === 'radius' || type === 'font-size' || type === 'breakpoint') return `${value.value}px`;
  return String(value.value);
}

export function exportDesignTokensCss(document: DesignDocument, collectionId: string): string {
  const variables = document.variables.filter((variable) => variable.collectionId === collectionId);
  return `:root {\n${variables.map((variable) => {
    const value = resolveDesignVariableValue(document, variable.id);
    return value ? `  --${cssName(variable.name)}: ${cssValue(variable.type, value)};` : '';
  }).filter(Boolean).join('\n')}\n}\n`;
}

export function exportDesignTokensTailwind(document: DesignDocument, collectionId: string): string {
  const groups: Record<string, Record<string, string | number>> = {};
  const groupName: Partial<Record<DesignVariableType, string>> = {
    color: 'colors', spacing: 'spacing', radius: 'borderRadius', 'font-size': 'fontSize', 'font-weight': 'fontWeight', breakpoint: 'screens', opacity: 'opacity',
  };
  for (const variable of document.variables.filter((candidate) => candidate.collectionId === collectionId)) {
    const group = groupName[variable.type];
    const value = resolveDesignVariableValue(document, variable.id);
    if (!group || !value || value.kind === 'effect' || value.kind === 'boolean') continue;
    const raw = value.kind === 'number' && ['spacing', 'radius', 'font-size', 'breakpoint'].includes(variable.type) ? `${value.value}px` : value.value;
    (groups[group] ??= {})[cssName(variable.name)] = raw;
  }
  return `export default ${JSON.stringify({ theme: { extend: groups } }, null, 2)};\n`;
}

function auditValue(value: Exclude<DesignVariableValue, { kind: 'alias' }>): string {
  return JSON.stringify(value);
}

function elementSignature(element: DesignElement, children: DesignElement[]): string {
  return JSON.stringify({
    type: element.type,
    width: Math.round(element.width / 4) * 4,
    height: Math.round(element.height / 4) * 4,
    layout: element.layoutMode,
    children: children.map((child) => child.type).sort(),
  });
}

export function auditDesignSystem(document: DesignDocument): DesignSystemAudit {
  const usages = new Map(document.variables.map((variable) => [variable.id, 0]));
  for (const variable of document.variables) for (const value of Object.values(variable.values)) if (value.kind === 'alias') usages.set(value.variableId, (usages.get(value.variableId) ?? 0) + 1);
  for (const element of document.elements) for (const variableId of Object.values(element.variableBindings)) usages.set(variableId, (usages.get(variableId) ?? 0) + 1);

  const duplicateMap = new Map<string, string[]>();
  for (const variable of document.variables) {
    const value = resolveDesignVariableValue(document, variable.id);
    if (!value) continue;
    const key = `${variable.type}:${auditValue(value)}`;
    duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), variable.id]);
  }

  const hardcoded = new Map<string, { property: DesignSystemAudit['hardcodedValues'][number]['property']; value: string; elementIds: string[] }>();
  const addHardcoded = (property: DesignSystemAudit['hardcodedValues'][number]['property'], value: string, element: DesignElement) => {
    if (element.variableBindings[property === 'spacing' ? 'layoutGap' : property]) return;
    const key = `${property}:${value}`;
    const current = hardcoded.get(key) ?? { property, value, elementIds: [] };
    current.elementIds.push(element.id);
    hardcoded.set(key, current);
  };
  for (const element of document.elements) {
    const fill = element.fills.find((paint) => paint.type === 'solid' && paint.visible);
    const stroke = element.strokes.find((paint) => paint.type === 'solid' && paint.visible);
    if (fill?.type === 'solid') addHardcoded('fill', fill.color, element);
    else if (element.fill !== 'transparent') addHardcoded('fill', element.fill, element);
    if (stroke?.type === 'solid') addHardcoded('stroke', stroke.color, element);
    else if (element.stroke !== 'transparent') addHardcoded('stroke', element.stroke, element);
    if (element.cornerRadius) addHardcoded('cornerRadius', String(element.cornerRadius), element);
    if (element.type === 'text') addHardcoded('fontSize', String(element.fontSize), element);
    if (element.layoutMode !== 'none') addHardcoded('spacing', String(element.layoutGap), element);
  }

  const signatures = new Map<string, string[]>();
  for (const element of document.elements.filter((candidate) => (candidate.type === 'frame' || candidate.type === 'group') && !candidate.componentId && !candidate.instanceRootId)) {
    const signature = elementSignature(element, document.elements.filter((child) => child.parentId === element.id));
    signatures.set(signature, [...(signatures.get(signature) ?? []), element.id]);
  }

  return {
    duplicateTokens: [...duplicateMap.entries()].filter(([, ids]) => ids.length > 1).map(([key, variableIds]) => {
      const separator = key.indexOf(':');
      return { type: key.slice(0, separator) as DesignVariableType, value: key.slice(separator + 1), variableIds };
    }),
    unusedVariableIds: [...usages.entries()].filter(([, count]) => count === 0).map(([id]) => id),
    hardcodedValues: [...hardcoded.values()].filter((group) => group.elementIds.length > 1),
    componentCandidates: [...signatures.entries()].filter(([, ids]) => ids.length > 1).map(([signature, elementIds]) => ({ signature, elementIds })),
  };
}

export function designVariableUsageCount(document: DesignDocument, variableId: string): number {
  let count = 0;
  for (const element of document.elements) count += Object.values(element.variableBindings).filter((id) => id === variableId).length;
  for (const variable of document.variables) count += Object.values(variable.values).filter((value) => value.kind === 'alias' && value.variableId === variableId).length;
  return count;
}
