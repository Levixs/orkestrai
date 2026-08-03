<script lang="ts">
  import { EdgeLabel, useEdges, useNodes, type EdgeProps } from '@xyflow/svelte';
  import { X } from '@lucide/svelte';
  import { floatingAnchorFor } from './floating-anchor.js';

  /**
   * Aresta do Orkestrai: corda com fisica verlet (segmentos com gravidade e
   * restricao de comprimento). As duas pontas convergem para a bolinha do
   * handle flutuante de cada no (floatingAnchorFor) — com varias conexoes no
   * mesmo no, todas as cordas saem do mesmo ponto, como no Maestri.
   */
  let { id, source, target, data, selected }: EdgeProps = $props();

  const nodesStore = useNodes();
  const edgesStore = useEdges();

  type RopePoint = { x: number; y: number; px: number; py: number };

  const SEGMENTS = 14;
  const GRAVITY = 0.35;
  const ITERATIONS = 5;

  let rope: RopePoint[] = $state([]);
  let rafId: number | null = null;
  let lastAnchorSig = '';
  let initialized = false;

  function centerOf(nodeId: string): { x: number; y: number } | null {
    const node = nodesStore.current.find((item) => item.id === nodeId);
    if (!node) return null;
    const width = node.measured?.width ?? node.width ?? 320;
    const height = node.measured?.height ?? node.height ?? 200;
    return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
  }

  type Box = { x: number; y: number; halfW: number; halfH: number };

  function boxOf(nodeId: string): Box | null {
    const node = nodesStore.current.find((item) => item.id === nodeId);
    if (!node) return null;
    const width = node.measured?.width ?? node.width ?? 320;
    const height = node.measured?.height ?? node.height ?? 200;
    return { x: node.position.x + width / 2, y: node.position.y + height / 2, halfW: width / 2, halfH: height / 2 };
  }

  function anchors(): { ax: number; ay: number; bx: number; by: number } | null {
    const a = floatingAnchorFor(source, nodesStore.current, edgesStore.current) ?? centerOf(source);
    const b = floatingAnchorFor(target, nodesStore.current, edgesStore.current) ?? centerOf(target);
    if (!a || !b) return null;
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  }

  /**
   * Repulsao das caixas dos nos: pontos da corda que caem dentro de um no
   * (inflado pela margem) sao empurrados para a borda mais proxima — a corda
   * contorna a caixa em vez de sumir embaixo dela.
   */
  const BOX_MARGIN = 12;

  function pushOutOfBox(point: RopePoint, box: Box) {
    const dx = point.x - box.x;
    const dy = point.y - box.y;
    const limitX = box.halfW + BOX_MARGIN;
    const limitY = box.halfH + BOX_MARGIN;
    if (Math.abs(dx) >= limitX || Math.abs(dy) >= limitY) return;
    // Projeta para a face mais proxima do retangulo inflado.
    const pushX = limitX - Math.abs(dx);
    const pushY = limitY - Math.abs(dy);
    if (pushX < pushY) {
      point.x = box.x + Math.sign(dx || 1) * limitX;
    } else {
      point.y = box.y + Math.sign(dy || 1) * limitY;
    }
  }

  function initRope(ax: number, ay: number, bx: number, by: number) {
    const points: RopePoint[] = [];
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const t = i / SEGMENTS;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t + Math.sin(t * Math.PI) * 30;
      points.push({ x, y, px: x, py: y });
    }
    rope = points;
  }

  function simulate(): boolean {
    const current = anchors();
    if (!current || rope.length === 0) return false;
    const sourceBox = boxOf(source);
    const targetBox = boxOf(target);

    // Verlet: gravidade + inercia
    let movement = 0;
    for (const point of rope) {
      const vx = (point.x - point.px) * 0.98;
      const vy = (point.y - point.py) * 0.98;
      movement += Math.abs(vx) + Math.abs(vy);
      point.px = point.x;
      point.py = point.y;
      point.x += vx;
      point.y += vy + GRAVITY;
    }

    const segLength = Math.hypot(current.bx - current.ax, current.by - current.ay) / SEGMENTS * 1.06;

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      // Pinos nas ancoras (flutuantes)
      rope[0].x = current.ax;
      rope[0].y = current.ay;
      rope[SEGMENTS].x = current.bx;
      rope[SEGMENTS].y = current.by;

      for (let i = 0; i < SEGMENTS; i += 1) {
        const p1 = rope[i];
        const p2 = rope[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - segLength) / dist;
        const offsetX = dx * 0.5 * diff;
        const offsetY = dy * 0.5 * diff;
        if (i !== 0) {
          p1.x += offsetX;
          p1.y += offsetY;
        }
        if (i + 1 !== SEGMENTS) {
          p2.x -= offsetX;
          p2.y -= offsetY;
        }
      }

      // Corda contorna as caixas dos nos (exceto os pinos, que ficam na borda)
      for (let i = 1; i < SEGMENTS; i += 1) {
        if (sourceBox) pushOutOfBox(rope[i], sourceBox);
        if (targetBox) pushOutOfBox(rope[i], targetBox);
      }
    }

    rope = [...rope];
    return movement > 0.05;
  }

  let settleFrames = 0;

  function loop() {
    const active = simulate();
    // Para a simulacao quando a corda estabiliza — o $effect religa o rAF
    // assim que uma ancora se move (no arrastado, redimensionado etc).
    settleFrames = active ? 0 : settleFrames + 1;
    if (settleFrames > 45) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  $effect(() => {
    const current = anchors();
    if (!current) return;
    const sig = `${Math.round(current.ax)},${Math.round(current.ay)},${Math.round(current.bx)},${Math.round(current.by)}`;
    if (sig !== lastAnchorSig) {
      lastAnchorSig = sig;
      if (!initialized) {
        initialized = true;
        initRope(current.ax, current.ay, current.bx, current.by);
      }
      if (rafId === null) rafId = requestAnimationFrame(loop);
    }
  });

  $effect(() => {
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };
  });

  const path = $derived.by(() => {
    if (rope.length === 0) return { path: '', midX: 0, midY: 0 };
    const pathD = rope.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
    const mid = rope[Math.floor(SEGMENTS / 2)];
    return { path: pathD, midX: mid.x, midY: mid.y };
  });

  const talking = $derived(Boolean((data as { talking?: boolean } | undefined)?.talking));
  const pinned = $derived(Boolean((data as { pinned?: boolean } | undefined)?.pinned));
  const stroke = $derived(talking ? '#8ec98e' : pinned ? '#7C4DFF' : '#4A4580');

  // O X so aparece com hover na corda (ou no proprio botao) ou com a edge
  // selecionada/pinned — escondido ele nao intercepta cliques do canvas.
  let hovered = $state(false);

  function remove() {
    (data as { onRemove?: (edgeId: string) => void } | undefined)?.onRemove?.(id);
  }
</script>

{#if rope.length}
  <g class="orkestrai-edge" class:talking>
    <path
      d={path.path}
      fill="none"
      stroke="transparent"
      stroke-width="26"
      style="pointer-events: stroke; cursor: pointer"
      role="button"
      aria-label="Conexao"
      tabindex="-1"
      onpointerenter={() => (hovered = true)}
      onpointerleave={() => (hovered = false)}
    />
    <path
      {id}
      d={path.path}
      fill="none"
      stroke={stroke}
      stroke-width={talking ? 2.4 : 1.6}
      stroke-dasharray="7 5"
      stroke-linecap="round"
      class="edge-line"
      class:animated={talking}
      style="pointer-events: none"
    />
    <EdgeLabel x={Math.round(path.midX)} y={Math.round(path.midY)} selectEdgeOnClick>
      <button
        class="edge-delete"
        class:pinned
        class:visible={hovered || pinned || selected}
        aria-label="Remover conexao"
        onpointerenter={() => (hovered = true)}
        onpointerleave={() => (hovered = false)}
        onclick={(event) => {
          event.stopPropagation();
          remove();
        }}
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </EdgeLabel>
  </g>
{/if}

<style>
  .edge-line {
    transition: stroke 120ms ease;
  }

  .edge-line.animated {
    animation: dash-flow 0.9s linear infinite;
  }

  @keyframes dash-flow {
    to {
      stroke-dashoffset: -12;
    }
  }

  .edge-delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(35, 36, 43, 0.92);
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    color: #b9bac4;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
    padding: 0;
  }

  .edge-delete.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .edge-delete:hover {
    background: #e5484d;
    border-color: #e5484d;
    color: #fff;
    transform: scale(1.1);
  }
</style>
