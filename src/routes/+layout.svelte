<script lang="ts">
  import '../app.css';
  import { Toaster, toast, Seo } from '@beeblock/svelar/ui';
  import { getCsrfToken, registerToast } from '@beeblock/svelar/http';
  import { onMount } from 'svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import UpdateNotifier from '$lib/components/agent-room/UpdateNotifier.svelte';

  // Wire apiFetch error handling to the toast UI
  registerToast((variant: string, title: string, opts?: any) => {
    const fn = (toast as any)[variant] ?? toast;
    fn(title, opts);
  });

  let { children } = $props();

  onMount(() => {
    // Cmd/Ctrl+K global: de qualquer tela, abre a busca da documentacao.
    const docsSearchShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (location.pathname === '/docs') return; // a pagina trata localmente
      event.preventDefault();
      location.assign('/docs?search=1');
    };
    window.addEventListener('keydown', docsSearchShortcut);

    const syncCsrfToken = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if ((form.method || 'GET').toUpperCase() !== 'POST') return;

      const token = getCsrfToken();
      if (!token) return;

      let field = form.querySelector<HTMLInputElement>('input[name="_csrf"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = '_csrf';
        form.prepend(field);
      }
      field.value = token;
    };

    document.addEventListener('submit', syncCsrfToken, true);
    return () => {
      window.removeEventListener('keydown', docsSearchShortcut);
      document.removeEventListener('submit', syncCsrfToken, true);
    };
  });
</script>

<!-- Site-wide SEO defaults — override per page with another <Seo> -->
<Seo
  title="Orkestrai Agent Room"
  description="Orquestrador local para conversa entre usuario, Codex e Claude."
  ogSiteName="Orkestrai Agent Room"
  ogType="website"
/>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<!-- Tooltip.Provider global: qualquer pagina pode usar Tooltip shadcn -->
<Tooltip.Provider>
  {@render children()}
</Tooltip.Provider>

<Toaster position="bottom-right" />
<UpdateNotifier />

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>
