<script lang="ts">
  import type { DesignElement } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

  let {
    elements,
    selectedId = null,
  }: {
    elements: DesignElement[];
    selectedId?: string | null;
  } = $props();

  const visibleElements = $derived(elements.filter((element) => element.visible).sort((a, b) => a.order - b.order));
</script>

{#each visibleElements as element (element.id)}
  <g
    data-design-element={element.id}
    opacity={element.opacity}
    transform={`rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`}
  >
    {#if element.type === 'ellipse'}
      <ellipse
        cx={element.x + element.width / 2}
        cy={element.y + element.height / 2}
        rx={element.width / 2}
        ry={element.height / 2}
        fill={element.fill}
        stroke={element.stroke}
        stroke-width={element.strokeWidth}
      />
    {:else if element.type === 'text'}
      <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="transparent" />
      <text
        x={element.textAlign === 'center' ? element.x + element.width / 2 : element.textAlign === 'right' ? element.x + element.width : element.x}
        y={element.y + element.fontSize}
        fill={element.fill}
        font-family="Inter Variable, Inter, sans-serif"
        font-size={element.fontSize}
        font-weight={element.fontWeight}
        text-anchor={element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start'}
      >{element.text || element.name}</text>
    {:else}
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={element.cornerRadius}
        fill={element.fill}
        stroke={element.stroke}
        stroke-width={element.strokeWidth}
      />
      {#if element.type === 'frame'}
        <text
          x={element.x}
          y={element.y - 8}
          fill="currentColor"
          font-family="Inter Variable, Inter, sans-serif"
          font-size="12"
          font-weight="600"
        >{element.name}</text>
      {/if}
    {/if}
    {#if selectedId === element.id}
      <rect
        x={element.x - 2}
        y={element.y - 2}
        width={element.width + 4}
        height={element.height + 4}
        rx={Math.max(0, element.cornerRadius + 2)}
        fill="none"
        stroke="var(--app-accent)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
      />
    {/if}
  </g>
{/each}
