import type { Tour } from '../types.js';

/** Catalogo de tours en español — espejo de pt-BR.js (mismos ids y estructura). */
export const TOURS_ES: Tour[] = [
  {
    id: 'team-leader',
    icon: 'Users',
    title: 'Equipo con líder (zero-config)',
    tagline: 'Un líder que arma y comanda el equipo por ti.',
    steps: [
      {
        id: 'leader',
        title: 'Crea el líder del equipo',
        body: 'Todo empieza con un agente líder (Modo Maestro). Propone el equipo, recluta, conecta y distribuye el trabajo solo. Lo creo por ti con un clic.',
        action: { kind: 'createAgent', title: 'Líder', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
      {
        id: 'brief',
        title: 'La nota de briefing',
        body: 'La spec del proyecto vive en una nota conectada al equipo. Creo una nota "Briefing" de ejemplo — edítala con lo que quieres construir.',
        action: { kind: 'createNote', title: 'Briefing', content: '# Briefing\n\nDescribe aquí el proyecto: objetivo, alcance y criterios de listo.\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Briefing' },
      },
      {
        id: 'brief-connect',
        title: 'Conecta la nota al líder',
        body: 'Conectar la nota le da al líder el contexto del proyecto. Hago la conexión por ti.',
        action: { kind: 'connect', fromTitle: 'Briefing', toTitle: 'Líder' },
        check: { kind: 'edgeExists', fromTitle: 'Briefing', toTitle: 'Líder' },
      },
      {
        id: 'board',
        title: 'El tablero de tareas',
        body: 'El kanban del equipo: tarjetas en Por hacer/Haciendo/Hecho. Creo el tablero y la primera tarea asignada al líder — él desglosa y distribuye el resto.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'first-task',
        title: 'Primera tarea para el líder',
        body: 'Creo la tarea "Armar el equipo y empezar" asignada al líder. El briefing completo llega a su terminal; todo trabajo que delegue también debe existir con responsable en el tablero.',
        action: { kind: 'createTask', title: 'Armar el equipo y empezar (lee la nota Briefing)', assigneeTitle: 'Líder' },
        check: { kind: 'taskExists', titleIncludes: 'Armar el equipo' },
      },
      {
        id: 'talk',
        title: 'Da la orden',
        body: 'En la terminal del líder, di: "lee la nota Briefing, propone el equipo y empieza". Las consultas solo cuentan cuando ask confirma la respuesta; cuando alguien termina con task done, el líder recibe el handoff automáticamente.',
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
    ],
  },
  {
    id: 'vigia-24-7',
    icon: 'Repeat',
    title: 'Empleado 24/7 (vigía de tareas)',
    tagline: 'Un agente que trabaja sin parar, minuto a minuto.',
    steps: [
      {
        id: 'leader',
        title: 'El vigía',
        body: 'Un agente líder queda de guardia: cada pocos minutos mira el tablero, asigna lo que no tiene dueño y recluta si falta gente.',
        action: { kind: 'createAgent', title: 'Vigia', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Vigia' },
      },
      {
        id: 'board',
        title: 'El tablero vigilado',
        body: 'Necesita un tablero que vigilar. Creo el nodo Tareas por ti.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'routine',
        title: 'La rutina de guardia',
        body: 'Creo la rutina: cada 5 minutos el vigía recibe "revisa el tablero (orkestrai task list); asigna lo que no tenga dueño; si falta agente, recluta".',
        action: { kind: 'createRoutine', targetTitle: 'Vigia', prompt: 'Revisa el tablero con: orkestrai task list. Asigna lo que no tenga dueño. Si falta agente, recluta (orkestrai recruit).', intervalMinutes: 5 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'drop-task',
        title: 'Prueba con una tarea',
        body: 'Crea cualquier tarea en el tablero (o usa "Hazlo por mí") y observa: en máximo 5 minutos el vigía la toma y la distribuye solo.',
        action: { kind: 'createTask', title: 'Tarea de prueba del vigía' },
        check: { kind: 'taskExists', titleIncludes: 'vigía' },
      },
    ],
  },
  {
    id: 'duas-features',
    icon: 'GitBranch',
    title: 'Dos features en paralelo sin conflicto',
    tagline: 'Dos equipos, dos pisos, cero pisotones.',
    steps: [
      {
        id: 'floor',
        title: 'Crea un piso',
        body: 'Un piso es una copia aislada del proyecto (worktree git) con rama propia. El equipo B trabaja en ella mientras el A sigue en la principal. Creo el piso "feature-nueva" por ti.',
        action: { kind: 'createFloor', name: 'feature-nueva' },
        check: { kind: 'floorExists', nameIncludes: 'feature' },
      },
      {
        id: 'agents',
        title: 'Un agente por frente',
        body: 'Creo dos agentes: uno trabaja en el piso principal, otro en la feature nueva. Mueve el segundo a la capa del piso (panel Pisos en la barra inferior).',
        action: { kind: 'createAgent', title: 'Dev Principal', provider: 'claude' },
      },
      {
        id: 'agent-b',
        title: 'El agente de la feature',
        body: 'Creo el agente del frente B. En el panel Pisos, cambia la capa visible y arrástralo ahí — empieza a trabajar en el checkout del piso.',
        action: { kind: 'createAgent', title: 'Dev Feature', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Dev Feature' },
      },
      {
        id: 'land',
        title: 'Uniendo de vuelta',
        body: 'Cuando la feature termine: panel Pisos → preview muestra conflictos ANTES del merge; el land une todo. Los conflictos se vuelven tarea para un agente. Concluye cuando el piso exista.',
        check: { kind: 'floorExists', nameIncludes: 'feature' },
      },
    ],
  },
  {
    id: 'qa-visual',
    icon: 'Workflow',
    title: 'QA visual de tu aplicación',
    tagline: 'Un agente que abre tu app y la prueba de verdad.',
    steps: [
      {
        id: 'portal',
        title: 'El portal (navegador de los agentes)',
        body: 'El portal es un navegador integrado que los agentes controlan. Creo uno apuntando a tu dev server — ajusta la URL después si no es localhost:5173.',
        action: { kind: 'createPortal', url: 'http://localhost:5173', title: 'Portal App' },
        check: { kind: 'nodeExists', nodeType: 'portal' },
      },
      {
        id: 'qa',
        title: 'El agente de QA',
        body: 'Creo el agente que va a probar. Conéctalo al portal para que vea la página.',
        action: { kind: 'createAgent', title: 'QA', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'QA' },
      },
      {
        id: 'connect',
        title: 'Conecta QA al portal',
        body: 'Conectado, QA navega, lee el DOM, ejecuta JS y toma capturas. Hago la conexión.',
        action: { kind: 'connect', fromTitle: 'QA', toTitle: 'Portal App' },
        check: { kind: 'edgeExists', fromTitle: 'QA', toTitle: 'Portal App' },
      },
      {
        id: 'test',
        title: 'Pide la prueba',
        body: 'En la terminal de QA: "abre el portal, haz el flujo principal de la app, toma captura y dime qué se rompió". Lo ejecuta y reporta.',
      },
    ],
  },
  {
    id: 'pesquisa-resumo',
    icon: 'Search',
    title: 'Investigación automatizada con resumen',
    tagline: 'El agente investiga en la web y escribe el resumen en una nota.',
    steps: [
      {
        id: 'note',
        title: 'La nota de resumen',
        body: 'Creo la nota "Resumen" — ahí el agente escribe los hallazgos en bullet points.',
        action: { kind: 'createNote', title: 'Resumen', content: '# Resumen\n\n(los hallazgos de la investigación aparecen aquí en bullet points)\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Resumen' },
      },
      {
        id: 'portal',
        title: 'El portal de investigación',
        body: 'Creo un portal abierto en Google — el agente lo usa para leer fuentes.',
        action: { kind: 'createPortal', url: 'https://www.google.com', title: 'Portal Investigación' },
        check: { kind: 'nodeExists', nodeType: 'portal' },
      },
      {
        id: 'agent',
        title: 'El investigador',
        body: 'Creo el agente investigador y lo conecto al portal y a la nota — portal para leer, nota para escribir.',
        action: { kind: 'createAgent', title: 'Investigador', provider: 'kimi' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Investigador' },
      },
      {
        id: 'connect',
        title: 'Conexiones de trabajo',
        body: 'Hago las dos conexiones: Investigador ↔ Portal Investigación e Investigador ↔ Resumen. Después di: "usa el portal para leer sobre X y escribe el resumen en la nota".',
        action: [
          { kind: 'connect', fromTitle: 'Investigador', toTitle: 'Portal Investigación' },
          { kind: 'connect', fromTitle: 'Investigador', toTitle: 'Resumen' },
        ],
        check: { kind: 'edgeExists', fromTitle: 'Investigador', toTitle: 'Portal Investigación' },
      },
    ],
  },
  {
    id: 'inbox-arquivos',
    icon: 'FolderPlus',
    title: 'Inbox de archivos procesada sola',
    tagline: 'Suelta archivos en la carpeta; el equipo los procesa en lote.',
    steps: [
      {
        id: 'agent',
        title: 'El procesador',
        body: 'Creo el agente que mirará la carpeta ./inbox de tu proyecto (crea la carpeta después si no existe).',
        action: { kind: 'createAgent', title: 'Procesador', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Procesador' },
      },
      {
        id: 'routine',
        title: 'La rutina de barrido',
        body: 'Creo la rutina: cada 2 minutos lista ./inbox, describe/clasifica lo nuevo, lo mueve a ./inbox/done y lo registra en el tablero.',
        action: { kind: 'createRoutine', targetTitle: 'Procesador', prompt: 'Lista ./inbox; para cada archivo nuevo, descríbelo y clasifícalo; muévelo a ./inbox/done y regístralo en el tablero con orkestrai task add.', intervalMinutes: 2 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'test',
        title: 'Suelta un archivo',
        body: 'Crea la carpeta ./inbox en el proyecto y suelta cualquier archivo. En máximo 2 minutos el procesador lo describe, clasifica y archiva.',
      },
    ],
  },
  {
    id: 'revisao-cruzada',
    icon: 'Cable',
    title: 'Revisión cruzada entre providers',
    tagline: 'Claude implementa, Codex revisa. Dos miradas por cambio.',
    steps: [
      {
        id: 'dev',
        title: 'El implementador',
        body: 'Creo el Claude que implementa los cambios.',
        action: { kind: 'createAgent', title: 'Claude Dev', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Claude Dev' },
      },
      {
        id: 'reviewer',
        title: 'El revisor',
        body: 'Creo el Codex revisor — un modelo diferente revisando con otra mirada.',
        action: { kind: 'createAgent', title: 'Codex Reviewer', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Codex Reviewer' },
      },
      {
        id: 'connect',
        title: 'Conecta los dos',
        body: 'Hago la conexión: todo lo que uno pregunte al otro viaja por ella (y se enciende verde mientras conversan).',
        action: { kind: 'connect', fromTitle: 'Claude Dev', toTitle: 'Codex Reviewer' },
        check: { kind: 'edgeExists', fromTitle: 'Claude Dev', toTitle: 'Codex Reviewer' },
      },
      {
        id: 'flow',
        title: 'El flujo de revisión',
        body: 'Dile a Claude Dev: "implementa X y pide revisión a Codex Reviewer (orkestrai ask)". Implementa, Codex critica, el veredicto vuelve por la misma cuerda.',
      },
    ],
  },
  {
    id: 'sentinela-deploy',
    icon: 'Rocket',
    title: 'Centinela de deploy y pruebas',
    tagline: 'Cada hora: pruebas corriendo, fallos se vuelven tarea + notificación.',
    steps: [
      {
        id: 'agent',
        title: 'El centinela',
        body: 'Creo el agente que vigila la salud del proyecto.',
        action: { kind: 'createAgent', title: 'Centinela', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Centinela' },
      },
      {
        id: 'board',
        title: 'El tablero de incidentes',
        body: 'Los fallos se vuelven tarjetas en el tablero. Creo el nodo Tareas.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'routine',
        title: 'La ronda de cada hora',
        body: 'Creo la rutina: cada 60 minutos corre las pruebas; si fallan, abre tarea para el equipo y te notifica en el escritorio.',
        action: { kind: 'createRoutine', targetTitle: 'Centinela', prompt: 'Corre las pruebas del proyecto. Si fallan, abre una tarea para el equipo (orkestrai task add) y notifica al usuario (orkestrai notify).', intervalMinutes: 60 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'test',
        title: 'Rómpelo a propósito (opcional)',
        body: 'Introduce un error en el código y mira la próxima ronda abrir la tarea y disparar la notificación nativa.',
      },
    ],
  },
  {
    id: 'preset-bootstrap',
    icon: 'Layers',
    title: 'Preset de tu framework',
    tagline: 'Arma el equipo una vez; todo proyecto nuevo nace listo.',
    steps: [
      {
        id: 'team',
        title: 'Arma el equipo estándar',
        body: 'Crea el equipo que usas en todo proyecto (líder, devs, roles, nota de bootstrap con las convenciones de tu framework). Creo el líder para empezar.',
        action: { kind: 'createAgent', title: 'Líder', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
      {
        id: 'save',
        title: 'Guárdalo como preset',
        body: 'Con el equipo armado: lápiz junto al nombre del workspace en la barra lateral → "Guardar como preset". El snapshot guarda agentes, layout, notas, roles y rutinas (sin sesiones).',
      },
      {
        id: 'use',
        title: 'Úsalo en el próximo proyecto',
        body: 'Al crear un workspace nuevo (+ en la barra lateral), elige el preset en "Empezar de un preset" — el equipo entero nace instanciado en el proyecto. Gestiona presets en Configuración.',
      },
    ],
  },
  {
    id: 'pipeline-aprovacao',
    icon: 'Workflow',
    title: 'Pipeline escribe → revisa → aprueba',
    tagline: 'Flujo de 3 pasos con pausa para tu OK.',
    steps: [
      {
        id: 'agents',
        title: 'Dev y revisor',
        body: 'Creo los dos agentes del pipeline: el Dev (escribe) y el Revisor (critica).',
        action: { kind: 'createAgent', title: 'Dev', provider: 'claude' },
      },
      {
        id: 'reviewer',
        title: 'El revisor',
        body: 'Creo el revisor del pipeline.',
        action: { kind: 'createAgent', title: 'Revisor', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Revisor' },
      },
      {
        id: 'flow',
        title: 'El flujo de 3 pasos',
        body: 'Creo el nodo Flujo: paso 1 el Dev escribe ({{input}} = tu entrada), paso 2 el Revisor critica la salida del Dev, paso 3 pausa para TU aprobación.',
        action: {
          kind: 'createFlow',
          title: 'Pipeline revisión',
          steps: [
            { kind: 'agent', target: 'Dev', prompt: 'Escribe la solución para: {{input}}' },
            { kind: 'agent', target: 'Revisor', prompt: 'Revisa críticamente, señala problemas y mejoras: {{input}}' },
            { kind: 'approval' },
          ],
        },
        check: { kind: 'nodeExists', nodeType: 'flow' },
      },
      {
        id: 'run',
        title: 'Corre el flujo',
        body: 'En el nodo Flujo: escribe la entrada (ej.: "validación de formulario con zod") y haz clic en Correr. Mira los pasos encenderse y aprueba en el paso final.',
      },
    ],
  },
  {
    id: 'mcp-tools',
    icon: 'Cable',
    title: 'Tools externas vía MCP',
    tagline: 'GitHub, docs y web en manos de los agentes — con un clic.',
    steps: [
      {
        id: 'install',
        title: 'Instala un MCP con 1 clic',
        body: 'Instalo DeepWiki (documentación de cualquier repositorio, sin configurar nada) en este workspace — sin comando, sin token.',
        action: { kind: 'installMcp', key: 'deepwiki' },
        check: { kind: 'mcpInstalled', name: 'deepwiki' },
      },
      {
        id: 'market',
        title: 'El marketplace de MCPs',
        body: 'Página Skills → pestaña MCPs: curaduría oficial (GitHub, Gmail, Figma, Drive, Vercel...) + registry completo. Los que piden token abren un diálogo guiado.',
      },
      {
        id: 'use',
        title: 'Úsalo en un agente',
        body: 'En una terminal de agente (Claude/Kimi), pide algo que el MCP haga — ej.: "pregúntale a DeepWiki cómo funciona el auth del repositorio X". La tool aparece nativa en el agente.',
      },
    ],
  },
  {
    id: 'chained-flows',
    icon: 'Workflow',
    title: 'Flujos encadenados',
    tagline: 'Un flujo dispara el siguiente — pipelines compuestos y fan-out.',
    steps: [
      {
        id: 'first-flow',
        title: 'El primer eslabón',
        body: 'Creo el Flujo "Investigación" con un paso de aprobación — así simulas la etapa sin necesitar un agente real.',
        action: { kind: 'createFlow', title: 'Investigación', steps: [{ kind: 'approval' }] },
        check: { kind: 'nodeExists', nodeType: 'flow', titleIncludes: 'Investigación' },
      },
      {
        id: 'second-flow',
        title: 'El segundo eslabón',
        body: 'Creo el Flujo "Redacción" — cuando Investigación termine con éxito, su salida se vuelve la entrada de Redacción sola.',
        action: { kind: 'createFlow', title: 'Redacción', steps: [{ kind: 'approval' }] },
        check: { kind: 'nodeExists', nodeType: 'flow', titleIncludes: 'Redacción' },
      },
      {
        id: 'chain',
        title: 'Conecta los dos flujos',
        body: 'Uno Investigación → Redacción con una arista: la arista es la que dice a dónde va la salida cuando el flujo termina.',
        action: { kind: 'connect', fromTitle: 'Investigación', toTitle: 'Redacción' },
        check: { kind: 'edgeExists', fromTitle: 'Investigación', toTitle: 'Redacción' },
      },
      {
        id: 'run-chain',
        title: 'Ejecuta y mira el encadenamiento',
        body: 'En el Flujo Investigación: haz clic en Ejecutar y luego Aprobar. Cuando termina, Redacción dispara sola con la salida — el fallo no encadena y los ciclos se bloquean. Fan-out: conecta un tercer flujo a Investigación y los dos disparan juntos. Y el botón Sincronizar convierte cada agente conectado a un flujo en paso, en el orden de las aristas.',
      },
    ],
  },

  {
    id: 'design-figma',
    icon: 'Palette',
    title: 'De Figma al código',
    tagline: 'El mockup de Figma se vuelve UI fiel con el agente diseñador.',
    steps: [
      {
        id: 'designer',
        title: 'El agente diseñador',
        body: 'Creo el Diseñador (Claude) — leerá tus referencias visuales y generará la UI.',
        action: { kind: 'createAgent', title: 'Diseñador', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Diseñador' },
      },
      {
        id: 'image',
        title: 'La referencia visual',
        body: 'Agrega un nodo Imagen (barra inferior), pega el print de Figma con Ctrl+V y conéctalo al Diseñador — así es como ve el mockup.',
      },
      {
        id: 'mcp',
        title: 'Figma MCP (opcional y poderoso)',
        body: 'Página Skills → pestaña MCPs → busca "Figma" e instala con tu token (Perfil de Figma → Settings → Personal access tokens). Con él el Diseñador lee frames, componentes y estilos DIRECTO del archivo — sin prints.',
      },
    ],
  },
  {
    id: 'managed-ports',
    icon: 'RadioTower',
    title: 'Liberar puertos de dev servers',
    tagline: 'Mira y detén listeners locales sin salir del canvas.',
    steps: [
      {
        id: 'portal',
        title: 'Registra la app en un Portal',
        body: 'Creo un Portal local en el puerto 4173. Este vínculo persistido permite que Orkestrai gestione el puerto de forma segura.',
        action: { kind: 'createPortal', url: 'http://localhost:4173', title: 'Portal Dev' },
        check: { kind: 'nodeExists', nodeType: 'portal', titleIncludes: 'Portal Dev' },
      },
      {
        id: 'server',
        title: 'Inicia tu dev server',
        body: 'En la terminal del proyecto, inicia la app en el mismo puerto del Portal. Puedes usar `orkestrai port 4173` para elegir un puerto libre antes de iniciar el servidor.',
      },
      {
        id: 'panel',
        title: 'Abre Puertos y libera el listener',
        body: 'En la barra inferior, justo después de Uso, abre Puertos. El proceso aparece en uso; haz clic en el icono de detener y confirma. El Portal queda guardado para la próxima ejecución.',
      },
    ],
  },
  {
    id: 'leader-dictation',
    icon: 'Mic',
    title: 'Dictar en cualquier campo',
    tagline: 'Habla donde estés escribiendo, sin depender de un líder.',
    steps: [
      {
        id: 'field',
        title: 'Coloca el cursor',
        body: 'Enfoca cualquier campo editable: título o descripción de tarea, rol, nota o formulario. El dictado sigue el último campo y su selección actual.',
      },
      {
        id: 'record',
        title: 'Haz clic en la esfera de voz',
        body: 'Usa la esfera de colores o Alt+Espacio para grabar. El primer clic conserva el campo enfocado. Su pequeño indicador clicable muestra si está fijada o libre y abre directamente los controles de posición; el tooltip también presenta el atajo Ctrl+clic o Command+clic. Desfija la esfera para arrastrarla dentro del canvas visible.',
      },
      {
        id: 'auto-submit',
        title: 'Elige si la terminal debe enviar',
        body: 'En Configuración → Dictado por voz, activa Enviar automáticamente en terminales para agregar Enter a la transcripción. Solo envía en terminales; kanban, roles, notas y formularios siguen recibiendo únicamente el texto.',
      },
      {
        id: 'fallback',
        title: 'Usa el atajo del líder en cualquier vista',
        body: 'Sin un campo activo, la esfera envía la transcripción al líder Maestro en Canvas o Workbench. Creo uno para probar; sin campo ni líder, la app muestra un aviso. En macOS, Fn/Globe por sí sola está reservada por el sistema, así que configura una combinación o F1–F12.',
        action: { kind: 'createAgent', title: 'Líder por voz', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder por voz' },
      },
    ],
  },
  {
    id: 'switch-agent-provider',
    icon: 'Cable',
    title: 'Cambiar el provider de un agente',
    tagline: 'Cambia el modelo de ejecución sin desmontar el equipo.',
    steps: [
      {
        id: 'open',
        title: 'Abre el selector del encabezado',
        body: 'Haz clic en ⇄ en el agente que quieres reemplazar. El menú lista los providers detectados en este dispositivo y marca el actual.',
      },
      {
        id: 'choose',
        title: 'Elige un provider instalado',
        body: 'El cambio cierra la PTY y conversación anteriores e inicia una sesión limpia con el nuevo adapter y sus flags de acceso.',
      },
      {
        id: 'preserve',
        title: 'Continúa con el mismo miembro',
        body: 'Nombre, rol, Modo Maestro, piso, posición y conexiones permanecen. Reaplica el contexto necesario en la nueva conversación y continúa desde el mismo tablero.',
      },
    ],
  },
  {
    id: 'multilingual-spoken-replies',
    icon: 'Languages',
    title: 'Respuestas habladas en tres idiomas',
    tagline: 'Elige, prueba y usa una voz local adecuada al idioma.',
    steps: [
      {
        id: 'choose',
        title: 'Elige la voz en Configuración',
        body: 'Abre Configuración → Voz y selecciona Portugués (Brasil), English (United States) o Español (Latinoamérica). Cada opción define el speaker y el idioma de síntesis.',
      },
      {
        id: 'preview',
        title: 'Escucha antes de usar',
        body: 'Ajusta la velocidad entre 0,75× y 1,50× y haz clic en Escuchar vista previa. En el primer uso, confirma la descarga local; después las tres voces funcionan offline en macOS, Linux y Windows.',
      },
      {
        id: 'enable',
        title: 'Actívala en el agente',
        body: 'Vuelve al canvas y haz clic en el altavoz de la terminal. La próxima respuesta se hablará con la voz elegida, por frases, mientras el dictado continúa usando el mismo Parakeet de antes.',
      },
    ],
  },
  {
    id: 'team-template-library',
    icon: 'LayoutTemplate',
    title: 'Empezar con un equipo listo',
    tagline: 'Elige el stack y recibe agentes, roles, skills y tablero ya organizados.',
    steps: [
      {
        id: 'preset-library',
        title: 'Abre la biblioteca de presets',
        body: 'Usa el icono de plantilla en la barra lateral o Presets en la barra inferior. Filtra por Producto, Desarrollo, Diseño y creación, Marketing y contenido u Orkestrai.',
      },
      {
        id: 'create-or-merge',
        title: 'Crea desde cero o suma al equipo actual',
        body: 'Nuevo workspace prepara el proyecto elegido con layout, tareas, roles y skills. El botón + añade el mismo equipo al canvas actual sin eliminar tus nodos.',
      },
      {
        id: 'operate',
        title: 'Completa el equipo y sigue los pisos',
        body: 'Los roles extensos entran automáticamente en la primera sesión y el líder recibe la tarea inicial completa para asignar. En Pisos, sigue el título, etapa y responsable real de cada tarea antes de revisar y aterrizar.',
      },
    ],
  },
  {
    id: 'custom-board-stages',
    icon: 'Workflow',
    title: 'Adaptar el tablero a tu proceso',
    tagline: 'Reemplaza un kanban genérico por las etapas que tu equipo realmente usa.',
    steps: [
      {
        id: 'board',
        title: 'Crea el tablero de trabajo',
        body: 'Creo un nodo Tareas. Empieza simple y puede representar una campaña, producción de contenido, proyecto de diseño o desarrollo.',
        action: { kind: 'createTasksBoard' },
        check: { kind: 'nodeExists', nodeType: 'tasks', titleIncludes: 'Tareas' },
      },
      {
        id: 'stages',
        title: 'Define tus etapas',
        body: 'Haz clic en el icono de columnas del encabezado. Renombra, cambia colores, ordena y agrega etapas como Ideas, Aprobación y Publicado.',
      },
      {
        id: 'team-awareness',
        title: 'El equipo sigue el mismo flujo',
        body: 'El líder y los especialistas reciben las etapas automáticamente. Crean y mueven entregas mientras tú acompañas todo visualmente.',
      },
    ],
  },
  {
    id: 'campaign-ready-team',
    icon: 'Palette',
    title: 'Lanzar una campaña con un equipo listo',
    tagline: 'Estrategia, investigación, copy y métricas llegan ya organizadas.',
    steps: [
      {
        id: 'library',
        title: 'Abre la Biblioteca de presets',
        body: 'Elige Marketing y contenido → Campaña y lanzamiento. Para otras frentes también están Brand y diseño y Contenido y SEO.',
      },
      {
        id: 'apply',
        title: 'Empieza nuevo o suma al workspace',
        body: 'Nuevo workspace crea el equipo en otra carpeta. El botón + añade líder y especialistas al canvas actual sin eliminar nada.',
      },
      {
        id: 'brief',
        title: 'Completa el briefing y define el objetivo',
        body: 'Registra objetivo, audiencia, oferta, canales, plazo y métrica en la nota creada. Luego habla con el líder: coordina investigación, copy, distribución y aprobación.',
      },
    ],
  },
  {
    id: 'orkestrai-consensus-team',
    icon: 'LayoutTemplate',
    title: 'Contribuir a Orkestrai con consenso',
    tagline: 'Claude, Codex y Kimi acuerdan el plan antes de la ejecución.',
    steps: [
      {
        id: 'apply',
        title: 'Aplica Orkestrai Contributing',
        body: 'En la categoría Orkestrai de la Biblioteca, crea el equipo completo con líder, dos oráculos y especialistas Svelar, desktop y QA/release.',
      },
      {
        id: 'consensus',
        title: 'Ejecuta el Flow de consenso',
        body: 'Codex propone o audita arquitectura, Kimi revisa producto, UX y riesgos, y Claude sintetiza. Ambos oráculos deben responder APROBADO.',
      },
      {
        id: 'delivery',
        title: 'Solo entonces distribuye las tareas',
        body: 'Con el plan aprobado, el líder registra la decisión, crea briefings completos y acompaña Revisión y Validación hasta que pasen pruebas, build, documentación y changelog.',
      },
    ],
  },
  {
    id: 'provider-center-setup',
    icon: 'Cable',
    title: 'Preparar tus providers de IA',
    tagline: 'Mira qué está listo y sigue la configuración oficial sin adivinar comandos.',
    steps: [
      {
        id: 'open-center',
        title: 'Abre la Central de Providers',
        body: 'Usa el icono de cable en la barra lateral izquierda, Cmd/Ctrl+2 o Workspace → Central de Providers. Verifica Claude, Codex, Kimi, OpenCode, Cursor, Antigravity, Cline y Devin localmente.',
      },
      {
        id: 'follow-setup',
        title: 'Sigue la configuración de tu dispositivo',
        body: 'Expande un agente para ver la guía oficial y, cuando esté disponible, un comando de instalación para macOS, Windows o Linux. Completa el inicio de sesión en la propia CLI del provider; Orkestrai nunca recibe la credencial.',
      },
      {
        id: 'verify',
        title: 'Verifica de nuevo y crea el agente',
        body: 'Regresa a la Central y usa Verificar de nuevo. Cuando se detecte la CLI, vuelve al canvas y crea ese agente desde la barra inferior.',
      },
    ],
  },
  {
    id: 'choose-agent-provider',
    icon: 'Users',
    title: 'Elegir agentes sin aprender la terminal',
    tagline: 'Usa un servicio que ya tengas y organiza el equipo por resultado.',
    steps: [
      {
        id: 'available',
        title: 'Mira lo que ya está disponible',
        body: 'La barra inferior detecta Claude, Codex, Kimi, OpenCode, Cursor, Antigravity, Cline y Devin. Los disponibles quedan activos; los desactivados solo necesitan instalación e inicio de sesión.',
      },
      {
        id: 'outcome',
        title: 'Nombra el trabajo, no la tecnología',
        body: 'Crea “Investigación de audiencia”, “Dirección de arte”, “Copy de campaña” o “Revisión de producto”. Roles, notas y tareas indican al agente qué entregar aunque nunca uses una terminal fuera de Orkestrai.',
      },
      {
        id: 'perspective',
        title: 'Combina solo cuando ayude',
        body: 'Un provider basta para empezar. Agrega otro para revisar una decisión importante o aportar una perspectiva independiente; Orkestrai mantiene cada conversación separada y vinculada al workspace.',
      },
    ],
  },
  {
    id: 'pin-favorite-agents',
    icon: 'Pin',
    title: 'Mantener tus agentes favoritos cerca',
    tagline: 'Adapta la barra a tu rutina sin ocultar las demás opciones.',
    steps: [
      {
        id: 'open-agents',
        title: 'Abre el menú Agentes',
        body: 'Usa Agentes en la barra inferior para ver todos los servicios compatibles. Seleccionar un agente listo activa la misma herramienta de dibujo de antes; un agente que requiere configuración abre la Central de Providers.',
      },
      {
        id: 'pin-favorites',
        title: 'Fija hasta cuatro favoritos',
        body: 'En Fijados en la barra, marca los servicios que más usas. Los favoritos listos aparecen como botones directos junto a Agentes, en el orden elegido.',
      },
      {
        id: 'keep-your-preference',
        title: 'Usa la misma barra en todas partes',
        body: 'La selección es global y persiste al cambiar de workspace o reiniciar la app. Si una CLI fijada deja de estar disponible, sigue guardada pero no ocupa espacio.',
      },
    ],
  },
  {
    id: 'devin-local-agent',
    icon: 'Cable',
    title: 'Agregar Devin al equipo local',
    tagline: 'Usa el agente local oficial en el mismo flujo visual del canvas.',
    steps: [
      {
        id: 'prepare',
        title: 'Prepara la CLI oficial',
        body: 'Abre la Central de Providers, expande Devin y sigue las instrucciones de instalación e inicio de sesión. Verifica de nuevo hasta que Devin aparezca listo.',
      },
      {
        id: 'create',
        title: 'Crea el miembro Devin',
        body: 'Vuelve al canvas y selecciona Devin en la barra inferior. Busca o desplázate por la lista limitada de modelos, elige uno disponible en tu cuenta e inicia con acceso autónomo al workspace.',
      },
      {
        id: 'continue',
        title: 'Trabaja mediante el puente',
        body: 'Conecta Devin con el líder, tablero o notas. Orkestrai provisiona sus tools MCP y skill, mantiene respuestas limpias y reanuda la conversación exacta después de reiniciar.',
      },
    ],
  },
  {
    id: 'quota-aware-delegation',
    icon: 'RadioTower',
    title: 'Delegación según la cuota',
    tagline: 'El líder ve los límites antes de distribuir trabajo nuevo.',
    steps: [
      {
        id: 'add-usage',
        title: 'Pon Uso en el canvas',
        body: 'Creo un nodo Uso persistente con Claude como origen, Codex como fallback y un límite inicial de 90%. Consulta Claude, Codex y Kimi cada cinco minutos.',
        action: { kind: 'createUsage', title: 'Uso de providers' },
        check: { kind: 'nodeExists', nodeType: 'usage', titleIncludes: 'Uso de providers' },
      },
      {
        id: 'set-policy',
        title: 'Ajusta la política',
        body: 'En el nodo, elige el origen, un fallback diferente, la ventana de 5 horas, semanal o mensual y el porcentaje que significa "cerca del límite". Si el provider no reporta ese período, el nodo pide otra ventana.',
      },
      {
        id: 'leader-checks',
        title: 'El líder consulta antes de delegar',
        body: 'La skill enseña al líder a llamar orkestrai usage antes de distribuir trabajo nuevo. Recomienda un fallback saludable sin mover silenciosamente tareas o conversaciones que ya están en curso.',
      },
    ],
  },
  {
    id: 'organize-canvas',
    icon: 'LayoutGrid',
    title: 'Organizar el canvas',
    tagline: 'Realinea una selección o todo el workspace sin superposiciones.',
    steps: [
      {
        id: 'choose-scope',
        title: 'Elige qué se moverá',
        body: 'Selecciona los nodos que necesitan atención. Con una selección, Orkestrai mueve solo esos nodos; sin selección, organiza todo el canvas.',
      },
      {
        id: 'run-layout',
        title: 'Ejecuta Organizar canvas',
        body: 'Usa la acción de la barra, la paleta de comandos o Command+Shift+T. El layout determinista distribuye los nodos en filas legibles sin apilarlos.',
      },
      {
        id: 'keep-connections-clear',
        title: 'Mantén el workspace legible',
        body: 'Las conexiones permanecen detrás de todos los nodos, incluso en pantallas Windows con escalas diferentes. Luego puedes ajustar posiciones manualmente.',
      },
    ],
  },
  {
    id: 'focused-workspace-view',
    icon: 'PanelLeftOpen',
    title: 'Trabajar en el Workbench',
    tagline: 'Abre, organiza y compara artefactos sin perder el canvas.',
    steps: [
      {
        id: 'switch-view',
        title: 'Cambia la vista',
        body: 'Usa Canvas/Workbench en la esquina superior izquierda o abre Workbench desde el menú Workspace. Los agentes permanecen en las mismas sesiones mientras cambias de modo.',
      },
      {
        id: 'choose-item',
        title: 'Elige dónde trabajar',
        body: 'Expande un workspace o usa la búsqueda. Los elementos abiertos usan pestañas verticales por defecto; puedes elegir pestañas horizontales en Configuración → Apariencia.',
      },
      {
        id: 'split-work',
        title: 'Arma tu espacio de trabajo',
        body: 'Divide el panel activo a la derecha o abajo y organiza hasta ocho artefactos redimensionables. Arrastra pestañas entre paneles o usa el menú Mover a; el layout vuelve con el workspace.',
      },
      {
        id: 'attach-context',
        title: 'Mantén las referencias con el trabajo',
        body: 'Suelta, pega o selecciona imágenes, PDFs, archivos y enlaces en notas, tarjetas o el composer del agente. Los archivos de hasta 10 MB quedan en el workspace y la referencia completa llega al briefing.',
      },
      {
        id: 'monitor-provider-usage',
        title: 'Controla las cuotas en el pie',
        body: 'El pie muestra las ventanas de 5 horas, semanal y mensual realmente informadas por Claude, Codex y Kimi. Haz clic en cualquier provider para abrir los detalles de Uso.',
      },
      {
        id: 'terminal-options',
        title: 'Mantén organizadas las opciones',
        body: 'Abre el menú de puntos suspensivos del encabezado para cambiar provider o rol, elegir visualmente 1 de 10 temas ANSI, recargar, alternar el Modo Maestro o eliminar la terminal.',
      },
      {
        id: 'dictate-to-leader',
        title: 'Dicta sin volver al Canvas',
        body: 'Cuando está fijada, la esfera usa un espacio propio del encabezado sin cubrir pestañas ni acciones. Sin un campo de texto activo, encuentra al líder del workspace, abre su terminal e inicia el mismo flujo del Canvas.',
      },
      {
        id: 'return-canvas',
        title: 'Vuelve al contexto visual',
        body: 'Haz clic en el icono del canvas en el encabezado o usa el selector. El workspace sigue activo y el nodo elegido aparece centrado en el canvas.',
      },
    ],
  },
  {
    id: 'edit-and-preview-files',
    icon: 'FileCode2',
    title: 'Editar y visualizar archivos',
    tagline: 'Usa un editor local completo e inspecciona formatos comunes sin salir de la app.',
    steps: [
      {
        id: 'open-file',
        title: 'Abre un archivo del workspace',
        body: 'Expande Archivos en la barra lateral del Workbench y elige un archivo de texto. Se abre directamente en una pestaña local sin añadir un nodo al Canvas. Monaco conserva cursor, selección, undo y cambios sin guardar entre pestañas y paneles.',
      },
      {
        id: 'use-editor-tools',
        title: 'Usa las herramientas del editor',
        body: 'Busca o reemplaza texto, navega por símbolos, formatea archivos compatibles y alterna el ajuste de línea o el minimapa. Configuración → Apariencia también ofrece tamaño de fuente y guardado automático opcional.',
      },
      {
        id: 'inspect-previews',
        title: 'Inspecciona sin otra aplicación',
        body: 'Alterna Markdown entre fuente y vista previa, navega y amplía PDFs o desplaza y amplía imágenes. Los binarios muestran metadatos seguros y pueden abrirse con la aplicación del sistema.',
      },
      {
        id: 'protect-edits',
        title: 'Mantén los cambios explícitos',
        body: 'Las pestañas sin guardar muestran un indicador y piden confirmación al cerrar. Los archivos mayores de 512 KB se abren solo para lectura para no sobrescribir contenido que no fue cargado.',
      },
    ],
  },
  {
    id: 'share-reference-material',
    icon: 'Paperclip',
    title: 'Compartir materiales de referencia',
    tagline: 'Mantén imágenes, PDFs, archivos y enlaces junto al briefing que reciben los agentes.',
    steps: [
      {
        id: 'prepare-reference-note',
        title: 'Prepara un briefing trazable',
        body: 'Crea una nota para reunir el objetivo, las restricciones y las referencias del trabajo. Sigue siendo un nodo del Canvas y también puede abrirse en Workbench.',
        action: { kind: 'createNote', title: 'Briefing con referencias', content: '# Briefing\n\n## Objetivo\n\n## Referencias\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Briefing con referencias' },
      },
      {
        id: 'attach-reference',
        title: 'Adjunta en el contexto correcto',
        body: 'Arrastra, pega o selecciona una imagen, PDF, archivo o enlace HTTP/HTTPS en la nota, el composer de un agente o una tarea. El elemento aparece con nombre, tipo y una acción explícita para quitarlo.',
      },
      {
        id: 'deliver-complete-context',
        title: 'Entrega el briefing completo',
        body: 'Conecta la nota al líder o asigna la tarea. El agente recibe título, descripción y referencias con paths relativos bajo .orkestrai/attachments, sin depender de texto pegado ni de la memoria de la conversación.',
      },
    ],
  },
  {
    id: 'universal-workspace-search',
    icon: 'Search',
    title: 'Usar la búsqueda universal',
    tagline: 'Encuentra y abre cualquier parte del trabajo con Command/Ctrl+K.',
    steps: [
      {
        id: 'open-search',
        title: 'Ábrela desde cualquier pantalla',
        body: 'Presiona Command/Ctrl+K para buscar workspaces, agentes, tareas, notas, roles, skills, archivos, configuración y comandos.',
      },
      {
        id: 'inspect-result',
        title: 'Comprueba el contexto',
        body: 'Navega por los grupos y lee la vista previa antes de abrir. Marca elementos frecuentes con la estrella; los recientes vuelven en la próxima apertura.',
      },
      {
        id: 'place-result',
        title: 'Elige dónde abrir',
        body: 'Abre en el panel actual, a la derecha o abajo. Usa content: antes del término para buscar dentro de archivos, siempre limitado a la carpeta del workspace.',
      },
    ],
  },
  {
    id: 'monitor-team-control-center',
    icon: 'Activity',
    title: 'Supervisar el equipo en el Centro de control',
    tagline: 'Observa la actividad real y verifica cada handoff sin despertar agentes inactivos.',
    steps: [
      {
        id: 'open-control-center',
        title: 'Abre la vista operativa',
        body: 'Ve a Workbench, expande un workspace y abre el Centro de control sobre Archivos. Es una vista local del Workbench y no crea otro nodo en el Canvas.',
        action: { kind: 'openPage', path: '/terminal?workspace={workspace}&node=workbench-control-center:{workspace}' },
      },
      {
        id: 'read-agent-state',
        title: 'Lee el estado real de los agentes',
        body: 'Compara agentes trabajando, esperando respuesta o permiso, bloqueados, inactivos, completados, con error o desconectados. Cada fila incluye tarea actual, última acción relevante, tiempo en el estado, proveedor, rol y uso.',
      },
      {
        id: 'verify-delivery',
        title: 'Verifica las comunicaciones',
        body: 'La bandeja agrupa las transiciones en cola, enviado, entregado, recibido, respondido y falló bajo un id de mensaje. Un orkestrai ask exitoso siempre termina con respuesta confirmada.',
      },
      {
        id: 'switch-without-waking',
        title: 'Cambia de workspace de forma segura',
        body: 'Cambia de vista o reinicia la app. El historial reconstruye el Centro sin inyectar prompts ni activar terminales inactivos; las notificaciones nativas se reservan para atención y finalización reales.',
      },
    ],
  },
  {
    id: 'review-delivery',
    icon: 'GitPullRequestArrow',
    title: 'Revisar una entrega',
    tagline: 'Inspecciona los cambios reales, reúne evidencias y registra una decisión clara.',
    steps: [
      {
        id: 'open-review-center',
        title: 'Abre el Centro de revisión',
        body: 'Ve a Workbench, expande el workspace y abre el Centro de revisión encima de Archivos. Es una vista local y no agrega otro nodo al Canvas.',
        action: { kind: 'openPage', path: '/terminal?workspace={workspace}&node=workbench-review-center:{workspace}' },
      },
      {
        id: 'inspect-diff',
        title: 'Inspecciona los cambios reales',
        body: 'Elige un archivo preparado o no preparado. Monaco compara lado a lado la versión indexada y la modificada; usa la lista para preparar, quitar de preparación o crear el commit sin cambiar de aplicación.',
      },
      {
        id: 'capture-context',
        title: 'Registra el contexto de la entrega',
        body: 'Inicia una revisión, vincula la tarea y el agente responsable y registra el resultado esperado, evidencias, pruebas, riesgos y archivos incluidos. La revisión Git actual queda guardada con ella.',
      },
      {
        id: 'decide',
        title: 'Comenta y decide',
        body: 'Haz clic en una línea del diff para comentar y después aprueba, solicita cambios o rechaza. Los cambios solicitados se envían al agente responsable cuando está conectado; los comentarios siguen visibles y se marcan como desactualizados si cambia el código.',
      },
    ],
  },
  {
    id: 'portal-design-feedback',
    icon: 'ScanSearch',
    title: 'Dar feedback visual desde un Portal',
    tagline: 'Selecciona el elemento exacto de la interfaz y envía contexto seguro y accionable.',
    steps: [
      {
        id: 'open-portal',
        title: 'Abre la página real',
        body: 'Abre un Portal en Canvas o Workbench usando la aplicación instalada. Carga la pantalla y el viewport donde encontraste el problema visual.',
        action: { kind: 'openPage', path: '/canvas' },
      },
      {
        id: 'inspect-element',
        title: 'Selecciona el elemento',
        body: 'Elige Inspeccionar diseño en el encabezado del Portal. Recorre la página para resaltar elementos reales y haz clic en el botón, campo, imagen, título o área de layout exacta. Presiona Escape para cancelar sin modificar la página.',
      },
      {
        id: 'review-context',
        title: 'Revisa antes de enviar',
        body: 'Confirma la captura recortada, selector, texto visible, estilos relevantes, path de la página y viewport. Agrega el resultado esperado. El HTML bruto queda en la vista previa sanitizada; cookies, tokens, storage, headers y query strings se excluyen.',
      },
      {
        id: 'send-feedback',
        title: 'Elige el destino responsable',
        body: 'Crea una tarea para revisión del líder, una tarea ya asignada a un especialista o agrega el feedback y PNG a una tarea existente. Todas las opciones mantienen el contexto y las decisiones trazables en el Kanban.',
      },
    ],
  },
  {
    id: 'council-perspectives',
    icon: 'Scale',
    title: 'Comparar perspectivas con Council',
    tagline: 'Haz la misma pregunta a agentes independientes y conserva la decisión final humana.',
    steps: [
      {
        id: 'open-council',
        title: 'Empieza desde el trabajo',
        body: 'Abre Consejo directamente desde la barra del Canvas o en la parte superior del workspace en Workbench. También puedes usar Pedir perspectivas en una tarea para llevar el briefing completo o desde el menú del líder para preseleccionarlo.',
        action: { kind: 'openCouncil' },
      },
      {
        id: 'configure-council',
        title: 'Limita la comparación',
        body: 'Elige entre dos y cinco agentes reales, asigna un enfoque distinto a cada uno, selecciona modo consultivo o implementación y un criterio de decisión, y define el máximo de ejecuciones. La síntesis opcional del líder consume una ejecución de ese límite.',
      },
      {
        id: 'compare-council',
        title: 'Compara el mismo contrato',
        body: 'Revisa lado a lado propuesta, evidencias verificadas, riesgos, pruebas, divergencias, recomendación y confianza. Las perspectivas completadas siguen siendo útiles cuando falla otro provider; la sugerencia del líder es consultiva, no un veredicto automático.',
      },
      {
        id: 'decide-council',
        title: 'Registra la decisión humana',
        body: 'Selecciona una perspectiva, pide más consenso o rechaza la ronda y guarda tu justificación. En modo implementación, solo un piso seleccionado y confirmado en commit puede aterrizar, después de una nueva vista previa limpia y sin conflictos. Council nunca hace push ni merge por sí solo.',
      },
    ],
  },
  {
    id: 'mobile-device-testing',
    icon: 'Smartphone',
    title: 'Probar una app en iOS o Android',
    tagline: 'Controla, inspecciona y captura un flujo móvil sin salir del workspace.',
    steps: [
      {
        id: 'open-mobile-device',
        title: 'Agrega Dispositivo móvil',
        body: 'Agrega Dispositivo móvil desde la barra del Canvas. Se convierte en un único nodo persistente del workspace; Workbench lista y abre el mismo nodo. Elige iOS Simulator en Apple Silicon o Android en macOS, Windows y Linux con Platform Tools de Android Studio instalado.',
        action: { kind: 'createDevice', title: 'Dispositivo móvil' },
        check: { kind: 'nodeExists', nodeType: 'device' },
      },
      {
        id: 'attach-simulator',
        title: 'Conecta un dispositivo',
        body: 'Elige un iPhone o iPad Simulator, un AVD Android o un dispositivo Android autorizado en ADB y selecciona Iniciar. El hardware Android físico pide confirmación explícita. La pantalla se ajusta por defecto; zoom y 1:1 siguen independientes. Haz clic o arrastra para tocar y deslizar, mientras la barra ofrece los botones del sistema de la plataforma, rotación, pinza, reinicio y detención.',
      },
      {
        id: 'inspect-mobile-flow',
        title: 'Inspecciona el flujo',
        body: 'Abre Herramientas del dispositivo para escribir texto, instalar un build iOS o APK desde un path del workspace, abrir un bundle id o package/activity Android, inspeccionar o cambiar permisos, leer logs y datos de accesibilidad limitados y guardar una captura en .orkestrai/devices/screenshots.',
      },
      {
        id: 'delegate-mobile-check',
        title: 'Delega con evidencias',
        body: 'Pide a un agente que use orkestrai device o las tools MCP equivalentes. Sus toques, swipes, capturas, logs e inspección de accesibilidad usan la sesión de este workspace. Detén la sesión al terminar; Orkestrai también limpia los helpers inactivos iniciados por él.',
      },
    ],
  },
  {
    id: 'workspace-automations',
    icon: 'Workflow',
    title: 'Automatizar trabajo repetible del workspace',
    tagline: 'Conecta un disparador preciso con una acción trazable sin ocultar qué se ejecutó.',
    steps: [
      {
        id: 'open-automations',
        title: 'Abre Automatizaciones',
        body: 'Abre Automatizaciones desde la barra del Canvas, el explorador del Workbench o Command/Ctrl+K. Las mismas automatizaciones y el mismo historial aparecen en todos los accesos.',
        action: { kind: 'openPage', path: '/terminal?workspace={workspace}&node=workbench-automations:{workspace}' },
      },
      {
        id: 'choose-recipe',
        title: 'Empieza con una receta útil',
        body: 'Abre Recetas y elige un punto de partida de desarrollo, diseño, marketing, investigación u operaciones. La receta llena el formulario, pero nunca se ejecuta antes de que la revises y guardes.',
      },
      {
        id: 'configure-trigger-action',
        title: 'Haz explícito el contrato',
        body: 'Elige el evento y la acción exactos. Los disparadores de tarea, mensaje, Git, GitHub, webhook, archivo, uso, agenda y manual pueden enviar un prompt, crear una tarea Kanban o notificar el escritorio.',
      },
      {
        id: 'inspect-history',
        title: 'Sigue cada ejecución',
        body: 'Usa el Historial de ejecuciones para revisar entrada, agente y provider destino, confirmación de salida, duración, intento y fallo. Las ejecuciones fallidas ofrecen un reintento limitado en lugar de desaparecer.',
      },
    ],
  },
  {
    id: 'remote-workspace-collaboration',
    icon: 'RadioTower',
    title: 'Compartir un workspace de forma segura',
    tagline: 'Invita otro dispositivo sin exponer terminales, archivos ni secretos.',
    steps: [
      {
        id: 'open-sharing',
        title: 'Abre el uso compartido',
        body: 'Abre Compartir workspace desde Canvas o Workbench. Esta funcionalidad experimental está desactivada por defecto y debe habilitarse explícitamente en el host.',
        action: { kind: 'openSharing' },
      },
      {
        id: 'create-invite',
        title: 'Elige el destino y el acceso',
        body: 'Selecciona Lector, Colaborador, Operador o Administrador y después Navegador/móvil para la PWA Remote o App Orkestrai para otro escritorio instalado. Envía solo el enlace o código QR correspondiente por un canal confiable.',
      },
      {
        id: 'approve-device',
        title: 'Aprueba el dispositivo correcto',
        body: 'Compara la huella digital del dispositivo antes de aprobarlo. Puedes cambiar su rol, revocarlo de inmediato y revisar cada comando aceptado o rechazado en la auditoría.',
      },
      {
        id: 'work-remotely',
        title: 'Usa o instala Remote',
        body: 'En el navegador o PWA instalable, el invitado sigue el resumen sanitizado, estado del equipo, tareas, revisiones, actividad y uso de proveedores. Su clave de emparejamiento queda no extraíble en ese navegador. El rol puede permitir cambios en tareas, decisiones de revisión o mensajes al líder; la salida PTY, archivos, notas, portales, credenciales y rutas locales nunca entran en la proyección compartida.',
      },
      {
        id: 'stop-sharing',
        title: 'Detén la sesión',
        body: 'Detén el uso compartido cuando termine la colaboración. Orkestrai cierra la sesión del relay, revoca el acceso activo y exige una nueva invitación para volver a conectar otro dispositivo.',
      },
    ],
  },
  {
    id: 'custom-app-theme',
    icon: 'Palette',
    title: 'Personalizar la apariencia',
    tagline: 'Elige un tema listo o ajusta cada token visual de la app.',
    steps: [
      {
        id: 'choose-theme',
        title: 'Elige claro u oscuro',
        body: 'En Configuración → Apariencia, compara Orkestrai Dark, Graphite, Midnight y Orkestrai Light. La opción clara mantiene contraste accesible en nodos, paneles, iconos, marcas de providers y hovers.',
      },
      {
        id: 'edit-tokens',
        title: 'Crea tu propio tema',
        body: 'Duplica el tema más cercano y edita tokens semánticos de superficies, texto, bordes, acento, estados, cuadrícula y conexiones. Usa Guardar para conservarlo.',
      },
      {
        id: 'share-theme',
        title: 'Lleva el tema contigo',
        body: 'Exporta el tema personalizado como JSON e impórtalo en otra instalación. El archivo se valida y no puede ejecutar CSS arbitrario.',
      },
    ],
  },
];
