import { describe, expect, it } from 'vitest';
import {
  extractCssDesignTokens,
  extractDesignCodeComponent,
  extractTailwindDesignTokens,
} from '$lib/modules/agent-room/application/services/DesignCodebaseService.js';

describe('Design codebase extraction', () => {
  it('extracts CSS variables and keeps aliases type compatible', () => {
    const tokens = extractCssDesignTokens(`
      :root {
        --color-brand: #6750a4;
        --color-action: var(--color-brand);
        --space-md: 1rem;
      }
    `, 'src/app.css');

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'color/brand', type: 'color', value: '#6750a4' }),
      expect.objectContaining({ name: 'color/action', type: 'color', aliasKey: 'src/app.css:color-brand' }),
      expect.objectContaining({ name: 'space/md', type: 'spacing', value: 16 }),
    ]));
  });

  it('parses static Tailwind values without treating unsupported colors as native hex', () => {
    const tokens = extractTailwindDesignTokens(`
      export default {
        theme: { extend: {
          colors: { brand: '#112233', modern: 'oklch(0.6 0.2 250)' },
          spacing: { card: '24px' }
        } }
      };
    `, 'tailwind.config.ts');

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'color/brand', type: 'color', value: '#112233' }),
      expect.objectContaining({ name: 'color/modern', type: 'string' }),
      expect.objectContaining({ name: 'space/card', type: 'spacing', value: 24 }),
    ]));
  });

  it('finds Svelte, React, and Vue component contracts', () => {
    expect(extractDesignCodeComponent(
      `<script lang="ts">let { label, disabled = false } = $props<{ label: string; disabled?: boolean }>();</script>`,
      'src/Button.svelte',
    )).toMatchObject({ framework: 'svelte', name: 'Button', props: ['label', 'disabled'] });
    expect(extractDesignCodeComponent(
      `interface CardProps { title: string; elevated?: boolean } export function Card(props: CardProps) { return <div /> }`,
      'src/Card.tsx',
    )).toMatchObject({ framework: 'react', name: 'Card', props: ['title', 'elevated'] });
    expect(extractDesignCodeComponent(
      `<script setup lang="ts">defineProps<{ value: string; active?: boolean }>()</script>`,
      'src/Badge.vue',
    )).toMatchObject({ framework: 'vue', name: 'Badge', props: ['value', 'active'] });
  });
});
