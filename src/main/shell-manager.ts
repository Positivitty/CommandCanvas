import * as pty from 'node-pty';
import { getDefaultShell, IS_WINDOWS } from './constants';
import { Logger } from './logger';

/**
 * ShellManager manages the node-pty process lifecycle.
 *
 * Responsibilities:
 * - Spawn a new shell process (one per application window)
 * - Write data (keystrokes) to the shell
 * - Resize the PTY when the terminal viewport changes
 * - Kill the shell process on window close or crash
 * - Forward data and exit events to registered callbacks
 *
 * The shell is NOT spawned automatically; the renderer must
 * request a spawn via the shell:spawn IPC channel.
 */
export class ShellManager {
  private ptyProcess: pty.IPty | null = null;
  private dataCallbacks: Array<(data: string) => void> = [];
  private exitCallbacks: Array<(exitCode: number, signal?: number) => void> = [];
  private currentCwd: string;
  private logger: Logger | null = null;
  private killedByUser = false;

  constructor(logger?: Logger) {
    this.currentCwd = process.env.HOME || process.env.USERPROFILE || '/';
    if (logger) {
      this.logger = logger;
    }
  }

  /**
   * Spawn a new shell process.
   * If a shell is already running, it is killed first.
   *
   * @param cwd - Working directory for the shell
   * @param cols - Terminal column count
   * @param rows - Terminal row count
   */
  spawn(cwd: string, cols: number, rows: number): void {
    // Kill existing shell if any
    if (this.ptyProcess) {
      this.kill();
    }

    // Clear previously registered callbacks to prevent accumulation
    // across respawns. Callers re-register on each shell:spawn event.
    this.dataCallbacks = [];
    this.exitCallbacks = [];

    this.currentCwd = cwd;
    this.killedByUser = false;

    const shell = getDefaultShell();

    const startTime = Date.now();

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols,
      rows: rows,
      cwd: cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      } as Record<string, string>,
    });

    const elapsed = Date.now() - startTime;
    this.logger?.info(`Shell spawned: cwd=${cwd}, shell=${shell}`);
    this.logger?.debug(`Shell spawn completed in ${elapsed}ms`);

    // Forward data events
    this.ptyProcess.onData((data: string) => {
      for (const callback of this.dataCallbacks) {
        callback(data);
      }
    });

    // Forward exit events
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      if (!this.killedByUser) {
        this.logger?.error(
          `Shell exited unexpectedly: exitCode=${exitCode}, signal=${signal}`
        );
      } else {
        this.logger?.info(`Shell exited: code=${exitCode}`);
      }

      for (const callback of this.exitCallbacks) {
        callback(exitCode, signal);
      }

      this.ptyProcess = null;
    });
  }

  /**
   * Write data to the running shell process.
   * Each character or string is forwarded directly to the PTY.
   *
   * @param data - The string data to write (keystroke, paste, etc.)
   */
  write(data: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  /**
   * Resize the PTY to match new terminal dimensions.
   *
   * @param cols - New column count
   * @param rows - New row count
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
        this.logger?.info(`Shell resized: ${cols}x${rows}`);
      } catch (err) {
        this.logger?.error(`Shell resize failed: ${err}`);
      }
    }
  }

  /**
   * Kill the running shell process.
   * This is called when the window closes or the user explicitly stops the shell.
   */
  kill(): void {
    if (this.ptyProcess) {
      this.killedByUser = true;
      try {
        this.ptyProcess.kill();
      } catch (err) {
        this.logger?.error(`Shell kill failed: ${err}`);
      }
      this.ptyProcess = null;
    }
  }

  /**
   * Register a callback to receive shell output data.
   * Multiple callbacks can be registered.
   *
   * @param callback - Function called with each chunk of shell output
   */
  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  /**
   * Register a callback to be notified when the shell process exits.
   * Multiple callbacks can be registered.
   *
   * @param callback - Function called with exit code and optional signal number
   */
  onExit(callback: (exitCode: number, signal?: number) => void): void {
    this.exitCallbacks.push(callback);
  }

  /**
   * Check whether the shell process is currently running.
   */
  isAlive(): boolean {
    return this.ptyProcess !== null;
  }

  /**
   * Get the current working directory that was used to spawn the shell.
   * Note: This returns the initial CWD; it does not track `cd` commands
   * issued within the shell.
   */
  getCwd(): string {
    return this.currentCwd;
  }
}
