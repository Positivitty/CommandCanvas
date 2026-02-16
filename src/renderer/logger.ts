/**
 * Renderer-side logging module.
 *
 * Forwards all log messages to the main process via `window.api.log.send()`.
 * In development mode, also logs to the browser console for convenience.
 *
 * Log levels (from ARCHITECTURE.md Section 8):
 * - error: Always logged
 * - warn:  Always logged
 * - info:  Production + Development
 * - debug: Development only
 */

import type { LogLevel } from '../shared/types';

declare global {
  interface Window {
    api: {
      log: {
        send: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
      };
      [key: string]: any;
    };
  }
}

const isDev = typeof process !== 'undefined'
  ? process.env?.NODE_ENV === 'development'
  : true; // Default to true in renderer context for dev convenience

/**
 * Send a log message to the main process logger.
 * Optionally also logs to the browser console in development mode.
 */
function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  // Forward to main process via preload API
  try {
    if (window.api?.log?.send) {
      window.api.log.send(level, message, meta);
    }
  } catch {
    // If IPC is unavailable, fall back to console only
  }

  // Also log to console in development
  if (isDev) {
    const prefix = `[renderer] [${level.toUpperCase()}]`;
    const args: any[] = [prefix, message];
    if (meta) {
      args.push(meta);
    }

    switch (level) {
      case 'error':
        console.error(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'debug':
        console.debug(...args);
        break;
    }
  }
}

/**
 * Log an error-level message.
 */
export function error(message: string, meta?: Record<string, unknown>): void {
  log('error', message, meta);
}

/**
 * Log a warn-level message.
 */
export function warn(message: string, meta?: Record<string, unknown>): void {
  log('warn', message, meta);
}

/**
 * Log an info-level message.
 */
export function info(message: string, meta?: Record<string, unknown>): void {
  log('info', message, meta);
}

/**
 * Log a debug-level message.
 */
export function debug(message: string, meta?: Record<string, unknown>): void {
  log('debug', message, meta);
}
