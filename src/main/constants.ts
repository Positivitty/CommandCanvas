import * as os from 'os';
import type { AppConfig } from '../shared/types';

// ============================================================
// Platform Detection Helpers
// ============================================================

/** Whether the current platform is Windows */
export const IS_WINDOWS = process.platform === 'win32';

/** Whether the current platform is macOS */
export const IS_MAC = process.platform === 'darwin';

/** Whether the current platform is Linux */
export const IS_LINUX = process.platform === 'linux';

/**
 * Returns the default shell path for the current platform.
 * Windows: process.env.COMSPEC or 'powershell.exe'
 * macOS/Linux: process.env.SHELL or '/bin/bash'
 */
export function getDefaultShell(): string {
  if (IS_WINDOWS) {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

/**
 * Returns the user's home directory.
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Returns whether the app is running in development mode.
 */
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

// ============================================================
// Application Constants
// ============================================================

/** Application name */
export const APP_NAME = 'CommandCanvas';

/** Config directory name inside the user's home directory */
export const CONFIG_DIR_NAME = '.commandcanvas';

/** Config file name */
export const CONFIG_FILE_NAME = 'config.json';

/** Config backup file name */
export const CONFIG_BACKUP_FILE_NAME = 'config.backup.json';

/** Log directory name inside the config directory */
export const LOG_DIR_NAME = 'logs';

/** Log file name */
export const LOG_FILE_NAME = 'commandcanvas.log';

/** Maximum log file size in bytes (5 MB) */
export const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024;

/** Maximum number of rotated log files to keep */
export const MAX_LOG_ROTATIONS = 3;

/** Current config schema version */
export const CURRENT_CONFIG_VERSION = 1;

/** IPC invoke timeout in milliseconds */
export const IPC_TIMEOUT_MS = 10000;

/** Default window width */
export const DEFAULT_WINDOW_WIDTH = 1400;

/** Default window height */
export const DEFAULT_WINDOW_HEIGHT = 950;

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  shell: {
    defaultShell: null,
    defaultCwd: null,
    env: {},
    args: [],
  },
  animation: {
    enabled: true,
    theme: 'default',
    speed: 1.0,
    transitionDuration: 2000,
  },
  warnings: {
    enabled: true,
    disabledBuiltInRules: [],
    customRules: [],
  },
  ui: {
    commandPanelWidth: 200,
    animationAreaHeight: 420,
    explanationPanelHeight: 48,
    terminalFontSize: 14,
    terminalFontFamily: 'monospace',
    terminalTheme: {
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
    },
  },
  customCommands: [],
};
