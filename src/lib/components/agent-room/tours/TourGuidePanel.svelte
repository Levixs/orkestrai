<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as m from '$lib/paraglide/messages.js';
  import { Check, CircleCheck, Loader2, Play, X } from '@lucide/svelte';
  import { tourState, tourNext, tourBack, tourCompleteCurrent, tourRunAction, stopTour } from './engine.svelte.js';

  const step = $derived(tourState.tour?.steps[tourState.stepIndex] ?? null);
  const total = $derived(tourState.tour?.steps.length ?? 0);
  const completed = $derived((id: string) => tourState.autoCompleted.has(id));
</script>

{#if tourState.tour && step}
  <aside class="tour-panel nodrag nowheel" role="complementary" aria-label={m['tour.panel_aria']()}>
    {#if tourState.done}
      <div class="tour-done">
        <CircleCheck size={20} aria-hidden="true" />
        <h3>{m['tour.completed_title']()}</h3>
        <p>{m['tour.completed_body']()}</p>
        <div class="tour-actions">
          <Button size="sm" variant="outline" onclick={stopTour}>{m['tour.finish']()}</Button>
        </div>
      </div>
    {:else}
      <header class="tour-head">
        <span class="tour-kicker">{tourState.tour.title}</span>
        <button class="tour-close" aria-label={m['tour.quit']()} onclick={stopTour}>
          <X size={13} />
        </button>
      </header>
      <div class="tour-progress" aria-hidden="true">
        {#each tourState.tour.steps as s, index (s.id)}
          <span
            class="tour-dot"
            class:done={completed(s.id) || index < tourState.stepIndex}
            class:current={index === tourState.stepIndex}
          ></span>
        {/each}
      </div>
      <span class="tour-step-of">{m['tour.step_of']({ current: String(tourState.stepIndex + 1), total: String(total) })}</span>
      <h3 class="tour-title">{step.title}</h3>
      <p class="tour-body">{step.body}</p>
      {#if tourState.error}
        <p class="tour-error">{tourState.error}</p>
      {/if}
      <div class="tour-actions">
        {#if tourState.stepIndex > 0}
          <Button size="sm" variant="ghost" onclick={tourBack}>{m['tour.back']()}</Button>
        {/if}
        <span class="tour-spacer"></span>
        {#if step.action}
          <Button size="sm" disabled={tourState.busy || (tourState.actionDoneFor === step.id && !step.check)} onclick={() => step.action && tourRunAction(step.action)}>
            {#if tourState.busy}<Loader2 size={13} class="tour-spin" aria-hidden="true" />{m['tour.doing']()}{:else}<Play size={13} aria-hidden="true" />{m['tour.do_for_me']()}{/if}
          </Button>
        {:else if step.check}
          <Button size="sm" variant="outline" onclick={tourCompleteCurrent}>
            <Check size={13} aria-hidden="true" />{m['tour.done_step']()}
          </Button>
        {:else}
          <Button size="sm" onclick={tourNext}>{m['tour.next']()}</Button>
        {/if}
      </div>
    {/if}
  </aside>
{/if}

<style>
  .tour-panel {
    position: absolute;
    left: 16px;
    bottom: 16px;
    z-index: 30;
    width: 340px;
    max-width: calc(100vw - 40px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(91, 141, 239, 0.35);
    background: rgba(26, 23, 66, 0.96);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
  }

  .tour-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .tour-kicker {
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #7de5ff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-close {
    display: inline-flex;
    padding: 3px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
  }

  .tour-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }

  .tour-progress {
    display: flex;
    gap: 5px;
  }

  .tour-dot {
    width: 16px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  .tour-dot.done {
    background: #3dd68c;
  }

  .tour-dot.current {
    background: #5b8def;
  }

  .tour-step-of {
    font-size: 10.5px;
    color: #6d6d78;
    font-variant-numeric: tabular-nums;
  }

  .tour-title {
    margin: 0;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: #e6e6eb;
    text-wrap: balance;
  }

  .tour-body {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: #a9aab3;
    text-wrap: pretty;
  }

  .tour-error {
    margin: 0;
    font-size: 11px;
    color: #ff9c9f;
  }

  .tour-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .tour-spacer {
    flex: 1;
  }

  .tour-done {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    color: #3dd68c;
  }

  .tour-done h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #e6e6eb;
  }

  .tour-done p {
    margin: 0;
    font-size: 12px;
    color: #a9aab3;
    line-height: 1.6;
  }

  .tour-spin {
    animation: tour-spin 1s linear infinite;
  }

  @keyframes tour-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tour-spin {
      animation: none;
    }
  }
</style>
