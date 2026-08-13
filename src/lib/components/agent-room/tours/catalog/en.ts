import type { Tour } from '../types.js';

/** Tour catalog in English — mirror of pt-BR.js (same ids and structure). */
export const TOURS_EN: Tour[] = [
  {
    id: 'team-leader',
    icon: 'Users',
    title: 'Team with a leader (zero-config)',
    tagline: 'A leader that assembles and commands the team for you.',
    steps: [
      {
        id: 'leader',
        title: 'Create the team leader',
        body: 'Everything starts with a leader agent (Maestro Mode). It proposes the team, recruits, connects and distributes work on its own. I\'ll create it for you with one click.',
        action: { kind: 'createAgent', title: 'Líder', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
      {
        id: 'brief',
        title: 'The briefing note',
        body: 'The project spec lives in a note connected to the team. I\'ll create a sample "Briefing" note — edit it with what you want to build.',
        action: { kind: 'createNote', title: 'Briefing', content: '# Briefing\n\nDescribe the project here: goal, scope and definition of done.\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Briefing' },
      },
      {
        id: 'brief-connect',
        title: 'Connect the note to the leader',
        body: 'Connecting the note gives the leader the project context. I\'ll make the connection for you.',
        action: { kind: 'connect', fromTitle: 'Briefing', toTitle: 'Líder' },
        check: { kind: 'edgeExists', fromTitle: 'Briefing', toTitle: 'Líder' },
      },
      {
        id: 'board',
        title: 'The task board',
        body: 'The team kanban: cards in To do/Doing/Done. I\'ll create the board and the first task assigned to the leader — it breaks down and distributes the rest.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'first-task',
        title: 'First task for the leader',
        body: 'I\'ll create the task "Assemble the team and start" assigned to the leader. The complete brief lands in their terminal; every work item they delegate must also exist with an assignee on the board.',
        action: { kind: 'createTask', title: 'Assemble the team and start (read the Briefing note)', assigneeTitle: 'Líder' },
        check: { kind: 'taskExists', titleIncludes: 'Assemble the team' },
      },
      {
        id: 'talk',
        title: 'Give the order',
        body: 'In the leader\'s terminal, say: "read the Briefing note, propose the team and start". Agent consultations count only after ask confirms the reply; when someone finishes with task done, the leader receives the handoff automatically.',
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
    ],
  },
  {
    id: 'vigia-24-7',
    icon: 'Repeat',
    title: '24/7 worker (task watcher)',
    tagline: 'An agent that works nonstop, minute after minute.',
    steps: [
      {
        id: 'leader',
        title: 'The watcher',
        body: 'A leader agent stays on duty: every few minutes it checks the board, assigns whatever has no owner and recruits when people are missing.',
        action: { kind: 'createAgent', title: 'Vigia', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Vigia' },
      },
      {
        id: 'board',
        title: 'The watched board',
        body: 'It needs a board to watch. I\'ll create the Tasks node for you.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'routine',
        title: 'The duty routine',
        body: 'I\'ll create the routine: every 5 minutes the watcher gets "check the board (orkestrai task list); assign what has no owner; recruit if someone is missing".',
        action: { kind: 'createRoutine', targetTitle: 'Vigia', prompt: 'Check the board with: orkestrai task list. Assign whatever has no owner. If an agent is missing, recruit (orkestrai recruit).', intervalMinutes: 5 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'drop-task',
        title: 'Test with a task',
        body: 'Create any task on the board (or use "Do it for me") and watch: within 5 minutes the watcher picks it up and distributes it on its own.',
        action: { kind: 'createTask', title: 'Watcher test task' },
        check: { kind: 'taskExists', titleIncludes: 'Watcher' },
      },
    ],
  },
  {
    id: 'duas-features',
    icon: 'GitBranch',
    title: 'Two features in parallel, no conflicts',
    tagline: 'Two teams, two floors, zero stepping on toes.',
    steps: [
      {
        id: 'floor',
        title: 'Create a floor',
        body: 'A floor is an isolated copy of the project (git worktree) with its own branch. Team B works in it while team A stays on the main one. I\'ll create the "new-feature" floor for you.',
        action: { kind: 'createFloor', name: 'new-feature' },
        check: { kind: 'floorExists', nameIncludes: 'feature' },
      },
      {
        id: 'agents',
        title: 'One agent per front',
        body: 'I\'ll create two agents: one works on the main floor, the other on the new feature. Move the second to the floor layer (Floors panel in the bottom bar).',
        action: { kind: 'createAgent', title: 'Dev Principal', provider: 'claude' },
      },
      {
        id: 'agent-b',
        title: 'The feature agent',
        body: 'I\'ll create the B-front agent. In the Floors panel, switch the visible layer and drag it there — it starts working in the floor checkout.',
        action: { kind: 'createAgent', title: 'Dev Feature', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Dev Feature' },
      },
      {
        id: 'land',
        title: 'Merging back',
        body: 'When the feature is done: Floors panel → preview shows conflicts BEFORE the merge; land merges everything. Conflicts become a task for an agent to solve. Finish when the floor exists.',
        check: { kind: 'floorExists', nameIncludes: 'feature' },
      },
    ],
  },
  {
    id: 'qa-visual',
    icon: 'Workflow',
    title: 'Visual QA of your app',
    tagline: 'An agent that opens your app and tests it for real.',
    steps: [
      {
        id: 'portal',
        title: 'The portal (the agents\' browser)',
        body: 'The portal is an embedded browser the agents control. I\'ll create one pointing at your dev server — adjust the URL later if it isn\'t localhost:5173.',
        action: { kind: 'createPortal', url: 'http://localhost:5173', title: 'Portal App' },
        check: { kind: 'nodeExists', nodeType: 'portal' },
      },
      {
        id: 'qa',
        title: 'The QA agent',
        body: 'I\'ll create the agent that will test. Connect it to the portal so it can see the page.',
        action: { kind: 'createAgent', title: 'QA', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'QA' },
      },
      {
        id: 'connect',
        title: 'Connect QA to the portal',
        body: 'Connected, QA navigates, reads the DOM, runs JS and takes screenshots. I\'ll make the connection.',
        action: { kind: 'connect', fromTitle: 'QA', toTitle: 'Portal App' },
        check: { kind: 'edgeExists', fromTitle: 'QA', toTitle: 'Portal App' },
      },
      {
        id: 'test',
        title: 'Ask for the test',
        body: 'In QA\'s terminal: "open the portal, run the app\'s main flow, take a screenshot and tell me what broke". It executes and reports.',
      },
    ],
  },
  {
    id: 'pesquisa-resumo',
    icon: 'Search',
    title: 'Automated research with summary',
    tagline: 'The agent researches the web and writes the summary in a note.',
    steps: [
      {
        id: 'note',
        title: 'The summary note',
        body: 'I\'ll create the "Summary" note — where the agent writes the findings in bullet points.',
        action: { kind: 'createNote', title: 'Summary', content: '# Summary\n\n(research findings appear here in bullet points)\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Summary' },
      },
      {
        id: 'portal',
        title: 'The research portal',
        body: 'I\'ll create a portal open on Google — the agent uses it to read sources.',
        action: { kind: 'createPortal', url: 'https://www.google.com', title: 'Research Portal' },
        check: { kind: 'nodeExists', nodeType: 'portal' },
      },
      {
        id: 'agent',
        title: 'The researcher',
        body: 'I\'ll create the researcher agent and connect it to the portal and the note — portal to read, note to write.',
        action: { kind: 'createAgent', title: 'Researcher', provider: 'kimi' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Researcher' },
      },
      {
        id: 'connect',
        title: 'Working connections',
        body: 'I\'ll make both connections: Researcher ↔ Research Portal and Researcher ↔ Summary. Then say: "use the portal to read about X and write the summary in the note".',
        action: [
          { kind: 'connect', fromTitle: 'Researcher', toTitle: 'Research Portal' },
          { kind: 'connect', fromTitle: 'Researcher', toTitle: 'Summary' },
        ],
        check: { kind: 'edgeExists', fromTitle: 'Researcher', toTitle: 'Research Portal' },
      },
    ],
  },
  {
    id: 'inbox-arquivos',
    icon: 'FolderPlus',
    title: 'Self-processing file inbox',
    tagline: 'Drop files in the folder; the team processes them in batch.',
    steps: [
      {
        id: 'agent',
        title: 'The processor',
        body: 'I\'ll create the agent that will watch the ./inbox folder in your project (create the folder later if it doesn\'t exist).',
        action: { kind: 'createAgent', title: 'Processor', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Processor' },
      },
      {
        id: 'routine',
        title: 'The sweep routine',
        body: 'I\'ll create the routine: every 2 minutes it lists ./inbox, describes/classifies what\'s new, moves it to ./inbox/done and logs it on the board.',
        action: { kind: 'createRoutine', targetTitle: 'Processor', prompt: 'List ./inbox; for each new file, describe and classify it; move it to ./inbox/done and log it on the board with orkestrai task add.', intervalMinutes: 2 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'test',
        title: 'Drop a file',
        body: 'Create the ./inbox folder in the project and drop any file. Within 2 minutes the processor describes, classifies and archives it.',
      },
    ],
  },
  {
    id: 'revisao-cruzada',
    icon: 'Cable',
    title: 'Cross-review between providers',
    tagline: 'Claude implements, Codex reviews. Two looks per change.',
    steps: [
      {
        id: 'dev',
        title: 'The implementer',
        body: 'I\'ll create the Claude that implements the changes.',
        action: { kind: 'createAgent', title: 'Claude Dev', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Claude Dev' },
      },
      {
        id: 'reviewer',
        title: 'The reviewer',
        body: 'I\'ll create the Codex reviewer — a different model reviewing with another perspective.',
        action: { kind: 'createAgent', title: 'Codex Reviewer', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Codex Reviewer' },
      },
      {
        id: 'connect',
        title: 'Connect the two',
        body: 'I\'ll make the connection: anything one asks the other travels through it (and it glows green while they talk).',
        action: { kind: 'connect', fromTitle: 'Claude Dev', toTitle: 'Codex Reviewer' },
        check: { kind: 'edgeExists', fromTitle: 'Claude Dev', toTitle: 'Codex Reviewer' },
      },
      {
        id: 'flow',
        title: 'The review flow',
        body: 'Tell Claude Dev: "implement X and ask Codex Reviewer for a review (orkestrai ask)". It implements, Codex critiques, the verdict comes back on the same rope.',
      },
    ],
  },
  {
    id: 'sentinela-deploy',
    icon: 'Rocket',
    title: 'Deploy & tests sentinel',
    tagline: 'Every hour: tests run, failures become a task + notification.',
    steps: [
      {
        id: 'agent',
        title: 'The sentinel',
        body: 'I\'ll create the agent that watches the project\'s health.',
        action: { kind: 'createAgent', title: 'Sentinel', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Sentinel' },
      },
      {
        id: 'board',
        title: 'The incident board',
        body: 'Failures become cards on the board. I\'ll create the Tasks node.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'routine',
        title: 'The hourly patrol',
        body: 'I\'ll create the routine: every 60 minutes it runs the tests; on failure, it opens a task for the team and notifies you on the desktop.',
        action: { kind: 'createRoutine', targetTitle: 'Sentinel', prompt: 'Run the project tests. On failure, open a task for the team (orkestrai task add) and notify the user (orkestrai notify).', intervalMinutes: 60 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'test',
        title: 'Break it on purpose (optional)',
        body: 'Introduce an error in the code and watch the next patrol open the task and fire the native notification.',
      },
    ],
  },
  {
    id: 'preset-bootstrap',
    icon: 'Layers',
    title: 'Your framework preset',
    tagline: 'Build the team once; every new project starts ready.',
    steps: [
      {
        id: 'team',
        title: 'Build the default team',
        body: 'Create the team you use in every project (leader, devs, roles, bootstrap note with your framework conventions). I\'ll create the leader to start.',
        action: { kind: 'createAgent', title: 'Líder', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
      {
        id: 'save',
        title: 'Save as preset',
        body: 'With the team assembled: pencil next to the workspace name in the sidebar → "Save as preset". The snapshot stores agents, layout, notes, roles and routines (no sessions).',
      },
      {
        id: 'use',
        title: 'Use it in the next project',
        body: 'When creating a new workspace (+ in the sidebar), pick the preset under "Start from a preset" — the whole team is instantiated in the project. Manage presets in Settings.',
      },
    ],
  },
  {
    id: 'pipeline-aprovacao',
    icon: 'Workflow',
    title: 'Write → review → approve pipeline',
    tagline: 'A 3-step flow with a pause for your OK.',
    steps: [
      {
        id: 'agents',
        title: 'Dev and reviewer',
        body: 'I\'ll create the two pipeline agents: the Dev (writes) and the Reviewer (critiques).',
        action: { kind: 'createAgent', title: 'Dev', provider: 'claude' },
      },
      {
        id: 'reviewer',
        title: 'The reviewer',
        body: 'I\'ll create the pipeline reviewer.',
        action: { kind: 'createAgent', title: 'Reviewer', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Reviewer' },
      },
      {
        id: 'flow',
        title: 'The 3-step flow',
        body: 'I\'ll create the Flow node: step 1 the Dev writes ({{input}} = your entry), step 2 the Reviewer critiques the Dev\'s output, step 3 pauses for YOUR approval.',
        action: {
          kind: 'createFlow',
          title: 'Review pipeline',
          steps: [
            { kind: 'agent', target: 'Dev', prompt: 'Write the solution for: {{input}}' },
            { kind: 'agent', target: 'Reviewer', prompt: 'Review critically, point out problems and improvements: {{input}}' },
            { kind: 'approval' },
          ],
        },
        check: { kind: 'nodeExists', nodeType: 'flow' },
      },
      {
        id: 'run',
        title: 'Run the flow',
        body: 'In the Flow node: write the input (e.g., "form validation with zod") and click Run. Watch the steps light up and approve at the final step.',
      },
    ],
  },
  {
    id: 'mcp-tools',
    icon: 'Cable',
    title: 'External tools via MCP',
    tagline: 'GitHub, docs and web in the agents\' hands — with one click.',
    steps: [
      {
        id: 'install',
        title: 'Install an MCP with 1 click',
        body: 'I\'ll install DeepWiki (documentation for any repository, zero configuration) in this workspace — no command, no token.',
        action: { kind: 'installMcp', key: 'deepwiki' },
        check: { kind: 'mcpInstalled', name: 'deepwiki' },
      },
      {
        id: 'market',
        title: 'The MCP marketplace',
        body: 'Skills page → MCPs tab: official curation (GitHub, Gmail, Figma, Drive, Vercel...) + the full registry. Ones that need a token open a guided dialog.',
      },
      {
        id: 'use',
        title: 'Use it in an agent',
        body: 'In an agent terminal (Claude/Kimi), ask something the MCP does — e.g., "ask DeepWiki how auth works in repository X". The tool appears natively in the agent.',
      },
    ],
  },
  {
    id: 'chained-flows',
    icon: 'Workflow',
    title: 'Chained flows',
    tagline: 'One flow triggers the next — compound pipelines and fan-out.',
    steps: [
      {
        id: 'first-flow',
        title: 'The first link',
        body: 'I create the "Research" Flow with an approval step — so you can simulate the stage without needing a real agent.',
        action: { kind: 'createFlow', title: 'Research', steps: [{ kind: 'approval' }] },
        check: { kind: 'nodeExists', nodeType: 'flow', titleIncludes: 'Research' },
      },
      {
        id: 'second-flow',
        title: 'The second link',
        body: 'I create the "Writing" Flow — when Research finishes successfully, its output becomes the Writing input by itself.',
        action: { kind: 'createFlow', title: 'Writing', steps: [{ kind: 'approval' }] },
        check: { kind: 'nodeExists', nodeType: 'flow', titleIncludes: 'Writing' },
      },
      {
        id: 'chain',
        title: 'Connect the two flows',
        body: 'I wire Research → Writing with an edge: the edge is what tells where the output goes when the flow finishes.',
        action: { kind: 'connect', fromTitle: 'Research', toTitle: 'Writing' },
        check: { kind: 'edgeExists', fromTitle: 'Research', toTitle: 'Writing' },
      },
      {
        id: 'run-chain',
        title: 'Run it and watch the chaining',
        body: 'On the Research Flow: click Run and then Approve. When it finishes, Writing fires by itself with the output — failure does not chain and cycles are blocked. Fan-out: connect a third flow to Research and both fire together. And the Sync button turns every agent connected to a flow into a step, in edge order.',
      },
    ],
  },

  {
    id: 'design-figma',
    icon: 'Palette',
    title: 'From Figma to code',
    tagline: 'Figma mockup becomes faithful UI with the designer agent.',
    steps: [
      {
        id: 'designer',
        title: 'The designer agent',
        body: 'I create the Designer (Claude) — it will read your visual references and generate the UI.',
        action: { kind: 'createAgent', title: 'Designer', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Designer' },
      },
      {
        id: 'image',
        title: 'The visual reference',
        body: 'Add an Image node (bottom bar), paste the Figma screenshot with Ctrl+V and connect it to the Designer — that is how it sees the mockup.',
      },
      {
        id: 'mcp',
        title: 'Figma MCP (optional and powerful)',
        body: 'Skills page → MCPs tab → search "Figma" and install with your token (Figma profile → Settings → Personal access tokens). With it the Designer reads frames, components and styles STRAIGHT from the file — no screenshots.',
      },
    ],
  },
  {
    id: 'managed-ports',
    icon: 'RadioTower',
    title: 'Release dev server ports',
    tagline: 'See and stop local listeners without leaving the canvas.',
    steps: [
      {
        id: 'portal',
        title: 'Register the app in a Portal',
        body: 'I create a local Portal on port 4173. This persisted link is what lets Orkestrai manage the port safely.',
        action: { kind: 'createPortal', url: 'http://localhost:4173', title: 'Dev Portal' },
        check: { kind: 'nodeExists', nodeType: 'portal', titleIncludes: 'Dev Portal' },
      },
      {
        id: 'server',
        title: 'Start your dev server',
        body: 'In the project terminal, start the app on the same port as the Portal. You can use `orkestrai port 4173` to pick a free port before starting the server.',
      },
      {
        id: 'panel',
        title: 'Open Ports and release the listener',
        body: 'In the bottom toolbar, immediately after Usage, open Ports. The process appears as in use; click the stop icon and confirm. The Portal stays saved for the next run.',
      },
    ],
  },
  {
    id: 'leader-dictation',
    icon: 'Mic',
    title: 'Dictate into any field',
    tagline: 'Speak wherever you are writing, without requiring a leader.',
    steps: [
      {
        id: 'field',
        title: 'Place the cursor',
        body: 'Focus any editable field: task title or description, role, note, or form. Dictation follows the last field and its current selection.',
      },
      {
        id: 'record',
        title: 'Click the voice orb',
        body: 'Use the colored orb or Alt+Space to record. The first click preserves the focused field. Its small clickable badge shows whether it is pinned or movable and opens position controls directly; the tooltip also displays the Ctrl-click or Command-click shortcut. Unpin the orb to drag it inside the visible canvas.',
      },
      {
        id: 'auto-submit',
        title: 'Choose whether the terminal sends',
        body: 'Under Settings → Voice dictation, enable Send automatically in terminals to append Enter to the transcript. It only submits in terminals; kanban, roles, notes, and forms still only receive text.',
      },
      {
        id: 'fallback',
        title: 'Use the leader shortcut in either view',
        body: 'With no active field, the orb sends the transcript to the Maestro leader in Canvas or Workbench. I create one to test; without a field or leader, the app shows a warning. On macOS, Fn/Globe by itself is reserved by the system, so configure a key combination or F1–F12.',
        action: { kind: 'createAgent', title: 'Voice Leader', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Voice Leader' },
      },
    ],
  },
  {
    id: 'switch-agent-provider',
    icon: 'Cable',
    title: 'Change an agent provider',
    tagline: 'Change the execution model without dismantling the team.',
    steps: [
      {
        id: 'open',
        title: 'Open the switcher in the header',
        body: 'Click ⇄ on the agent you want to replace. The menu lists providers detected on this device and marks the current one.',
      },
      {
        id: 'choose',
        title: 'Choose an installed provider',
        body: 'The switch closes the previous PTY and conversation, then starts a clean session with the new adapter and its access flags.',
      },
      {
        id: 'preserve',
        title: 'Continue with the same member',
        body: 'Name, role, Maestro Mode, floor, position, and connections remain. Reapply any needed context in the new conversation and continue from the same board.',
      },
    ],
  },
  {
    id: 'multilingual-spoken-replies',
    icon: 'Languages',
    title: 'Spoken replies in three languages',
    tagline: 'Choose, test and use a local voice suited to the language.',
    steps: [
      {
        id: 'choose',
        title: 'Choose the voice in Settings',
        body: 'Open Settings → Voice and select Portuguese (Brazil), English (United States) or Spanish (Latin America). Each option sets both the speaker and synthesis language.',
      },
      {
        id: 'preview',
        title: 'Listen before using it',
        body: 'Adjust speed from 0.75× to 1.50× and click Play preview. On first use, confirm the local download; after that all three voices work offline on macOS, Linux and Windows.',
      },
      {
        id: 'enable',
        title: 'Enable it on the agent',
        body: 'Return to the canvas and click the speaker in the terminal. The next reply is spoken with the selected voice, sentence by sentence, while dictation continues using the same Parakeet as before.',
      },
    ],
  },
  {
    id: 'team-template-library',
    icon: 'LayoutTemplate',
    title: 'Start with a ready-made team',
    tagline: 'Choose the stack and get agents, roles, skills, and a board already organized.',
    steps: [
      {
        id: 'preset-library',
        title: 'Open the preset library',
        body: 'Use the template icon in the sidebar or Presets in the bottom toolbar. Filter by Product, Development, Design and creative, Marketing and content, or Orkestrai.',
      },
      {
        id: 'create-or-merge',
        title: 'Create from scratch or add to the current team',
        body: 'New workspace prepares the selected project with layout, tasks, roles, and skills. The + button adds the same team to the current canvas without removing your nodes.',
      },
      {
        id: 'operate',
        title: 'Complete the team and track floors',
        body: 'Extensive roles enter automatically in the first session and the lead receives the complete initial task to assign. In Floors, track each task title, stage, and actual assignee before reviewing and landing.',
      },
    ],
  },
  {
    id: 'custom-board-stages',
    icon: 'Workflow',
    title: 'Adapt the board to your process',
    tagline: 'Replace a generic kanban with the stages your team actually uses.',
    steps: [
      {
        id: 'board',
        title: 'Create the work board',
        body: 'I create a Tasks node. It starts simple and can represent a campaign, content production, design project, or software delivery.',
        action: { kind: 'createTasksBoard' },
        check: { kind: 'nodeExists', nodeType: 'tasks', titleIncludes: 'Tasks' },
      },
      {
        id: 'stages',
        title: 'Define your stages',
        body: 'Click the columns icon in the board header. Rename, recolor, reorder, and add stages such as Ideas, Approval, and Published.',
      },
      {
        id: 'team-awareness',
        title: 'The team follows the same workflow',
        body: 'The lead and specialists receive the stages automatically. They create and move deliveries while you track everything visually.',
      },
    ],
  },
  {
    id: 'campaign-ready-team',
    icon: 'Palette',
    title: 'Launch a campaign with a ready team',
    tagline: 'Strategy, research, copy, and measurement arrive already organized.',
    steps: [
      {
        id: 'library',
        title: 'Open the Preset library',
        body: 'Choose Marketing and content → Campaign and launch. Brand and design and Content and SEO are ready for other kinds of work.',
      },
      {
        id: 'apply',
        title: 'Start new or add to this workspace',
        body: 'New workspace creates the team in another folder. The + button adds its lead and specialists to the current canvas without removing anything.',
      },
      {
        id: 'brief',
        title: 'Complete the brief and set the objective',
        body: 'Fill in objective, audience, offer, channels, deadline, and measurement in the created note. Then talk to the lead, which coordinates research, copy, distribution, and approval.',
      },
    ],
  },
  {
    id: 'orkestrai-consensus-team',
    icon: 'LayoutTemplate',
    title: 'Contribute to Orkestrai through consensus',
    tagline: 'Claude, Codex, and Kimi agree on the plan before execution.',
    steps: [
      {
        id: 'apply',
        title: 'Apply Orkestrai Contributing',
        body: 'In the Library’s Orkestrai category, create the complete team with a lead, two oracles, and Svelar, desktop, and QA/release specialists.',
      },
      {
        id: 'consensus',
        title: 'Run the consensus Flow',
        body: 'Codex proposes or audits architecture, Kimi reviews product, UX, and risks, and Claude synthesizes. Both oracles must answer APPROVED.',
      },
      {
        id: 'delivery',
        title: 'Only then distribute tasks',
        body: 'After approval, the lead records the decision, creates complete briefs, and tracks Review and Validation until tests, build, documentation, and changelog pass.',
      },
    ],
  },
  {
    id: 'provider-center-setup',
    icon: 'Cable',
    title: 'Prepare your AI providers',
    tagline: 'See what is ready and follow official setup without guessing commands.',
    steps: [
      {
        id: 'open-center',
        title: 'Open Provider Center',
        body: 'Use the cable icon in the left sidebar, Cmd/Ctrl+2, or Workspace → Provider Center. It checks Claude, Codex, Kimi, OpenCode, Cursor, Antigravity, Cline, and Devin locally.',
      },
      {
        id: 'follow-setup',
        title: 'Follow the setup for your device',
        body: 'Expand an agent to see the official guide and, when available, an installation command for macOS, Windows, or Linux. Complete sign-in in the provider’s own CLI; Orkestrai never receives the credential.',
      },
      {
        id: 'verify',
        title: 'Check again and create the agent',
        body: 'Return to Provider Center and use Check again. When the CLI is detected, go back to the canvas and create that agent from the bottom toolbar.',
      },
    ],
  },
  {
    id: 'choose-agent-provider',
    icon: 'Users',
    title: 'Choose agents without learning the terminal',
    tagline: 'Use a service you already have and organize the team by outcome.',
    steps: [
      {
        id: 'available',
        title: 'See what is already available',
        body: 'The bottom toolbar detects Claude, Codex, Kimi, OpenCode, Cursor, Antigravity, Cline, and Devin. Available services are active; disabled ones only need installation and sign-in.',
      },
      {
        id: 'outcome',
        title: 'Name the work, not the technology',
        body: 'Create “Audience research”, “Art direction”, “Campaign copy”, or “Product review”. Roles, notes, and tasks tell the agent what to deliver even if you never use a terminal outside Orkestrai.',
      },
      {
        id: 'perspective',
        title: 'Combine only when it helps',
        body: 'One provider is enough to start. Add another to review an important decision or bring an independent perspective; Orkestrai keeps every conversation separate and tied to the workspace.',
      },
    ],
  },
  {
    id: 'pin-favorite-agents',
    icon: 'Pin',
    title: 'Keep favorite agents within reach',
    tagline: 'Make the toolbar fit your routine without hiding other options.',
    steps: [
      {
        id: 'open-agents',
        title: 'Open the Agents menu',
        body: 'Use Agents in the bottom toolbar to see every supported service. Selecting a ready agent arms the same draw tool as before; an agent that needs setup opens Provider Center.',
      },
      {
        id: 'pin-favorites',
        title: 'Pin up to four favorites',
        body: 'In Pinned to toolbar, check the services you use most. Ready favorites appear as direct buttons beside Agents in the order you selected them.',
      },
      {
        id: 'keep-your-preference',
        title: 'Use the same toolbar everywhere',
        body: 'Your selection is global and survives workspace switches and app restarts. If a pinned CLI becomes unavailable, it stays saved but does not take toolbar space.',
      },
    ],
  },
  {
    id: 'devin-local-agent',
    icon: 'Cable',
    title: 'Add Devin to the local team',
    tagline: 'Use the official local agent with the same canvas workflow.',
    steps: [
      {
        id: 'prepare',
        title: 'Prepare the official CLI',
        body: 'Open Provider Center, expand Devin, and follow the installation and sign-in guidance. Check again until Devin appears as ready.',
      },
      {
        id: 'create',
        title: 'Create the Devin member',
        body: 'Return to the canvas and select Devin in the bottom toolbar. Search or scroll the bounded model list, choose one available to your account, and start with autonomous workspace access.',
      },
      {
        id: 'continue',
        title: 'Work through the bridge',
        body: 'Connect Devin to the leader, board, or notes. Orkestrai provisions its MCP tools and skill, keeps agent replies clean, and resumes the exact conversation after a restart.',
      },
    ],
  },
  {
    id: 'quota-aware-delegation',
    icon: 'RadioTower',
    title: 'Quota-aware delegation',
    tagline: 'The leader sees provider limits before distributing new work.',
    steps: [
      {
        id: 'add-usage',
        title: 'Put Usage on the canvas',
        body: 'I create a persistent Usage node with Claude as source, Codex as fallback, and a 90% initial threshold. It checks Claude, Codex, and Kimi every five minutes.',
        action: { kind: 'createUsage', title: 'Provider usage' },
        check: { kind: 'nodeExists', nodeType: 'usage', titleIncludes: 'Provider usage' },
      },
      {
        id: 'set-policy',
        title: 'Adjust the policy',
        body: 'In the node, choose the source, a different fallback, the 5-hour, weekly, or monthly window, and the percentage that means "near the limit". If the provider does not report that period, the node asks for another window.',
      },
      {
        id: 'leader-checks',
        title: 'The leader checks before delegating',
        body: 'The skill teaches the leader to call orkestrai usage before distributing new work. It recommends a healthy fallback without silently moving tasks or conversations already in progress.',
      },
    ],
  },
  {
    id: 'organize-canvas',
    icon: 'LayoutGrid',
    title: 'Organize the canvas',
    tagline: 'Realign a selection or the whole workspace without overlaps.',
    steps: [
      {
        id: 'choose-scope',
        title: 'Choose what moves',
        body: 'Select the nodes that need attention. With a selection, Orkestrai moves only those nodes; with nothing selected, it organizes the entire canvas.',
      },
      {
        id: 'run-layout',
        title: 'Run Organize canvas',
        body: 'Use the toolbar action, command palette, or Command+Shift+T. The deterministic layout arranges nodes into readable rows without stacking them.',
      },
      {
        id: 'keep-connections-clear',
        title: 'Keep the workspace readable',
        body: 'Connections remain behind every node, including on Windows displays with different scale factors. You can still fine-tune positions manually afterward.',
      },
    ],
  },
  {
    id: 'focused-workspace-view',
    icon: 'PanelLeftOpen',
    title: 'Work in the Workbench',
    tagline: 'Open, organize, and compare artifacts without losing the canvas.',
    steps: [
      {
        id: 'switch-view',
        title: 'Switch the view',
        body: 'Use Canvas/Workbench in the upper-left corner or open Workbench from the Workspace menu. Agents remain in the same sessions while you switch modes.',
      },
      {
        id: 'choose-item',
        title: 'Choose where to work',
        body: 'Expand a workspace or use search. Open items use vertical tabs by default; you can choose horizontal tabs under Settings → Appearance.',
      },
      {
        id: 'split-work',
        title: 'Build your work area',
        body: 'Split the active pane right or down and arrange up to eight resizable artifacts. Drag tabs between panes or use the Move to menu; the layout returns with the workspace.',
      },
      {
        id: 'attach-context',
        title: 'Keep references with the work',
        body: 'Drop, paste, or select images, PDFs, files, and links in notes, cards, or the agent composer. Files up to 10 MB stay in the workspace and the complete reference reaches the brief.',
      },
      {
        id: 'monitor-provider-usage',
        title: 'Monitor quotas in the footer',
        body: 'The footer shows the 5-hour, weekly, and monthly windows actually reported by Claude, Codex, and Kimi. Click any provider to open Usage details.',
      },
      {
        id: 'terminal-options',
        title: 'Keep terminal options organized',
        body: 'Open the ellipsis menu in the header to change provider or role, visually choose 1 of 10 ANSI themes, reload, toggle Maestro Mode, or remove the terminal.',
      },
      {
        id: 'dictate-to-leader',
        title: 'Dictate without returning to Canvas',
        body: 'When pinned, the voice orb uses a dedicated header slot without covering tabs or actions. With no text field active, it finds the workspace leader, opens that terminal, and starts the same flow used in Canvas.',
      },
      {
        id: 'return-canvas',
        title: 'Return to visual context',
        body: 'Click the canvas icon in the header or use the switch. The workspace stays active and the selected node is centered on the canvas.',
      },
    ],
  },
  {
    id: 'edit-and-preview-files',
    icon: 'FileCode2',
    title: 'Edit and preview files',
    tagline: 'Use a complete local editor and inspect common file formats in place.',
    steps: [
      {
        id: 'open-file',
        title: 'Open a workspace file',
        body: 'Expand Files in the Workbench sidebar and choose a text file. It opens directly in a local editor tab without adding a node to Canvas. Monaco keeps cursor, selection, undo, and unsaved edits across tabs and panes.',
      },
      {
        id: 'use-editor-tools',
        title: 'Use the editor tools',
        body: 'Find or replace text, navigate symbols, format supported files, and toggle wrapping or the minimap. Settings → Appearance also offers font size and optional autosave.',
      },
      {
        id: 'inspect-previews',
        title: 'Inspect without another app',
        body: 'Switch Markdown between source and preview, browse and zoom PDFs, or pan and zoom images. Binary files show safe metadata and can open in the system application.',
      },
      {
        id: 'protect-edits',
        title: 'Keep changes explicit',
        body: 'Unsaved tabs show a status dot and ask before closing. Files above 512 KB open read-only so content that was not loaded is never overwritten.',
      },
    ],
  },
  {
    id: 'universal-workspace-search',
    icon: 'Search',
    title: 'Use universal search',
    tagline: 'Find and open any part of the work with Command/Ctrl+K.',
    steps: [
      {
        id: 'open-search',
        title: 'Open it from any screen',
        body: 'Press Command/Ctrl+K to search workspaces, agents, tasks, notes, roles, skills, files, settings, and commands.',
      },
      {
        id: 'inspect-result',
        title: 'Check the context',
        body: 'Navigate the groups and read the preview before opening. Star frequent items; recently used items return the next time search opens.',
      },
      {
        id: 'place-result',
        title: 'Choose where it opens',
        body: 'Open in the current pane, right, or below. Prefix the term with content: to search inside files, always confined to the workspace folder.',
      },
    ],
  },
  {
    id: 'monitor-team-control-center',
    icon: 'Activity',
    title: 'Monitor the team in Control Center',
    tagline: 'See real activity and verify every handoff without waking idle agents.',
    steps: [
      {
        id: 'open-control-center',
        title: 'Open the operational view',
        body: 'Go to Workbench, expand a workspace, and open Control Center above Files. It is a local Workbench view and does not create another Canvas node.',
        action: { kind: 'openPage', path: '/terminal' },
      },
      {
        id: 'read-agent-state',
        title: 'Read the real agent state',
        body: 'Compare working, waiting for input or permission, blocked, idle, done, error, and disconnected agents. Each row includes the current task, last significant action, time in state, provider, role, and usage.',
      },
      {
        id: 'verify-delivery',
        title: 'Verify communications',
        body: 'The inbox groups queued, sent, delivered, acknowledged, replied, and failed transitions under one message id. A successful orkestrai ask always ends with a confirmed reply.',
      },
      {
        id: 'switch-without-waking',
        title: 'Move between workspaces safely',
        body: 'Switch views or restart the app. Event history reconstructs the Control Center without injecting prompts or activating idle terminals; native notifications remain reserved for real attention and completion.',
      },
    ],
  },
  {
    id: 'review-delivery',
    icon: 'GitPullRequestArrow',
    title: 'Review a delivery',
    tagline: 'Inspect the actual changes, collect evidence, and send a clear decision.',
    steps: [
      {
        id: 'open-review-center',
        title: 'Open the Review Center',
        body: 'Go to Workbench, expand the workspace, and open Review Center above Files. It is a local view and does not add a node to Canvas.',
        action: { kind: 'openPage', path: '/terminal' },
      },
      {
        id: 'inspect-diff',
        title: 'Inspect the real changes',
        body: 'Choose a staged or unstaged file. Monaco compares the indexed and changed versions side by side; use the source list to stage, unstage, or commit without switching applications.',
      },
      {
        id: 'capture-context',
        title: 'Capture delivery context',
        body: 'Start a review, link the task and responsible agent, and record the expected outcome, evidence, tests, risks, and included files. The current Git revision is saved with it.',
      },
      {
        id: 'decide',
        title: 'Comment and decide',
        body: 'Click a diff line to comment, then approve, request changes, or reject. Requested changes are submitted to the responsible agent when online; comments remain visible and are marked outdated if the code changes.',
      },
    ],
  },
  {
    id: 'portal-design-feedback',
    icon: 'ScanSearch',
    title: 'Give visual feedback from a Portal',
    tagline: 'Select the exact interface element and send safe, actionable context.',
    steps: [
      {
        id: 'open-portal',
        title: 'Open the real page',
        body: 'Open a Portal in Canvas or Workbench using the installed desktop app. Load the screen and viewport where you found the visual problem.',
        action: { kind: 'openPage', path: '/canvas' },
      },
      {
        id: 'inspect-element',
        title: 'Select the element',
        body: 'Choose Inspect design in the Portal header. Move over the page to highlight real elements and click the exact button, field, image, heading, or layout area. Press Escape to cancel without changing the page.',
      },
      {
        id: 'review-context',
        title: 'Review before sending',
        body: 'Confirm the cropped screenshot, selector, visible text, relevant styles, page path, and viewport. Add the expected outcome. Raw HTML stays in the sanitized preview; cookies, tokens, storage, headers, and query strings are excluded.',
      },
      {
        id: 'send-feedback',
        title: 'Choose the responsible destination',
        body: 'Create a task for leader triage, a task already assigned to a specialist, or append the feedback and PNG to an existing task. Every option keeps context and decisions traceable on the Kanban board.',
      },
    ],
  },
  {
    id: 'custom-app-theme',
    icon: 'Palette',
    title: 'Customize the appearance',
    tagline: 'Choose a ready theme or adjust every visual token in the app.',
    steps: [
      {
        id: 'choose-theme',
        title: 'Choose light or dark',
        body: 'Under Settings → Appearance, compare Orkestrai Dark, Graphite, Midnight, and Orkestrai Light. The light option keeps accessible contrast across nodes, panels, icons, provider marks, and hover states.',
      },
      {
        id: 'edit-tokens',
        title: 'Create your own theme',
        body: 'Duplicate the closest theme and edit semantic tokens for surfaces, text, borders, accent, states, grid, and connections. Use Save to persist it.',
      },
      {
        id: 'share-theme',
        title: 'Take the theme with you',
        body: 'Export the custom theme as JSON and import it into another installation. The file is validated and cannot run arbitrary CSS.',
      },
    ],
  },
];
