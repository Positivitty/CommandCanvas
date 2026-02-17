import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppConfig } from '../shared/types';
import {
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  CONFIG_BACKUP_FILE_NAME,
  CURRENT_CONFIG_VERSION,
  DEFAULT_CONFIG,
} from './constants';
import { Logger } from './logger';

/**
 * ConfigManager handles reading, writing, validating, and migrating
 * the application configuration stored at ~/.commandcanvas/config.json.
 *
 * Responsibilities:
 * - First-run creation (writes defaults if config directory/file don't exist)
 * - Corruption recovery (backs up corrupt file, writes fresh defaults)
 * - Schema validation and migration
 * - In-memory cache for synchronous get() access
 */
export class ConfigManager {
  private configDir: string;
  private configFilePath: string;
  private config: AppConfig;
  private logger: Logger | null = null;

  constructor(logger?: Logger) {
    this.configDir = path.join(os.homedir(), CONFIG_DIR_NAME);
    this.configFilePath = path.join(this.configDir, CONFIG_FILE_NAME);
    this.config = structuredClone(DEFAULT_CONFIG);
    if (logger) {
      this.logger = logger;
    }
  }

  /**
   * Load the configuration from disk.
   * Handles:
   * - Missing directory: creates it
   * - Missing file: writes defaults
   * - Corrupt JSON: backs up and writes defaults
   * - Valid JSON but missing fields: merges with defaults
   * - Version mismatch: runs migrations
   */
  async load(): Promise<AppConfig> {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Try to read the config file
      let fileContent: string;
      try {
        fileContent = await fs.readFile(this.configFilePath, 'utf-8');
      } catch (err: unknown) {
        // File doesn't exist - write defaults
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          this.logger?.info('Config file not found, writing defaults');
          this.config = structuredClone(DEFAULT_CONFIG);
          await this.writeToDisk();
          return this.config;
        }
        throw err;
      }

      // Try to parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(fileContent);
      } catch {
        // Corrupt JSON - back up and write defaults
        this.logger?.warn('Config file corrupt, backed up and reset');
        const backupPath = path.join(this.configDir, CONFIG_BACKUP_FILE_NAME);
        await fs.writeFile(backupPath, fileContent, 'utf-8');
        this.config = structuredClone(DEFAULT_CONFIG);
        await this.writeToDisk();
        return this.config;
      }

      // Validate and merge with defaults
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        this.logger?.warn('Config file has invalid structure, resetting to defaults');
        const backupPath = path.join(this.configDir, CONFIG_BACKUP_FILE_NAME);
        await fs.writeFile(backupPath, fileContent, 'utf-8');
        this.config = structuredClone(DEFAULT_CONFIG);
        await this.writeToDisk();
        return this.config;
      }

      // Merge with defaults to fill any missing fields
      this.config = this.mergeWithDefaults(parsed as Partial<AppConfig>);

      // Run migrations if needed
      if (this.config.version < CURRENT_CONFIG_VERSION) {
        this.config = this.migrate(this.config);
        await this.writeToDisk();
        this.logger?.info(`Config migrated to version ${CURRENT_CONFIG_VERSION}`);
      }

      return this.config;
    } catch (err) {
      this.logger?.error(`Failed to load config: ${err}`);
      // Return defaults in memory
      this.config = structuredClone(DEFAULT_CONFIG);
      return this.config;
    }
  }

  /**
   * Save the full configuration object to disk.
   */
  async save(config: AppConfig): Promise<void> {
    const previous = this.config;
    this.config = config;
    try {
      await this.writeToDisk();
      this.logger?.info('Config saved');
    } catch (err) {
      // Roll back in-memory state on write failure
      this.config = previous;
      this.logger?.error(`Config save failed, rolled back in-memory state: ${err}`);
      throw err;
    }
  }

  /**
   * Get a single top-level config key value (synchronous, from in-memory cache).
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Set a single top-level config key and persist to disk.
   */
  async set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    this.config[key] = value;
    await this.writeToDisk();
    this.logger?.info(`Config key "${key}" updated`);
  }

  /**
   * Get the path to the config file.
   */
  getPath(): string {
    return this.configFilePath;
  }

  /**
   * Reset configuration to defaults and write to disk.
   */
  async reset(): Promise<void> {
    this.config = structuredClone(DEFAULT_CONFIG);
    await this.writeToDisk();
    this.logger?.info('Config reset to defaults');
  }

  /**
   * Write the current in-memory config to disk.
   */
  private async writeToDisk(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    // Atomic write: write to temp file then rename (atomic on POSIX)
    const tmpPath = this.configFilePath + '.tmp';
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, this.configFilePath);
  }

  /**
   * Deep merge a partial config with the defaults, preserving any extra fields
   * from the loaded config while filling in missing fields from defaults.
   */
  private mergeWithDefaults(loaded: Partial<AppConfig>): AppConfig {
    const defaults = structuredClone(DEFAULT_CONFIG);

    return {
      version: typeof loaded.version === 'number' ? loaded.version : defaults.version,
      shell: {
        ...defaults.shell,
        ...(loaded.shell && typeof loaded.shell === 'object' ? loaded.shell : {}),
      },
      animation: {
        ...defaults.animation,
        ...(loaded.animation && typeof loaded.animation === 'object' ? loaded.animation : {}),
      },
      warnings: {
        ...defaults.warnings,
        ...(loaded.warnings && typeof loaded.warnings === 'object' ? loaded.warnings : {}),
        // Ensure arrays are present
        disabledBuiltInRules: Array.isArray(loaded.warnings?.disabledBuiltInRules)
          ? loaded.warnings.disabledBuiltInRules
          : defaults.warnings.disabledBuiltInRules,
        customRules: Array.isArray(loaded.warnings?.customRules)
          ? loaded.warnings.customRules
          : defaults.warnings.customRules,
      },
      ui: {
        ...defaults.ui,
        ...(loaded.ui && typeof loaded.ui === 'object' ? loaded.ui : {}),
        terminalTheme: {
          ...defaults.ui.terminalTheme,
          ...(loaded.ui?.terminalTheme && typeof loaded.ui.terminalTheme === 'object'
            ? loaded.ui.terminalTheme
            : {}),
        },
      },
      customCommands: Array.isArray(loaded.customCommands)
        ? loaded.customCommands
        : defaults.customCommands,
    };
  }

  /**
   * Run sequential migrations from the loaded version to the current version.
   * Each migration updates specific fields and increments the version.
   */
  private migrate(config: AppConfig): AppConfig {
    let current = config;

    // Add future migration functions here:
    // if (current.version < 2) { current = this.migrateV1toV2(current); }
    // if (current.version < 3) { current = this.migrateV2toV3(current); }

    // Ensure version is set to current
    current.version = CURRENT_CONFIG_VERSION;

    return current;
  }
}
