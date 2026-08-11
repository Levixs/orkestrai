<script lang="ts">
  import { AppWindow, CheckCircle2, FileText, LayoutGrid, LifeBuoy, Maximize2, Minus, PanelTop, RefreshCw, Search, Settings, X } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as m from '$lib/paraglide/messages.js';

  type DesktopBridge = { runMenuCommand?: (action: string) => Promise<unknown> };
  const desktop = (window as unknown as { orkestraiDesktop?: DesktopBridge }).orkestraiDesktop;

  function run(action: string) {
    void desktop?.runMenuCommand?.(action);
  }
</script>

<header class="desktop-titlebar" data-dictation-ignore>
  <div class="brand"><img src="/brand/icon.svg" alt="" width="17" height="17" /><strong>Orkestrai</strong></div>

  <nav aria-label={m['desktop.menu_aria']()}>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="menu-trigger">{m['desktop.workspace']()}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="titlebar-menu">
        <DropdownMenu.Item onclick={() => run('canvas')}><AppWindow size={14} />{m['desktop.canvas']()}<DropdownMenu.Shortcut>Ctrl+1</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('providers')}><PanelTop size={14} />{m['desktop.providers']()}<DropdownMenu.Shortcut>Ctrl+2</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('new-workspace')}>{m['desktop.new_workspace']()}<DropdownMenu.Shortcut>Ctrl+N</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('presets')}>{m['desktop.presets']()}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => run('organize')}><LayoutGrid size={14} />{m['desktop.organize']()}<DropdownMenu.Shortcut>Ctrl+Shift+T</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('floors')}>{m['desktop.floors']()}</DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('roles')}>{m['desktop.roles']()}</DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('usage')}>{m['desktop.usage']()}</DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('ports')}>{m['desktop.ports']()}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => run('settings')}><Settings size={14} />{m['desktop.settings']()}<DropdownMenu.Shortcut>Ctrl+,</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('check-updates')}><RefreshCw size={14} />{m['desktop.check_updates']()}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="menu-trigger">{m['desktop.edit']()}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="titlebar-menu">
        <DropdownMenu.Item onclick={() => run('undo')}>{m['desktop.undo']()}<DropdownMenu.Shortcut>Ctrl+Z</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('redo')}>{m['desktop.redo']()}<DropdownMenu.Shortcut>Ctrl+Y</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => run('cut')}>{m['desktop.cut']()}<DropdownMenu.Shortcut>Ctrl+X</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('copy')}>{m['desktop.copy']()}<DropdownMenu.Shortcut>Ctrl+C</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('paste')}>{m['desktop.paste']()}<DropdownMenu.Shortcut>Ctrl+V</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('select-all')}>{m['desktop.select_all']()}<DropdownMenu.Shortcut>Ctrl+A</DropdownMenu.Shortcut></DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="menu-trigger">{m['desktop.view']()}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="titlebar-menu">
        <DropdownMenu.Item onclick={() => run('command-palette')}><Search size={14} />{m['desktop.command_palette']()}<DropdownMenu.Shortcut>Ctrl+P</DropdownMenu.Shortcut></DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => run('reload')}>{m['desktop.reload']()}</DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('fullscreen')}>{m['desktop.fullscreen']()}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="menu-trigger">{m['desktop.window']()}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="titlebar-menu">
        <DropdownMenu.Item onclick={() => run('minimize')}><Minus size={14} />{m['desktop.minimize']()}</DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('toggle-maximize')}><Maximize2 size={14} />{m['desktop.maximize']()}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => run('close')}><X size={14} />{m['desktop.close']()}<DropdownMenu.Shortcut>Alt+F4</DropdownMenu.Shortcut></DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="menu-trigger">{m['desktop.help']()}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="titlebar-menu">
        <DropdownMenu.Item onclick={() => run('docs')}><FileText size={14} />{m['desktop.docs']()}</DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => run('changelog')}><CheckCircle2 size={14} />{m['desktop.changelog']()}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => run('report-issue')}><LifeBuoy size={14} />{m['desktop.report_issue']()}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </nav>

  <div class="window-controls" aria-hidden="true"></div>
</header>

<style>
  .desktop-titlebar {
    height: 36px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 138px;
    align-items: center;
    background: var(--app-sidebar);
    color: var(--app-text-soft);
    user-select: none;
    -webkit-app-region: drag;
  }

  .brand {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    color: var(--app-text);
  }

  .brand strong {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
  }

  nav,
  .window-controls {
    height: 100%;
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }

  :global(.menu-trigger) {
    height: 28px;
    border: 0;
    border-radius: 5px;
    padding: 0 9px;
    background: transparent;
    color: var(--app-text-soft);
    font-size: 11px;
  }

  :global(.menu-trigger:hover),
  :global(.menu-trigger[data-state='open']) {
    background: var(--app-accent-soft);
    color: var(--app-text);
  }

  :global(.titlebar-menu) {
    min-width: 238px;
    border-color: var(--app-border);
    background: var(--app-surface-raised);
    color: var(--app-text);
  }

</style>
