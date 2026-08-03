import type { Edge, Node } from '@xyflow/svelte';

/**
 * Ancora flutuante do handle de um no: o ponto da borda (+ respiro de 4px)
 * mais proximo do centro do vizinho conectado mais perto. Compartilhada por
 * NodeShell (posiciona a bolinha do handle) e OrkestraiEdge (ponta da corda)
 * para que corda e bolinha coincidam sempre — mesmo com varias conexoes no
 * mesmo no (todas as cordas convergem para a unica bolinha).
 */

type NodeLike = Pick<Node, 'id' | 'position'> & {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

type Rect = { cx: number; cy: number; halfW: number; halfH: number; x: number; y: number };

function rectOf(node: NodeLike): Rect {
  const width = node.measured?.width ?? node.width ?? 320;
  const height = node.measured?.height ?? node.height ?? 200;
  return {
    cx: node.position.x + width / 2,
    cy: node.position.y + height / 2,
    halfW: width / 2,
    halfH: height / 2,
    x: node.position.x,
    y: node.position.y,
  };
}

/** Ancora absoluta (coordenadas de flow) do handle flutuante, ou null sem conexoes. */
export function floatingAnchorFor(nodeId: string, nodes: NodeLike[], edges: Pick<Edge, 'source' | 'target'>[]): { x: number; y: number } | null {
  const links = edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  if (!links.length) return null;
  const self = nodes.find((node) => node.id === nodeId);
  if (!self) return null;
  const rect = rectOf(self);

  let best: { dx: number; dy: number } | null = null;
  let bestDist = Infinity;
  for (const link of links) {
    const otherId = link.source === nodeId ? link.target : link.source;
    const other = nodes.find((node) => node.id === otherId);
    if (!other) continue;
    const otherRect = rectOf(other);
    const dx = otherRect.cx - rect.cx;
    const dy = otherRect.cy - rect.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = { dx, dy };
    }
  }
  if (!best || (best.dx === 0 && best.dy === 0)) return null;
  const scale = Math.max(Math.abs(best.dx) / (rect.halfW + 4), Math.abs(best.dy) / (rect.halfH + 4));
  return { x: rect.cx + best.dx / scale, y: rect.cy + best.dy / scale };
}
