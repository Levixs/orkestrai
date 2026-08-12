# Workbench LSP Spike

Date: 2026-08-12

## Objective

Validate whether an external Language Server Protocol client can be added to
the direct Svelte/Monaco Workbench editor without replacing its model registry,
theme integration, or lazy-loading boundary.

## Evaluated Stack

- `monaco-editor` 0.56.0, loaded directly by the Svelte component.
- `monaco-languageclient` 10.7.0, current stable release.
- `vscode-ws-jsonrpc` 3.5.0, current stable transport release.
- `monaco-languageclient` 11.0.0-next.2, compatibility reference only.

Official sources:

- <https://github.com/TypeFox/monaco-languageclient>
- <https://www.npmjs.com/package/monaco-languageclient>
- <https://www.npmjs.com/package/vscode-ws-jsonrpc>

## Findings

1. Stable `monaco-languageclient` 10.7.0 is aligned with Monaco 0.55.x, while
   the Workbench uses Monaco 0.56.0.
2. Version 11 aligns with Monaco 0.56.0 but is still a prerelease.
3. The language client is not an additive transport around a direct Monaco
   instance. It initializes the Codingame VS Code service layer globally and
   brings a large set of service overrides and language packs.
4. `vscode-ws-jsonrpc` is suitable for a future same-origin WebSocket bridge,
   but the transport alone does not connect Monaco models to LSP features.
5. Monaco's bundled workers already provide stable local TypeScript/JavaScript,
   JSON, CSS, and HTML language features without a host subprocess or network.
6. Shipping the stable client now would require downgrading Monaco or mixing
   incompatible editor APIs. Shipping the matching client would put a
   prerelease runtime in the production editor.

## Decision

Do not add the external LSP client to the production dependency graph in this
phase. Keep the direct Monaco integration and its built-in workers. Svelte
language-server support remains deferred rather than being presented as a
partially reliable feature.

Revisit the bridge when all of these conditions are met:

- `monaco-languageclient` 11 is stable and explicitly aligned with Monaco 0.56;
- the client can initialize lazily without affecting Canvas or terminal startup;
- one server process is scoped to one workspace and terminates after the last
  model disconnects or the app exits;
- the packaged bundle and first-editor-open regression stay within the agreed
  performance budget;
- TypeScript and Svelte diagnostics, completion, hover, definition, references,
  restart, crash recovery, and cleanup pass Electron tests on macOS and Windows.

This is a deliberate no-go result for the external client, not an unfinished
production integration.
