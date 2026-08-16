<script lang="ts">
  import type { DesignElement } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import { designPathData, designTextLines } from '$lib/modules/agent-room/domain/design-geometry.js';

  let {
    element,
    fill = 'none',
    fillOpacity = 1,
    stroke = 'none',
    strokeOpacity = 1,
    strokeWidth = 0,
    assetUrl = null,
    pointerEvents = 'visiblePainted',
  }: {
    element: DesignElement;
    fill?: string;
    fillOpacity?: number;
    stroke?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
    assetUrl?: string | null;
    pointerEvents?: string;
  } = $props();

</script>

{#if element.type === 'ellipse'}
  <ellipse
    cx={element.x + element.width / 2}
    cy={element.y + element.height / 2}
    rx={element.width / 2}
    ry={element.height / 2}
    {fill}
    fill-opacity={fillOpacity}
    {stroke}
    stroke-opacity={strokeOpacity}
    stroke-width={strokeWidth}
    pointer-events={pointerEvents}
  />
{:else if element.type === 'path'}
  <path
    d={designPathData(element)}
    {fill}
    fill-opacity={fillOpacity}
    fill-rule={element.fillRule}
    {stroke}
    stroke-opacity={strokeOpacity}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    pointer-events={pointerEvents}
  />
{:else if element.type === 'text'}
  <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="transparent" pointer-events={pointerEvents} />
  <svg x={element.x} y={element.y} width={element.width} height={element.height} overflow="hidden" pointer-events="none">
    <text
      x={element.textAlign === 'center' ? element.width / 2 : element.textAlign === 'right' ? element.width : 0}
      {fill}
      fill-opacity={fillOpacity}
      {stroke}
      stroke-opacity={strokeOpacity}
      stroke-width={strokeWidth}
      font-family="Inter Variable, Inter, sans-serif"
      font-size={element.fontSize}
      font-weight={element.fontWeight}
      text-anchor={element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start'}
    >
      {#each designTextLines(element.text || element.name, element.width, element.fontSize, element.fontWeight) as line, index}
        <tspan x={element.textAlign === 'center' ? element.width / 2 : element.textAlign === 'right' ? element.width : 0} y={element.fontSize + index * element.fontSize * 1.2}>{line}</tspan>
      {/each}
    </text>
  </svg>
{:else if element.type === 'image' && assetUrl}
  {#if element.cornerRadius > 0}
    <defs>
      <clipPath id={`design-image-clip-${element.id}`} clipPathUnits="userSpaceOnUse">
        <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={element.cornerRadius} />
      </clipPath>
    </defs>
  {/if}
  <rect
    x={element.x}
    y={element.y}
    width={element.width}
    height={element.height}
    rx={element.cornerRadius}
    {fill}
    fill-opacity={fillOpacity}
    {stroke}
    stroke-opacity={strokeOpacity}
    stroke-width={strokeWidth}
    pointer-events={pointerEvents}
  />
  <image
    href={assetUrl}
    x={element.x}
    y={element.y}
    width={element.width}
    height={element.height}
    preserveAspectRatio={element.imageFit === 'fill' ? 'none' : element.imageFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
    pointer-events={pointerEvents}
    clip-path={element.cornerRadius > 0 ? `url(#design-image-clip-${element.id})` : undefined}
  />
{:else}
  <rect
    x={element.x}
    y={element.y}
    width={element.width}
    height={element.height}
    rx={element.cornerRadius}
    {fill}
    fill-opacity={fillOpacity}
    {stroke}
    stroke-opacity={strokeOpacity}
    stroke-width={strokeWidth}
    pointer-events={pointerEvents}
  />
{/if}
