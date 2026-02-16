# CommandCanvas System Architecture

> This document is the sole reference for 5 independent coding agents building CommandCanvas in parallel.
> Every file path, channel name, event name, and data shape is authoritative.
> Ambiguity causes merge conflicts. When in doubt, follow this document exactly.

---

## Table of Contents

1. [Complete Folder Structure](#1-complete-folder-structure)
2. [Module Boundary Definitions](#2-module-boundary-definitions)
3. [IPC Architecture](#3-ipc-architecture)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Configuration Schema](#5-configuration-schema)
6. [Event System Design](#6-event-system-design)
7. [Error Handling Strategy](#7-error-handling-strategy)
8. [Logging Approach](#8-logging-approach)
9. [Extensibility Strategy](#9-extensibility-strategy)
10. [Risk Analysis](#10-risk-analysis)
11. [Key Technical Decisions](#11-key-technical-decisions)
12. [Agent Work Boundaries](#12-agent-work-boundaries)

---

## 1. Complete Folder Structure

```
CommandCanvas/
├── .github/                              # GitHub CI/CD workflows
│   └── workflows/
│       └── build.yml                     # Cross-platform build pipeline
├── .vscode/                              # VS Code workspace settings
│   └── settings.json                     # Editor config (tabs, formatters)
├── assets/                               # Static assets bundled with app
│   ├── icons/                            # Application icons per platform
│   │   ├── icon.ico                      # Windows icon
│   │   ├── icon.icns                     # macOS icon
│   │   └── icon.png                      # Linux icon (256x256)
│   └── animations/                       # Built-in ASCII animation frame files
│       ├── default/                      # Default animation theme
│       │   ├── idle.frames.json          # Idle state animation frames
│       │   ├── success.frames.json       # Success state animation frames
│       │   └── error.frames.json         # Error state animation frames
│       └── minimal/                      # Minimal animation theme
│           ├── idle.frames.json          # Minimal idle frames
│           ├── success.frames.json       # Minimal success frames
│           └── error.frames.json         # Minimal error frames
├── src/
│   ├── main/                             # Electron main process code
│   │   ├── index.ts                      # App entry point; creates BrowserWindow, orchestrates init
│   │   ├── shell-manager.ts              # node-pty lifecycle: spawn, write, resize, kill
│   │   ├── warning-engine.ts             # Regex-based risky command detection and rule management
│   │   ├── project-detector.ts           # Filesystem scan for project type marker files
│   │   ├── config-manager.ts             # Read/write/validate/migrate ~/.commandcanvas/config.json
│   │   ├── ipc-handlers.ts               # All ipcMain.handle() and ipcMain.on() registrations
│   │   ├── logger.ts                     # Main process file logging with rotation
│   │   └── constants.ts                  # Default values, platform detection helpers
│   ├── preload/                          # Preload scripts (contextBridge)
│   │   └── index.ts                      # Exposes typed minimal API to renderer via contextBridge
│   ├── renderer/                         # Renderer process code (UI)
│   │   ├── index.html                    # Root HTML shell with panel container elements
│   │   ├── index.ts                      # Renderer entry; initializes all UI modules and event wiring
│   │   ├── styles/                       # CSS stylesheets
│   │   │   ├── main.css                  # Global styles, CSS variables, grid layout
│   │   │   ├── terminal.css              # xterm.js overrides and terminal area styling
│   │   │   ├── command-panel.css         # Command button grid and category tab styles
│   │   │   ├── animation.css             # ASCII animation area container styles
│   │   │   └── explanation.css           # Explanation panel styles
│   │   ├── terminal-renderer.ts          # xterm.js init, fit addon, data piping to/from preload
│   │   ├── command-panel.ts              # Command button rendering, click handlers, category tabs
│   │   ├── explanation-panel.ts          # Displays command description text
│   │   ├── animation-engine.ts           # ASCII frame loading, playback loop, state transitions
│   │   ├── warning-overlay.ts            # Warning modal overlay: display, confirm, cancel
│   │   ├── custom-command-form.ts        # Modal form for creating/editing custom commands
│   │   ├── event-bus.ts                  # Renderer-side pub/sub event system
│   │   └── logger.ts                     # Renderer-side logging (forwards to main via IPC)
│   └── shared/                           # Code shared between main and renderer
│       ├── types.ts                      # All TypeScript interfaces and type definitions
│       ├── ipc-channels.ts               # IPC channel name string constants (single source of truth)
│       └── default-commands.ts           # Built-in command definitions per category
├── test/                                 # Test suites
│   ├── unit/                             # Unit tests
│   │   ├── warning-engine.test.ts        # Warning pattern matching tests
│   │   ├── project-detector.test.ts      # Project detection logic tests
│   │   ├── config-manager.test.ts        # Config read/write/migration tests
│   │   ├── command-registry.test.ts      # Command merge/lookup tests
│   │   └── event-bus.test.ts             # Event bus pub/sub tests
│   ├── integration/                      # Integration tests
│   │   ├── shell-ipc.test.ts             # Shell spawn + IPC data flow tests
│   │   └── config-persistence.test.ts    # Config save/load round-trip tests
│   └── e2e/                              # End-to-end tests
│       └── app-launch.test.ts            # App starts, terminal renders, basic interaction
├── forge.config.ts                       # Electron Forge build and packaging configuration
├── vite.main.config.ts                   # Vite config for main process bundling
├── vite.preload.config.ts                # Vite config for preload script bundling
├── vite.renderer.config.ts               # Vite config for renderer process bundling
├── tsconfig.json                         # Root TypeScript configuration
├── tsconfig.main.json                    # TypeScript config for main process
├── tsconfig.preload.json                 # TypeScript config for preload script
├── tsconfig.renderer.json                # TypeScript config for renderer process
├── package.json                          # Dependencies, scripts, Electron Forge metadata
├── package-lock.json                     # Dependency lockfile
├── .gitignore                            # Ignore node_modules, dist, out, .commandcanvas
├── .eslintrc.json                        # Linting rules
├── .prettierrc                           # Code formatting rules
├── LICENSE                               # License file
├── README.md                             # Project overview and setup instructions
└── ARCHITECTURE.md                       # This document
```

---

## 2. Module Boundary Definitions

### 2.1 Shell Manager

| Field | Value |
|-------|-------|
| **Module** | Shell Manager |
| **File** | `src/main/shell-manager.ts` |
| **Process** | Main |
| **Responsibility** | Manages the node-pty process lifecycle: spawn, write, resize, kill, and data/exit event forwarding |
| **Public API** | `spawn(cwd: string, cols: number, rows: number): void` / `write(data: string): void` / `resize(cols: number, rows: number): void` / `kill(): void` / `onData(callback: (data: string) => void): void` / `onExit(callback: (exitCode: number, signal?: number) => void): void` / `getCwd(): string` |
| **Dependencies** | `node-pty`, `src/main/logger.ts` |

### 2.2 Terminal Renderer

| Field | Value |
|-------|-------|
| **Module** | Terminal Renderer |
| **File** | `src/renderer/terminal-renderer.ts` |
| **Process** | Renderer |
| **Responsibility** | Initializes xterm.js, manages the fit addon for auto-sizing, pipes user input to the preload API and shell output to the terminal display |
| **Public API** | `init(container: HTMLElement): void` / `write(data: string): void` / `insertCommand(command: string): void` / `focus(): void` / `dispose(): void` |
| **Dependencies** | `xterm`, `@xterm/addon-fit`, `src/renderer/event-bus.ts`, preload API (`window.api`) |

### 2.3 Command Panel

| Field | Value |
|-------|-------|
| **Module** | Command Panel |
| **File** | `src/renderer/command-panel.ts` |
| **Process** | Renderer |
| **Responsibility** | Renders categorized command buttons, handles click-to-insert, manages category tab visibility based on detected project types |
| **Public API** | `init(container: HTMLElement): void` / `setCommands(commands: CommandDefinition[]): void` / `setVisibleCategories(categories: string[]): void` / `refresh(): void` |
| **Dependencies** | `src/renderer/event-bus.ts`, `src/shared/types.ts`, preload API |

### 2.4 Command Registry

| Field | Value |
|-------|-------|
| **Module** | Command Registry |
| **File** | `src/shared/default-commands.ts` (static data); persistence handled by Config Manager |
| **Process** | Shared (imported by both main and renderer at build time) |
| **Responsibility** | Defines built-in command definitions per category; provides merge logic for combining built-in and custom commands |
| **Public API** | `DEFAULT_COMMANDS: Record<string, CommandDefinition[]>` / `mergeCommands(builtIn: CommandDefinition[], custom: CommandDefinition[]): CommandDefinition[]` / `getCommandsByCategory(category: string): CommandDefinition[]` |
| **Dependencies** | `src/shared/types.ts` |

### 2.5 Warning Engine

| Field | Value |
|-------|-------|
| **Module** | Warning Engine |
| **File** | `src/main/warning-engine.ts` |
| **Process** | Main |
| **Responsibility** | Evaluates input command strings against risky command patterns (regex); returns warning details if a match is found; manages built-in and custom rules |
| **Public API** | `evaluate(command: string): WarningResult \| null` / `addRule(rule: WarningRule): void` / `getRules(): WarningRule[]` / `setEnabled(enabled: boolean): void` |
| **Dependencies** | `src/shared/types.ts`, `src/main/config-manager.ts` |

### 2.6 Animation Engine

| Field | Value |
|-------|-------|
| **Module** | Animation Engine |
| **File** | `src/renderer/animation-engine.ts` |
| **Process** | Renderer |
| **Responsibility** | Loads ASCII animation frame sets from the main process, manages a playback loop using requestAnimationFrame, transitions between animation states (idle, running, success, error) |
| **Public API** | `init(container: HTMLElement): void` / `setState(state: 'idle' \| 'success' \| 'error' \| 'running'): void` / `setTheme(theme: string): void` / `setEnabled(enabled: boolean): void` / `setSpeed(speed: number): void` / `dispose(): void` |
| **Dependencies** | `src/renderer/event-bus.ts`, preload API (`window.api.animation`) |

### 2.7 Project Detector

| Field | Value |
|-------|-------|
| **Module** | Project Detector |
| **File** | `src/main/project-detector.ts` |
| **Process** | Main |
| **Responsibility** | Scans a given directory for marker files (.git, package.json, requirements.txt, pyproject.toml, Dockerfile) and returns an array of detected project types |
| **Public API** | `detect(directory: string): Promise<ProjectType[]>` / `getMarkerMap(): Record<string, ProjectType>` |
| **Dependencies** | `fs/promises`, `src/shared/types.ts` |

### 2.8 Config Manager

| Field | Value |
|-------|-------|
| **Module** | Config Manager |
| **File** | `src/main/config-manager.ts` |
| **Process** | Main |
| **Responsibility** | Reads, writes, validates, and migrates `~/.commandcanvas/config.json`; handles first-run creation and corruption recovery |
| **Public API** | `load(): Promise<AppConfig>` / `save(config: AppConfig): Promise<void>` / `get<K extends keyof AppConfig>(key: K): AppConfig[K]` / `set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>` / `getPath(): string` / `reset(): Promise<void>` |
| **Dependencies** | `fs/promises`, `path`, `os`, `src/shared/types.ts` |

### 2.9 IPC Bridge

| Field | Value |
|-------|-------|
| **Module** | IPC Bridge |
| **Files** | `src/main/ipc-handlers.ts` (main-side handler registration) / `src/preload/index.ts` (preload contextBridge exposure) / `src/shared/ipc-channels.ts` (channel name constants) |
| **Process** | Both (main registers handlers; preload exposes API to renderer) |
| **Responsibility** | Centralizes all IPC channel registration in one file on the main side; exposes a typed, minimal, safe API to the renderer via contextBridge in the preload script |
| **Public API** | Main: `registerAllHandlers(deps: IpcDependencies): void` / Preload: `window.api` object (see Section 3.0) |
| **Dependencies** | `electron` (ipcMain, ipcRenderer, contextBridge), all main-process modules |

### 2.10 Explanation Panel

| Field | Value |
|-------|-------|
| **Module** | Explanation Panel |
| **File** | `src/renderer/explanation-panel.ts` |
| **Process** | Renderer |
| **Responsibility** | Displays contextual explanation text when a command button is hovered over or selected |
| **Public API** | `init(container: HTMLElement): void` / `show(explanation: CommandExplanation): void` / `clear(): void` |
| **Dependencies** | `src/renderer/event-bus.ts`, `src/shared/types.ts` |

### 2.11 Warning Overlay

| Field | Value |
|-------|-------|
| **Module** | Warning Overlay |
| **File** | `src/renderer/warning-overlay.ts` |
| **Process** | Renderer |
| **Responsibility** | Renders the warning modal/overlay when a risky command is detected; provides confirm and cancel actions; returns user decision |
| **Public API** | `init(container: HTMLElement): void` / `show(warning: WarningDisplayPayload): Promise<boolean>` / `hide(): void` |
| **Dependencies** | `src/renderer/event-bus.ts`, `src/shared/types.ts` |

---

## 3. IPC Architecture

### 3.0 Preload API Shape

The preload script (`src/preload/index.ts`) exposes the following typed API on `window.api` via `contextBridge.exposeInMainWorld('api', { ... })`:

```typescript
interface PreloadAPI {
  shell: {
    spawn: (cwd: string, cols: number, rows: number) => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: () => void;
    onData: (callback: (data: string) => void) => void;
    onExit: (callback: (exitCode: number) => void) => void;
  };
  warning: {
    check: (command: string) => Promise<WarningResult | null>;
    onWarning: (callback: (payload: WarningDisplayPayload) => void) => void;
    confirmExecution: (warningId: string) => void;
    cancelExecution: (warningId: string) => void;
  };
  config: {
    load: () => Promise<AppConfig>;
    save: (config: AppConfig) => Promise<void>;
    get: <K extends keyof AppConfig>(key: K) => Promise<AppConfig[K]>;
    set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;
  };
  project: {
    detect: (directory: string) => Promise<ProjectType[]>;
  };
  animation: {
    loadTheme: (themeName: string) => Promise<AnimationThemeData>;
    getAvailableThemes: () => Promise<string[]>;
  };
  log: {
    send: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
  };
}
```

**Security rules enforced by the preload script:**
- No raw `ipcRenderer` is exposed. Every method is a purpose-built wrapper.
- No `require`, `fs`, `child_process`, or `eval` is accessible from the renderer.
- Callback registrations (`onData`, `onExit`, `onWarning`) strip the Electron `event` object before forwarding to the renderer.
- `contextIsolation: true` and `nodeIntegration: false` are enforced in BrowserWindow options.

### 3.1 Shell Subsystem Channels

| Channel Name | Direction | Payload Interface | When/Why Sent | Sender | Listener |
|---|---|---|---|---|---|
| `shell:spawn` | renderer -> main | `{ cwd: string; cols: number; rows: number }` | App starts or user requests shell restart after crash | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> calls `shellManager.spawn()` |
| `shell:write` | renderer -> main | `{ data: string }` | Every keystroke or pasted text from xterm.js `onData` | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> line buffer -> warning check -> `shellManager.write()` |
| `shell:resize` | renderer -> main | `{ cols: number; rows: number }` | Window resize or layout change triggers xterm fit addon | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> calls `shellManager.resize()` |
| `shell:kill` | renderer -> main | `void` | User closes terminal or app is shutting down | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> calls `shellManager.kill()` |
| `shell:data` | main -> renderer | `{ data: string }` | Every chunk of output from the PTY process | `ipc-handlers.ts` via `webContents.send()` | `preload/index.ts` -> invokes registered `onData` callback |
| `shell:exit` | main -> renderer | `{ exitCode: number; signal?: number }` | Shell process terminates (expected or unexpected) | `ipc-handlers.ts` via `webContents.send()` | `preload/index.ts` -> invokes registered `onExit` callback |

**Transport rationale:** All shell channels use `send()`/`on()` (fire-and-forget), not `invoke()`/`handle()` (request/response). Terminal I/O is latency-sensitive; the invoke round-trip overhead is unnecessary. This matches the pattern used by VS Code and Hyper terminal.

### 3.2 Warning Subsystem Channels

| Channel Name | Direction | Payload Interface | When/Why Sent | Sender | Listener |
|---|---|---|---|---|---|
| `warning:check` | renderer -> main | `{ command: string }` | Renderer wants to pre-check a command (e.g., before panel insert) | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> calls `warningEngine.evaluate()` |
| *(return value)* | main -> renderer | `WarningResult \| null` | Response to the check request | -- | -- |
| `warning:triggered` | main -> renderer | `WarningDisplayPayload` (see types) | Warning engine detected a risky pattern in the `shell:write` pipeline | `ipc-handlers.ts` via `webContents.send()` | `preload/index.ts` -> invokes registered `onWarning` callback |
| `warning:confirm` | renderer -> main | `{ warningId: string }` | User clicked "Execute Anyway" on the warning overlay | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> retrieves held command -> forwards to `shellManager.write()` |
| `warning:cancel` | renderer -> main | `{ warningId: string }` | User clicked "Cancel" on the warning overlay | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> discards held command |

**Pipeline integration detail:** The `shell:write` handler in `ipc-handlers.ts` maintains an internal line buffer (an accumulating string). Every character received via `shell:write` is appended to this buffer AND immediately forwarded to `shellManager.write()` -- EXCEPT when `\r` (Enter/carriage return) is detected. When `\r` is detected:

1. The accumulated line buffer is extracted.
2. `warningEngine.evaluate(lineBuffer)` is called.
3. If result is `null`: the `\r` is forwarded to `shellManager.write()` and the buffer is cleared.
4. If result is a `WarningResult`: the `\r` is NOT forwarded. A pending command entry `{ warningId, pendingData: '\r' }` is stored. A `warning:triggered` message is sent to the renderer. The handler waits for `warning:confirm` or `warning:cancel`.
5. Backspace characters (`\x7f` or `\b`) remove the last character from the line buffer.
6. Control characters (Ctrl+C, Ctrl+D, etc.) clear the line buffer.

### 3.3 Config Subsystem Channels

| Channel Name | Direction | Payload Interface | When/Why Sent | Sender | Listener |
|---|---|---|---|---|---|
| `config:load` | renderer -> main | `void` | On app startup, renderer requests the full configuration | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> calls `configManager.load()` |
| *(return)* | main -> renderer | `AppConfig` | Full config object returned | -- | -- |
| `config:save` | renderer -> main | `AppConfig` | User saves settings or creates/edits a custom command | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> calls `configManager.save()` |
| *(return)* | main -> renderer | `{ success: boolean }` | Confirmation of write | -- | -- |
| `config:get` | renderer -> main | `{ key: string }` | Read a single top-level config key | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> calls `configManager.get()` |
| *(return)* | main -> renderer | `any` | Value for that key | -- | -- |
| `config:set` | renderer -> main | `{ key: string; value: any }` | Write a single top-level config key | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> calls `configManager.set()` |
| *(return)* | main -> renderer | `{ success: boolean }` | Confirmation of write | -- | -- |

All config channels use `ipcMain.handle()` / `ipcRenderer.invoke()` (request/response pattern).

### 3.4 Project Detection Subsystem Channels

| Channel Name | Direction | Payload Interface | When/Why Sent | Sender | Listener |
|---|---|---|---|---|---|
| `project:detect` | renderer -> main | `{ directory: string }` | On app startup and when working directory changes | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> calls `projectDetector.detect()` |
| *(return)* | main -> renderer | `ProjectType[]` | Array of detected project types (e.g., `['git', 'node']`) | -- | -- |

### 3.5 Animation Subsystem Channels

| Channel Name | Direction | Payload Interface | When/Why Sent | Sender | Listener |
|---|---|---|---|---|---|
| `animation:load-theme` | renderer -> main | `{ themeName: string }` | On startup or when user switches animation theme | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> reads files from `assets/animations/<themeName>/` |
| *(return)* | main -> renderer | `AnimationThemeData` | Frame data for all three states (idle, success, error) | -- | -- |
| `animation:get-themes` | renderer -> main | `void` | When populating the theme selector dropdown | `preload/index.ts` via `ipcRenderer.invoke()` | `ipc-handlers.ts` -> reads directory names from `assets/animations/` |
| *(return)* | main -> renderer | `string[]` | Available theme names (directory names) | -- | -- |

### 3.6 Logging Subsystem Channels

| Channel Name | Direction | Payload Interface | When/Why Sent | Sender | Listener |
|---|---|---|---|---|---|
| `log:send` | renderer -> main | `{ level: LogLevel; message: string; meta?: Record<string, unknown> }` | When any renderer-side module needs to write a log entry | `preload/index.ts` via `ipcRenderer.send()` | `ipc-handlers.ts` -> calls `logger.log()` with `[renderer]` prefix |

Fire-and-forget (`send`). Logs are written exclusively by the main process logger.

### 3.7 IPC Channel Constants

All channel names are defined in `src/shared/ipc-channels.ts`:

```typescript
export const IPC_CHANNELS = {
  // Shell
  SHELL_SPAWN: 'shell:spawn',
  SHELL_WRITE: 'shell:write',
  SHELL_RESIZE: 'shell:resize',
  SHELL_KILL: 'shell:kill',
  SHELL_DATA: 'shell:data',
  SHELL_EXIT: 'shell:exit',

  // Warnings
  WARNING_CHECK: 'warning:check',
  WARNING_TRIGGERED: 'warning:triggered',
  WARNING_CONFIRM: 'warning:confirm',
  WARNING_CANCEL: 'warning:cancel',

  // Config
  CONFIG_LOAD: 'config:load',
  CONFIG_SAVE: 'config:save',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Project Detection
  PROJECT_DETECT: 'project:detect',

  // Animation
  ANIMATION_LOAD_THEME: 'animation:load-theme',
  ANIMATION_GET_THEMES: 'animation:get-themes',

  // Logging
  LOG_SEND: 'log:send',
} as const;
```

---

## 4. Data Flow Diagrams

### 4.1 Flow: Command Button Click -> Execution -> Animation

```
USER clicks "git commit" button in Command Panel
  |
  v
[command-panel.ts]
  eventBus.emit('command:selected', {
    command: 'git commit -m ""',
    explanation: 'Creates a snapshot of staged changes with a message.',
    id: 'git-commit'
  })
  |
  +------> [explanation-panel.ts] listens for 'command:selected'
  |          show({ text: 'Creates a snapshot of staged changes...', commandId: 'git-commit' })
  |          Renders explanation text in the explanation panel area
  |
  +------> [terminal-renderer.ts] listens for 'command:selected'
             insertCommand('git commit -m ""')
             Writes command string into xterm.js display
             Each character is sent to PTY via window.api.shell.write()
             so the shell sees the typed input
             |
             v
USER edits the command text, then presses Enter
  |
  v
[terminal-renderer.ts]
  xterm.onData fires with each keystroke
  Calls window.api.shell.write(data) for each character
  When Enter is pressed, '\r' is sent
  |
  v
[preload/index.ts]
  ipcRenderer.send('shell:write', { data: '\r' })
  |
  v
[ipc-handlers.ts] (MAIN PROCESS)
  Line buffer has accumulated: 'git commit -m "initial"'
  Detects '\r' -> extracts line buffer content
  Calls warningEngine.evaluate('git commit -m "initial"')
  Result: null (not a risky command)
  Forwards '\r' to shellManager.write('\r')
  Clears line buffer
  |
  v
[shell-manager.ts]
  ptyProcess.write('\r')
  Shell executes the full command
  |
  v
[node-pty / Bash or PowerShell]
  Executes: git commit -m "initial"
  Streams output chunks via ptyProcess.onData()
  |
  v
[shell-manager.ts]
  onData callback fires with output chunk
  |
  v
[ipc-handlers.ts]
  webContents.send('shell:data', { data: outputChunk })
  |
  v
[preload/index.ts]
  Invokes registered onData callback with outputChunk
  |
  v
[terminal-renderer.ts]
  xterm.write(outputChunk)
  Output renders in the terminal display
  |
  v
[node-pty process completes]
  Shell prompt reappears (output via shell:data as above)
  |
  v
[terminal-renderer.ts]
  Detects command completion (prompt pattern or idle timeout)
  eventBus.emit('shell:exit', { exitCode: 0 })
  |
  v
[animation-engine.ts] listens for 'shell:exit'
  exitCode === 0 -> setState('success')
  Plays success animation frames for transitionDuration ms (default 2000)
  After timeout: setState('idle')
  Resumes idle animation loop
```

### 4.2 Flow: App Opens Directory -> Project Detection -> Panels Rendered

```
APP launches with working directory = /Users/dev/my-project
  |
  v
[renderer/index.ts]
  DOMContentLoaded fires
  Determines CWD (passed from main process or defaults to home)
  const types = await window.api.project.detect('/Users/dev/my-project')
  |
  v
[preload/index.ts]
  ipcRenderer.invoke('project:detect', { directory: '/Users/dev/my-project' })
  |
  v
[ipc-handlers.ts] (MAIN PROCESS)
  Calls projectDetector.detect('/Users/dev/my-project')
  |
  v
[project-detector.ts]
  Scans directory for marker files using fs.access():
    .git               -> exists? YES  -> add 'git'
    package.json        -> exists? YES  -> add 'node'
    requirements.txt    -> exists? NO
    pyproject.toml      -> exists? NO
    Dockerfile          -> exists? YES  -> add 'docker'
  Returns: ['git', 'node', 'docker']
  |
  v
[ipc-handlers.ts]
  Returns ['git', 'node', 'docker'] via invoke response
  |
  v
[renderer/index.ts]
  Receives project types
  eventBus.emit('project:detected', { types: ['git', 'node', 'docker'] })
  |
  v
[command-panel.ts] listens for 'project:detected'
  setVisibleCategories(['git', 'node', 'docker', 'custom'])
  'custom' is always included regardless of detection
  Hides categories not in the list (e.g., 'python' is hidden)
  Re-renders button grid showing only: Git, Node/NPM, Docker, Custom tabs
```

### 4.3 Flow: User Creates a Custom Command

```
USER clicks "+ Add Command" button in the Command Panel
  |
  v
[command-panel.ts]
  eventBus.emit('custom-command:open-form')
  |
  v
[custom-command-form.ts] listens for 'custom-command:open-form'
  Displays modal form with fields:
    - Name:              [text input]
    - Command:           [text input]
    - Explanation:       [textarea]
    - Category:          [dropdown: git, node, python, docker, custom]
    - Animation Trigger: [dropdown: none, success, error]
  |
  v
USER fills in form:
  Name: "Deploy"
  Command: "npm run deploy"
  Explanation: "Builds and deploys the application to production."
  Category: "custom"
  Animation Trigger: "success"
USER clicks "Save"
  |
  v
[custom-command-form.ts]
  Validates input:
    - Name must be non-empty
    - Command must be non-empty
  Generates unique ID: 'custom-' + Date.now()
  Constructs CommandDefinition object:
    {
      id: 'custom-1707984000000',
      name: 'Deploy',
      command: 'npm run deploy',
      explanation: 'Builds and deploys the application to production.',
      category: 'custom',
      animationTrigger: 'success',
      order: 0
    }
  |
  v
  Loads current config:
    const config = await window.api.config.load()
  Appends new command:
    config.customCommands.push(newCommand)
  Saves updated config:
    await window.api.config.save(config)
  |
  v
[preload/index.ts]
  ipcRenderer.invoke('config:save', updatedConfig)
  |
  v
[ipc-handlers.ts] (MAIN PROCESS)
  Calls configManager.save(updatedConfig)
  |
  v
[config-manager.ts]
  Validates config structure
  Writes JSON to ~/.commandcanvas/config.json
  Returns { success: true }
  |
  v
[custom-command-form.ts]
  Receives success confirmation
  Hides modal form
  eventBus.emit('custom-command:close-form')
  eventBus.emit('commands:updated')
  |
  v
[command-panel.ts] listens for 'commands:updated'
  Reloads commands:
    const config = await window.api.config.load()
    const merged = mergeCommands(DEFAULT_COMMANDS, config.customCommands)
  setCommands(merged)
  Re-renders button grid
  New "Deploy" button appears under "Custom" tab
```

### 4.4 Flow: User Types a Risky Command

```
USER types characters one at a time: r, m, ' ', -, r, f, ' ', /
  Each character flows through:
    [terminal-renderer.ts] -> xterm.onData(char)
    -> window.api.shell.write(char)
    -> ipcRenderer.send('shell:write', { data: char })
    -> [ipc-handlers.ts] appends to lineBuffer, forwards char to shellManager.write(char)
    -> [shell-manager.ts] ptyProcess.write(char)
    -> character appears in terminal via shell echo (shell:data back to renderer)
  |
  v
Line buffer now contains: "rm -rf /"
  |
  v
USER presses Enter
  |
  v
[terminal-renderer.ts]
  xterm.onData('\r')
  window.api.shell.write('\r')
  |
  v
[preload/index.ts]
  ipcRenderer.send('shell:write', { data: '\r' })
  |
  v
[ipc-handlers.ts] (MAIN PROCESS)
  Detects '\r' in incoming data
  Extracts line buffer: "rm -rf /"
  Calls warningEngine.evaluate("rm -rf /")
  |
  v
[warning-engine.ts]
  Tests against all rules:
    Rule 'rm-rf': pattern /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|f[a-zA-Z]*r)/ -> MATCH
  Returns WarningResult:
    {
      warningId: 'warn-1707984000000',
      ruleId: 'rm-rf',
      riskLevel: 'critical',
      command: 'rm -rf /',
      description: 'Recursively deletes files without confirmation. Can destroy important data.',
      recommendation: 'Double-check the target path. Consider using trash-cli instead.'
    }
  |
  v
[ipc-handlers.ts]
  Does NOT forward '\r' to shellManager (command is HELD)
  Stores pending command:
    pendingCommands.set('warn-1707984000000', { warningId, pendingData: '\r' })
  Sends warning to renderer:
    webContents.send('warning:triggered', {
      warningId: 'warn-1707984000000',
      command: 'rm -rf /',
      riskLevel: 'critical',
      description: 'Recursively deletes files without confirmation...',
      recommendation: 'Double-check the target path...'
    })
  |
  v
[preload/index.ts]
  Invokes registered onWarning callback
  |
  v
[renderer/index.ts or warning-overlay.ts]
  eventBus.emit('warning:show', warningPayload)
  |
  v
[warning-overlay.ts] listens for 'warning:show'
  Displays overlay modal:
    +-----------------------------------------+
    |  WARNING: Critical Risk                 |
    |                                         |
    |  Command: rm -rf /                      |
    |                                         |
    |  Recursively deletes files without      |
    |  confirmation. Can destroy important    |
    |  data.                                  |
    |                                         |
    |  Recommendation: Double-check the       |
    |  target path. Consider using trash-cli  |
    |  instead.                               |
    |                                         |
    |    [Cancel]     [Execute Anyway]         |
    +-----------------------------------------+
  |
  v
CASE A: User clicks "Execute Anyway"
  |
  v
  [warning-overlay.ts]
    hide()
    window.api.warning.confirmExecution('warn-1707984000000')
    eventBus.emit('warning:dismissed', { warningId: '...', action: 'confirm' })
  |
  v
  [preload/index.ts]
    ipcRenderer.send('warning:confirm', { warningId: 'warn-1707984000000' })
  |
  v
  [ipc-handlers.ts] (MAIN PROCESS)
    Retrieves pending command by warningId
    Forwards held '\r' to shellManager.write('\r')
    Deletes pending command entry
    Clears line buffer
    Command executes in the shell
  |
  v
CASE B: User clicks "Cancel"
  |
  v
  [warning-overlay.ts]
    hide()
    window.api.warning.cancelExecution('warn-1707984000000')
    eventBus.emit('warning:dismissed', { warningId: '...', action: 'cancel' })
  |
  v
  [preload/index.ts]
    ipcRenderer.send('warning:cancel', { warningId: 'warn-1707984000000' })
  |
  v
  [ipc-handlers.ts] (MAIN PROCESS)
    Discards pending command by warningId
    Does NOT write anything to the shell
    Clears line buffer
    Terminal remains at the same line (Enter was never sent to the shell)
```

### 4.5 Flow: App Startup Sequence

```
[Operating system launches CommandCanvas executable]
  |
  v
[Electron starts main process]
  |
  v
[src/main/index.ts]
  Step 1: app.whenReady() resolves
  |
  v
  Step 2: Initialize logger
    logger.init()
    Creates log directory: ~/.commandcanvas/logs/
    Opens log file: ~/.commandcanvas/logs/commandcanvas.log
    Logs: "[INFO] [main] CommandCanvas starting..."
  |
  v
  Step 3: Load configuration
    const config = await configManager.load()
    |
    +---> ~/.commandcanvas/ directory exists?
    |       NO  -> fs.mkdir('~/.commandcanvas/', { recursive: true })
    |       YES -> continue
    |
    +---> ~/.commandcanvas/config.json exists?
    |       NO  -> Write default config, return defaults
    |       YES -> Read file
    |               |
    |               +---> Valid JSON?
    |               |       NO  -> Backup to config.backup.json, write defaults, log warning
    |               |       YES -> Validate schema
    |               |               |
    |               |               +---> Schema valid?
    |               |                       NO  -> Merge with defaults (fill missing fields)
    |               |                       YES -> Check version, run migrations if needed
    |               |
    |               +---> Return AppConfig object
  |
  v
  Step 4: Initialize warning engine
    const warningEngine = new WarningEngine(config.warnings)
    Loads built-in rules
    Applies user's disabledBuiltInRules list
    Adds user's customRules
  |
  v
  Step 5: Initialize project detector
    const projectDetector = new ProjectDetector()
  |
  v
  Step 6: Initialize shell manager
    const shellManager = new ShellManager()
    (Shell is NOT spawned yet -- that happens on renderer request)
  |
  v
  Step 7: Register all IPC handlers
    registerAllHandlers({
      shellManager,
      warningEngine,
      configManager,
      projectDetector,
      logger
    })
    All ipcMain.handle() and ipcMain.on() listeners are now active
  |
  v
  Step 8: Create BrowserWindow
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false  // Required: node-pty needs unsandboxed preload
      }
    })
  |
  v
  Step 9: Load renderer
    win.loadFile('src/renderer/index.html')
    // or in dev: win.loadURL('http://localhost:5173')
  |
  v
========== RENDERER PROCESS STARTS ==========
  |
  v
[src/renderer/index.ts]
  Step 10: DOMContentLoaded fires
  |
  v
  Step 11: Initialize event bus
    eventBus (singleton, already instantiated on import)
  |
  v
  Step 12: Load configuration from main process
    const config = await window.api.config.load()
  |
  v
  Step 13: Initialize animation engine
    animationEngine.init(document.getElementById('animation-area'))
    const themeData = await window.api.animation.loadTheme(config.animation.theme)
    animationEngine.setTheme(config.animation.theme)  // loads frames
    animationEngine.setEnabled(config.animation.enabled)
    animationEngine.setSpeed(config.animation.speed)
    animationEngine.setState('idle')
  |
  v
  Step 14: Initialize terminal renderer
    terminalRenderer.init(document.getElementById('terminal-output'))
    Sets up xterm.js instance with config.ui.terminalFontSize, terminalFontFamily, terminalTheme
    Fits terminal to container
    Registers xterm.onData -> window.api.shell.write()
    Registers window.api.shell.onData -> xterm.write()
    Registers window.api.shell.onExit -> eventBus.emit('shell:exit')
  |
  v
  Step 15: Spawn shell
    window.api.shell.spawn(cwd, terminal.cols, terminal.rows)
    |
    v
    [MAIN PROCESS]
    shellManager.spawn(cwd, cols, rows)
    node-pty spawns the shell process (bash, zsh, or powershell)
    Shell prompt output starts flowing via shell:data -> xterm.write()
  |
  v
  Step 16: Detect project types
    const cwd = await window.api.config.get('shell').then(s => s.defaultCwd) || homedir
    const types = await window.api.project.detect(cwd)
    eventBus.emit('project:detected', { types })
  |
  v
  Step 17: Initialize command panel
    commandPanel.init(document.getElementById('command-panel'))
    const merged = mergeCommands(DEFAULT_COMMANDS, config.customCommands)
    commandPanel.setCommands(merged)
    commandPanel.setVisibleCategories([...types, 'custom'])
  |
  v
  Step 18: Initialize explanation panel
    explanationPanel.init(document.getElementById('explanation-panel'))
  |
  v
  Step 19: Initialize warning overlay
    warningOverlay.init(document.getElementById('warning-overlay'))
    Register: window.api.warning.onWarning((payload) => {
      eventBus.emit('warning:show', payload)
    })
  |
  v
  Step 20: Focus terminal
    terminalRenderer.focus()
  |
  v
  APP IS FULLY READY
  - Animation area plays idle animation
  - Terminal displays shell prompt and accepts input
  - Command panel shows buttons for detected project types + custom
  - Explanation panel is empty, waiting for command hover/selection
```

---

## 5. Configuration Schema

### 5.1 File Location

`~/.commandcanvas/config.json`

The `~` resolves to:
- **macOS/Linux**: `$HOME` (e.g., `/Users/noahkerr`)
- **Windows**: `%USERPROFILE%` (e.g., `C:\Users\noahkerr`)

### 5.2 Full TypeScript Interface

```typescript
interface AppConfig {
  /** Schema version for migration support. Current: 1 */
  version: number;

  /** Shell preferences */
  shell: ShellConfig;

  /** Animation preferences */
  animation: AnimationConfig;

  /** Warning system preferences */
  warnings: WarningsConfig;

  /** UI layout preferences */
  ui: UIConfig;

  /** User-created custom commands */
  customCommands: CommandDefinition[];
}

interface ShellConfig {
  /** Override default shell path. null = use system default
   *  System default: Windows = process.env.COMSPEC || 'powershell.exe'
   *                  macOS/Linux = process.env.SHELL || '/bin/bash' */
  defaultShell: string | null;

  /** Default working directory. null = use OS home directory */
  defaultCwd: string | null;

  /** Environment variable overrides merged with process.env */
  env: Record<string, string>;

  /** Additional arguments passed to the shell on spawn */
  args: string[];
}

interface AnimationConfig {
  /** Whether ASCII animations are displayed */
  enabled: boolean;

  /** Current theme name. Must match a directory under assets/animations/ */
  theme: string;

  /** Playback speed multiplier. 1.0 = normal, 0.5 = half speed, 2.0 = double */
  speed: number;

  /** Duration in ms that success/error animations play before returning to idle */
  transitionDuration: number;
}

interface WarningsConfig {
  /** Whether the warning system is active. When false, no commands are intercepted. */
  enabled: boolean;

  /** IDs of built-in rules that the user has explicitly disabled */
  disabledBuiltInRules: string[];

  /** User-defined custom warning rules */
  customRules: WarningRule[];
}

interface UIConfig {
  /** Command panel width in pixels */
  commandPanelWidth: number;

  /** Animation area height in pixels */
  animationAreaHeight: number;

  /** Explanation panel height in pixels */
  explanationPanelHeight: number;

  /** Terminal font size in pixels */
  terminalFontSize: number;

  /** Terminal font family CSS value */
  terminalFontFamily: string;

  /** Terminal ANSI color theme */
  terminalTheme: TerminalThemeConfig;
}

interface TerminalThemeConfig {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

interface CommandDefinition {
  /** Unique identifier. Built-in: 'git-status', Custom: 'custom-<timestamp>' */
  id: string;

  /** Display name shown on the button */
  name: string;

  /** The command string inserted into the terminal */
  command: string;

  /** Brief explanation shown in the explanation panel */
  explanation: string;

  /** Category for panel grouping: 'git' | 'node' | 'python' | 'docker' | 'custom' */
  category: string;

  /** Animation state to trigger after this command executes. null = use exit code. */
  animationTrigger?: 'success' | 'error' | null;

  /** Display order within its category (lower = first) */
  order: number;
}

interface WarningRule {
  /** Unique identifier. Built-in: 'rm-rf'. Custom: 'custom-rule-<timestamp>' */
  id: string;

  /** Human-readable name for display */
  name: string;

  /** Regex pattern string tested against the command input */
  pattern: string;

  /** Severity level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  /** Description of what makes this command risky */
  description: string;

  /** Suggested alternative or precaution */
  recommendation: string;
}
```

### 5.3 Default Configuration

Written to `~/.commandcanvas/config.json` on first launch:

```json
{
  "version": 1,
  "shell": {
    "defaultShell": null,
    "defaultCwd": null,
    "env": {},
    "args": []
  },
  "animation": {
    "enabled": true,
    "theme": "default",
    "speed": 1.0,
    "transitionDuration": 2000
  },
  "warnings": {
    "enabled": true,
    "disabledBuiltInRules": [],
    "customRules": []
  },
  "ui": {
    "commandPanelWidth": 220,
    "animationAreaHeight": 120,
    "explanationPanelHeight": 60,
    "terminalFontSize": 14,
    "terminalFontFamily": "monospace",
    "terminalTheme": {
      "background": "#1e1e2e",
      "foreground": "#cdd6f4",
      "cursor": "#f5e0dc",
      "selectionBackground": "#585b70",
      "black": "#45475a",
      "red": "#f38ba8",
      "green": "#a6e3a1",
      "yellow": "#f9e2af",
      "blue": "#89b4fa",
      "magenta": "#f5c2e7",
      "cyan": "#94e2d5",
      "white": "#bac2de",
      "brightBlack": "#585b70",
      "brightRed": "#f38ba8",
      "brightGreen": "#a6e3a1",
      "brightYellow": "#f9e2af",
      "brightBlue": "#89b4fa",
      "brightMagenta": "#f5c2e7",
      "brightCyan": "#94e2d5",
      "brightWhite": "#a6adc8"
    }
  },
  "customCommands": []
}
```

### 5.4 Built-in Default Command Packs

Defined in `src/shared/default-commands.ts`:

```typescript
export const DEFAULT_COMMANDS: Record<string, CommandDefinition[]> = {
  git: [
    { id: 'git-status',   name: 'Status',    command: 'git status',             explanation: 'Shows the working tree status: modified, staged, and untracked files.', category: 'git', order: 0 },
    { id: 'git-add-all',  name: 'Stage All',  command: 'git add .',             explanation: 'Stages all changes in the current directory for the next commit.',      category: 'git', order: 1 },
    { id: 'git-commit',   name: 'Commit',    command: 'git commit -m ""',       explanation: 'Creates a snapshot of staged changes with a message.',                  category: 'git', order: 2 },
    { id: 'git-push',     name: 'Push',      command: 'git push',               explanation: 'Uploads local branch commits to the remote repository.',                category: 'git', order: 3 },
    { id: 'git-pull',     name: 'Pull',      command: 'git pull',               explanation: 'Fetches and integrates changes from the remote repository.',             category: 'git', order: 4 },
    { id: 'git-log',      name: 'Log',       command: 'git log --oneline -10',  explanation: 'Shows the last 10 commits in a compact one-line format.',                category: 'git', order: 5 },
    { id: 'git-branch',   name: 'Branches',  command: 'git branch',             explanation: 'Lists all local branches. The current branch is highlighted.',           category: 'git', order: 6 },
    { id: 'git-checkout', name: 'Checkout',  command: 'git checkout ',           explanation: 'Switches to a different branch or restores files.',                      category: 'git', order: 7 },
    { id: 'git-diff',     name: 'Diff',      command: 'git diff',               explanation: 'Shows unstaged changes between working directory and index.',            category: 'git', order: 8 },
    { id: 'git-stash',    name: 'Stash',     command: 'git stash',              explanation: 'Temporarily stores modified tracked files for later use.',               category: 'git', order: 9 },
  ],
  node: [
    { id: 'npm-install',   name: 'Install',  command: 'npm install',       explanation: 'Installs all dependencies listed in package.json.',  category: 'node', order: 0 },
    { id: 'npm-start',     name: 'Start',    command: 'npm start',         explanation: 'Runs the start script defined in package.json.',     category: 'node', order: 1 },
    { id: 'npm-test',      name: 'Test',     command: 'npm test',          explanation: 'Runs the test script defined in package.json.',      category: 'node', order: 2 },
    { id: 'npm-run-build', name: 'Build',    command: 'npm run build',     explanation: 'Runs the build script defined in package.json.',     category: 'node', order: 3 },
    { id: 'npm-run-dev',   name: 'Dev',      command: 'npm run dev',       explanation: 'Runs the dev script for local development.',         category: 'node', order: 4 },
    { id: 'npm-outdated',  name: 'Outdated', command: 'npm outdated',      explanation: 'Lists packages that have newer versions available.', category: 'node', order: 5 },
  ],
  python: [
    { id: 'py-venv',      name: 'Create Venv',   command: 'python -m venv venv',              explanation: 'Creates a virtual environment in a venv/ directory.',  category: 'python', order: 0 },
    { id: 'py-activate',  name: 'Activate Venv',  command: 'source venv/bin/activate',          explanation: 'Activates the Python virtual environment.',            category: 'python', order: 1 },
    { id: 'pip-install',  name: 'Pip Install',    command: 'pip install -r requirements.txt',   explanation: 'Installs all dependencies from requirements.txt.',     category: 'python', order: 2 },
    { id: 'py-run',       name: 'Run',            command: 'python ',                           explanation: 'Runs a Python script.',                                category: 'python', order: 3 },
    { id: 'pip-freeze',   name: 'Freeze',         command: 'pip freeze > requirements.txt',     explanation: 'Writes installed packages to requirements.txt.',       category: 'python', order: 4 },
  ],
  docker: [
    { id: 'docker-ps',           name: 'Containers',   command: 'docker ps',              explanation: 'Lists running Docker containers.',                              category: 'docker', order: 0 },
    { id: 'docker-images',       name: 'Images',       command: 'docker images',           explanation: 'Lists locally available Docker images.',                        category: 'docker', order: 1 },
    { id: 'docker-build',        name: 'Build',        command: 'docker build -t  .',      explanation: 'Builds a Docker image from the Dockerfile in current directory.',category: 'docker', order: 2 },
    { id: 'docker-compose-up',   name: 'Compose Up',   command: 'docker compose up',       explanation: 'Starts all services defined in docker-compose.yml.',            category: 'docker', order: 3 },
    { id: 'docker-compose-down', name: 'Compose Down',  command: 'docker compose down',    explanation: 'Stops and removes all containers defined in docker-compose.yml.',category: 'docker', order: 4 },
  ],
};
```

### 5.5 Built-in Warning Rules

Defined in `src/main/warning-engine.ts` as `BUILT_IN_RULES`:

```typescript
const BUILT_IN_RULES: WarningRule[] = [
  {
    id: 'rm-rf',
    name: 'Recursive Force Delete',
    pattern: 'rm\\s+(-[a-zA-Z]*r[a-zA-Z]*f|f[a-zA-Z]*r)',
    riskLevel: 'critical',
    description: 'Recursively deletes files without confirmation. Can destroy important data.',
    recommendation: 'Double-check the target path. Consider using trash-cli instead.'
  },
  {
    id: 'rm-root',
    name: 'Delete Root',
    pattern: 'rm\\s+.*\\s+/',
    riskLevel: 'critical',
    description: 'Targets the root filesystem for deletion.',
    recommendation: 'This will destroy your entire system. Almost certainly not what you want.'
  },
  {
    id: 'sudo',
    name: 'Superuser Execution',
    pattern: '^sudo\\s+',
    riskLevel: 'medium',
    description: 'Executes command with superuser privileges.',
    recommendation: 'Verify you trust this command before running with elevated permissions.'
  },
  {
    id: 'git-reset-hard',
    name: 'Git Hard Reset',
    pattern: 'git\\s+reset\\s+--hard',
    riskLevel: 'high',
    description: 'Discards all uncommitted changes permanently.',
    recommendation: 'Consider git stash first to preserve your changes.'
  },
  {
    id: 'git-force-push',
    name: 'Git Force Push',
    pattern: 'git\\s+push\\s+.*--force',
    riskLevel: 'high',
    description: 'Overwrites remote history. Can cause data loss for collaborators.',
    recommendation: 'Use --force-with-lease for a safer alternative.'
  },
  {
    id: 'chmod-777',
    name: 'Open Permissions',
    pattern: 'chmod\\s+777',
    riskLevel: 'high',
    description: 'Sets file permissions to fully open (read/write/execute for everyone).',
    recommendation: 'Use more restrictive permissions like 755 or 644.'
  },
  {
    id: 'dd',
    name: 'Disk Dump',
    pattern: '^dd\\s+',
    riskLevel: 'critical',
    description: 'Low-level disk copy tool. Can overwrite disk partitions.',
    recommendation: 'Verify the of= (output file) parameter extremely carefully.'
  },
  {
    id: 'mkfs',
    name: 'Format Filesystem',
    pattern: 'mkfs',
    riskLevel: 'critical',
    description: 'Formats a filesystem partition, destroying all data on it.',
    recommendation: 'Triple-check the target device before executing.'
  },
  {
    id: 'git-clean-fd',
    name: 'Git Clean Force',
    pattern: 'git\\s+clean\\s+.*-[a-zA-Z]*f',
    riskLevel: 'high',
    description: 'Permanently removes untracked files from the working directory.',
    recommendation: 'Run git clean -n first for a dry-run preview.'
  },
  {
    id: 'curl-pipe-sh',
    name: 'Pipe to Shell',
    pattern: 'curl\\s+.*\\|.*sh',
    riskLevel: 'high',
    description: 'Downloads and immediately executes a remote script.',
    recommendation: 'Download the script first, review it, then execute.'
  },
];
```

### 5.6 Project Detection Marker Map

Defined in `src/main/project-detector.ts`:

```typescript
const MARKER_MAP: Record<string, ProjectType> = {
  '.git':              'git',
  'package.json':      'node',
  'requirements.txt':  'python',
  'pyproject.toml':    'python',
  'Dockerfile':        'docker',
};
```

---

## 6. Event System Design

### 6.1 Implementation

The event bus lives at `src/renderer/event-bus.ts` and is a singleton used by all renderer-side modules for decoupled communication.

```typescript
type EventCallback = (...args: any[]) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event: string, callback: EventCallback): () => void;

  /**
   * Unsubscribe a specific callback from an event.
   */
  off(event: string, callback: EventCallback): void;

  /**
   * Emit an event with optional payload arguments.
   */
  emit(event: string, ...args: any[]): void;

  /**
   * Subscribe to an event for a single invocation only.
   */
  once(event: string, callback: EventCallback): () => void;

  /**
   * Remove all listeners, optionally for a specific event only.
   */
  removeAllListeners(event?: string): void;
}

export const eventBus = new EventBus();
```

### 6.2 Event Catalog

| Event Name | Payload Type | Publisher | Subscriber(s) | Description |
|---|---|---|---|---|
| `command:selected` | `{ command: string; explanation: string; id: string }` | `command-panel.ts` | `terminal-renderer.ts`, `explanation-panel.ts` | User clicked a command button |
| `command:hovered` | `{ explanation: string; id: string }` | `command-panel.ts` | `explanation-panel.ts` | User hovers over a command button |
| `command:hover-end` | `void` | `command-panel.ts` | `explanation-panel.ts` | User mouse leaves a command button |
| `commands:updated` | `void` | `custom-command-form.ts` | `command-panel.ts` | Custom commands list was modified (add/edit/delete) |
| `project:detected` | `{ types: ProjectType[] }` | `index.ts` | `command-panel.ts` | Project type detection completed for current directory |
| `shell:exit` | `{ exitCode: number }` | `terminal-renderer.ts` | `animation-engine.ts` | Shell command finished (exit code received) |
| `shell:spawned` | `void` | `terminal-renderer.ts` | `animation-engine.ts` | Shell process successfully started |
| `shell:input-start` | `void` | `terminal-renderer.ts` | `animation-engine.ts` | User began typing after idle period |
| `shell:idle` | `void` | `terminal-renderer.ts` | `animation-engine.ts` | No shell activity for idle timeout threshold |
| `warning:show` | `WarningDisplayPayload` | `index.ts` (from IPC callback) | `warning-overlay.ts` | Risky command detected; show warning overlay |
| `warning:dismissed` | `{ warningId: string; action: 'confirm' \| 'cancel' }` | `warning-overlay.ts` | `terminal-renderer.ts` | User responded to warning overlay |
| `custom-command:open-form` | `void` or `{ command: CommandDefinition }` | `command-panel.ts` | `custom-command-form.ts` | Open the create/edit custom command modal |
| `custom-command:close-form` | `void` | `custom-command-form.ts` | (cleanup listeners) | Custom command modal was closed |
| `config:changed` | `{ key: string }` | `index.ts` | `animation-engine.ts`, `terminal-renderer.ts`, `command-panel.ts` | A configuration value was updated and saved |
| `terminal:resized` | `{ cols: number; rows: number }` | `terminal-renderer.ts` | (logging, optional listeners) | Terminal dimensions changed after fit |

---

## 7. Error Handling Strategy

### 7.1 Shell Crashes

**Detection:** `shell-manager.ts` registers `ptyProcess.onExit()`. An unexpected exit is one where the main process did not call `kill()`.

**Handling sequence:**
1. Main process logs the crash: `[ERROR] Shell exited unexpectedly: exitCode=N, signal=S`
2. Main sends `shell:exit` with the exit code to the renderer via IPC.
3. Renderer `terminal-renderer.ts` receives the exit event and writes an inline message into the xterm.js display: `"\r\n[Shell process terminated unexpectedly (exit code: N). Press Enter to restart.]\r\n"`
4. `terminal-renderer.ts` sets up a one-time keypress listener. On Enter, it calls `window.api.shell.spawn()` to restart the shell.
5. `animation-engine.ts` receives the `shell:exit` event, transitions to `error` state, plays error animation, then returns to `idle`.

**No auto-respawn.** Automatic restart could cause infinite crash loops. The user must explicitly trigger restart.

### 7.2 IPC Failures

**Detection:** `ipcRenderer.invoke()` rejects its returned promise on main process errors or when no handler is registered.

**Handling:**
1. Every `invoke` call in the preload wrappers is wrapped in try/catch.
2. Errors are forwarded to the main logger via `log:send` (if the log channel itself is functional) or to `console.error` as fallback.
3. The renderer displays a non-blocking toast notification: "Communication error. Some features may be unavailable."
4. For critical startup failures (e.g., `config:load` rejects), the renderer falls back to hardcoded defaults and displays a persistent warning banner at the top of the window.

**Timeout protection:** Invoke calls that do not resolve within 10 seconds are treated as failed. Implementation in the preload layer:

```typescript
function invokeWithTimeout<T>(channel: string, ...args: any[]): Promise<T> {
  return Promise.race([
    ipcRenderer.invoke(channel, ...args),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`IPC timeout: ${channel}`)), 10000)
    ),
  ]);
}
```

### 7.3 Config Corruption

**Detection:** `config-manager.ts` validates the loaded JSON on every `load()` call.

**Handling by failure type:**

| Failure | Recovery Action |
|---|---|
| File does not exist | Create `~/.commandcanvas/` directory (recursive), write default config |
| File is not valid JSON | Backup corrupt file to `~/.commandcanvas/config.backup.json`, write fresh defaults, log `[WARN] Config file corrupt, backed up and reset` |
| File is valid JSON but fails schema validation | Merge with defaults: missing fields receive default values, unknown fields are preserved for forward compatibility |
| Directory is not writable | Log `[ERROR] Config directory not writable`, run with in-memory defaults, display persistent banner to user |

**Version migration:** The `version` field enables schema evolution. When `load()` finds `version < CURRENT_VERSION`, it runs sequential migration functions: `migrateV1toV2(config)`, `migrateV2toV3(config)`, etc. Each migration updates specific fields and increments the version. The migrated config is saved back to disk.

### 7.4 Missing Animation Files

**Detection:** `animation:load-theme` IPC handler checks for the theme directory and frame files using `fs.access()`.

**Handling cascade:**
1. Requested theme directory missing -> Log `[WARN] Animation theme 'X' not found, falling back to 'default'`. Attempt to load `default` theme.
2. `default` theme also missing -> Log `[WARN] Default animation theme missing, disabling animations`. Return `null` to renderer.
3. Individual frame file missing (e.g., `success.frames.json`) -> Log `[WARN] Missing frame file: success.frames.json in theme 'X'`. Return empty frames array for that state. Animation engine renders blank for that state.
4. Frame file is invalid JSON -> Same as #3: log warning, return empty frames array.

The animation engine gracefully handles null or empty frame data by showing a static blank animation area.

### 7.5 User-Facing Error Display Tiers

| Tier | UI Element | Duration | Used When |
|---|---|---|---|
| **Toast** | Bottom-right floating notification, semi-transparent background | 5 seconds, auto-dismisses. User can click to dismiss early. | Non-critical: IPC hiccup recovered, animation theme fallback, config write failure (non-fatal) |
| **Banner** | Full-width bar at the top of the window, below the title bar | Persistent until user clicks dismiss button | Degraded state: config directory unwritable, critical IPC channels unavailable |
| **Inline** | Text rendered directly inside the affected panel area | Persistent until the condition resolves | Shell crash message in terminal area, missing command panel data |

**Native OS dialogs** (`dialog.showErrorBox()`) are used only for fatal startup failures where the BrowserWindow cannot be created.

---

## 8. Logging Approach

### 8.1 What Gets Logged

| Category | Example Log Messages | Level |
|---|---|---|
| App lifecycle | `CommandCanvas starting...`, `App shutting down`, `Window focused` | `info` |
| Shell events | `Shell spawned: cwd=/Users/dev, shell=/bin/zsh`, `Shell exited: code=0`, `Shell resized: 120x40` | `info` |
| IPC traffic | `IPC: shell:spawn received`, `IPC: config:load handled` (channel name + direction only, NOT payload data) | `debug` |
| Config operations | `Config loaded from ~/.commandcanvas/config.json`, `Config saved`, `Config migrated v1->v2`, `Config file corrupt, backed up` | `info` / `warn` |
| Warning triggers | `Warning triggered: rule=rm-rf, riskLevel=critical`, `Warning resolved: rule=rm-rf, action=cancel` | `warn` |
| Project detection | `Project detected: cwd=/Users/dev/project, types=[git, node]` | `info` |
| Errors | Full stack traces for uncaught exceptions, IPC failures, file I/O errors | `error` |
| Performance | `Shell spawn completed in 45ms`, `Config loaded in 12ms` | `debug` |

**Privacy rule:** Shell output content and user command text are NEVER logged. Config file contents (which may contain custom env vars) are NEVER logged. Only metadata about operations is recorded.

### 8.2 Where Logs Go

| Destination | When |
|---|---|
| `~/.commandcanvas/logs/commandcanvas.log` | Always (primary log file) |
| `stdout` / `stderr` | Only when `NODE_ENV=development` |
| DevTools console (renderer) | Only when `NODE_ENV=development` |

**Log rotation:** Maximum file size 5 MB. When exceeded, the current file is renamed to `commandcanvas.1.log`, and a new `commandcanvas.log` is created. Maximum 3 rotated files kept (`commandcanvas.1.log`, `commandcanvas.2.log`, `commandcanvas.3.log`). Oldest is deleted.

### 8.3 Log Levels

```typescript
type LogLevel = 'error' | 'warn' | 'info' | 'debug';
```

| Level | Numeric Priority | Default Enabled |
|---|---|---|
| `error` | 0 | Always |
| `warn` | 1 | Always |
| `info` | 2 | Production + Development |
| `debug` | 3 | Development only |

Default level: `info` in production (`NODE_ENV=production`), `debug` in development.

**Override:** Environment variable `COMMANDCANVAS_LOG_LEVEL=debug` overrides the default level in any environment.

### 8.4 Log Format

```
[2026-02-15T14:30:00.123Z] [INFO]  [main]     Shell spawned: cwd=/Users/dev/project, shell=/bin/zsh
[2026-02-15T14:30:00.456Z] [INFO]  [main]     Project detected: types=[git, node]
[2026-02-15T14:30:05.789Z] [WARN]  [main]     Warning triggered: rule=rm-rf, decision=pending
[2026-02-15T14:30:07.012Z] [WARN]  [main]     Warning resolved: rule=rm-rf, decision=cancel
[2026-02-15T14:30:10.345Z] [DEBUG] [renderer] Terminal resized: cols=120, rows=40
[2026-02-15T14:30:15.678Z] [ERROR] [main]     IPC handler failed: channel=config:save, error=EACCES permission denied
```

Format: `[ISO-8601 timestamp] [LEVEL] [process] message`

- `[main]` = logged directly by the main process
- `[renderer]` = originated in the renderer, forwarded to main via `log:send` IPC

### 8.5 How to Access Logs

1. Log file path is printed to `stdout` on startup: `Logging to: /Users/noahkerr/.commandcanvas/logs/commandcanvas.log`
2. The `config-manager.ts` module exposes `getLogPath(): string` which can be called via a future "Open Log File" button in settings.
3. In development, logs also appear in the terminal where the Electron process was launched.
4. The `~/.commandcanvas/logs/` directory can be opened directly in any text editor or viewed with `tail -f`.

---

## 9. Extensibility Strategy

### 9.1 Future AI Integration

AI integration plugs into the existing architecture at three specific points without requiring refactoring of any existing module.

**Integration Point 1: AI Command Suggestions**

| Aspect | Detail |
|---|---|
| New file | `src/main/ai-provider.ts` |
| New IPC channel | `ai:suggest` (renderer -> main, invoke/handle) |
| Payload | Request: `{ context: string; projectTypes: ProjectType[] }` / Response: `CommandDefinition[]` |
| Integration | The Command Panel already accepts dynamic command lists via `setCommands()`. AI-generated suggestions appear as a new category `'ai-suggested'` in the existing panel. No changes to `command-panel.ts` are needed beyond the caller adding the new category. |

**Integration Point 2: AI Error Explanation**

| Aspect | Detail |
|---|---|
| New file | `src/main/ai-error-explainer.ts` |
| New IPC channel | `ai:explain-error` (renderer -> main, invoke/handle) |
| Payload | Request: `{ terminalOutput: string; exitCode: number }` / Response: `{ explanation: string }` |
| Integration | When `shell:exit` fires with a non-zero exit code, the renderer can optionally send recent terminal output to the AI module. The Explanation Panel already has a `show()` method. AI explanations render in the same panel using the same interface. Only addition: `index.ts` adds a listener for `shell:exit` that optionally queries AI. |

**Integration Point 3: AI Command Correction (Middleware)**

| Aspect | Detail |
|---|---|
| New file | `src/main/ai-command-corrector.ts` |
| No new IPC channel | Inserted as an internal middleware step in `ipc-handlers.ts` |
| Integration | The warning engine pipeline in `ipc-handlers.ts` already intercepts commands before execution. An AI correction step can be inserted as a second middleware check: after the warning check passes but before forwarding to `shellManager.write()`. This requires adding one function call in the existing pipeline. |

**Configuration addition** (added to `AppConfig` when AI feature is built):

```typescript
ai: {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'local' | null;
  apiKey: string | null;  // Stored encrypted via OS keychain (keytar)
  model: string;
}
```

### 9.2 Adding New Command Packs

**For developers (built-in):**
1. Add new entries to `src/shared/default-commands.ts` under a new category key (e.g., `rust`).
2. Add the corresponding marker file to `MARKER_MAP` in `src/main/project-detector.ts` (e.g., `'Cargo.toml': 'rust'`).
3. Add the new project type to the `ProjectType` union in `src/shared/types.ts`.
4. No other modules need changes. The Command Panel dynamically renders all categories.

**For users (installable packs, post-MVP):**
1. Command packs are JSON files placed in `~/.commandcanvas/packs/`.
2. Each pack file follows the schema: `{ name: string; commands: CommandDefinition[] }`.
3. `config-manager.ts` gains a `loadPacks(): CommandDefinition[]` method that reads all `.json` files from the packs directory.
4. Packs are merged with default + custom commands during the command loading phase.
5. No architectural changes needed; just a new method on an existing module.

### 9.3 Adding New Animation Themes

1. Create a new directory: `assets/animations/<theme-name>/`
2. Add three files: `idle.frames.json`, `success.frames.json`, `error.frames.json`
3. No code changes required. The `animation:get-themes` IPC handler reads directory names dynamically from `assets/animations/`.

**Animation frame file format:**

```typescript
interface AnimationFrameFile {
  meta: {
    /** Display name for the theme */
    name: string;
    /** Theme author */
    author: string;
    /** Default delay in ms between frames */
    frameDelayMs: number;
  };
  /** Array of frames. Each frame is an array of strings (one per line of ASCII art). */
  frames: string[][];
}
```

**Example frame file** (`assets/animations/default/idle.frames.json`):

```json
{
  "meta": {
    "name": "Default Idle",
    "author": "CommandCanvas",
    "frameDelayMs": 200
  },
  "frames": [
    ["   _____   ", "  |     |  ", "  | >_  |  ", "  |_____|  "],
    ["   _____   ", "  |     |  ", "  | >_| |  ", "  |_____|  "],
    ["   _____   ", "  |     |  ", "  | >_  |  ", "  |_____|  "]
  ]
}
```

### 9.4 Future Plugin System (Post-MVP)

When the plugin system is built, it follows this pattern:

1. **Plugin location:** `~/.commandcanvas/plugins/<plugin-name>/`
2. **Manifest file:** Each plugin contains a `plugin.json`:
   ```typescript
   interface PluginManifest {
     name: string;
     version: string;
     author: string;
     description: string;
     extends: ('commands' | 'warnings' | 'animations' | 'ui')[];
     main: string; // Entry point file relative to plugin directory
   }
   ```
3. **Plugin Manager:** A new main process module `src/main/plugin-manager.ts` loads plugins at startup, validates manifests, and registers extensions via existing module APIs (`warningEngine.addRule()`, command pack merge, etc.).
4. **Sandboxing:** Plugins run in a Node.js `vm` context or worker thread with access only to a defined plugin API surface. No direct filesystem or shell access.
5. **Existing architecture supports this:** The event bus, IPC system, and module APIs are already decoupled enough that plugins can register new event listeners and contribute data through existing interfaces.

---

## 10. Risk Analysis

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **node-pty native module build failures on developer machines** | High | Blocks development setup | Pin node-pty version in package.json. Include `electron-rebuild` in `postinstall` script. Document required build tools per platform in README (Python 3, C++ compiler: MSVC on Windows, Xcode CLT on macOS, build-essential on Linux). |
| **node-pty ASAR packaging breaks production builds** | High | App crashes when launched from packaged build | Use `@electron-forge/plugin-auto-unpack-natives` in forge.config.ts. Add `spawn-helper` to `asar.unpack` explicitly if auto-detection misses it. Test packaged builds in CI on all target platforms. |
| **xterm.js and node-pty data encoding mismatch** | Medium | Garbled terminal output for non-ASCII text | Ensure both use UTF-8 encoding. Test with Unicode-heavy output (CJK characters, emoji). Set `encoding: 'utf8'` in node-pty spawn options. |
| **Warning engine line buffer inaccuracy** | Medium | False positives or missed warnings | The shadow line buffer cannot account for shell aliases, history expansion (`!!`), or tab completion results. This is an accepted limitation. The warning system is best-effort and advisory only, not a security boundary. Document this clearly. |
| **Electron security vulnerabilities (CVEs)** | Medium | Potential remote code execution | Keep Electron dependency updated. Enforce `contextIsolation: true`, `nodeIntegration: false`. Audit preload API surface for over-exposure. Subscribe to Electron security advisories. |
| **Large terminal output causes performance degradation** | Medium | UI becomes unresponsive during heavy output | xterm.js uses viewport virtualization, which handles this well natively. If issues arise, implement flow control: pause PTY reads when renderer backpressure is detected, resume when caught up. |
| **Config file race conditions** | Low | Config writes conflict if multiple windows or rapid saves | Implement file locking or debounced writes in config-manager.ts. MVP: single window, so risk is minimal. |

### 10.2 Performance Concerns

| Concern | Analysis | Mitigation |
|---|---|---|
| **Terminal I/O latency** | Data path: renderer -> preload -> IPC -> main -> pty (and reverse). Each IPC hop adds microseconds. Using `send()` (fire-and-forget) avoids invoke round-trip. This matches VS Code's proven pattern. | No mitigation needed for MVP. Profile if latency is perceptible. |
| **Animation rendering cost** | ASCII animations are text-based, rendered into a pre element or similar. Frame updates in `requestAnimationFrame` loop with configurable delay. No Canvas/WebGL. | Negligible cost. No mitigation needed. |
| **Project detection speed** | On-demand scan checks 5 marker files using `fs.access()`. Each is a single stat call. Total: <5ms for typical directory. | No watchers. Re-scan only on explicit trigger. |
| **Memory per shell instance** | Each node-pty process consumes approximately 5-10MB. MVP has one shell per window. | Future multi-tab: pool or limit shell instances. Set a maximum tab count. |
| **Renderer bundle size** | Vanilla TS (no framework runtime). xterm.js is ~200KB minified. Total renderer JS estimated at <500KB. | No concerns for MVP. |

### 10.3 Security Considerations

| Consideration | Assessment |
|---|---|
| **Real shell execution** | This is inherently dangerous by design. The app IS a terminal. It cannot and must not sandbox the shell. Users have full system access, same as any terminal emulator. |
| **Warning system is advisory only** | Warnings must NEVER block execution. The app always allows the user to confirm and proceed. The warning system reduces accidental damage, not intentional actions. |
| **Preload API surface** | Minimal and purpose-built. No raw `ipcRenderer`, no `require`, no `fs`, no `child_process`, no `eval` exposed to the renderer. Each method is a named, single-purpose wrapper. |
| **Custom warning regex ReDoS** | User-created regex patterns could cause catastrophic backtracking. Mitigation: validate regex patterns on save (test against a timeout). Apply a 100ms execution timeout to all regex evaluations in the warning engine. |
| **Config file injection** | A compromised config could inject commands via custom command definitions. However, the app already provides full shell access, so this is not a privilege escalation. |
| **Dependency supply chain** | Electron apps ship Chromium + Node.js. Pin dependency versions. Use `npm audit` in CI. Minimize transitive dependencies. |

### 10.4 Cross-Platform Gotchas

| Issue | Affected Platform | Mitigation |
|---|---|---|
| **Default shell detection** | All | Windows: `process.env.COMSPEC` or fallback `'powershell.exe'`. macOS/Linux: `process.env.SHELL` or fallback `'/bin/bash'`. Implement in `shell-manager.ts` with `process.platform` check. |
| **Shell arguments differ** | All | PowerShell uses different flags than Bash/Zsh. Config supports `shell.args` per-user override. Default args: empty array (let shell use its defaults). |
| **Python venv activation command** | All | Unix: `source venv/bin/activate`. Windows: `venv\\Scripts\\activate`. `default-commands.ts` must export a function that checks `process.platform` and returns platform-appropriate commands. |
| **Path separators** | Windows vs Unix | Use `path.join()` and `path.resolve()` everywhere in main process code. node-pty handles CWD path normalization internally. |
| **Line endings in shell output** | Windows | Windows shells may emit `\r\n`. node-pty normalizes this. The warning engine line buffer must detect both `\r` and `\n` as line terminators. |
| **node-pty build tools requirement** | All | Windows: `windows-build-tools` (npm package) or Visual Studio Build Tools. macOS: Xcode Command Line Tools (`xcode-select --install`). Linux: `build-essential`, `python3`. Document in README. |
| **Electron code signing** | macOS, Windows | macOS: notarization required for distribution. Windows: code signing certificate needed for SmartScreen. Configure in forge.config.ts makers section. Not required for MVP dev builds. |

---

## 11. Key Technical Decisions

### 11.1 Why Electron Over Alternatives

**Decision:** Use Electron (with Electron Forge + Vite).

| Alternative | Why Rejected |
|---|---|
| **Tauri** | Tauri uses a Rust backend. node-pty is a Node.js native module and cannot be used from Rust directly. Would require rewriting PTY management in Rust or running a sidecar Node process, adding significant complexity for no clear benefit in the MVP. |
| **Web app + local server** | Terminal apps need direct system-level PTY access. A browser-based web app cannot spawn PTY processes. Would require a separate local server process, complicating installation and lifecycle management. |
| **Native app (Swift/C++/C#)** | No cross-platform story without significant effort. The team has JavaScript/TypeScript expertise. Electron provides a mature ecosystem for packaging and distribution. |

**Rationale:** Electron provides direct Node.js integration in the main process, which node-pty requires. The ecosystem (Electron Forge, electron-rebuild, `@electron-forge/plugin-auto-unpack-natives`) has mature, well-documented tooling for handling native modules. The Chromium renderer provides xterm.js with a high-performance canvas backend.

### 11.2 node-pty Lifecycle Management

**Decision:** One persistent node-pty instance per application window.

**Details:**
- The shell process spawns when the renderer sends `shell:spawn` during startup.
- The shell persists across commands, exactly like a normal terminal.
- `ShellManager` owns the full lifecycle: spawn, write, resize, kill.
- The shell is killed when the window closes (`window.on('close')` triggers `shell:kill`).
- After an unexpected crash, the user must explicitly restart (no auto-respawn).

**Future multi-tab support:** Each tab would get its own `ShellManager` instance. All shell IPC payloads would gain a `sessionId: string` field to route messages to the correct instance. `ipc-handlers.ts` would maintain a `Map<string, ShellManager>`.

### 11.3 xterm.js to node-pty Data Streaming

**Decision:** Use Electron IPC (`send`/`on`) for bidirectional data streaming.

| Alternative | Why Rejected |
|---|---|
| **WebSocket server on localhost** | Adds networking overhead, port management, and security exposure. IPC is faster and simpler for same-machine communication. |
| **SharedArrayBuffer** | Overly complex for string data. No measurable benefit over IPC for terminal I/O volumes. |

**Data flow:**
- User input: `xterm.onData(data)` -> `window.api.shell.write(data)` -> `ipcRenderer.send('shell:write')` -> `ipcMain.on('shell:write')` -> `shellManager.write(data)` -> `ptyProcess.write(data)`
- Shell output: `ptyProcess.onData(data)` -> `shellManager.onData callback` -> `webContents.send('shell:data')` -> preload `onData` callback -> `xterm.write(data)`

All data is UTF-8 strings. Binary data from the PTY is already string-encoded by node-pty.

### 11.4 Project Detection Implementation

**Decision:** On-demand filesystem scan using `fs.access()`, not filesystem watchers.

| Alternative | Why Rejected |
|---|---|
| **`fs.watch()` / chokidar** | Consumes resources continuously. Has well-documented cross-platform reliability issues (especially on Linux with inotify limits). Project type rarely changes during a session. |
| **Polling interval** | Unnecessary CPU usage for something that almost never changes. |

**Implementation:** `project-detector.ts` uses `fs.access(path.join(dir, markerFile))` for each marker file in `MARKER_MAP`. If access succeeds, the project type is added to the result array. For a typical directory with 5 checks, this completes in <5ms.

**Re-detection trigger:** Detection runs at startup. Post-MVP enhancement: monitor shell output for prompt patterns that indicate `cd` commands, then re-detect.

### 11.5 Animation Loading and Triggering

**Decision:** Animations are JSON files containing arrays of ASCII art string arrays, loaded from disk by the main process and sent to the renderer via IPC.

**Frame format:** Each frame is an array of strings, where each string is one line of ASCII art. The animation engine renders frames sequentially using `requestAnimationFrame`, pausing `frameDelayMs` between frames.

**State machine:**

```
                 +---------+
                 |  idle   |<-----------+
                 +---------+            |
                   |                    |
        user types |         transitionDuration
                   v              timeout
                 +---------+            |
                 | running |            |
                 +---------+            |
                   |     |              |
          exit=0   |     |  exit!=0     |
                   v     v              |
             +---------+  +---------+   |
             | success |  |  error  |---+
             +---------+  +---------+
                   |
                   +--------------------+
```

**Why not CSS animations, Canvas, or GIF:** ASCII art is thematically appropriate for a terminal application. It is text-based, extremely lightweight, easily customizable, and can be created by any user with a text editor. No additional rendering technology is needed.

### 11.6 Warning System Interception Point

**Decision:** The warning engine intercepts commands at the IPC layer in `ipc-handlers.ts`, between the `shell:write` channel receipt and the `shellManager.write()` call.

**How it works:**
1. A line buffer in `ipc-handlers.ts` accumulates characters received from `shell:write`.
2. Characters are forwarded to `shellManager.write()` immediately (so the shell echoes them and the user sees their typing in real time).
3. When `\r` (Enter) is detected, the line buffer content is extracted and passed to `warningEngine.evaluate()`.
4. If no warning: `\r` is forwarded to `shellManager.write()`, buffer is cleared.
5. If warning matched: `\r` is HELD (not forwarded), a pending command entry is stored, and `warning:triggered` is sent to the renderer. The handler waits for `warning:confirm` or `warning:cancel`.

**Why interception happens in the main process, not the renderer:** The main process is the authority on what reaches the shell. Placing security-relevant logic in the renderer would be less trustworthy (renderer is a web context). The main process also has direct access to the warning engine and config without additional IPC round-trips.

**Known limitation:** The line buffer is a shadow/approximation. It cannot account for shell-side features like history substitution (`!!`, `!$`), alias expansion, or tab completion results. This is explicitly accepted because the warning system is advisory, not a security boundary. It will catch the most common risky patterns typed directly.

### 11.7 Future AI Integration Strategy

**Decision:** AI is a separate module (`src/main/ai-provider.ts`) in the main process that plugs into existing interfaces without requiring refactoring.

**Why this works without refactoring:**
- The Command Panel dynamically renders whatever commands it receives via `setCommands()`. AI suggestions are just more `CommandDefinition` objects in a new category.
- The Explanation Panel dynamically displays whatever text it receives via `show()`. AI explanations use the same interface.
- The warning pipeline in `ipc-handlers.ts` is already middleware-based (line buffer -> warning check -> forward). Adding an AI correction step is inserting one more function call in the same pipeline.

All three integration points use existing data structures and module APIs. No existing module signatures change.

### 11.8 Why Vanilla TypeScript Over React/Vue/Svelte

**Decision:** Use vanilla TypeScript with direct DOM manipulation. No UI framework.

| Factor | Assessment |
|---|---|
| **UI complexity** | 5 distinct panels with relatively simple DOM structures. No complex component trees, no deep prop drilling, no state management library needed. |
| **Performance** | Terminal I/O is latency-sensitive. Direct DOM manipulation avoids virtual DOM diffing overhead. |
| **Bundle size** | No framework runtime to ship. Smaller download, faster startup. |
| **Security surface** | Fewer dependencies = fewer packages to audit for a tool that runs a real shell. |
| **Module independence** | Each panel module manages its own DOM subtree. The event bus provides inter-module communication. This is conceptually similar to Web Components without the formalism. |
| **Future flexibility** | If a framework is later desired, the event bus decoupling means any single module can be replaced independently without affecting others. |

---

## 12. Agent Work Boundaries

Each agent has exclusive ownership of specific files. No file is modified by more than one agent (with controlled exceptions for shared files noted below).

### 12.1 Shell Integration Agent

Creates and has exclusive modification rights over:

| File | Purpose |
|---|---|
| `src/main/index.ts` | Electron app entry point; BrowserWindow creation; module init orchestration |
| `src/main/shell-manager.ts` | node-pty spawn, write, resize, kill, data/exit event forwarding |
| `src/main/ipc-handlers.ts` | All ipcMain.handle() and ipcMain.on() registrations; line buffer; warning pipeline |
| `src/main/config-manager.ts` | Config read/write/validate/migrate logic for ~/.commandcanvas/config.json |
| `src/main/project-detector.ts` | Filesystem marker file scanning logic |
| `src/main/logger.ts` | File logging with rotation and formatting |
| `src/main/constants.ts` | Default values, platform detection helper functions |
| `src/preload/index.ts` | contextBridge API definition; all preload wrappers |
| `src/shared/ipc-channels.ts` | IPC channel name string constants |
| `forge.config.ts` | Electron Forge build and packaging configuration |
| `vite.main.config.ts` | Vite config for main process bundling |
| `vite.preload.config.ts` | Vite config for preload script bundling |
| `package.json` | Dependencies, scripts, electron-forge metadata |
| `tsconfig.json` | Root TypeScript configuration |
| `tsconfig.main.json` | Main process TypeScript config |
| `tsconfig.preload.json` | Preload script TypeScript config |
| `.gitignore` | Git ignore rules |

**This agent does NOT touch:** Any file under `src/renderer/`. It may reference types from `src/shared/types.ts` (owned by Command System Agent) but must not modify that file.

### 12.2 UI Layout Agent

Creates and has exclusive modification rights over:

| File | Purpose |
|---|---|
| `src/renderer/index.html` | Root HTML structure with all panel container elements (IDs defined here) |
| `src/renderer/index.ts` | Renderer entry point; imports and initializes all UI modules; wires event bus listeners to IPC callbacks |
| `src/renderer/terminal-renderer.ts` | xterm.js initialization, fit addon, data piping, command insertion |
| `src/renderer/styles/main.css` | Global styles, CSS custom properties (variables), grid layout for all panels |
| `src/renderer/styles/terminal.css` | xterm.js overrides and terminal area styling |
| `src/renderer/event-bus.ts` | Pub/sub event system implementation |
| `src/renderer/logger.ts` | Renderer-side logging (formats and sends to main via window.api.log.send) |
| `vite.renderer.config.ts` | Vite config for renderer process bundling |
| `tsconfig.renderer.json` | Renderer TypeScript config |

**This agent does NOT touch:** Module-specific renderer files (command-panel.ts, animation-engine.ts, warning-overlay.ts, etc.) or any main process files.

**HTML container IDs** that this agent defines in `index.html` (other agents mount into these):

```html
<div id="animation-area"></div>
<div id="command-panel"></div>
<div id="terminal-output"></div>
<div id="explanation-panel"></div>
<div id="warning-overlay"></div>
<div id="custom-command-modal"></div>
```

### 12.3 Command System Agent

Creates and has exclusive modification rights over:

| File | Purpose |
|---|---|
| `src/renderer/command-panel.ts` | Command button grid rendering, category tabs, click-to-insert handlers |
| `src/renderer/explanation-panel.ts` | Command explanation text display panel |
| `src/renderer/custom-command-form.ts` | Create/edit custom command modal form |
| `src/renderer/styles/command-panel.css` | Command panel button and tab styles |
| `src/renderer/styles/explanation.css` | Explanation panel text styles |
| `src/shared/default-commands.ts` | Built-in command definitions per category |
| `src/shared/types.ts` | ALL shared TypeScript interfaces and type definitions |

**This agent does NOT touch:** Terminal rendering, animation engine, warning engine, or any main process files.

**Note on `src/shared/types.ts`:** This file is the single source of truth for all TypeScript interfaces used across the entire project. Other agents read from it but must not modify it. If another agent needs a new type, they must request it from the Command System Agent (via PR comment or coordination). This prevents merge conflicts on the most widely-imported file.

### 12.4 Warning Engine Agent

Creates and has exclusive modification rights over:

| File | Purpose |
|---|---|
| `src/main/warning-engine.ts` | Regex pattern matching engine, built-in rules array, rule management methods |
| `src/renderer/warning-overlay.ts` | Warning modal overlay UI: renders warning details, confirm button, cancel button |

**CSS rule:** The Warning Engine Agent may append (ONLY append, never modify existing rules) `.warning-*` CSS classes to the bottom of `src/renderer/styles/main.css`. Alternatively, this agent may create a dedicated `src/renderer/styles/warning.css` file if the UI Layout Agent adds a `<link>` for it in `index.html`.

**Coordination with other agents:**
- `warning-overlay.ts` reads events from the event bus (`warning:show`) and calls `window.api.warning.confirmExecution()` / `cancelExecution()`. These preload methods are implemented by the Shell Integration Agent.
- `warning-engine.ts` reads `WarningRule` and `WarningResult` types from `src/shared/types.ts` (owned by Command System Agent).
- `warning-engine.ts` is called BY `ipc-handlers.ts` (owned by Shell Integration Agent). The Warning Engine Agent implements the module; the Shell Integration Agent calls it.

**This agent does NOT touch:** `shell-manager.ts`, `ipc-handlers.ts`, `command-panel.ts`, `terminal-renderer.ts`, `animation-engine.ts`.

### 12.5 Animation Engine Agent

Creates and has exclusive modification rights over:

| File | Purpose |
|---|---|
| `src/renderer/animation-engine.ts` | Animation frame loading, requestAnimationFrame playback loop, state machine, theme switching |
| `src/renderer/styles/animation.css` | Animation area container styles (monospace font, sizing, background) |
| `assets/animations/default/idle.frames.json` | Default theme idle animation frames |
| `assets/animations/default/success.frames.json` | Default theme success animation frames |
| `assets/animations/default/error.frames.json` | Default theme error animation frames |
| `assets/animations/minimal/idle.frames.json` | Minimal theme idle animation frames |
| `assets/animations/minimal/success.frames.json` | Minimal theme success animation frames |
| `assets/animations/minimal/error.frames.json` | Minimal theme error animation frames |

**This agent does NOT touch:** Any main process files, any other renderer modules, any non-animation CSS files, or `index.html`.

### 12.6 Shared File Coordination Rules

| Shared Resource | Primary Owner | Contributors | Strict Rule |
|---|---|---|---|
| `src/shared/types.ts` | Command System Agent | All agents read it | Only Command System Agent creates and modifies. Other agents submit type requests via PR comments. |
| `src/renderer/styles/main.css` | UI Layout Agent | Warning Engine Agent (append only) | UI Layout Agent owns the grid layout and base styles. Warning Engine Agent may ONLY append `.warning-*` classes at the end of the file after a clearly marked comment: `/* === WARNING OVERLAY STYLES (Warning Engine Agent) === */` |
| `src/renderer/index.html` | UI Layout Agent | None | UI Layout Agent defines all container element IDs. Other agents mount into these containers via their `init(container)` functions. |
| `src/renderer/index.ts` | UI Layout Agent | None | UI Layout Agent imports and initializes all modules. Module init functions must follow the signature `init(container: HTMLElement): void`. |
| `src/main/ipc-handlers.ts` | Shell Integration Agent | None | Shell Integration Agent registers all IPC handlers and calls functions from other main-process modules (warning-engine.ts, project-detector.ts, config-manager.ts). Those modules are owned by their respective agents but are CALLED from this file. |
| `package.json` | Shell Integration Agent | None | Shell Integration Agent manages all dependencies. Other agents needing new dependencies must request via PR comments. |

### 12.7 Integration Contracts

Each agent MUST ensure its module exports match these exact function signatures. These are the contracts that `src/renderer/index.ts` (UI Layout Agent) and `src/main/ipc-handlers.ts` (Shell Integration Agent) depend on.

**Renderer modules (called by UI Layout Agent's `index.ts`):**

```typescript
// src/renderer/terminal-renderer.ts (UI Layout Agent)
export function init(container: HTMLElement): void;
export function write(data: string): void;
export function insertCommand(command: string): void;
export function focus(): void;
export function dispose(): void;

// src/renderer/command-panel.ts (Command System Agent)
export function init(container: HTMLElement): void;
export function setCommands(commands: CommandDefinition[]): void;
export function setVisibleCategories(categories: string[]): void;
export function refresh(): void;

// src/renderer/explanation-panel.ts (Command System Agent)
export function init(container: HTMLElement): void;
export function show(explanation: { text: string; commandId: string }): void;
export function clear(): void;

// src/renderer/animation-engine.ts (Animation Engine Agent)
export function init(container: HTMLElement): void;
export function setState(state: 'idle' | 'success' | 'error' | 'running'): void;
export function setTheme(theme: string): void;
export function setEnabled(enabled: boolean): void;
export function setSpeed(speed: number): void;
export function dispose(): void;

// src/renderer/warning-overlay.ts (Warning Engine Agent)
export function init(container: HTMLElement): void;
export function show(warning: WarningDisplayPayload): Promise<boolean>;
export function hide(): void;

// src/renderer/custom-command-form.ts (Command System Agent)
export function init(container: HTMLElement): void;

// src/renderer/event-bus.ts (UI Layout Agent)
export const eventBus: {
  on(event: string, callback: (...args: any[]) => void): () => void;
  off(event: string, callback: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
  once(event: string, callback: (...args: any[]) => void): () => void;
  removeAllListeners(event?: string): void;
};
```

**Main process modules (called by Shell Integration Agent's `ipc-handlers.ts`):**

```typescript
// src/main/shell-manager.ts (Shell Integration Agent)
export class ShellManager {
  spawn(cwd: string, cols: number, rows: number): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitCode: number, signal?: number) => void): void;
  getCwd(): string;
}

// src/main/warning-engine.ts (Warning Engine Agent)
export class WarningEngine {
  constructor(config: WarningsConfig);
  evaluate(command: string): WarningResult | null;
  addRule(rule: WarningRule): void;
  getRules(): WarningRule[];
  setEnabled(enabled: boolean): void;
}

// src/main/config-manager.ts (Shell Integration Agent)
export class ConfigManager {
  load(): Promise<AppConfig>;
  save(config: AppConfig): Promise<void>;
  get<K extends keyof AppConfig>(key: K): AppConfig[K];
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>;
  getPath(): string;
  reset(): Promise<void>;
}

// src/main/project-detector.ts (Shell Integration Agent)
export class ProjectDetector {
  detect(directory: string): Promise<ProjectType[]>;
  getMarkerMap(): Record<string, ProjectType>;
}

// src/main/logger.ts (Shell Integration Agent)
export class Logger {
  init(): void;
  log(level: LogLevel, source: 'main' | 'renderer', message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  getLogPath(): string;
}
```

---

## Appendix A: Complete Type Definitions

All types below are defined in `src/shared/types.ts` (owned by Command System Agent).

```typescript
// ============================================================
// Project Types
// ============================================================

/** Project types detected by filesystem marker files */
export type ProjectType = 'git' | 'node' | 'python' | 'docker';

/** Maps a marker filename to a project type */
export interface ProjectMarker {
  file: string;
  type: ProjectType;
}

// ============================================================
// Warning Types
// ============================================================

/** A warning rule definition (built-in or custom) */
export interface WarningRule {
  id: string;
  name: string;
  pattern: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

/** Result returned by the warning engine when a command matches a rule */
export interface WarningResult {
  warningId: string;
  ruleId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  command: string;
  description: string;
  recommendation: string;
}

/** Payload sent to the renderer to display a warning overlay */
export interface WarningDisplayPayload {
  warningId: string;
  command: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

// ============================================================
// Command Types
// ============================================================

/** A command definition (built-in or custom) */
export interface CommandDefinition {
  id: string;
  name: string;
  command: string;
  explanation: string;
  category: string;
  animationTrigger?: 'success' | 'error' | null;
  order: number;
}

/** Payload for the command:selected event */
export interface CommandSelectedPayload {
  command: string;
  explanation: string;
  id: string;
}

/** Payload for explanation panel display */
export interface CommandExplanation {
  text: string;
  commandId: string;
}

// ============================================================
// Animation Types
// ============================================================

/** Complete theme data for all animation states */
export interface AnimationThemeData {
  idle: AnimationFrameFile;
  success: AnimationFrameFile;
  error: AnimationFrameFile;
}

/** A single animation frame file loaded from disk */
export interface AnimationFrameFile {
  meta: {
    name: string;
    author: string;
    frameDelayMs: number;
  };
  frames: string[][];
}

/** Animation states */
export type AnimationState = 'idle' | 'running' | 'success' | 'error';

// ============================================================
// Configuration Types
// ============================================================

export interface AppConfig {
  version: number;
  shell: ShellConfig;
  animation: AnimationConfig;
  warnings: WarningsConfig;
  ui: UIConfig;
  customCommands: CommandDefinition[];
}

export interface ShellConfig {
  defaultShell: string | null;
  defaultCwd: string | null;
  env: Record<string, string>;
  args: string[];
}

export interface AnimationConfig {
  enabled: boolean;
  theme: string;
  speed: number;
  transitionDuration: number;
}

export interface WarningsConfig {
  enabled: boolean;
  disabledBuiltInRules: string[];
  customRules: WarningRule[];
}

export interface UIConfig {
  commandPanelWidth: number;
  animationAreaHeight: number;
  explanationPanelHeight: number;
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalTheme: TerminalThemeConfig;
}

export interface TerminalThemeConfig {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// ============================================================
// Logging Types
// ============================================================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// ============================================================
// IPC Types
// ============================================================

/** Dependencies injected into the IPC handler registration function */
export interface IpcDependencies {
  shellManager: import('../main/shell-manager').ShellManager;
  warningEngine: import('../main/warning-engine').WarningEngine;
  configManager: import('../main/config-manager').ConfigManager;
  projectDetector: import('../main/project-detector').ProjectDetector;
  logger: import('../main/logger').Logger;
}

/** Pending command held by the warning pipeline */
export interface PendingCommand {
  warningId: string;
  pendingData: string;
}
```

---

## Appendix B: HTML Container Structure

The following is the required structure for `src/renderer/index.html` (UI Layout Agent). All other agents mount their modules into these container elements by ID.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';" />
  <title>CommandCanvas</title>
  <link rel="stylesheet" href="./styles/main.css" />
  <link rel="stylesheet" href="./styles/terminal.css" />
  <link rel="stylesheet" href="./styles/command-panel.css" />
  <link rel="stylesheet" href="./styles/animation.css" />
  <link rel="stylesheet" href="./styles/explanation.css" />
</head>
<body>
  <div id="app">
    <!-- Row 1: ASCII Animation Area (full width) -->
    <div id="animation-area"></div>

    <!-- Row 2: Command Panel (left) + Terminal Output (right) -->
    <div id="main-area">
      <div id="command-panel"></div>
      <div id="terminal-output"></div>
    </div>

    <!-- Row 3: Explanation Panel (full width) -->
    <div id="explanation-panel"></div>

    <!-- Row 4: Terminal Input Area (handled by xterm.js inside terminal-output) -->

    <!-- Overlays (positioned absolute, hidden by default) -->
    <div id="warning-overlay" class="overlay hidden"></div>
    <div id="custom-command-modal" class="overlay hidden"></div>
  </div>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

---

*End of architecture document.*
