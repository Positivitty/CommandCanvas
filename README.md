# Oblivion Engine

A visual terminal application built with Electron. It combines a real terminal emulator with clickable command panels, ASCII animations, and a warning system for dangerous commands.

## Quick Start

```bash
git clone https://github.com/swosu/House_Aaron.git OblivionEngine
cd OblivionEngine
npm install
npm start
```

If that worked and you see the app, you're good to go. If not, read on.

---

## Setup Guide (Step by Step)

### Step 1: Install Node.js

You need **Node.js v18 or higher**. Check if you already have it:

```bash
node -v
npm -v
```

If those commands don't work or show a version below 18, download and install Node.js from https://nodejs.org (use the **LTS** version).

### Step 2: Install Build Tools

This project uses `node-pty`, a native C++ module that has to be compiled on your machine. This is the step that causes the most issues.

**macOS:**
```bash
xcode-select --install
```
A popup will appear. Click "Install" and wait for it to finish.

**Windows:**
1. Download [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Run the installer
3. Check the box for **"Desktop development with C++"**
4. Click Install and wait for it to finish
5. **Restart your terminal/PowerShell after installing**

If you already have Visual Studio 2019+ with the C++ workload, skip this.

**Linux (Ubuntu/Debian):**
```bash
sudo apt install build-essential python3
```

### Step 3: Clone and Install

```bash
git clone https://github.com/swosu/House_Aaron.git OblivionEngine
cd OblivionEngine
npm install
```

The install will take a minute. At the end it automatically runs `electron-rebuild` to compile `node-pty` for Electron. You should see output ending with something like `Rebuild Complete`.

### Step 4: Run It

```bash
npm start
```

The app window should open with DevTools on the side. You'll see the terminal, command buttons, and the animation panel.

---

## Common Problems

### `npm install` fails with node-pty or node-gyp errors

This is the most common issue. It means the C++ build tools aren't set up right. When you run `npm install`, a prerequisite checker will run first and tell you exactly what's missing. If you see a red error from the checker, follow its instructions.

**Windows (most common):**

You need **all three** of these installed:
1. **Node.js v18+** — download from https://nodejs.org (LTS version)
2. **Python 3** — download from https://www.python.org/downloads/
   - **Check "Add Python to PATH"** during installation
3. **Visual Studio Build Tools** with C++ support:
   - Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Run the installer and check **"Desktop development with C++"**
   - Click Install and wait (this is a large download)
   - **Restart your terminal after installing**

After installing all three, do a clean install:
```
rmdir /s /q node_modules
del package-lock.json
npm cache clean --force
npm install
```

> **Note:** If your project path has spaces (like `C:\Github Codes\...`), that can cause build failures. Try cloning to a path without spaces: `C:\OblivionEngine`

**macOS:**
```bash
xcode-select --install
```
If it says "already installed," try `sudo xcode-select --reset`, then delete `node_modules` and run `npm install` again.

**Linux:**
```bash
sudo apt install build-essential python3
```

**Last resort — rebuild manually:**
```bash
npx electron-rebuild
```

### App opens but the terminal is blank / no shell

The shell process failed to start. Open DevTools (it should already be open) and check the Console tab for red errors.

Common causes:
- **macOS:** Your terminal needs Full Disk Access. Go to System Settings > Privacy & Security > Full Disk Access, and add your terminal app (Terminal.app, iTerm, etc.).
- **Windows:** The app tries to use PowerShell by default. If PowerShell is blocked by your organization, this may fail.

### App won't start at all / white screen

The build might be broken. Try:
```bash
rm -rf node_modules .vite
npm install
npm start
```

The `.vite` folder is the build cache. Deleting it forces a fresh build.

### Changes I made aren't showing up

Electron Forge uses Vite with hot reload, but some changes (especially in `src/main/`) require a full restart:

1. Close the app window
2. Go back to your terminal and press `Ctrl+C` to stop the process
3. Run `npm start` again

Changes to `src/renderer/` files usually hot-reload automatically.

---

## How the App Works

The app has three processes that talk to each other:

```
┌─────────────────────────────────────────────────────┐
│  Main Process (src/main/)                           │
│  - Creates the app window                           │
│  - Spawns the shell (node-pty)                      │
│  - Detects dangerous commands                       │
│  - Reads/writes config files                        │
└──────────────────────┬──────────────────────────────┘
                       │ IPC (inter-process communication)
┌──────────────────────┴──────────────────────────────┐
│  Preload (src/preload/)                             │
│  - Secure bridge between main and renderer          │
│  - Exposes only the APIs the UI is allowed to use   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│  Renderer (src/renderer/)                           │
│  - Everything you see: terminal, buttons, animation │
│  - Runs in a browser context (like a web page)      │
└─────────────────────────────────────────────────────┘
```

### Key Files

| File | What It Does |
|------|-------------|
| `src/main/index.ts` | App entry point — creates the window and wires everything up |
| `src/main/shell-manager.ts` | Manages the shell process (spawning, writing input, resizing) |
| `src/main/ipc-handlers.ts` | Handles messages between main and renderer |
| `src/main/warning-engine.ts` | Checks if a command is dangerous before running it |
| `src/renderer/terminal-renderer.ts` | The terminal display (xterm.js) |
| `src/renderer/command-panel.ts` | The clickable command buttons |
| `src/renderer/animation-engine.ts` | ASCII animation playback |
| `src/renderer/warning-overlay.ts` | The danger confirmation popup |
| `src/preload/index.ts` | Defines what APIs the renderer can access |

### Project Structure

```
OblivionEngine/
├── src/
│   ├── main/            # Backend (Node.js) — shell, config, warnings
│   ├── preload/         # Security bridge between backend and frontend
│   ├── renderer/        # Frontend (browser) — UI, terminal, buttons
│   │   └── styles/      # CSS files
│   └── shared/          # Types and data used by both sides
├── assets/
│   └── animations/      # ASCII animation frames (JSON files)
├── index.html           # HTML entry point for the renderer
├── forge.config.ts      # Electron Forge build/packaging config
├── vite.*.config.ts     # Vite configs for each process
└── package.json
```

---

## Scripts

| Command | What It Does |
|---------|-------------|
| `npm start` | Run the app in dev mode (with hot reload and DevTools) |
| `npm run package` | Build the app for your OS (output in `out/` folder) |
| `npm run make` | Build a distributable installer (`.dmg`, `.exe`, `.deb`) |

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Electron | Desktop app framework |
| TypeScript | Type-safe JavaScript |
| Vite | Fast build tool and dev server |
| Electron Forge | Packaging and distribution |
| xterm.js | Terminal emulator component |
| node-pty | Native shell access (the part that needs C++ tools) |

## License

MIT
