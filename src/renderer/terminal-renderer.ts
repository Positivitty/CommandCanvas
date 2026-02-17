/**
 * Terminal Renderer Module
 *
 * Initializes xterm.js, manages the fit addon for auto-sizing,
 * pipes user input to the preload API and shell output to the
 * terminal display.
 *
 * Public API (from ARCHITECTURE.md Section 12.7):
 * - init(container: HTMLElement): void
 * - write(data: string): void
 * - insertCommand(command: string): void
 * - focus(): void
 * - dispose(): void
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { eventBus } from './event-bus';
import * as logger from './logger';
import type { AppConfig } from '../shared/types';

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let containerElement: HTMLElement | null = null;

/** Debounce flag to prevent rapid shell restarts */
let restartInProgress = false;

/**
 * Default terminal theme (Catppuccin Mocha).
 * Used if config is not yet available at init time.
 */
const DEFAULT_THEME = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#585b70',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

/**
 * Initialize the xterm.js terminal inside the given container element.
 * Sets up data piping between the terminal and the shell process via
 * the preload API.
 */
export function init(container: HTMLElement): void {
  if (terminal) {
    logger.warn('Terminal already initialized, disposing previous instance');
    dispose();
  }

  containerElement = container;

  // Create xterm.js terminal instance
  terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 14,
    fontFamily: 'monospace',
    theme: DEFAULT_THEME,
    allowProposedApi: true,
    scrollback: 5000,
    convertEol: true,
  });

  // Create and load the fit addon for auto-resizing
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // Open the terminal in the container
  terminal.open(container);

  // Initial fit
  try {
    fitAddon.fit();
  } catch (err) {
    logger.warn('Initial terminal fit failed, will retry on resize', { error: String(err) });
  }

  // Pipe user input from xterm to the shell process
  terminal.onData((data: string) => {
    try {
      window.api.shell.write(data);
    } catch (err) {
      logger.error('Failed to write to shell', { error: String(err) });
    }
  });

  // Pipe shell output from the shell process to xterm
  window.api.shell.onData((data: string) => {
    if (terminal) {
      terminal.write(data);
    }
  });

  // Handle shell exit events
  window.api.shell.onExit((exitCode: number) => {
    logger.info('Shell process exited', { exitCode });
    eventBus.emit('shell:exit', { exitCode });

    // Write restart instructions into the terminal
    if (terminal) {
      terminal.write(
        '\r\n\x1b[31m[Shell process terminated unexpectedly (exit code: ' +
        exitCode +
        '). Press Enter to restart.]\x1b[0m\r\n'
      );

      // One-time listener to restart the shell on Enter
      const disposable = terminal.onData((restartData: string) => {
        if (restartData === '\r' || restartData === '\n') {
          disposable.dispose();
          restartShell();
        }
      });
    }
  });

  // Listen for command:selected events to insert commands
  eventBus.on('command:selected', (payload: { command: string; explanation: string; id: string }) => {
    insertCommand(payload.command);
    eventBus.emit('command:inserted', { command: payload.command });
  });

  // Set up ResizeObserver for auto-fitting
  resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      try {
        fitAddon.fit();
        const dims = { cols: terminal.cols, rows: terminal.rows };
        window.api.shell.resize(dims.cols, dims.rows);
        eventBus.emit('terminal:resized', dims);
      } catch (err) {
        logger.debug('Terminal resize failed', { error: String(err) });
      }
    }
  });
  resizeObserver.observe(container);

  // Emit focus/blur events
  terminal.textarea?.addEventListener('focus', () => {
    eventBus.emit('terminal:focused', {});
  });
  terminal.textarea?.addEventListener('blur', () => {
    eventBus.emit('terminal:blurred', {});
  });

  logger.info('Terminal renderer initialized', {
    cols: terminal.cols,
    rows: terminal.rows,
  });
}

/**
 * Apply configuration to the terminal instance.
 * Called after config is loaded to update font size, font family, and theme.
 */
export function applyConfig(config: AppConfig): void {
  if (!terminal) return;

  const ui = config.ui;
  terminal.options.fontSize = ui.terminalFontSize;
  terminal.options.fontFamily = ui.terminalFontFamily;
  terminal.options.theme = ui.terminalTheme;

  // Re-fit after changing font metrics
  if (fitAddon) {
    try {
      fitAddon.fit();
    } catch (err) {
      logger.debug('Terminal re-fit after config change failed', { error: String(err) });
    }
  }
}

/**
 * Write data directly to the terminal display.
 * Used for programmatic output, not user input.
 */
export function write(data: string): void {
  if (terminal) {
    terminal.write(data);
  }
}

/**
 * Insert a command string into the terminal.
 * Writes the command character-by-character to both the xterm display
 * and the shell process, so the shell sees the typed input.
 * Does NOT press Enter -- the user can edit the command first.
 */
export function insertCommand(command: string): void {
  if (!terminal) {
    logger.warn('Cannot insert command: terminal not initialized');
    return;
  }

  // Write the command to the shell process so it becomes the current
  // input line. The shell will echo it back to xterm via shell:data.
  try {
    window.api.shell.write(command);
  } catch (err) {
    logger.error('Failed to insert command into shell', { error: String(err) });
  }
}

/**
 * Focus the terminal so it receives keyboard input.
 */
export function focus(): void {
  if (terminal) {
    terminal.focus();
  }
}

/**
 * Get the current terminal dimensions (cols, rows).
 * Returns null if terminal is not initialized.
 */
export function getDimensions(): { cols: number; rows: number } | null {
  if (!terminal) return null;
  return { cols: terminal.cols, rows: terminal.rows };
}

/**
 * Clean up terminal resources.
 */
export function dispose(): void {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (terminal) {
    terminal.dispose();
    terminal = null;
  }

  fitAddon = null;
  containerElement = null;

  logger.info('Terminal renderer disposed');
}

/**
 * Restart the shell process after it crashes.
 * Spawns a new shell with the terminal's current dimensions.
 */
function restartShell(): void {
  if (!terminal) return;
  if (restartInProgress) return; // Prevent rapid restart loops

  restartInProgress = true;
  logger.info('Restarting shell process');

  // Clear the terminal
  terminal.clear();
  terminal.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to top-left
  terminal.write('Restarting shell...\r\n');

  try {
    // Use home directory as fallback CWD
    const cwd = '.'; // The main process will resolve this
    window.api.shell.spawn(cwd, terminal.cols, terminal.rows);
    eventBus.emit('shell:spawned', {});
  } catch (err) {
    logger.error('Failed to restart shell', { error: String(err) });
    if (terminal) {
      terminal.write('\r\n\x1b[31m[Failed to restart shell. Press Enter to try again.]\x1b[0m\r\n');
      // Give the user another chance to retry
      const retryDisposable = terminal.onData((retryData: string) => {
        if (retryData === '\r' || retryData === '\n') {
          retryDisposable.dispose();
          restartShell();
        }
      });
    }
  } finally {
    // Allow restart again after a short cooldown
    setTimeout(() => { restartInProgress = false; }, 1000);
  }
}
