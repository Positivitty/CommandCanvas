import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  IpcDependencies,
  PendingCommand,
  WarningDisplayPayload,
  AppConfig,
  LogLevel,
} from '../shared/types';
import type { ShellManager } from './shell-manager';
import type { WarningEngine } from './warning-engine';
import type { ConfigManager } from './config-manager';
import type { ProjectDetector } from './project-detector';
import type { Logger } from './logger';

/**
 * Registers all 18 IPC channel handlers.
 *
 * This function is the single centralized location for all ipcMain.handle()
 * and ipcMain.on() registrations. It receives dependencies via injection
 * to maintain testability and clear module boundaries.
 *
 * Shell channels use send/on (fire-and-forget) for latency-sensitive terminal I/O.
 * Config, project, animation, and warning:check channels use invoke/handle (request/response).
 *
 * The shell:write handler implements the line buffer and warning pipeline:
 * - Characters are accumulated in a line buffer AND forwarded to the shell immediately
 * - When '\r' (Enter) is detected, the line buffer is evaluated by the warning engine
 * - If risky: '\r' is held, a warning is sent to the renderer
 * - If safe: '\r' is forwarded, buffer is cleared
 */
export function registerAllHandlers(deps: IpcDependencies): void {
  const { shellManager, warningEngine, configManager, projectDetector, logger } = deps;

  // ============================================================
  // Internal state for the warning pipeline
  // ============================================================

  /** Line buffer accumulates typed characters to evaluate on Enter */
  let lineBuffer = '';

  /** Map of held commands waiting for user confirmation/cancellation */
  const pendingCommands = new Map<string, PendingCommand>();

  /** Whether we are inside a multi-byte escape sequence (e.g. arrow keys) */
  let inEscapeSequence = false;

  /** Maximum line buffer length to prevent OOM from large pastes */
  const MAX_LINE_BUFFER_LENGTH = 65536;

  // ============================================================
  // Helper: Get the focused BrowserWindow's webContents
  // ============================================================

  function getWebContents(): Electron.WebContents | null {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return win ? win.webContents : null;
  }

  // ============================================================
  // Shell Subsystem (fire-and-forget: send/on)
  // ============================================================

  // shell:spawn - Renderer requests a new shell
  ipcMain.on(IPC_CHANNELS.SHELL_SPAWN, (_event, payload: { cwd: string; cols: number; rows: number }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.SHELL_SPAWN} received`);

    shellManager.spawn(payload.cwd, payload.cols, payload.rows);

    // Wire up shell data output -> renderer
    shellManager.onData((data: string) => {
      const wc = getWebContents();
      if (wc) {
        wc.send(IPC_CHANNELS.SHELL_DATA, { data });
      }
    });

    // Wire up shell exit -> renderer
    shellManager.onExit((exitCode: number, signal?: number) => {
      // Clear stale line buffer and pending commands on shell exit
      lineBuffer = '';
      inEscapeSequence = false;
      pendingCommands.clear();

      const wc = getWebContents();
      if (wc) {
        wc.send(IPC_CHANNELS.SHELL_EXIT, { exitCode, signal });
      }
    });
  });

  // shell:write - Keystroke or paste from the renderer
  // This is the heart of the warning pipeline
  ipcMain.on(IPC_CHANNELS.SHELL_WRITE, (_event, payload: { data: string }) => {
    const data = payload.data;

    // If the shell is not running, discard input to prevent
    // line buffer accumulation during dead-shell state
    if (!shellManager.isAlive()) {
      return;
    }

    for (const char of data) {
      // Detect start of escape sequence (e.g. arrow keys, Home, End)
      if (char === '\x1b') {
        inEscapeSequence = true;
        shellManager.write(char);
        continue;
      }

      // Inside an escape sequence — forward without buffering
      if (inEscapeSequence) {
        shellManager.write(char);
        // Escape sequences end with a letter [A-Za-z] or ~
        if (/[A-Za-z~]/.test(char)) {
          inEscapeSequence = false;
        }
        continue;
      }

      // Handle backspace: remove last character from line buffer
      if (char === '\x7f' || char === '\b') {
        lineBuffer = lineBuffer.slice(0, -1);
        shellManager.write(char);
        continue;
      }

      // Handle control characters (Ctrl+C = \x03, Ctrl+D = \x04, etc.)
      // These clear the line buffer and are forwarded immediately
      if (char.charCodeAt(0) < 0x20 && char !== '\r' && char !== '\n') {
        lineBuffer = '';
        shellManager.write(char);
        continue;
      }

      // Handle Enter (carriage return or newline from paste)
      if (char === '\r' || char === '\n') {
        // Extract the accumulated command from the line buffer
        const command = lineBuffer.trim();
        logger.debug(`IPC: ${IPC_CHANNELS.SHELL_WRITE} detected Enter, line buffer: [${command.length} chars]`);

        if (command.length === 0) {
          // Empty command - just forward Enter
          shellManager.write(char);
          lineBuffer = '';
          continue;
        }

        // Evaluate the command against warning rules
        const warningResult = warningEngine.evaluate(command);

        if (warningResult === null) {
          // No warning - forward Enter and clear buffer
          shellManager.write(char);
          lineBuffer = '';
        } else {
          // Warning triggered - hold the Enter key
          logger.warn(`Warning triggered: rule=${warningResult.ruleId}, riskLevel=${warningResult.riskLevel}`);

          // Store the pending command
          pendingCommands.set(warningResult.warningId, {
            warningId: warningResult.warningId,
            pendingData: '\r',
          });

          // Send warning to renderer
          const warningPayload: WarningDisplayPayload = {
            warningId: warningResult.warningId,
            command: warningResult.command,
            riskLevel: warningResult.riskLevel,
            description: warningResult.description,
            recommendation: warningResult.recommendation,
          };

          const wc = getWebContents();
          if (wc) {
            wc.send(IPC_CHANNELS.WARNING_TRIGGERED, warningPayload);
          }
        }

        continue;
      }

      // Regular character - append to line buffer and forward to shell
      if (lineBuffer.length < MAX_LINE_BUFFER_LENGTH) {
        lineBuffer += char;
      }
      shellManager.write(char);
    }
  });

  // shell:resize - Terminal viewport changed
  ipcMain.on(IPC_CHANNELS.SHELL_RESIZE, (_event, payload: { cols: number; rows: number }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.SHELL_RESIZE} received`);
    shellManager.resize(payload.cols, payload.rows);
  });

  // shell:kill - Renderer requests shell termination
  ipcMain.on(IPC_CHANNELS.SHELL_KILL, () => {
    logger.debug(`IPC: ${IPC_CHANNELS.SHELL_KILL} received`);
    shellManager.kill();
  });

  // ============================================================
  // Warning Subsystem
  // ============================================================

  // warning:check - Pre-check a command (invoke/handle pattern)
  ipcMain.handle(IPC_CHANNELS.WARNING_CHECK, async (_event, payload: { command: string }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.WARNING_CHECK} received`);
    return warningEngine.evaluate(payload.command);
  });

  // warning:confirm - User clicked "Execute Anyway"
  ipcMain.on(IPC_CHANNELS.WARNING_CONFIRM, (_event, payload: { warningId: string }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.WARNING_CONFIRM} received`);
    const pending = pendingCommands.get(payload.warningId);

    if (pending) {
      logger.warn(`Warning resolved: warningId=${payload.warningId}, decision=confirm`);

      // Forward the held Enter key to the shell
      shellManager.write(pending.pendingData);

      // Clean up
      pendingCommands.delete(payload.warningId);
      lineBuffer = '';
    } else {
      logger.warn(`Warning confirm received for unknown warningId: ${payload.warningId}`);
    }
  });

  // warning:cancel - User clicked "Cancel"
  ipcMain.on(IPC_CHANNELS.WARNING_CANCEL, (_event, payload: { warningId: string }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.WARNING_CANCEL} received`);
    const pending = pendingCommands.get(payload.warningId);

    if (pending) {
      logger.warn(`Warning resolved: warningId=${payload.warningId}, decision=cancel`);

      // Discard the pending command (do not forward Enter)
      pendingCommands.delete(payload.warningId);
      lineBuffer = '';

      // Clear the cancelled command text from the shell input line
      shellManager.write('\x15'); // Ctrl+U: kill line
    } else {
      logger.warn(`Warning cancel received for unknown warningId: ${payload.warningId}`);
    }
  });

  // ============================================================
  // Config Subsystem (invoke/handle pattern)
  // ============================================================

  // config:load - Load the full configuration
  ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, async () => {
    logger.debug(`IPC: ${IPC_CHANNELS.CONFIG_LOAD} handled`);
    return configManager.load();
  });

  // config:save - Save the full configuration
  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, async (_event, config: AppConfig) => {
    logger.debug(`IPC: ${IPC_CHANNELS.CONFIG_SAVE} handled`);
    await configManager.save(config);
    return { success: true };
  });

  // config:get - Get a single config key
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (_event, payload: { key: string }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.CONFIG_GET} handled`);
    return configManager.get(payload.key as keyof AppConfig);
  });

  // config:set - Set a single config key
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, payload: { key: string; value: unknown }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.CONFIG_SET} handled`);
    await configManager.set(
      payload.key as keyof AppConfig,
      payload.value as AppConfig[keyof AppConfig]
    );
    return { success: true };
  });

  // ============================================================
  // Project Detection Subsystem (invoke/handle pattern)
  // ============================================================

  // project:detect - Scan a directory for project markers
  ipcMain.handle(IPC_CHANNELS.PROJECT_DETECT, async (_event, payload: { directory: string }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.PROJECT_DETECT} handled`);
    const types = await projectDetector.detect(payload.directory);
    logger.info(`Project detected: cwd=${payload.directory}, types=[${types.join(', ')}]`);
    return types;
  });

  // ============================================================
  // Animation Subsystem (invoke/handle pattern)
  // ============================================================

  // animation:load-theme - Load animation frame data for a given theme
  ipcMain.handle(IPC_CHANNELS.ANIMATION_LOAD_THEME, async (_event, payload: { themeName: string }) => {
    logger.debug(`IPC: ${IPC_CHANNELS.ANIMATION_LOAD_THEME} handled`);

    // Sanitize theme name to prevent path traversal
    let themeName = path.basename(payload.themeName);
    if (!themeName || themeName === '.' || themeName === '..') {
      themeName = 'default';
    }
    let themeDir = path.join(__dirname, '../../assets/animations', themeName);

    // Check if the theme directory exists
    try {
      await fs.access(themeDir);
    } catch {
      logger.warn(`Animation theme '${themeName}' not found, falling back to 'default'`);
      themeDir = path.join(__dirname, '../../assets/animations', 'default');

      try {
        await fs.access(themeDir);
      } catch {
        logger.warn('Default animation theme missing, disabling animations');
        return null;
      }
    }

    // Load each frame file
    const loadFrameFile = async (state: string) => {
      const filePath = path.join(themeDir, `${state}.frames.json`);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
        logger.warn(`Missing or invalid frame file: ${state}.frames.json in theme '${themeName}'`);
        return {
          meta: { name: `${state}`, author: 'unknown', frameDelayMs: 200 },
          frames: [],
        };
      }
    };

    const [idle, success, error] = await Promise.all([
      loadFrameFile('idle'),
      loadFrameFile('success'),
      loadFrameFile('error'),
    ]);

    return { idle, success, error };
  });

  // animation:get-themes - List available animation theme names
  ipcMain.handle(IPC_CHANNELS.ANIMATION_GET_THEMES, async () => {
    logger.debug(`IPC: ${IPC_CHANNELS.ANIMATION_GET_THEMES} handled`);

    const animationsDir = path.join(__dirname, '../../assets/animations');

    try {
      const entries = await fs.readdir(animationsDir, { withFileTypes: true });
      const themeNames = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      return themeNames;
    } catch (err) {
      logger.error(`Failed to read animation themes directory: ${err}`);
      return [];
    }
  });

  // ============================================================
  // Logging Subsystem (fire-and-forget: send/on)
  // ============================================================

  // log:send - Forward renderer-side log messages to the main logger
  ipcMain.on(
    IPC_CHANNELS.LOG_SEND,
    (_event, payload: { level: LogLevel; message: string; meta?: Record<string, unknown> }) => {
      logger.log(payload.level, 'renderer', payload.message, payload.meta);
    }
  );
}
