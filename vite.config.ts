import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { WebSocketServer } from 'ws';
import { handlePtyConnection, isAllowedPtyWsOrigin, isPtyWsPath } from './src/lib/modules/agent-room/infrastructure/pty/pty-ws.ts';
import { installOrkestraiShim, writeOrkestraiRuntimeFile } from './scripts/install-orkestrai-shim.mjs';

// Shim da CLI `orkestrai` acessivel nos terminais PTY tambem em dev.
installOrkestraiShim();

/** Expoe o WebSocket de PTY no servidor de dev do vite. */
function ptyWebSocketPlugin(): Plugin {
  return {
    name: 'orkestrai-pty-websocket',
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true });
      server.httpServer?.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (!isPtyWsPath(pathname)) return;
        if (!isAllowedPtyWsOrigin(request.headers.origin, request.headers.host)) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => handlePtyConnection(ws));
      });
      // Anuncia a porta real do dev server para a CLI orkestrai.
      server.httpServer?.on('listening', () => {
        const address = server.httpServer?.address();
        if (address && typeof address === 'object' && address.port) {
          writeOrkestraiRuntimeFile(`http://127.0.0.1:${address.port}`);
        }
      });
    },
  };
}

// Resolve the svelar package root so we can alias submodule imports
const require_ = createRequire(import.meta.url);
const svelarRoot = dirname(require_.resolve('@beeblock/svelar/package.json'));
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
};

function setCrossOriginIsolationHeaders(response: { setHeader: (header: string, value: string) => void }) {
  for (const [header, value] of Object.entries(crossOriginIsolationHeaders)) {
    response.setHeader(header, value);
  }
}

function crossOriginIsolationPlugin(): Plugin {
  return {
    name: 'orkestrai-cross-origin-isolation',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((_request, response, next) => {
        setCrossOriginIsolationHeaders(response);
        next();
      });
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((_request, response, next) => {
        setCrossOriginIsolationHeaders(response);
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
  plugins: [crossOriginIsolationPlugin(), ptyWebSocketPlugin(), sveltekit(), tailwindcss()],
  resolve: {
    alias: {
      '@beeblock/svelar/actions': resolve(svelarRoot, 'dist/actions/index.js'),
      '@beeblock/svelar/api-keys': resolve(svelarRoot, 'dist/api-keys/index.js'),
      '@beeblock/svelar/audit': resolve(svelarRoot, 'dist/audit/index.js'),
      '@beeblock/svelar/auth': resolve(svelarRoot, 'dist/auth/index.js'),
      '@beeblock/svelar/broadcasting/client': resolve(svelarRoot, 'dist/broadcasting/client.js'),
      '@beeblock/svelar/broadcasting': resolve(svelarRoot, 'dist/broadcasting/index.js'),
      '@beeblock/svelar/cache': resolve(svelarRoot, 'dist/cache/index.js'),
      '@beeblock/svelar/cli': resolve(svelarRoot, 'dist/cli/index.js'),
      '@beeblock/svelar/config': resolve(svelarRoot, 'dist/config/index.js'),
      '@beeblock/svelar/container': resolve(svelarRoot, 'dist/container/index.js'),
      '@beeblock/svelar/dashboard': resolve(svelarRoot, 'dist/dashboard/index.js'),
      '@beeblock/svelar/database': resolve(svelarRoot, 'dist/database/index.js'),
      '@beeblock/svelar/dates': resolve(svelarRoot, 'dist/support/date.js'),
      '@beeblock/svelar/email-templates': resolve(svelarRoot, 'dist/email-templates/index.js'),
      '@beeblock/svelar/errors': resolve(svelarRoot, 'dist/errors/index.js'),
      '@beeblock/svelar/events': resolve(svelarRoot, 'dist/events/index.js'),
      '@beeblock/svelar/excel': resolve(svelarRoot, 'dist/excel/index.js'),
      '@beeblock/svelar/feature-flags': resolve(svelarRoot, 'dist/feature-flags/index.js'),
      '@beeblock/svelar/forms': resolve(svelarRoot, 'dist/forms/index.js'),
      '@beeblock/svelar/hashing': resolve(svelarRoot, 'dist/hashing/index.js'),
      '@beeblock/svelar/hooks': resolve(svelarRoot, 'dist/hooks/index.js'),
      '@beeblock/svelar/http': resolve(svelarRoot, 'dist/http/index.js'),
      '@beeblock/svelar/logging/LogViewer': resolve(svelarRoot, 'dist/logging/LogViewer.js'),
      '@beeblock/svelar/logging': resolve(svelarRoot, 'dist/logging/index.js'),
      '@beeblock/svelar/mail': resolve(svelarRoot, 'dist/mail/index.js'),
      '@beeblock/svelar/middleware': resolve(svelarRoot, 'dist/middleware/index.js'),
      '@beeblock/svelar/notifications': resolve(svelarRoot, 'dist/notifications/index.js'),
      '@beeblock/svelar/orm': resolve(svelarRoot, 'dist/orm/index.js'),
      '@beeblock/svelar/pagination': resolve(svelarRoot, 'src/pagination'),
      '@beeblock/svelar/pdf/GeneratePdfJob': resolve(svelarRoot, 'dist/pdf/GeneratePdfJob.js'),
      '@beeblock/svelar/pdf': resolve(svelarRoot, 'dist/pdf/index.js'),
      '@beeblock/svelar/permissions': resolve(svelarRoot, 'dist/permissions/index.js'),
      '@beeblock/svelar/plugins/PluginInstaller': resolve(svelarRoot, 'dist/plugins/PluginInstaller.js'),
      '@beeblock/svelar/plugins/PluginPublisher': resolve(svelarRoot, 'dist/plugins/PluginPublisher.js'),
      '@beeblock/svelar/plugins/PluginRegistry': resolve(svelarRoot, 'dist/plugins/PluginRegistry.js'),
      '@beeblock/svelar/plugins': resolve(svelarRoot, 'dist/plugins/index.js'),
      '@beeblock/svelar/queue/JobMonitor': resolve(svelarRoot, 'dist/queue/JobMonitor.js'),
      '@beeblock/svelar/queue': resolve(svelarRoot, 'dist/queue/index.js'),
      '@beeblock/svelar/repositories': resolve(svelarRoot, 'dist/repositories/index.js'),
      '@beeblock/svelar/routing': resolve(svelarRoot, 'dist/routing/index.js'),
      '@beeblock/svelar/scheduler/ScheduleMonitor': resolve(svelarRoot, 'dist/scheduler/ScheduleMonitor.js'),
      '@beeblock/svelar/scheduler': resolve(svelarRoot, 'dist/scheduler/index.js'),
      '@beeblock/svelar/search': resolve(svelarRoot, 'dist/search/index.js'),
      '@beeblock/svelar/services': resolve(svelarRoot, 'dist/services/index.js'),
      '@beeblock/svelar/session': resolve(svelarRoot, 'dist/session/index.js'),
      '@beeblock/svelar/storage': resolve(svelarRoot, 'dist/storage/index.js'),

      '@beeblock/svelar/support': resolve(svelarRoot, 'dist/support/index.js'),
      '@beeblock/svelar/teams': resolve(svelarRoot, 'dist/teams/index.js'),
      '@beeblock/svelar/uploads': resolve(svelarRoot, 'dist/uploads/index.js'),
      '@beeblock/svelar/validation': resolve(svelarRoot, 'dist/validation/index.js'),
      '@beeblock/svelar/webhooks': resolve(svelarRoot, 'dist/webhooks/index.js'),
      '@beeblock/svelar/ui': resolve(svelarRoot, 'src/ui'),
      '@beeblock/svelar/i18n/LanguageSwitcher.svelte': resolve(svelarRoot, 'src/i18n/LanguageSwitcher.svelte'),
      '@beeblock/svelar/i18n': resolve(svelarRoot, 'dist/i18n/index.js'),
      '@beeblock/svelar/testing': resolve(svelarRoot, 'dist/testing/index.js'),
      '@beeblock/svelar': resolve(svelarRoot, 'dist/index.js'),
    },
  },
  server: {
    headers: crossOriginIsolationHeaders,
    fs: {
      // Allow serving files from the svelar package (UI components are source .svelte files)
      allow: ['.', svelarRoot],
    },
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  ssr: {
    // Node-only optional drivers must stay external for adapter-node production builds.
	    external: ['bcrypt', 'argon2', 'bullmq', 'ioredis', 'meilisearch', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    // Process Svelte icon components during SSR.
    noExternal: ['@lucide/svelte', '@tabler/icons-svelte', 'bits-ui', '@xterm/xterm', '@xterm/addon-fit'],
  },
  optimizeDeps: {
    exclude: ['@lucide/svelte', '@tabler/icons-svelte', 'bits-ui'],
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        const warningText = [
          warning.message,
          warning.id,
          ...(Array.isArray(warning.ids) ? warning.ids : []),
        ]
          .filter(Boolean)
          .join(' ');

        if (
          warning.code === 'CIRCULAR_DEPENDENCY' &&
          (
            warningText.includes('node_modules/typebox') ||
            warningText.includes('node_modules/zod-v3-to-json-schema')
          )
        ) {
          return;
        }

        warn(warning);
      },
    },
  },
  };
});
