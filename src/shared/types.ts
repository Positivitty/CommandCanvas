// ============================================================
// AUTHORITATIVE TYPE DEFINITIONS — FROZEN
// Do NOT modify this file without Architect approval.
// All agents import from here. Changes break parallel work.
// ============================================================

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
