<script lang="ts">
  import HeaderIconButton from './HeaderIconButton.svelte';

  import type { NodeProps } from '@xyflow/svelte';
  import { NodeResizer } from '@xyflow/svelte';
  import { GripHorizontal, Settings2, X } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { Slider } from '$lib/components/ui/slider';

  export type ShapeKind = 'rectangle' | 'rounded' | 'ellipse' | 'diamond' | 'arrow';

  export type ShapeStyle = {
    shape?: ShapeKind;
    label?: string;
    fill?: string;
    fillOpacity?: number;
    stroke?: string;
    strokeWidth?: number;
    strokeDash?: boolean;
    textColor?: string;
    fontSize?: number;
    fontWeight?: number;
    textAlign?: 'left' | 'center' | 'right';
  };

  export type ShapeNodeData = {
    title: string;
    payload: ShapeStyle;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onPayloadChange?: (id: string, partial: Record<string, unknown>) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: ShapeNodeData }>();

  const DEFAULTS: Required<Omit<ShapeStyle, 'shape' | 'label'>> = {
    fill: '#7C4DFF',
    fillOpacity: 0.08,
    stroke: '#7C4DFF',
    strokeWidth: 2,
    strokeDash: false,
    textColor: '#e6e6eb',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
  };

  const style = $derived({ ...DEFAULTS, ...data.payload });
  const shape = $derived(data.payload.shape ?? 'rectangle');
  const label = $derived(data.payload.label ?? data.title ?? '');

  const SWATCHES = ['#7C4DFF', '#00BFFF', '#FFC857', '#3dd68c', '#e5484d', '#e6e6eb', '#8b8c96', 'transparent'];

  function patch(partial: Record<string, unknown>) {
    data.onPayloadChange?.(id, partial);
  }

  // -- Painel de estilo flutuante (arrastavel pelo canvas) ---------------------
  let styleOpen = $state(false);
  let panelPos = $state({ x: 0, y: 0 });
  let panelDrag: { startX: number; startY: number; baseX: number; baseY: number } | null = null;

  /** Move o elemento para o <body>: dentro do no o xyflow aplica transform,
      e position:fixed passaria a ser relativo ao no (painel sai da tela). */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function openStylePanel(event: MouseEvent) {
    if (styleOpen) {
      styleOpen = false;
      return;
    }
    styleOpen = true;
    // Nasce perto do clique; depois o usuario arrasta para onde quiser.
    panelPos = { x: Math.min(event.clientX + 14, window.innerWidth - 280), y: Math.max(60, event.clientY - 60) };
  }

  function panelPointerDown(event: PointerEvent) {
    panelDrag = { startX: event.clientX, startY: event.clientY, baseX: panelPos.x, baseY: panelPos.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function panelPointerMove(event: PointerEvent) {
    if (!panelDrag) return;
    panelPos = {
      x: Math.max(8, Math.min(window.innerWidth - 272, panelDrag.baseX + event.clientX - panelDrag.startX)),
      y: Math.max(8, Math.min(window.innerHeight - 120, panelDrag.baseY + event.clientY - panelDrag.startY)),
    };
  }

  function panelPointerUp() {
    panelDrag = null;
  }
  let editing = $state(false);
  let draft = $state('');

  function editLabel() {
    draft = label;
    editing = true;
  }

  function commitLabel() {
    editing = false;
    patch({ label: draft });
  }

  function handleLabelKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitLabel();
    if (event.key === 'Escape') editing = false;
  }

  // -- Geometria em PIXELS reais (sem viewBox escalado: borda/canto nao deformam) --
  let boxWidth = $state(0);
  let boxHeight = $state(0);

  const geom = $derived.by(() => {
    const w = Math.max(0, boxWidth);
    const h = Math.max(0, boxHeight);
    const pad = style.strokeWidth / 2 + 1;
    const x1 = pad;
    const y1 = pad;
    const x2 = Math.max(pad, w - pad);
    const y2 = Math.max(pad, h - pad);
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(1, w / 2 - pad);
    const ry = Math.max(1, h / 2 - pad);
    const radius = Math.min(12, Math.min(w, h) / 4);
    return { w, h, x1, y1, x2, y2, cx, cy, rx, ry, radius };
  });

  const dashArray = $derived(style.strokeDash ? `${style.strokeWidth * 3} ${style.strokeWidth * 2}` : undefined);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="canvas-shape"
  class:selected
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
  ondblclick={editLabel}
>
  <NodeResizer isVisible={selected ?? false} minWidth={60} minHeight={40} onResizeEnd={(_e, params) => data.onResize?.(id, params)} />
  {#if selected}
    <HeaderIconButton label="Remover" class="shape-delete nodrag" side="left" onclick={() => data.onDelete(id)}>
      <X size={12} />
    </HeaderIconButton>

    <button class="shape-settings nodrag" class:style-open={styleOpen} aria-label="Estilo da forma" onclick={openStylePanel}>
      <Settings2 size={12} />
    </button>
  {/if}

  {#if styleOpen}
    <div
      class="style-panel nodrag nowheel"
      use:portal
      style:left="{panelPos.x}px"
      style:top="{panelPos.y}px"
      role="dialog"
      aria-label="Estilo da forma"
    >
      <div
        class="style-panel-grip"
        onpointerdown={panelPointerDown}
        onpointermove={panelPointerMove}
        onpointerup={panelPointerUp}
        role="button"
        tabindex="0"
        aria-label="Arrastar painel"
      >
        <GripHorizontal size={13} />
        <span>Estilo da forma</span>
        <button class="style-panel-close" aria-label="Fechar" onclick={() => (styleOpen = false)}>
          <X size={12} />
        </button>
      </div>
      <div class="pop-grid">
        <span class="pop-label">Tipo</span>
        <Select.Root type="single" value={shape} onValueChange={(value: string) => patch({ shape: value })}>
          <Select.Trigger class="h-7 w-full text-xs" data-slot="select-trigger">
            {{ rectangle: 'Retangulo', rounded: 'Arredondado', ellipse: 'Elipse', diamond: 'Losango', arrow: 'Seta' }[shape]}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="rectangle">Retangulo</Select.Item>
            <Select.Item value="rounded">Arredondado</Select.Item>
            <Select.Item value="ellipse">Elipse</Select.Item>
            <Select.Item value="diamond">Losango</Select.Item>
            <Select.Item value="arrow">Seta</Select.Item>
          </Select.Content>
        </Select.Root>

        <span class="pop-label">Fundo</span>
        <div class="swatches">
          {#each SWATCHES as swatch (swatch)}
            <button
              class="swatch"
              class:active={style.fill === swatch}
              class:transparent={swatch === 'transparent'}
              style:background={swatch === 'transparent' ? 'transparent' : swatch}
              aria-label={`Fundo ${swatch}`}
              onclick={() => patch({ fill: swatch })}
            ></button>
          {/each}
        </div>

        <span class="pop-label">Opacidade</span>
        <Slider
          type="single"
          value={Math.round(style.fillOpacity * 100)}
          min={0}
          max={100}
          step={5}
          onValueChange={(value: number) => patch({ fillOpacity: value / 100 })}
        />

        <span class="pop-label">Borda</span>
        <div class="swatches">
          {#each SWATCHES.filter((swatch) => swatch !== 'transparent') as swatch (swatch)}
            <button
              class="swatch"
              class:active={style.stroke === swatch}
              style:background={swatch}
              aria-label={`Borda ${swatch}`}
              onclick={() => patch({ stroke: swatch })}
            ></button>
          {/each}
        </div>

        <span class="pop-label">Espessura</span>
        <div class="pop-row">
          <Slider
            type="single"
            value={style.strokeWidth}
            min={0}
            max={10}
            step={0.5}
            onValueChange={(value: number) => patch({ strokeWidth: value })}
          />
          <span class="pop-value">{style.strokeWidth}px</span>
        </div>

        <span class="pop-label">Tracejada</span>
        <button class="mini-toggle" class:active={style.strokeDash} onclick={() => patch({ strokeDash: !style.strokeDash })}>
          {style.strokeDash ? 'Sim' : 'Nao'}
        </button>

        <span class="pop-label">Texto</span>
        <div class="swatches">
          {#each ['#e6e6eb', '#8b8c96', '#7C4DFF', '#00BFFF', '#FFC857', '#3dd68c', '#e5484d'] as swatch (swatch)}
            <button
              class="swatch"
              class:active={style.textColor === swatch}
              style:background={swatch}
              aria-label={`Texto ${swatch}`}
              onclick={() => patch({ textColor: swatch })}
            ></button>
          {/each}
        </div>

        <span class="pop-label">Tamanho</span>
        <Input
          class="h-7 w-20 text-xs"
          type="number"
          min={8}
          max={72}
          value={style.fontSize}
          oninput={(event) => patch({ fontSize: Number((event.target as HTMLInputElement).value) || DEFAULTS.fontSize })}
        />

        <span class="pop-label">Peso</span>
        <Select.Root type="single" value={String(style.fontWeight)} onValueChange={(value: string) => patch({ fontWeight: Number(value) })}>
          <Select.Trigger class="h-7 w-full text-xs" data-slot="select-trigger">
            {{ '400': 'Normal', '500': 'Medio', '600': 'Semibold', '700': 'Bold' }[String(style.fontWeight)]}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="400">Normal</Select.Item>
            <Select.Item value="500">Medio</Select.Item>
            <Select.Item value="600">Semibold</Select.Item>
            <Select.Item value="700">Bold</Select.Item>
          </Select.Content>
        </Select.Root>

        <span class="pop-label">Alinhamento</span>
        <div class="pop-row">
          {#each (['left', 'center', 'right'] as const) as align (align)}
            <button
              class="mini-toggle"
              class:active={style.textAlign === align}
              onclick={() => patch({ textAlign: align })}
            >{{ left: 'Esq', center: 'Centro', right: 'Dir' }[align]}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if geom.w > 0 && geom.h > 0}
    <svg width={geom.w} height={geom.h} class="shape-svg">
      {#if shape === 'rectangle' || shape === 'rounded'}
        <rect
          x={geom.x1}
          y={geom.y1}
          width={geom.x2 - geom.x1}
          height={geom.y2 - geom.y1}
          rx={shape === 'rounded' ? geom.radius : 2}
          fill={style.fill === 'transparent' ? 'none' : style.fill}
          fill-opacity={style.fill === 'transparent' ? 0 : style.fillOpacity}
          stroke={style.stroke}
          stroke-width={style.strokeWidth}
          stroke-dasharray={dashArray}
        />
      {:else if shape === 'ellipse'}
        <ellipse
          cx={geom.cx}
          cy={geom.cy}
          rx={geom.rx}
          ry={geom.ry}
          fill={style.fill === 'transparent' ? 'none' : style.fill}
          fill-opacity={style.fill === 'transparent' ? 0 : style.fillOpacity}
          stroke={style.stroke}
          stroke-width={style.strokeWidth}
          stroke-dasharray={dashArray}
        />
      {:else if shape === 'diamond'}
        <polygon
          points={`${geom.cx},${geom.y1} ${geom.x2},${geom.cy} ${geom.cx},${geom.y2} ${geom.x1},${geom.cy}`}
          fill={style.fill === 'transparent' ? 'none' : style.fill}
          fill-opacity={style.fill === 'transparent' ? 0 : style.fillOpacity}
          stroke={style.stroke}
          stroke-width={style.strokeWidth}
          stroke-dasharray={dashArray}
          stroke-linejoin="round"
        />
      {:else if shape === 'arrow'}
        <line x1={geom.x1} y1={geom.cy} x2={geom.x2 - geom.h * 0.18} y2={geom.cy} stroke={style.stroke} stroke-width={style.strokeWidth} stroke-dasharray={dashArray} />
        <polygon
          points={`${geom.x2 - geom.h * 0.28},${geom.cy - geom.h * 0.18} ${geom.x2},${geom.cy} ${geom.x2 - geom.h * 0.28},${geom.cy + geom.h * 0.18}`}
          fill={style.stroke}
        />
      {/if}
    </svg>
  {/if}

  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="shape-label-input nodrag"
      bind:value={draft}
      onkeydown={handleLabelKeydown}
      onblur={commitLabel}
      autofocus
    />
  {:else if label}
    <span
      class="shape-label"
      style:color={style.textColor}
      style:font-size="{style.fontSize}px"
      style:font-weight={style.fontWeight}
      style:justify-content={{ left: 'flex-start', center: 'center', right: 'flex-end' }[style.textAlign]}
      style:text-align={style.textAlign}
    >{label}</span>
  {/if}
</div>

<style>
  .canvas-shape {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .shape-svg {
    position: absolute;
    inset: 0;
    display: block;
  }

  .shape-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 8px 12px;
    pointer-events: none;
    overflow-wrap: break-word;
  }

  .shape-label-input {
    position: absolute;
    inset: 30% 10%;
    border: none;
    outline: none;
    background: transparent;
    text-align: center;
    font-size: 12px;
    color: inherit;
  }

  :global(.shape-delete) {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: #262155;
    color: #8b8c96;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
  }

  :global(.shape-delete):hover {
    color: #e5484d;
  }

  :global(.shape-settings) {
    position: absolute;
    top: -10px;
    left: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: #262155;
    color: #8b8c96;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
  }

  :global(.shape-settings:hover),
  .shape-settings.style-open {
    color: #7c4dff;
    border-color: rgba(124, 77, 255, 0.5);
  }

  .style-panel {
    position: fixed;
    z-index: 60;
    width: 264px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: #1C1946;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
    padding: 10px 12px 12px;
    user-select: none;
  }

  .style-panel-grip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -4px -6px 10px;
    padding: 6px 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    color: #8b8c96;
    font-size: 11px;
    font-weight: 600;
    cursor: grab;
    touch-action: none;
  }

  .style-panel-grip:active {
    cursor: grabbing;
  }

  .style-panel-grip span {
    flex: 1;
  }

  .style-panel-close {
    border: none;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    display: inline-flex;
    padding: 2px;
    border-radius: 5px;
  }

  .style-panel-close:hover {
    color: #e5484d;
    background: rgba(255, 255, 255, 0.07);
  }

  .pop-grid {
    display: grid;
    grid-template-columns: 70px 1fr;
    align-items: center;
    gap: 8px 10px;
  }

  .pop-label {
    font-size: 11px;
    color: #8b8c96;
  }

  .pop-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pop-value {
    font-size: 10px;
    color: #8b8c96;
    min-width: 28px;
    text-align: right;
  }

  .swatches {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    cursor: pointer;
    padding: 0;
  }

  .swatch.transparent {
    background: repeating-conic-gradient(#3a3b46 0% 25%, #1e1f26 0% 50%) 0 0 / 8px 8px;
  }

  .swatch.active {
    outline: 2px solid #fff;
    outline-offset: 1px;
  }

  .mini-toggle {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: #8b8c96;
    font-size: 10px;
    border-radius: 6px;
    padding: 3px 8px;
    cursor: pointer;
  }

  .mini-toggle.active {
    background: rgba(124, 77, 255, 0.2);
    border-color: rgba(124, 77, 255, 0.5);
    color: #e6e6eb;
  }
</style>
