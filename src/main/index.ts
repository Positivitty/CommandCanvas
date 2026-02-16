import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { Logger } from './logger';
import { ConfigManager } from './config-manager';
import { ShellManager } from './shell-manager';
import { ProjectDetector } from './project-detector';
import { registerAllHandlers } from './ipc-handlers';
import { DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from './constants';

// Import WarningEngine from warning-engine.ts (owned by Warning Engine Agent)
// This import will resolve once the Warning Engine Agent creates the file
import { WarningEngine } from './warning-engine';

/**
 * CommandCanvas Main Process Entry Point
 *
 * Follows the startup sequence defined in Architecture Section 4.5:
 *   Step 1: app.whenReady()
 *   Step 2: Initialize logger
 *   Step 3: Load configuration
 *   Step 4: Initialize warning engine
 *   Step 5: Initialize project detector
 *   Step 6: Initialize shell manager
 *   Step 7: Register all IPC handlers
 *   Step 8: Create BrowserWindow
 *   Step 9: Load renderer
 */

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Keep a global reference to the window to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

// Module instances (initialized during startup)
let logger: Logger;
let configManager: ConfigManager;
let shellManager: ShellManager;

async function createWindow(): Promise<void> {
  // Step 2: Initialize logger
  logger = new Logger();
  logger.init();
  logger.info('CommandCanvas starting...');

  // Step 3: Load configuration
  configManager = new ConfigManager(logger);
  const config = await configManager.load();
  logger.info(`Config loaded from ${configManager.getPath()}`);

  // Step 4: Initialize warning engine
  const warningEngine = new WarningEngine(config.warnings);
  logger.info('Warning engine initialized');

  // Step 5: Initialize project detector
  const projectDetector = new ProjectDetector();
  logger.info('Project detector initialized');

  // Step 6: Initialize shell manager (shell is NOT spawned yet)
  shellManager = new ShellManager(logger);
  logger.info('Shell manager initialized');

  // Step 7: Register all IPC handlers (only once)
  if (!handlersRegistered) {
    registerAllHandlers({
      shellManager,
      warningEngine,
      configManager,
      projectDetector,
      logger,
    });
    handlersRegistered = true;
    logger.info('IPC handlers registered');
  }

  // Step 8: Create BrowserWindow
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required: node-pty needs unsandboxed preload
    },
  });

  logger.info(`BrowserWindow created: ${DEFAULT_WINDOW_WIDTH}x${DEFAULT_WINDOW_HEIGHT}`);

  // Step 9: Load renderer
  // In development with Vite, MAIN_WINDOW_VITE_DEV_SERVER_URL is set
  // In production, MAIN_WINDOW_VITE_NAME is used to locate the built file
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Capture renderer console messages in the main process log
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    const levels = ['debug', 'info', 'warn', 'error'];
    const levelName = levels[level] || 'info';
    logger.info(`[renderer:${levelName}] ${message}`);
  });

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  logger.info('Renderer loaded');

  // Handle window close
  mainWindow.on('closed', () => {
    // Kill the shell when the window closes
    if (shellManager) {
      shellManager.kill();
    }
    mainWindow = null;
    logger.info('Window closed');
  });
}

// ============================================================
// App Lifecycle Events
// ============================================================

// Step 1: Wait for Electron to be ready
app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (err) {
    console.error('Failed to create window:', err);
    app.quit();
  }

  // macOS: Re-create window when dock icon is clicked and no windows exist
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await createWindow();
      } catch (err) {
        console.error('Failed to create window on activate:', err);
      }
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logger?.info('All windows closed, quitting app');
    app.quit();
  }
});

// Clean up before quit
app.on('before-quit', () => {
  if (shellManager) {
    shellManager.kill();
  }
  logger?.info('App shutting down');
});

// ============================================================
// Electron Forge Vite Plugin Type Declarations
// ============================================================

// These globals are injected by the Electron Forge Vite plugin at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
