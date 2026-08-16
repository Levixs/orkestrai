<script lang="ts">
  import type { DesignElement } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import { designPathData } from '$lib/modules/agent-room/domain/design-geometry.js';

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
  <text
    x={element.textAlign === 'center' ? element.x + element.width / 2 : element.textAlign === 'right' ? element.x + element.width : element.x}
    y={element.y + element.fontSize}
    {fill}
    fill-opacity={fillOpacity}
    {stroke}
    stroke-opacity={strokeOpacity}
    stroke-width={strokeWidth}
    font-family="Inter Variable, Inter, sans-serif"
    font-size={element.fontSize}
    font-weight={element.fontWeight}
    text-anchor={element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start'}
    pointer-events={pointerEvents}
  >{element.text || element.name}</text>
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
