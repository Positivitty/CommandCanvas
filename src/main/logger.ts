import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LogLevel } from '../shared/types';
import {
  CONFIG_DIR_NAME,
  LOG_DIR_NAME,
  LOG_FILE_NAME,
  MAX_LOG_FILE_SIZE,
  MAX_LOG_ROTATIONS,
  isDev,
} from './constants';

/**
 * Logger class that writes formatted log entries to disk with rotation support.
 *
 * Log format: [ISO-8601 timestamp] [LEVEL] [source] message
 * Rotation: When the log file exceeds 5MB, it is rotated (max 3 rotated files).
 */
export class Logger {
  private logDir: string;
  private logFilePath: string;
  private initialized = false;
  private minLevel: number;
  private writeStream: fs.WriteStream | null = null;

  private static readonly LEVEL_PRIORITY: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  constructor() {
    this.logDir = path.join(os.homedir(), CONFIG_DIR_NAME, LOG_DIR_NAME);
    this.logFilePath = path.join(this.logDir, LOG_FILE_NAME);

    // Determine minimum log level
    const envLevel = process.env.COMMANDCANVAS_LOG_LEVEL as LogLevel | undefined;
    if (envLevel && Logger.LEVEL_PRIORITY[envLevel] !== undefined) {
      this.minLevel = Logger.LEVEL_PRIORITY[envLevel];
    } else {
      this.minLevel = isDev() ? Logger.LEVEL_PRIORITY.debug : Logger.LEVEL_PRIORITY.info;
    }
  }

  /**
   * Initialize the logger: create log directory and open the write stream.
   */
  init(): void {
    if (this.initialized) return;

    try {
      // Create log directory recursively if it doesn't exist
      fs.mkdirSync(this.logDir, { recursive: true });

      // Check if rotation is needed before opening
      this.rotateIfNeeded();

      // Open write stream in append mode
      this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

      this.initialized = true;

      // Print log file path to stdout (for developer reference)
      if (isDev()) {
        process.stdout.write(`Logging to: ${this.logFilePath}\n`);
      }
    } catch (err) {
      // If logging fails, fall back to stderr
      process.stderr.write(`[Logger] Failed to initialize: ${err}\n`);
    }
  }

  /**
   * Write a log entry with the specified level, source, and message.
   */
  log(
    level: LogLevel,
    source: 'main' | 'renderer',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    // Check if this level should be logged
    if (Logger.LEVEL_PRIORITY[level] > this.minLevel) return;

    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const sourceStr = source.padEnd(8);

    let logLine = `[${timestamp}] [${levelStr}] [${sourceStr}] ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      logLine += ` ${JSON.stringify(meta)}`;
    }

    logLine += '\n';

    // Write to file
    if (this.writeStream) {
      this.writeStream.write(logLine);
    }

    // In development, also write to stdout/stderr
    if (isDev()) {
      if (level === 'error') {
        process.stderr.write(logLine);
      } else {
        process.stdout.write(logLine);
      }
    }

    // Check rotation after write
    this.rotateIfNeeded();
  }

  /**
   * Log an error message from the main process.
   */
  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', 'main', message, meta);
  }

  /**
   * Log a warning message from the main process.
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', 'main', message, meta);
  }

  /**
   * Log an info message from the main process.
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', 'main', message, meta);
  }

  /**
   * Log a debug message from the main process.
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', 'main', message, meta);
  }

  /**
   * Get the path to the current log file.
   */
  getLogPath(): string {
    return this.logFilePath;
  }

  /**
   * Rotate log files if the current log file exceeds the maximum size.
   * Rotation scheme:
   *   commandcanvas.log -> commandcanvas.1.log
   *   commandcanvas.1.log -> commandcanvas.2.log
   *   commandcanvas.2.log -> commandcanvas.3.log
   *   commandcanvas.3.log -> deleted
   */
  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFilePath)) return;

      const stats = fs.statSync(this.logFilePath);
      if (stats.size < MAX_LOG_FILE_SIZE) return;

      // Close current write stream
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }

      // Rotate existing numbered log files (shift numbers up)
      for (let i = MAX_LOG_ROTATIONS; i >= 1; i--) {
        const src = i === 1
          ? this.logFilePath
          : path.join(this.logDir, `commandcanvas.${i - 1}.log`);
        const dest = path.join(this.logDir, `commandcanvas.${i}.log`);

        if (fs.existsSync(src)) {
          // Delete the oldest if we're at max rotation
          if (i === MAX_LOG_ROTATIONS && fs.existsSync(dest)) {
            fs.unlinkSync(dest);
          }
          fs.renameSync(src, dest);
        }
      }

      // Open a new write stream for the fresh log file
      this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    } catch (err) {
      process.stderr.write(`[Logger] Rotation failed: ${err}\n`);
    }
  }
}
