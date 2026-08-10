<script lang="ts">
  import '../app.css';
  import { Toaster, toast, Seo } from '@beeblock/svelar/ui';
  import { getCsrfToken, registerToast } from '@beeblock/svelar/http';
  import { onMount } from 'svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import UpdateNotifier from '$lib/components/agent-room/UpdateNotifier.svelte';
  import GlobalDictation from '$lib/components/agent-room/GlobalDictation.svelte';
  import { initLocaleRuntime, localeState } from '$lib/i18n/locale.svelte.js';
  import { appSettingsStore } from '$lib/components/agent-room/app-settings.svelte.js';
  import { applyAppTheme } from '$lib/components/agent-room/app-themes.js';

  type DesktopMenuBridge = {
    setMenuLocale?: (locale: string) => Promise<string>;
    onMenuAction?: (callback: (action: string) => void) => () => void;
  };

  const desktopMenu = typeof window !== 'undefined'
    ? (window as unknown as { orkestraiDesktop?: DesktopMenuBridge }).orkestraiDesktop
    : undefined;

  $effect(() => {
    void desktopMenu?.setMenuLocale?.(localeState.current);
  });

  // Wire apiFetch error handling to the toast UI
  registerToast((variant: string, title: string, opts?: any) => {
    const fn = (toast as any)[variant] ?? toast;
    fn(title, opts);
  });

  let { children } = $props();
  let localeReady = $state(false);

  $effect(() => {
    applyAppTheme(appSettingsStore.values);
  });

  onMount(() => {
    // Nao libere interacao antes da preferencia inicial chegar: caso contrario
    // o remount de locale pode descartar um clique feito durante o startup.
    void initLocaleRuntime().finally(() => {
      applyAppTheme(appSettingsStore.values);
      localeReady = true;
    });
    // Cmd/Ctrl+K global: de qualquer tela, abre a busca da documentacao.
    const docsSearchShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (location.pathname === '/docs') return; // a pagina trata localmente
      event.preventDefault();
      location.assign('/docs?search=1');
    };
    window.addEventListener('keydown', docsSearchShortcut);

    const canvasActions = new Set(['new-workspace', 'presets', 'floors', 'roles', 'usage', 'ports', 'command-palette']);
    const unsubscribeMenu = desktopMenu?.onMenuAction?.((action) => {
      if (action === 'canvas') location.assign('/canvas');
      else if (action === 'providers') location.assign('/providers');
      else if (action === 'settings') location.assign('/settings');
      else if (action === 'docs') location.assign('/docs');
      else if (action === 'changelog') location.assign('/docs#changelog');
      else if (canvasActions.has(action)) {
        if (location.pathname !== '/canvas') {
          sessionStorage.setItem('orkestrai.menu-action', action);
          location.assign('/canvas');
        } else {
          window.dispatchEvent(new CustomEvent('orkestrai:menu-action', { detail: action }));
        }
      }
    });

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
      unsubscribeMenu?.();
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
  <!-- #key no locale: ao trocar de idioma, a arvore inteira remonta e todo
       m.*() reavalia — i18n reativo garantido por construcao. -->
  {#if localeReady}
    {#key localeState.current}
      {@render children()}
      <GlobalDictation />
    {/key}
  {/if}
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
