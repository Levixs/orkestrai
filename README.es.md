<p align="center">
  <img src="orkestrai-branding/logo.svg" alt="Orkestrai" width="360">
</p>

<p align="center">
  <strong>Orquesta equipos de IA para crear, diseñar, promocionar y entregar en un lienzo visual.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · Español
</p>

Orkestrai es una aplicación de escritorio local-first para macOS, Windows y
Linux. Reúne Claude Code, Codex CLI, Kimi Code, OpenCode, Cursor, Antigravity,
Cline, Devin, shells, tareas, notas,
navegadores y worktrees de Git en un lienzo persistente donde developers, vibe
coders, diseñadores, marketers y creators pueden dirigir un equipo de IA.

Descarga los instaladores más recientes desde
[beeblock/orkestrai](https://github.com/beeblock/orkestrai/releases/latest).

## Características Principales

- **Lienzo de agentes en vivo:** organiza terminales PTY reales, notas, tableros
  de tareas, portales de navegador, árboles de archivos, loops y formas. Las
  conexiones muestran la colaboración entre agentes mientras ocurre.
- **Modo Maestro:** asigna un líder que puede proponer un equipo, reclutar
  agentes, delegar briefings completos, coordinar el trabajo y retirar agentes
  cuando ya no sean necesarios.
- **Equipos listos:** inicia o amplía un workspace con presets de Producto,
  Campaña y lanzamiento, Brand y diseño, Contenido y SEO, React, Next.js,
  SvelteKit, Svelar, Laravel y Orkestrai Contributing. Los agentes comienzan en
  modo autónomo de acceso total y con roles en el nivel nativo de system/developer
  prompt, sin instrucciones largas bloqueando la terminal como texto pegado. El
  líder recibe y asigna la tarea inicial completa sin solicitudes repetidas.
- **Flujos que corresponden al trabajo:** nombra, colorea y ordena hasta diez
  etapas del tablero. Líder y agentes descubren y actualizan el mismo proceso.
- **Vistas operativas del equipo:** instala funciones especializadas desde un
  catálogo de 12 roles y consulta el título, etapa y responsable de cada tarea,
  además del estado Git de cada piso.
- **Puente nativo para agentes:** la CLI `orkestrai` y el servidor MCP incluidos
  exponen comandos tipados para mensajes, tareas, notas, portales, pisos, roles y
  notificaciones de escritorio.
- **Workspaces paralelos:** los agentes continúan trabajando cuando cambias de
  workspace, con indicadores de actividad y notificaciones nativas.
- **Pisos Git:** aísla el trabajo en worktrees, inspecciona conflictos e integra
  cambios terminados desde el lienzo.
- **Voz local:** dicta en cualquier campo de texto o usa el atajo del canvas sin
  foco para el líder y escucha respuestas en portugués de Brasil, inglés de
  Estados Unidos o español latinoamericano. STT y TTS se ejecutan localmente.
- **Delegación según la cuota:** fija el uso de Claude, Codex y Kimi en el canvas,
  configura origen, fallback, ventana de 5 horas/semanal/mensual y límite, y deja
  que el líder consulte la misma recomendación por CLI o MCP antes de asignar
  trabajo nuevo.
- **Apariencia personalizada:** elige entre tres temas oscuros y uno claro, o
  duplica uno y edita tokens semánticos con vista previa e importación/exportación JSON.
- **Controles operativos:** administra puertos de portales locales, configura
  rutinas recurrentes e instala skills desde el marketplace.
- **Central de Providers:** detecta localmente las ocho CLIs compatibles, sigue
  la instalación adecuada al sistema y el inicio de sesión oficial, y consulta
  capacidades sin enviar credenciales de providers a Orkestrai.
- **Barra de agentes personal:** elige cualquier servicio desde un menú Agentes
  compacto y fija hasta cuatro favoritos listos entre workspaces y reinicios.
- **Providers reemplazables:** cambia un miembro de Claude a Codex, Kimi u otro
  provider instalado conservando su rol, piso y conexiones.
- **Continuidad de sesión:** cada terminal reanuda su propia conversación del
  proveedor después de cerrar y volver a abrir la aplicación.

## Plataformas Compatibles

| Plataforma | Arquitecturas | Paquete |
| --- | --- | --- |
| macOS | Apple Silicon e Intel | DMG y ZIP de actualización |
| Windows | x64 | Instalador NSIS |
| Linux | x64 | AppImage |

La aplicación de escritorio utiliza las CLIs de agentes instaladas localmente.
Instala y autentica solamente los proveedores que quieras usar:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI](https://github.com/openai/codex)
- [Kimi Code](https://www.kimi.com/code)
- [OpenCode](https://opencode.ai/)
- [Cursor Agent CLI](https://docs.cursor.com/en/cli/overview)
- [Antigravity CLI](https://antigravity.google/docs/cli/getting-started)
- [Cline CLI](https://docs.cline.bot/cli/cli-reference)
- [Devin CLI](https://docs.devin.ai/cli)

No necesitas instalar todos los providers ni conocer la terminal. Orkestrai
activa las CLIs que detecta, mantiene cada conversación separada y permite
organizar los agentes por resultado: investigación, diseño, contenido,
marketing, producto, ingeniería o revisión.
Abre la Central desde el icono de cable del canvas, `Cmd/Ctrl+2` o el menú nativo
Workspace para preparar un provider y verificarlo de nuevo después de instalar.
Las instalaciones nuevas comienzan en inglés y preguntan el idioma preferido
como primer paso del onboarding.

## Desarrollo

Requisitos:

- Node.js 24 o posterior
- npm 11 o posterior
- Git

```bash
git clone https://github.com/beeblock/orkestrai.git
cd orkestrai
npm ci

npm run dev            # SvelteKit en http://localhost:5173
npm run electron:dev   # build de producción seguido por Electron
```

La voz funciona sin Docker ni Python. En el primer uso, Orkestrai solicita
confirmación antes de descargar el runtime integrado y los modelos locales. Un
sidecar de voz compatible con OpenAI sigue disponible como backend opcional.

## Arquitectura

Orkestrai está construido con Svelte 5, SvelteKit, Electron, Svelar, SQLite,
`node-pty` y `@xyflow/svelte`.

- `src/lib/modules/agent-room/` contiene las capas de aplicación, dominio,
  persistencia, PTY, bridge, voz y adaptadores de proveedores.
- `src/routes/canvas/` y `src/lib/components/agent-room/canvas/` implementan el
  workspace de escritorio.
- `packages/orkestrai-cli/` ofrece la CLI y el puente MCP para los agentes.
- `electron/` controla el ciclo de vida de escritorio, las notificaciones
  nativas y las actualizaciones.
- `docs/` contiene la documentación de build y releases.

Lee [AGENTS.md](AGENTS.md) antes de cambiar la arquitectura. El archivo documenta
el flujo obligatorio de Svelar, las reglas de i18n, la disciplina de releases y
las restricciones de plataforma.

## Controles De Calidad

```bash
npm test
npm run build
npm run test:e2e
```

Las pruebas end-to-end se ejecutan en serie contra el build de producción. Sigue
las reglas de limpieza de [AGENTS.md](AGENTS.md) después de builds de instaladores
o pruebas E2E.

## Contribuir

Las contribuciones son bienvenidas. Comienza con
[CONTRIBUTING.md](CONTRIBUTING.md) y usa GitHub Issues para bugs reproducibles y
propuestas concretas. Reporta problemas de seguridad de forma privada como se
describe en [SECURITY.md](SECURITY.md).

## Releases

Las tags siguen Versionado Semántico. El workflow `Release Desktop` compila todas
las plataformas, valida los manifests de actualización y publica los artefactos
verificados en las [Releases de GitHub](https://github.com/beeblock/orkestrai/releases).
Consulta [docs/releases.md](docs/releases.md) para ver el proceso completo.

## Licencia

Orkestrai se distribuye bajo la [Apache License 2.0](LICENSE). Los componentes
de terceros y los modelos descargados siguen sujetos a las licencias indicadas
en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
