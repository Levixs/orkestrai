<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Component } from 'svelte';
  import {
    ArrowLeft, BookOpen, Cable, FolderPlus, GitBranch, History, Layers, Link2, MessageSquare,
    PlayCircle, Repeat, Rocket, Search, SquareKanban, SquareTerminal, StickyNote, Users, Workflow,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as m from '$lib/paraglide/messages.js';
  import { localeState } from '$lib/i18n/locale.svelte.js';
  import { DOCS_PT } from '$lib/i18n/docs/pt-BR.js';
  import { DOCS_EN } from '$lib/i18n/docs/en.js';
  import { DOCS_ES } from '$lib/i18n/docs/es.js';

  // Conteudo longo (topicos, casos de uso, quickstart, changelog) vive em
  // catalogs TS por locale (src/lib/i18n/docs/) — mesmo padrao dos tours.
  const DOCS_CATALOGS = { 'pt-BR': DOCS_PT, en: DOCS_EN, es: DOCS_ES };
  const catalog = $derived(DOCS_CATALOGS[localeState.current] ?? DOCS_PT);

  // Icones ficam na pagina (componentes nao sao serializaveis no catalogo).
  const SECTION_ICONS: Record<string, Component> = {
    workspaces: Layers,
    agentes: SquareTerminal,
    roles: Users,
    times: Cable,
    notas: StickyNote,
    tarefas: SquareKanban,
    imagens: StickyNote,
    presets: Layers,
    fluxos: Workflow,
    'sem-medo': BookOpen,
    conexoes: Link2,
    andares: GitBranch,
    rotinas: Repeat,
    portal: Workflow,
    mcp: Cable,
    cli: MessageSquare,
    atalhos: BookOpen,
  };

  const USECASE_ICONS: Record<string, Component> = {
    'leader-team': Users,
    'watch-24-7': Repeat,
    'parallel-features': GitBranch,
    'visual-qa': Workflow,
    'research-summary': Search,
    'inbox-files': FolderPlus,
    'cross-review': Cable,
    'deploy-sentinel': Rocket,
    'framework-preset': Layers,
    'approval-pipeline': Workflow,
    'chained-flows': Workflow,
    'mcp-tools': Cable,
  };

  const quickstart = $derived(catalog.quickstart);
  const sections = $derived(catalog.sections.map((section) => ({ ...section, icon: SECTION_ICONS[section.id] ?? BookOpen })));
  const useCases = $derived(catalog.useCases.map((useCase) => ({ ...useCase, icon: USECASE_ICONS[useCase.id] ?? Cable })));
  const changelog = $derived(catalog.changelog);

  onMount(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    // Atalho global (Cmd/Ctrl+K de qualquer tela): abre a paleta ja focada.
    if (new URLSearchParams(location.search).has('search')) {
      history.replaceState(null, '', '/docs');
      openPalette();
    }
  });

  function rewatchOnboarding() {
    // Forca a apresentacao mesmo com workspaces existentes.
    location.href = '/canvas?onboarding=1';
  }

  let query = $state('');

  const filtered = $derived.by(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sections;
    return sections.filter((section) => `${section.title} ${section.body}`.toLowerCase().includes(term));
  });

  // -- Paleta de busca (Cmd/Ctrl+K): cobre topicos, casos de uso e changelog --
  type PaletteItem = { kind: 'topico' | 'caso'; title: string; body: string; href: string };
  let paletteOpen = $state(false);
  let paletteSelected = $state(0);
  let paletteInput = $state<HTMLInputElement | null>(null);

  const paletteItems = $derived.by((): PaletteItem[] => {
    const term = query.trim().toLowerCase();
    const items: PaletteItem[] = [
      { kind: 'topico', title: m['docs.quickstart_title'](), body: quickstart.join(' '), href: '#comece' },
      ...useCases.map((useCase) => ({ kind: 'caso' as const, title: useCase.title, body: useCase.body, href: '#casos-de-uso' })),
      ...sections.map((section) => ({ kind: 'topico' as const, title: section.title, body: section.body, href: `#${section.id}` })),
      { kind: 'topico', title: m['docs.changelog_title'](), body: changelog.map((entry) => `${entry.date} ${entry.items.join(' ')}`).join(' '), href: '#changelog' },
    ];
    if (!term) return items;
    return items.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(term));
  });

  $effect(() => {
    void query;
    paletteSelected = 0;
  });

  function openPalette() {
    paletteOpen = true;
    paletteSelected = 0;
    void tick().then(() => paletteInput?.focus());
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (paletteOpen) paletteOpen = false;
      else openPalette();
    }
  }

  function handlePaletteKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      paletteOpen = false;
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      paletteSelected = Math.min(paletteSelected + 1, paletteItems.length - 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      paletteSelected = Math.max(paletteSelected - 1, 0);
      return;
    }
    if (event.key === 'Enter' && paletteItems[paletteSelected]) {
      event.preventDefault();
      goToItem(paletteItems[paletteSelected]);
    }
  }

  function goToItem(item: PaletteItem) {
    paletteOpen = false;
    location.hash = item.href;
    document.querySelector(item.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

</script>

<svelte:head>
  <title>{m['docs.page_title']()}</title>
  <meta name="theme-color" content="#0D0B2E" />
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="docs-page">
  <header class="docs-header">
    <Button variant="ghost" size="sm" href="/canvas">
      <ArrowLeft size={15} aria-hidden="true" />
      {m['docs.back_canvas']()}
    </Button>
    <h1>{m['docs.heading']()}</h1>
    <span class="docs-spacer"></span>
    <Button variant="outline" size="sm" onclick={rewatchOnboarding}>
      <PlayCircle size={15} aria-hidden="true" />
      {m['docs.rewatch']()}
    </Button>
  </header>

  <div class="docs-layout">
    <aside class="docs-nav">
      <label class="docs-search">
        <Search size={14} aria-hidden="true" />
        <input bind:value={query} placeholder={m['ph.filter_topics']()} aria-label={m['ph.filter_topics']()} autocomplete="off" spellcheck="false" />
        <kbd class="search-kbd">⌘K</kbd>
      </label>
      <nav aria-label={m['docs.nav_aria']()}>
        <a href="#comece" class="nav-link">{m['docs.quickstart_title']()}</a>
        <a href="#casos-de-uso" class="nav-link">{m['docs.usecases_title']()}</a>
        {#each filtered as section (section.id)}
          <a href={`#${section.id}`} class="nav-link">{section.title}</a>
        {/each}
        <a href="#changelog" class="nav-link">{m['docs.changelog_title']()}</a>
        {#if !filtered.length}
          <span class="nav-empty">{m['docs.nav_empty']({ query })}</span>
        {/if}
      </nav>
    </aside>

    <div class="docs-content">
      <article class="doc-card quickstart" id="comece">
        <header>
          <span class="icon-chip"><Rocket size={15} aria-hidden="true" /></span>
          <h2>{m['docs.quickstart_title']()}</h2>
        </header>
        <ol>
          {#each quickstart as step, index (index)}
            <li><span class="step-num">{index + 1}</span><span>{step}</span></li>
          {/each}
        </ol>
      </article>

      <section class="usecases" id="casos-de-uso">
        <h2 class="usecases-title">{m['docs.usecases_title']()}</h2>
        <div class="usecases-grid">
          {#each useCases as useCase (useCase.id)}
            <article class="doc-card usecase-card">
              <header>
                <span class="icon-chip"><useCase.icon size={15} aria-hidden="true" /></span>
                <h3>{useCase.title}</h3>
              </header>
              <p>{useCase.body}</p>
              <footer>
                {#each useCase.tags as tag (tag)}
                  <span class="usecase-tag">{tag}</span>
                {/each}
              </footer>
            </article>
          {/each}
        </div>
      </section>

      {#each filtered as section (section.id)}
        <article class="doc-card" id={section.id}>
          <header>
            <span class="icon-chip"><section.icon size={15} aria-hidden="true" /></span>
            <h2>{section.title}</h2>
            <a href={`#${section.id}`} class="anchor-link" aria-label={m['docs.anchor_aria']({ title: section.title })}>#</a>
          </header>
          <p>{section.body}</p>
        </article>
      {/each}

      <article class="doc-card" id="changelog">
        <header>
          <span class="icon-chip"><History size={15} aria-hidden="true" /></span>
          <h2>{m['docs.changelog_title']()}</h2>
          <a href="#changelog" class="anchor-link" aria-label={m['docs.anchor_aria']({ title: m['docs.changelog_title']() })}>#</a>
        </header>
        <div class="changelog-list">
          {#each changelog as entry (entry.date)}
            <section class="changelog-entry">
              <h3 class="changelog-date">{entry.date}</h3>
              <ul>
                {#each entry.items as item, index (index)}
                  <li>{item}</li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      </article>
    </div>
  </div>

  {#if paletteOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette-overlay" onclick={() => (paletteOpen = false)} onkeydown={handlePaletteKeydown}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="palette-card" onclick={(event) => event.stopPropagation()} role="dialog" aria-label={m['docs.palette_aria']()}>
        <label class="palette-input-row">
          <Search size={15} aria-hidden="true" />
          <input
            bind:this={paletteInput}
            bind:value={query}
            placeholder={m['ph.search_docs']()}
            aria-label={m['docs.palette_aria']()}
            autocomplete="off"
            spellcheck="false"
            onkeydown={handlePaletteKeydown}
          />
          <kbd class="search-kbd">esc</kbd>
        </label>
        <ul class="palette-list" role="listbox">
          {#each paletteItems as item, index (item.href + item.title)}
            <li>
              <button
                class="palette-item"
                class:selected={index === paletteSelected}
                role="option"
                aria-selected={index === paletteSelected}
                onclick={() => goToItem(item)}
                onmousemove={() => (paletteSelected = index)}
              >
                <span class="palette-kind">{item.kind === 'caso' ? m['docs.kind_usecase']() : m['docs.kind_topic']()}</span>
                <span class="palette-title">{item.title}</span>
              </button>
            </li>
          {:else}
            <li class="palette-empty">{m['docs.palette_empty']({ query: query.trim() })}</li>
          {/each}
        </ul>
        <p class="palette-hint">{m['docs.palette_hint']()}</p>
      </div>
    </div>
  {/if}
</main>

<style>
  .docs-page {
    min-height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
    padding: 24px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
    scroll-behavior: smooth;
  }

  .docs-page > * {
    width: min(1200px, 100%);
  }

  .docs-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .docs-header h1 {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
    text-wrap: balance;
  }

  .docs-spacer {
    flex: 1;
  }

  .docs-layout {
    display: grid;
    grid-template-columns: 230px 1fr;
    gap: 28px;
    align-items: start;
  }

  /* ---- Navegacao lateral ---------------------------------------------- */
  .docs-nav {
    position: sticky;
    top: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .docs-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: #1A1742;
    color: #8b8c96;
    transition: border-color 140ms ease;
  }

  .docs-search:focus-within {
    border-color: rgba(91, 141, 239, 0.55);
  }

  .docs-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 12.5px;
  }

  .docs-search input:focus-visible {
    outline: none;
  }

  .docs-nav nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-link {
    display: block;
    padding: 6px 10px;
    border-radius: 8px;
    color: #a9aab3;
    font-size: 12.5px;
    text-decoration: none;
    line-height: 1.35;
    transition: color 120ms ease, background 120ms ease;
  }

  .nav-link:hover {
    color: #e6e6eb;
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-link:focus-visible {
    outline: 2px solid #7C4DFF;
    outline-offset: 1px;
  }

  .nav-empty {
    padding: 6px 10px;
    font-size: 12px;
    color: #6d6d78;
  }

  /* ---- Conteudo -------------------------------------------------------- */
  .docs-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .doc-card {
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    background: #1A1742;
    padding: 18px 20px;
    scroll-margin-top: 20px;
    transition: border-color 160ms ease;
  }

  .doc-card:target {
    border-color: rgba(91, 141, 239, 0.5);
  }

  .doc-card header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .icon-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(91, 141, 239, 0.12);
    color: #7DE5FF;
    flex-shrink: 0;
  }

  .doc-card h2 {
    flex: 1;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    letter-spacing: -0.005em;
    margin: 0;
    color: #e6e6eb;
    text-wrap: balance;
  }

  .anchor-link {
    color: #4a4a55;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    padding: 2px 6px;
    border-radius: 6px;
    transition: color 120ms ease, background 120ms ease;
  }

  .anchor-link:hover {
    color: #7DE5FF;
    background: rgba(91, 141, 239, 0.12);
  }

  .anchor-link:focus-visible {
    outline: 2px solid #7C4DFF;
    outline-offset: 1px;
  }

  .doc-card p {
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
    color: #a9aab3;
    text-wrap: pretty;
    overflow-wrap: break-word;
  }

  /* ---- Quickstart ------------------------------------------------------ */
  .quickstart {
    border-color: rgba(91, 141, 239, 0.28);
    background: linear-gradient(180deg, rgba(91, 141, 239, 0.06), rgba(91, 141, 239, 0.015));
  }

  .quickstart ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  /* ---- Casos de uso --------------------------------------------------- */
  .usecases {
    display: flex;
    flex-direction: column;
    gap: 12px;
    scroll-margin-top: 20px;
  }

  .usecases-title {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 600;
    margin: 8px 2px 0;
    color: #e5e1ff;
  }

  .usecases-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .usecase-card h3 {
    flex: 1;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    margin: 0;
    color: #e6e6eb;
    text-wrap: balance;
  }

  .usecase-card p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.65;
    color: #a9aab3;
    text-wrap: pretty;
  }

  .usecase-card footer {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 10px;
  }

  .usecase-tag {
    font-size: 10px;
    font-weight: 500;
    color: #7de5ff;
    background: rgba(0, 191, 255, 0.1);
    border-radius: 7px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .quickstart li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    line-height: 1.6;
    color: #c9cad2;
    text-wrap: pretty;
  }

  .step-num {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 50%;
    background: rgba(91, 141, 239, 0.16);
    color: #7DE5FF;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* ---- Changelog -------------------------------------------------------- */
  .changelog-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .changelog-date {
    margin: 0 0 6px;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #7de5ff;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .changelog-entry ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .changelog-entry li {
    font-size: 12.5px;
    line-height: 1.6;
    color: #a9aab3;
    text-wrap: pretty;
  }

  @media (max-width: 900px) {
    .docs-layout {
      grid-template-columns: 1fr;
    }

    .docs-nav {
      position: static;
      max-height: none;
    }
  }

  /* ---- Paleta de busca (Cmd/Ctrl+K) --------------------------------------- */
  .search-kbd {
    flex-shrink: 0;
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #6d6d78;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 1px 5px;
  }

  .palette-overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(8, 7, 24, 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
  }

  .palette-card {
    width: min(560px, calc(100vw - 40px));
    background: #1a1742;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .palette-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    color: #8b8c96;
  }

  .palette-input-row input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 14px;
  }

  .palette-list {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 46vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }

  .palette-item.selected {
    background: rgba(91, 141, 239, 0.16);
  }

  .palette-kind {
    flex-shrink: 0;
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #7de5ff;
    background: rgba(0, 191, 255, 0.1);
    border-radius: 6px;
    padding: 2px 7px;
  }

  .palette-title {
    font-size: 13px;
    color: #e6e6eb;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .palette-empty {
    padding: 14px 12px;
    font-size: 12px;
    color: #6d6d78;
  }

  .palette-hint {
    margin: 0;
    padding: 8px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 10.5px;
    color: #6d6d78;
  }

  @media (prefers-reduced-motion: reduce) {
    .doc-card,
    .nav-link,
    .anchor-link,
    .docs-search {
      transition: none;
    }
  }
</style>
