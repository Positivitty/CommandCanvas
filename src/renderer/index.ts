/**
 * CommandCanvas - Renderer Entry Point
 *
 * Initializes all UI modules and wires event bus listeners to IPC callbacks.
 * Follows the startup sequence from ARCHITECTURE.md Section 4.5, Steps 10-20.
 *
 * Startup Sequence:
 *  10. DOMContentLoaded fires
 *  11. Event bus instantiated (singleton, on import)
 *  12. Load configuration from main process
 *  13. Initialize animation engine
 *  14. Initialize terminal renderer
 *  15. Spawn shell
 *  16. Detect project types
 *  17. Initialize command panel
 *  18. Initialize explanation panel
 *  19. Initialize warning overlay
 *  20. Focus terminal
 */

import { eventBus } from './event-bus';
import * as terminalRenderer from './terminal-renderer';
import * as animationEngine from './animation-engine';
import * as commandPanel from './command-panel';
import * as explanationPanel from './explanation-panel';
import * as warningOverlay from './warning-overlay';
import * as customCommandForm from './custom-command-form';
import * as logger from './logger';
import type { AppConfig, WarningDisplayPayload } from '../shared/types';

/**
 * Default configuration used as fallback when config loading fails.
 */
const DEFAULT_CONFIG: AppConfig = {
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

/**
 * Main initialization function.
 * Called when DOMContentLoaded fires.
 */
async function initialize(): Promise<void> {
  logger.info('CommandCanvas renderer starting...');

  // Step 12: Load configuration from main process
  let config: AppConfig;
  try {
    config = await window.api.config.load();
    logger.info('Configuration loaded successfully');
  } catch (err) {
    logger.error('Failed to load configuration, using defaults', { error: String(err) });
    config = DEFAULT_CONFIG;
  }

  // Apply layout dimensions from config as CSS custom properties
  applyLayoutConfig(config);

  // Step 13: Initialize animation engine
  const animationArea = document.getElementById('animation-area');
  if (animationArea) {
    try {
      animationEngine.init(animationArea);
      animationEngine.setEnabled(config.animation.enabled);
      animationEngine.setSpeed(config.animation.speed);
      animationEngine.setTheme(config.animation.theme);
      animationEngine.setState('idle');
      logger.info('Animation engine initialized');
    } catch (err) {
      logger.warn('Animation engine initialization failed', { error: String(err) });
    }
  }

  // Step 14: Initialize terminal renderer
  const terminalOutput = document.getElementById('terminal-output');
  if (terminalOutput) {
    terminalRenderer.init(terminalOutput);
    terminalRenderer.applyConfig(config);
    logger.info('Terminal renderer initialized');
  } else {
    logger.error('Terminal output container not found');
    return;
  }

  // Step 15: Spawn shell
  const dims = terminalRenderer.getDimensions();
  const cols = dims?.cols ?? 80;
  const rows = dims?.rows ?? 24;

  // Determine the working directory
  let cwd: string;
  try {
    const shellConfig = await window.api.config.get('shell');
    cwd = shellConfig?.defaultCwd || '.';
  } catch {
    cwd = '.';
  }

  try {
    window.api.shell.spawn(cwd, cols, rows);
    eventBus.emit('shell:spawned', {});
    logger.info('Shell spawned', { cwd, cols, rows });
  } catch (err) {
    logger.error('Failed to spawn shell', { error: String(err) });
  }

  // Step 16: Detect project types
  let projectTypes: string[] = [];
  try {
    projectTypes = await window.api.project.detect(cwd);
    eventBus.emit('project:detected', { types: projectTypes });
    logger.info('Project types detected', { types: projectTypes });
  } catch (err) {
    logger.warn('Project detection failed', { error: String(err) });
  }

  // Step 17: Initialize command panel
  const commandPanelEl = document.getElementById('command-panel');
  if (commandPanelEl) {
    try {
      commandPanel.init(commandPanelEl);
      commandPanel.setVisibleCategories([...projectTypes, 'custom']);
      logger.info('Command panel initialized');
    } catch (err) {
      logger.warn('Command panel initialization failed', { error: String(err) });
    }
  }

  // Step 18: Initialize explanation panel
  const explanationPanelEl = document.getElementById('explanation-panel');
  if (explanationPanelEl) {
    try {
      explanationPanel.init(explanationPanelEl);
      logger.info('Explanation panel initialized');
    } catch (err) {
      logger.warn('Explanation panel initialization failed', { error: String(err) });
    }
  }

  // Step 19: Initialize warning overlay and custom command form
  const warningOverlayEl = document.getElementById('warning-overlay');
  if (warningOverlayEl) {
    try {
      warningOverlay.init(warningOverlayEl);
      logger.info('Warning overlay initialized');
    } catch (err) {
      logger.warn('Warning overlay initialization failed', { error: String(err) });
    }
  }

  const customCommandModalEl = document.getElementById('custom-command-modal');
  if (customCommandModalEl) {
    try {
      customCommandForm.init(customCommandModalEl);
      logger.info('Custom command form initialized');
    } catch (err) {
      logger.warn('Custom command form initialization failed', { error: String(err) });
    }
  }

  // Wire up warning IPC callback to event bus
  window.api.warning.onWarning((payload: WarningDisplayPayload) => {
    eventBus.emit('warning:show', payload);
  });

  // Step 20: Focus terminal
  terminalRenderer.focus();

  logger.info('CommandCanvas renderer fully initialized');
}

/**
 * Apply layout-related config values as CSS custom properties on the root element.
 * This allows the grid layout to adapt to user preferences.
 */
function applyLayoutConfig(config: AppConfig): void {
  const root = document.documentElement;
  const ui = config.ui;

  // Validate and clamp layout values before applying as CSS
  const animH = Number.isFinite(ui.animationAreaHeight) && ui.animationAreaHeight > 0
    ? ui.animationAreaHeight : 420;
  const cmdW = Number.isFinite(ui.commandPanelWidth) && ui.commandPanelWidth > 0
    ? ui.commandPanelWidth : 200;
  const expH = Number.isFinite(ui.explanationPanelHeight) && ui.explanationPanelHeight > 0
    ? ui.explanationPanelHeight : 48;

  root.style.setProperty('--animation-area-height', `${animH}px`);
  root.style.setProperty('--command-panel-width', `${cmdW}px`);
  root.style.setProperty('--explanation-panel-height', `${expH}px`);
}

// Wait for DOM to be ready before initializing
document.addEventListener('DOMContentLoaded', () => {
  initialize().catch((err) => {
    logger.error('Fatal initialization error', { error: String(err) });
    console.error('CommandCanvas initialization failed:', err);
  });
});
