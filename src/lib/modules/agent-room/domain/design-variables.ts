import type {
  DesignBindableProperty,
  DesignDocument,
  DesignElement,
  DesignVariableValue,
} from '../contracts/schemas/designSchemas.js';

export function resolveDesignVariableValue(
  document: DesignDocument,
  variableId: string,
  visited = new Set<string>(),
): Exclude<DesignVariableValue, { kind: 'alias' }> | null {
  if (visited.has(variableId)) return null;
  const variable = document.variables.find((candidate) => candidate.id === variableId);
  if (!variable) return null;
  const collection = document.variableCollections.find((candidate) => candidate.id === variable.collectionId);
  if (!collection) return null;
  const modeId = document.activeVariableModes[collection.id] ?? collection.defaultModeId;
  const value = variable.values[modeId] ?? variable.values[collection.defaultModeId] ?? Object.values(variable.values)[0];
  if (!value) return null;
  if (value.kind !== 'alias') return value;
  return resolveDesignVariableValue(document, value.variableId, new Set(visited).add(variableId));
}

function applyResolvedValue(element: DesignElement, property: DesignBindableProperty, value: Exclude<DesignVariableValue, { kind: 'alias' }>): DesignElement {
  if (property === 'fill' && value.kind === 'color' && element.type !== 'image' && element.type !== 'group') {
    return { ...element, fill: 'transparent', fills: [{ type: 'solid', color: value.value, opacity: 1, visible: true }] };
  }
  if (property === 'stroke' && value.kind === 'color' && element.type !== 'group') {
    return { ...element, stroke: 'transparent', strokes: [{ type: 'solid', color: value.value, opacity: 1, visible: true }] };
  }
  if (property === 'effects' && value.kind === 'effect') return { ...element, effects: value.value };
  if (value.kind !== 'number') return element;
  if (property === 'opacity') return { ...element, opacity: Math.max(0, Math.min(1, value.value)) };
  if (property === 'fontWeight') return { ...element, fontWeight: Math.max(100, Math.min(900, Math.round(value.value / 100) * 100)) };
  if (property === 'fontSize') return { ...element, fontSize: Math.max(4, value.value) };
  if (property === 'cornerRadius') return { ...element, cornerRadius: Math.max(0, value.value) };
  if (property === 'strokeWidth') return { ...element, strokeWidth: Math.max(0, value.value) };
  if (property.startsWith('layout')) return { ...element, [property]: Math.max(0, value.value) };
  return element;
}

export function resolveDesignElementVariables(document: DesignDocument, element: DesignElement): DesignElement {
  let resolved = element;
  for (const [property, variableId] of Object.entries(element.variableBindings) as Array<[DesignBindableProperty, string]>) {
    const value = resolveDesignVariableValue(document, variableId);
    if (value) resolved = applyResolvedValue(resolved, property, value);
  }
  return resolved;
}

export function resolveDesignElements(document: DesignDocument, elements: DesignElement[] = document.elements): DesignElement[] {
  return elements.map((element) => resolveDesignElementVariables(document, element));
}
