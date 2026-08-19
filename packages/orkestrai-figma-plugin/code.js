figma.showUI(__html__, { width: 380, height: 620, themeColors: true });

let connection = null;
let activeDesignNodeId = null;
const imageCache = new Map();

function message(type, payload = {}) {
  figma.ui.postMessage({ type, ...payload });
}

function checkedConnection(value) {
  const url = new URL(String(value.apiUrl || '').trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!loopback || !['http:', 'https:'].includes(url.protocol)) throw new Error('Orkestrai must use a loopback URL.');
  if (!String(value.token || '').trim()) throw new Error('Workspace token is missing.');
  return {
    apiUrl: url.origin,
    token: String(value.token).trim(),
    designNodeId: String(value.designNodeId || '').trim(),
    targetPageId: String(value.targetPageId || '').trim(),
  };
}

async function request(path, init = {}) {
  if (!connection) throw new Error('Connect this plugin to Orkestrai first.');
  const response = await fetch(`${connection.apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${connection.token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Orkestrai returned ${response.status}.`);
  return payload.data;
}

async function requestBinary(path) {
  if (!connection) throw new Error('Connect this plugin to Orkestrai first.');
  const response = await fetch(`${connection.apiUrl}${path}`, {
    headers: { authorization: `Bearer ${connection.token}` },
  });
  if (!response.ok) throw new Error(`Could not load the Orkestrai asset (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function decodeUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 16_384));
  }
  return decodeURIComponent(escape(binary));
}

function rgba(value, opacity = 1) {
  const hex = String(value || '').replace('#', '');
  if (![3, 6, 8].includes(hex.length)) return null;
  const expanded = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const number = Number.parseInt(expanded.slice(0, 6), 16);
  if (!Number.isFinite(number)) return null;
  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255,
    a: expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 * opacity : opacity,
  };
}

function paintList(value, fallback) {
  const values = Array.isArray(value) && value.length ? value : fallback && fallback !== 'transparent' ? [{ type: 'solid', color: fallback }] : [];
  return values.flatMap((paint) => {
    if (!paint || paint.visible === false) return [];
    const opacity = Number(paint.opacity ?? 1);
    if (paint.type === 'solid') {
      const color = rgba(paint.color, opacity);
      return color ? [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a }] : [];
    }
    if (paint.type === 'linear-gradient' || paint.type === 'radial-gradient') {
      const stops = (paint.stops || []).flatMap((stop) => {
        const color = rgba(stop.color, Number(stop.opacity ?? 1) * opacity);
        return color ? [{ position: Math.max(0, Math.min(1, Number(stop.offset))), color }] : [];
      });
      if (stops.length < 2) return [];
      if (paint.type === 'radial-gradient') {
        return [{
          type: 'GRADIENT_RADIAL',
          gradientStops: stops,
          gradientTransform: [[1, 0, Number(paint.centerX ?? 0.5) - 0.5], [0, 1, Number(paint.centerY ?? 0.5) - 0.5]],
        }];
      }
      const radians = Number(paint.angle || 0) * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      return [{
        type: 'GRADIENT_LINEAR',
        gradientStops: stops,
        gradientTransform: [[cosine, sine, 0.5 - cosine / 2 - sine / 2], [-sine, cosine, 0.5 + sine / 2 - cosine / 2]],
      }];
    }
    return [];
  });
}

function effectList(value) {
  return (Array.isArray(value) ? value : []).flatMap((effect) => {
    if (!effect || effect.visible === false) return [];
    if (effect.type === 'drop-shadow' || effect.type === 'inner-shadow') {
      const color = rgba(effect.color || '#00000040');
      if (!color) return [];
      return [{
        type: effect.type === 'drop-shadow' ? 'DROP_SHADOW' : 'INNER_SHADOW',
        color,
        offset: { x: Number(effect.x || 0), y: Number(effect.y || 0) },
        radius: Math.max(0, Number(effect.blur || 0)),
        spread: Number(effect.spread || 0),
        visible: true,
        blendMode: 'NORMAL',
      }];
    }
    if (effect.type === 'layer-blur' || effect.type === 'background-blur') {
      return [{ type: effect.type === 'layer-blur' ? 'LAYER_BLUR' : 'BACKGROUND_BLUR', radius: Math.max(0, Number(effect.blur || 0)), visible: true }];
    }
    return [];
  });
}

function pathData(element) {
  const subpaths = element.pathSubpaths?.length ? element.pathSubpaths : element.pathPoints?.length ? [element.pathPoints] : [];
  return subpaths.map((points) => points.map((point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    if (previous.outX != null || point.inX != null) {
      return `C ${previous.outX ?? previous.x} ${previous.outY ?? previous.y} ${point.inX ?? point.x} ${point.inY ?? point.y} ${point.x} ${point.y}`;
    }
    return `L ${point.x} ${point.y}`;
  }).join(' ') + (element.pathClosed ? ' Z' : '')).join(' ');
}

function variableType(variable) {
  if (variable.type === 'color') return 'COLOR';
  if (variable.type === 'boolean') return 'BOOLEAN';
  if (variable.type === 'string') return 'STRING';
  if (['spacing', 'radius', 'font-size', 'font-weight', 'line-height', 'opacity', 'breakpoint'].includes(variable.type)) return 'FLOAT';
  return null;
}

function variableValue(value, variables) {
  if (!value) return null;
  if (value.kind === 'color') return rgba(value.value);
  if (value.kind === 'number' || value.kind === 'string' || value.kind === 'boolean') return value.value;
  if (value.kind === 'alias' && variables.has(value.variableId)) return figma.variables.createVariableAlias(variables.get(value.variableId));
  return null;
}

async function importDesignResources(document) {
  const variablesById = new Map();
  const modesById = new Map();
  const collectionsById = new Map();
  const sourceCollections = (document.variableCollections || []).filter((collection) => collection.figmaSource?.nodeId !== 'styles');
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const source of sourceCollections) {
    const name = `Orkestrai / ${document.name} / ${source.name}`;
    const existing = localCollections.find((collection) => collection.name === name);
    const collection = existing || figma.variables.createVariableCollection(name);
    collectionsById.set(source.id, collection);
    const defaultMode = source.modes.find((mode) => mode.id === source.defaultModeId) || source.modes[0];
    if (defaultMode) {
      collection.renameMode(collection.defaultModeId, defaultMode.name);
      modesById.set(defaultMode.id, collection.defaultModeId);
    }
    for (const mode of source.modes.filter((candidate) => candidate.id !== defaultMode?.id)) {
      const existingMode = collection.modes.find((candidate) => candidate.name === mode.name);
      modesById.set(mode.id, existingMode?.modeId || collection.addMode(mode.name));
    }
  }
  const localVariables = await figma.variables.getLocalVariablesAsync();
  for (const source of document.variables || []) {
    const resolvedType = variableType(source);
    const collection = collectionsById.get(source.collectionId);
    if (!resolvedType || !collection) continue;
    const existing = localVariables.find((variable) => variable.resolvedType === resolvedType && variable.name === source.name && variable.variableCollectionId === collection.id);
    const variable = existing || figma.variables.createVariable(source.name, collection, resolvedType);
    variable.description = source.description || '';
    variablesById.set(source.id, variable);
  }
  for (const source of document.variables || []) {
    const variable = variablesById.get(source.id);
    if (!variable) continue;
    for (const [sourceModeId, sourceValue] of Object.entries(source.values || {})) {
      const modeId = modesById.get(sourceModeId);
      const value = variableValue(sourceValue, variablesById);
      if (modeId && value !== null) variable.setValueForMode(modeId, value);
    }
  }

  const styleCollectionIds = new Set((document.variableCollections || []).filter((collection) => collection.figmaSource?.nodeId === 'styles').map((collection) => collection.id));
  for (const source of (document.variables || []).filter((variable) => styleCollectionIds.has(variable.collectionId))) {
    const collection = document.variableCollections.find((candidate) => candidate.id === source.collectionId);
    const value = source.values[collection?.defaultModeId];
    const name = `Orkestrai/${document.name}/${source.name}`;
    if (source.type === 'color' && value?.kind === 'color') {
      const style = (await figma.getLocalPaintStylesAsync()).find((candidate) => candidate.name === name) || figma.createPaintStyle();
      style.name = name;
      style.description = source.description || '';
      style.paints = paintList([{ type: 'solid', color: value.value }], null);
    } else if (source.type === 'effect' && value?.kind === 'effect') {
      const style = (await figma.getLocalEffectStylesAsync()).find((candidate) => candidate.name === name) || figma.createEffectStyle();
      style.name = name;
      style.description = source.description || '';
      style.effects = effectList(value.value);
    } else if (source.type === 'font-size' && value?.kind === 'number') {
      const style = (await figma.getLocalTextStylesAsync()).find((candidate) => candidate.name === name) || figma.createTextStyle();
      style.name = name;
      style.description = source.description || '';
      style.fontSize = Math.max(4, Number(value.value));
    }
  }
}

async function applyVisual(node, element, parentElement = null) {
  if ('name' in node) node.name = element.name || node.name;
  if ('visible' in node) node.visible = element.visible !== false;
  if ('locked' in node) node.locked = Boolean(element.locked);
  if ('opacity' in node) node.opacity = Math.max(0, Math.min(1, Number(element.opacity ?? 1)));
  if ('rotation' in node) node.rotation = Number(element.rotation || 0);
  if ('resize' in node) node.resize(Math.max(1, Number(element.width || 1)), Math.max(1, Number(element.height || 1)));
  if ('x' in node) node.x = Number(element.x || 0) - Number(parentElement?.x || 0);
  if ('y' in node) node.y = Number(element.y || 0) - Number(parentElement?.y || 0);
  if ('fills' in node) {
    node.fills = paintList(element.fills, element.fill);
    if (element.assetId) {
      let imageHash = imageCache.get(element.assetId);
      if (!imageHash) {
        const bytes = await requestBinary(`/api/agent-room/bridge/designs/${encodeURIComponent(activeDesignNodeId || connection.designNodeId)}/figma/assets/${encodeURIComponent(element.assetId)}`);
        imageHash = figma.createImage(bytes).hash;
        imageCache.set(element.assetId, imageHash);
      }
      node.fills = [{ type: 'IMAGE', imageHash, scaleMode: element.imageFit === 'contain' ? 'FIT' : element.imageFit === 'fill' ? 'FILL' : 'CROP' }];
    }
  }
  if ('strokes' in node) {
    node.strokes = paintList(element.strokes, element.stroke);
    node.strokeWeight = Math.max(0, Number(element.strokeWidth || 0));
  }
  if ('effects' in node) node.effects = effectList(element.effects);
  if ('blendMode' in node) node.blendMode = String(element.blendMode || 'normal').replace('-', '_').toUpperCase();
  if ('isMask' in node) node.isMask = Boolean(element.isMask);
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number') node.cornerRadius = Math.max(0, Number(element.cornerRadius || 0));
  if (node.type === 'TEXT') {
    const family = 'Inter';
    const style = Number(element.fontWeight || 400) >= 600 ? 'Bold' : 'Regular';
    await figma.loadFontAsync({ family, style }).catch(() => figma.loadFontAsync({ family, style: 'Regular' }));
    node.fontName = { family, style };
    node.characters = String(element.text || '');
    node.fontSize = Math.max(4, Number(element.fontSize || 16));
    node.textAlignHorizontal = element.textAlign === 'center' ? 'CENTER' : element.textAlign === 'right' ? 'RIGHT' : 'LEFT';
  }
  if ('layoutMode' in node && ['frame', 'group'].includes(element.type)) {
    node.layoutMode = element.layoutMode === 'horizontal' ? 'HORIZONTAL' : element.layoutMode === 'vertical' ? 'VERTICAL' : 'NONE';
    if (node.layoutMode !== 'NONE') {
      node.itemSpacing = Math.max(0, Number(element.layoutGap || 0));
      node.paddingTop = Math.max(0, Number(element.layoutPaddingTop || 0));
      node.paddingRight = Math.max(0, Number(element.layoutPaddingRight || 0));
      node.paddingBottom = Math.max(0, Number(element.layoutPaddingBottom || 0));
      node.paddingLeft = Math.max(0, Number(element.layoutPaddingLeft || 0));
    }
    node.clipsContent = Boolean(element.clipContent);
  }
}

function createNode(element, componentRoots, componentNodes) {
  if (element.instanceRootId === element.id && element.instanceOf && componentNodes.has(element.instanceOf)) {
    return componentNodes.get(element.instanceOf).createInstance();
  }
  if (componentRoots.has(element.id)) return figma.createComponent();
  if (element.type === 'frame' || element.type === 'group') return figma.createFrame();
  if (element.type === 'ellipse') return figma.createEllipse();
  if (element.type === 'text') return figma.createText();
  if (element.type === 'path') {
    const node = figma.createVector();
    const data = pathData(element);
    if (data) node.vectorPaths = [{ windingRule: element.fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO', data }];
    return node;
  }
  return figma.createRectangle();
}

async function importDocument(document) {
  activeDesignNodeId = document.nodeId;
  let resourcesImported = true;
  try {
    await importDesignResources(document);
  } catch {
    resourcesImported = false;
  }
  const page = figma.createPage();
  page.name = `Orkestrai · ${document.name}`;
  await figma.setCurrentPageAsync(page);
  const componentRoots = new Map((document.components || []).map((component) => [component.rootElementId, component.id]));
  const componentNodes = new Map();
  const elements = [...(document.elements || [])]
    .filter((element) => !element.instanceRootId || element.instanceRootId === element.id)
    .sort((left, right) => left.order - right.order);
  const created = new Map();
  const pending = [...elements];
  let passes = 0;
  while (pending.length && passes++ < elements.length + 1) {
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const element = pending[index];
      if (element.parentId && !created.has(element.parentId)) continue;
      if (element.instanceRootId === element.id && element.instanceOf && !componentNodes.has(element.instanceOf)) continue;
      const node = createNode(element, componentRoots, componentNodes);
      const parent = element.parentId ? created.get(element.parentId) : page;
      parent.appendChild(node);
      const parentElement = element.parentId ? elements.find((candidate) => candidate.id === element.parentId) : null;
      await applyVisual(node, element, parentElement);
      created.set(element.id, node);
      if (componentRoots.has(element.id)) componentNodes.set(componentRoots.get(element.id), node);
      pending.splice(index, 1);
    }
  }
  for (const set of document.componentSets || []) {
    const components = (document.components || []).filter((component) => component.setId === set.id).map((component) => componentNodes.get(component.id)).filter(Boolean);
    if (components.length < 2) continue;
    const containerElement = elements.find((element) => element.figmaSource?.nodeId === set.figmaSource?.nodeId);
    const containerNode = containerElement ? created.get(containerElement.id) : null;
    const targetParent = containerNode?.parent || components[0].parent || page;
    const variantSet = figma.combineAsVariants(components, targetParent);
    variantSet.name = set.name;
    if (containerNode && containerNode !== variantSet) {
      variantSet.x = containerNode.x;
      variantSet.y = containerNode.y;
      created.set(containerElement.id, variantSet);
      containerNode.remove();
    }
  }
  const roots = elements.filter((element) => !element.parentId).map((element) => created.get(element.id)).filter(Boolean);
  figma.currentPage.selection = roots;
  if (roots.length) figma.viewport.scrollAndZoomIntoView(roots);
  return { count: created.size, resourcesImported };
}

async function synchronizeCurrentFile(document) {
  activeDesignNodeId = document.nodeId;
  const fileKey = String(figma.fileKey || '');
  const link = (document.figmaLinks || []).find((candidate) => candidate.fileKey === fileKey);
  if (!link) throw new Error('This Orkestrai design is not linked to the current Figma file.');
  const pending = new Set(link.pendingPushNodeIds || []);
  if (!pending.size) return { updated: 0, nodeIds: [], linkId: link.id };
  const elements = new Map((document.elements || []).map((element) => [element.id, element]));
  let updated = 0;
  const nodeIds = [];
  for (const [figmaNodeId, elementId] of Object.entries(link.mappings || {})) {
    if (!pending.has(figmaNodeId)) continue;
    const element = elements.get(elementId);
    const node = await figma.getNodeByIdAsync(figmaNodeId);
    if (!element || !node || node.type === 'DOCUMENT' || node.type === 'PAGE') continue;
    const parentElement = element.parentId ? elements.get(element.parentId) : null;
    await applyVisual(node, element, parentElement);
    updated += 1;
    nodeIds.push(figmaNodeId);
  }
  return { updated, nodeIds, linkId: link.id };
}

function base64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks = [];
  let chunk = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    chunk += alphabet[first >> 2];
    chunk += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    chunk += second === undefined ? '=' : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    chunk += third === undefined ? '=' : alphabet[third & 63];
    if (chunk.length >= 32_768) { chunks.push(chunk); chunk = ''; }
  }
  if (chunk) chunks.push(chunk);
  return chunks.join('');
}

function imageMimeType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'GIF8') return 'image/gif';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return 'image/png';
}

async function selectionPayload(includeImages = false) {
  const selection = figma.currentPage.selection;
  if (!selection.length) throw new Error('Select one or more layers in Figma first.');
  const sourceNodes = [];
  for (const node of selection) sourceNodes.push(await node.exportAsync({ format: 'JSON_REST_V1' }));
  const imageAssets = {};
  if (includeImages) {
    const hashes = new Set();
    const visit = (node) => {
      if ('fills' in node && Array.isArray(node.fills)) {
        for (const fill of node.fills) if (fill?.type === 'IMAGE' && fill.imageHash) hashes.add(fill.imageHash);
      }
      if ('children' in node) for (const child of node.children) visit(child);
    };
    selection.forEach(visit);
    let totalBytes = 0;
    for (const hash of hashes) {
      const image = figma.getImageByHash(hash);
      if (!image) continue;
      const bytes = await image.getBytesAsync();
      totalBytes += bytes.byteLength;
      if (bytes.byteLength > 20 * 1024 * 1024 || totalBytes > 40 * 1024 * 1024) throw new Error('Selected image assets exceed the 40 MB bridge limit.');
      imageAssets[hash] = { mimeType: imageMimeType(bytes), base64: base64(bytes) };
    }
  }
  return { sourceNodes, imageAssets };
}

figma.ui.onmessage = async (event) => {
  try {
    if (event.type === 'connect') {
      connection = checkedConnection(event.connection);
      await figma.clientStorage.setAsync('orkestrai.connection', connection);
      const designs = await request('/api/agent-room/bridge/designs');
      message('connected', { connection, designs, fileKey: figma.fileKey, fileName: figma.root.name });
      return;
    }
    if (event.type === 'refresh') {
      const designs = await request('/api/agent-room/bridge/designs');
      message('designs', { designs });
      return;
    }
    if (event.type === 'pull') {
      const document = await request(`/api/agent-room/bridge/designs/${encodeURIComponent(event.nodeId)}`);
      const result = await importDocument(document);
      message('done', { key: result.resourcesImported ? 'created_layers' : 'created_layers_without_resources', count: result.count });
      return;
    }
    if (event.type === 'sync') {
      const document = await request(`/api/agent-room/bridge/designs/${encodeURIComponent(event.nodeId)}`);
      const result = await synchronizeCurrentFile(document);
      if (result.nodeIds.length) {
        await request(`/api/agent-room/bridge/designs/${encodeURIComponent(event.nodeId)}/figma/push`, {
          method: 'PATCH',
          body: JSON.stringify({ linkId: result.linkId, baseRevision: document.revision, nodeIds: result.nodeIds }),
        });
      }
      message('done', { key: result.updated ? 'updated_layers' : 'no_pending', count: result.updated });
      return;
    }
    if (event.type === 'push-selection') {
      if (!figma.fileKey) throw new Error('Save this Figma file before linking its selection to Orkestrai.');
      const { sourceNodes, imageAssets } = await selectionPayload(true);
      const document = await request(`/api/agent-room/bridge/designs/${encodeURIComponent(event.nodeId)}`);
      const result = await request(`/api/agent-room/bridge/designs/${encodeURIComponent(event.nodeId)}/figma/selection`, {
        method: 'POST',
        body: JSON.stringify({
          baseRevision: document.revision,
          fileKey: figma.fileKey,
          fileName: figma.root.name,
          sourceNodes,
          imageAssets,
          targetPageId: document.activePageId,
          summary: 'Import Figma selection through Orkestrai Design Bridge',
        }),
      });
      message('done', { key: 'imported_layers', count: result.counts.elements });
      return;
    }
    if (event.type === 'copy-svg') {
      const selection = figma.currentPage.selection;
      if (selection.length !== 1) throw new Error('Select exactly one layer to copy as SVG.');
      const bytes = await selection[0].exportAsync({ format: 'SVG', svgOutlineText: false, svgIdAttribute: true });
      message('clipboard', { text: decodeUtf8(bytes), format: 'svg' });
      return;
    }
    if (event.type === 'copy-json') {
      message('clipboard', { text: JSON.stringify((await selectionPayload()).sourceNodes, null, 2), format: 'json' });
      return;
    }
    if (event.type === 'import-svg') {
      const svg = String(event.svg || '').trim();
      if (!/^<svg[\s>]/i.test(svg) || svg.length > 5_000_000) throw new Error('Paste a valid SVG under 5 MB.');
      const node = figma.createNodeFromSvg(svg);
      node.x = figma.viewport.center.x - node.width / 2;
      node.y = figma.viewport.center.y - node.height / 2;
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      message('done', { key: 'svg_imported' });
    }
  } catch (error) {
    message('error', { error: error instanceof Error ? error.message : String(error) });
  }
};

figma.clientStorage.getAsync('orkestrai.connection').then((saved) => {
  if (saved) {
    try { connection = checkedConnection(saved); } catch { connection = null; }
  }
  message('ready', { connection, fileKey: figma.fileKey, fileName: figma.root.name });
});
