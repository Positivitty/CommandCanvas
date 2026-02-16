import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';

/**
 * Preload script: Exposes a typed, minimal, safe API to the renderer process
 * via contextBridge.exposeInMainWorld('api', {...}).
 *
 * Security rules:
 * - No raw ipcRenderer is exposed
 * - No require, fs, child_process, or eval is accessible from the renderer
 * - Callback registrations strip the Electron event object before forwarding
 * - contextIsolation: true and nodeIntegration: false are enforced in BrowserWindow options
 *
 * Every method is a purpose-built wrapper around a specific IPC channel.
 */

/**
 * Helper to wrap ipcRenderer.invoke with a timeout.
 * If the invoke does not resolve within 10 seconds, it rejects.
 */
function invokeWithTimeout<T>(channel: string, ...args: unknown[]): Promise<T> {
  return Promise.race([
    ipcRenderer.invoke(channel, ...args) as Promise<T>,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`IPC timeout: ${channel}`)), 10000)
    ),
  ]);
}

contextBridge.exposeInMainWorld('api', {
  // ============================================================
  // Shell API
  // ============================================================
  shell: {
    /**
     * Request the main process to spawn a new shell.
     */
    spawn: (cwd: string, cols: number, rows: number): void => {
      ipcRenderer.send(IPC_CHANNELS.SHELL_SPAWN, { cwd, cols, rows });
    },

    /**
     * Write data (keystrokes, paste) to the shell.
     */
    write: (data: string): void => {
      ipcRenderer.send(IPC_CHANNELS.SHELL_WRITE, { data });
    },

    /**
     * Resize the shell PTY to match new terminal dimensions.
     */
    resize: (cols: number, rows: number): void => {
      ipcRenderer.send(IPC_CHANNELS.SHELL_RESIZE, { cols, rows });
    },

    /**
     * Kill the running shell process.
     */
    kill: (): void => {
      ipcRenderer.send(IPC_CHANNELS.SHELL_KILL);
    },

    /**
     * Register a callback to receive shell output data.
     * The Electron event object is stripped; only the data string is passed.
     */
    onData: (callback: (data: string) => void): void => {
      ipcRenderer.on(IPC_CHANNELS.SHELL_DATA, (_event, payload: { data: string }) => {
        callback(payload.data);
      });
    },

    /**
     * Register a callback to be notified when the shell process exits.
     * The Electron event object is stripped.
     */
    onExit: (callback: (exitCode: number) => void): void => {
      ipcRenderer.on(IPC_CHANNELS.SHELL_EXIT, (_event, payload: { exitCode: number }) => {
        callback(payload.exitCode);
      });
    },
  },

  // ============================================================
  // Warning API
  // ============================================================
  warning: {
    /**
     * Pre-check a command against warning rules (invoke/handle).
     */
    check: (command: string) => {
      return invokeWithTimeout(IPC_CHANNELS.WARNING_CHECK, { command });
    },

    /**
     * Register a callback to be notified when a warning is triggered
     * by the shell:write pipeline.
     * The Electron event object is stripped.
     */
    onWarning: (callback: (payload: {
      warningId: string;
      command: string;
      riskLevel: string;
      description: string;
      recommendation: string;
    }) => void): void => {
      ipcRenderer.on(IPC_CHANNELS.WARNING_TRIGGERED, (_event, payload) => {
        callback(payload);
      });
    },

    /**
     * Confirm execution of a held command (user clicked "Execute Anyway").
     */
    confirmExecution: (warningId: string): void => {
      ipcRenderer.send(IPC_CHANNELS.WARNING_CONFIRM, { warningId });
    },

    /**
     * Cancel execution of a held command (user clicked "Cancel").
     */
    cancelExecution: (warningId: string): void => {
      ipcRenderer.send(IPC_CHANNELS.WARNING_CANCEL, { warningId });
    },
  },

  // ============================================================
  // Config API
  // ============================================================
  config: {
    /**
     * Load the full application configuration.
     */
    load: () => {
      return invokeWithTimeout(IPC_CHANNELS.CONFIG_LOAD);
    },

    /**
     * Save the full application configuration.
     */
    save: (config: unknown) => {
      return invokeWithTimeout(IPC_CHANNELS.CONFIG_SAVE, config);
    },

    /**
     * Get a single top-level config key value.
     */
    get: (key: string) => {
      return invokeWithTimeout(IPC_CHANNELS.CONFIG_GET, { key });
    },

    /**
     * Set a single top-level config key and persist to disk.
     */
    set: (key: string, value: unknown) => {
      return invokeWithTimeout(IPC_CHANNELS.CONFIG_SET, { key, value });
    },
  },

  // ============================================================
  // Project API
  // ============================================================
  project: {
    /**
     * Detect project types in the given directory.
     */
    detect: (directory: string) => {
      return invokeWithTimeout(IPC_CHANNELS.PROJECT_DETECT, { directory });
    },
  },

  // ============================================================
  // Animation API
  // ============================================================
  animation: {
    /**
     * Load animation theme data (frames for all three states).
     */
    loadTheme: (themeName: string) => {
      return invokeWithTimeout(IPC_CHANNELS.ANIMATION_LOAD_THEME, { themeName });
    },

    /**
     * Get the list of available animation theme names.
     */
    getAvailableThemes: () => {
      return invokeWithTimeout<string[]>(IPC_CHANNELS.ANIMATION_GET_THEMES);
    },
  },

  // ============================================================
  // Log API
  // ============================================================
  log: {
    /**
     * Send a log message from the renderer to the main process logger.
     * Fire-and-forget (send), not invoke.
     */
    send: (level: string, message: string, meta?: Record<string, unknown>): void => {
      ipcRenderer.send(IPC_CHANNELS.LOG_SEND, { level, message, meta });
    },
  },
});
