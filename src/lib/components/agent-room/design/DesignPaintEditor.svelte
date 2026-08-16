<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as NativeSelect from '$lib/components/ui/native-select';
  import type { DesignPaint } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import * as m from '$lib/paraglide/messages.js';

  let {
    title,
    paints,
    fallbackColor,
    onChange,
  }: {
    title: string;
    paints: DesignPaint[];
    fallbackColor: string;
    onChange: (paints: DesignPaint[]) => void;
  } = $props();

  const visiblePaints = $derived(paints.length ? paints : fallbackColor === 'transparent' ? [] : [{ type: 'solid', color: fallbackColor, opacity: 1, visible: true } satisfies DesignPaint]);

  function defaultPaint(type: DesignPaint['type']): DesignPaint {
    if (type === 'linear-gradient') return {
      type,
      angle: 0,
      stops: [{ offset: 0, color: '#7c5cff', opacity: 1 }, { offset: 1, color: '#33d6c5', opacity: 1 }],
      opacity: 1,
      visible: true,
    };
    if (type === 'radial-gradient') return {
      type,
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.5,
      stops: [{ offset: 0, color: '#ffffff', opacity: 1 }, { offset: 1, color: '#7c5cff', opacity: 1 }],
      opacity: 1,
      visible: true,
    };
    return { type: 'solid', color: fallbackColor === 'transparent' ? '#7c5cff' : fallbackColor, opacity: 1, visible: true };
  }

  function changeType(index: number, type: DesignPaint['type']) {
    onChange(visiblePaints.map((paint, paintIndex) => paintIndex === index ? defaultPaint(type) : paint));
  }

  function changePaint(index: number, changes: Partial<DesignPaint>) {
    onChange(visiblePaints.map((paint, paintIndex) => paintIndex === index ? { ...paint, ...changes } as DesignPaint : paint));
  }

  function changeStop(index: number, stopIndex: number, color: string) {
    const paint = visiblePaints[index];
    if (paint.type === 'solid') return;
    const stops = paint.stops.map((stop, current) => current === stopIndex ? { ...stop, color } : stop);
    changePaint(index, { stops } as Partial<DesignPaint>);
  }
</script>

<section class="space-y-2">
  <div class="flex items-center justify-between gap-2">
    <h3 class="font-semibold text-[var(--app-text-soft)]">{title}</h3>
    <Button variant="ghost" size="icon-sm" class="size-6" aria-label={title === m['design.fill']() ? m['design.add_fill']() : m['design.add_stroke']()} onclick={() => onChange([...visiblePaints, defaultPaint('solid')])}><Plus size={12} /></Button>
  </div>
  {#each visiblePaints as paint, index (`${paint.type}-${index}`)}
    <div class="space-y-2 border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-2">
      <div class="flex items-center gap-1.5">
        <NativeSelect.Root class="h-7 min-w-0 flex-1 text-[10px]" value={paint.type} onchange={(event: Event) => changeType(index, (event.currentTarget as HTMLSelectElement).value as DesignPaint['type'])} aria-label={title}>
          <NativeSelect.Option value="solid">{m['design.solid']()}</NativeSelect.Option>
          <NativeSelect.Option value="linear-gradient">{m['design.linear_gradient']()}</NativeSelect.Option>
          <NativeSelect.Option value="radial-gradient">{m['design.radial_gradient']()}</NativeSelect.Option>
        </NativeSelect.Root>
        <Button variant="ghost" size="icon-sm" class="size-7" aria-label={m['design.remove_paint']()} onclick={() => onChange(visiblePaints.filter((_, paintIndex) => paintIndex !== index))}><Minus size={12} /></Button>
      </div>
      {#if paint.type === 'solid'}
        <div class="grid grid-cols-[1fr_62px] gap-2">
          <Input type="color" class="h-7 w-full p-1" value={paint.color} onchange={(event: Event) => changePaint(index, { color: (event.currentTarget as HTMLInputElement).value })} />
          <Input type="number" class="h-7" min="0" max="100" value={Math.round(paint.opacity * 100)} onchange={(event: Event) => changePaint(index, { opacity: Math.max(0, Math.min(1, Number((event.currentTarget as HTMLInputElement).value) / 100)) })} />
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          <Input type="color" class="h-7 w-full p-1" value={paint.stops[0].color} onchange={(event: Event) => changeStop(index, 0, (event.currentTarget as HTMLInputElement).value)} />
          <Input type="color" class="h-7 w-full p-1" value={paint.stops.at(-1)!.color} onchange={(event: Event) => changeStop(index, paint.stops.length - 1, (event.currentTarget as HTMLInputElement).value)} />
          {#if paint.type === 'linear-gradient'}
            <label class="col-span-2 grid grid-cols-[1fr_72px] items-center gap-2"><span class="text-[var(--app-text-muted)]">{m['design.angle']()}</span><Input class="h-7" type="number" value={paint.angle} onchange={(event: Event) => changePaint(index, { angle: Number((event.currentTarget as HTMLInputElement).value) })} /></label>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</section>
