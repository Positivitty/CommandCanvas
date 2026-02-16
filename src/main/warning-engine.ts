/**
 * Warning Engine - Regex-based risky command detection and rule management.
 *
 * Evaluates input command strings against a set of risky command patterns (regex).
 * Returns warning details if a match is found; manages both built-in and custom rules.
 *
 * Built-in rules are defined per ARCHITECTURE.md Section 5.5.
 * The engine is called by ipc-handlers.ts in the shell:write pipeline whenever
 * the user presses Enter, to intercept potentially dangerous commands before execution.
 *
 * Key behaviors:
 * - Commands are NEVER blocked; the engine only produces warnings for the UI
 * - Pattern matching is case-insensitive
 * - First matching rule wins (rules are evaluated in order)
 * - Rules can be disabled individually via config.disabledBuiltInRules
 * - Custom rules from config are appended after built-in rules
 */

import type { WarningRule, WarningResult, WarningsConfig } from '../shared/types';

// ============================================================
// Built-in Warning Rules (ARCHITECTURE.md Section 5.5)
// ============================================================

const BUILT_IN_RULES: WarningRule[] = [
  {
    id: 'rm-rf',
    name: 'Recursive Force Delete',
    pattern: 'rm\\s+(-[a-zA-Z]*r[a-zA-Z]*f|f[a-zA-Z]*r)',
    riskLevel: 'critical',
    description: 'Recursively deletes files without confirmation. Can destroy important data.',
    recommendation: 'Double-check the target path. Consider using trash-cli instead.',
  },
  {
    id: 'rm-root',
    name: 'Delete Root',
    pattern: 'rm\\s+.*\\s+/',
    riskLevel: 'critical',
    description: 'Targets the root filesystem for deletion.',
    recommendation: 'This will destroy your entire system. Almost certainly not what you want.',
  },
  {
    id: 'sudo',
    name: 'Superuser Execution',
    pattern: '^sudo\\s+',
    riskLevel: 'medium',
    description: 'Executes command with superuser privileges.',
    recommendation: 'Verify you trust this command before running with elevated permissions.',
  },
  {
    id: 'git-reset-hard',
    name: 'Git Hard Reset',
    pattern: 'git\\s+reset\\s+--hard',
    riskLevel: 'high',
    description: 'Discards all uncommitted changes permanently.',
    recommendation: 'Consider git stash first to preserve your changes.',
  },
  {
    id: 'git-force-push',
    name: 'Git Force Push',
    pattern: 'git\\s+push\\s+.*--force',
    riskLevel: 'high',
    description: 'Overwrites remote history. Can cause data loss for collaborators.',
    recommendation: 'Use --force-with-lease for a safer alternative.',
  },
  {
    id: 'chmod-777',
    name: 'Open Permissions',
    pattern: 'chmod\\s+777',
    riskLevel: 'high',
    description: 'Sets file permissions to fully open (read/write/execute for everyone).',
    recommendation: 'Use more restrictive permissions like 755 or 644.',
  },
  {
    id: 'dd',
    name: 'Disk Dump',
    pattern: '^dd\\s+',
    riskLevel: 'critical',
    description: 'Low-level disk copy tool. Can overwrite disk partitions.',
    recommendation: 'Verify the of= (output file) parameter extremely carefully.',
  },
  {
    id: 'mkfs',
    name: 'Format Filesystem',
    pattern: 'mkfs',
    riskLevel: 'critical',
    description: 'Formats a filesystem partition, destroying all data on it.',
    recommendation: 'Triple-check the target device before executing.',
  },
  {
    id: 'git-clean-fd',
    name: 'Git Clean Force',
    pattern: 'git\\s+clean\\s+.*-[a-zA-Z]*f',
    riskLevel: 'high',
    description: 'Permanently removes untracked files from the working directory.',
    recommendation: 'Run git clean -n first for a dry-run preview.',
  },
  {
    id: 'curl-pipe-sh',
    name: 'Pipe to Shell',
    pattern: 'curl\\s+.*\\|.*sh',
    riskLevel: 'high',
    description: 'Downloads and immediately executes a remote script.',
    recommendation: 'Download the script first, review it, then execute.',
  },
];

// ============================================================
// Compiled Rule (internal representation with pre-compiled regex)
// ============================================================

interface CompiledRule {
  rule: WarningRule;
  regex: RegExp;
}

// ============================================================
// WarningEngine Class
// ============================================================

export class WarningEngine {
  private enabled: boolean;
  private compiledRules: CompiledRule[] = [];
  private allRules: WarningRule[] = [];

  /**
   * Constructs the WarningEngine with the given warnings configuration.
   *
   * @param config - WarningsConfig containing enabled state, disabled built-in rule IDs,
   *                 and custom rules to add.
   */
  constructor(config: WarningsConfig) {
    this.enabled = config.enabled;

    // Build the active rule set:
    // 1. Start with built-in rules, excluding any that are disabled
    const disabledSet = new Set(config.disabledBuiltInRules);

    for (const rule of BUILT_IN_RULES) {
      if (!disabledSet.has(rule.id)) {
        this.allRules.push(rule);
      }
    }

    // 2. Append custom rules from config
    for (const customRule of config.customRules) {
      this.allRules.push(customRule);
    }

    // 3. Compile all regex patterns
    this.compileRules();
  }

  /**
   * Evaluates a command string against all active warning rules.
   * Returns the first matching WarningResult, or null if no rules match.
   *
   * @param command - The command string to evaluate (typically the line buffer contents).
   * @returns WarningResult if a risky pattern is matched, null otherwise.
   */
  evaluate(command: string): WarningResult | null {
    // If warnings are disabled, never match
    if (!this.enabled) {
      return null;
    }

    // Skip empty commands
    const trimmed = command.trim();
    if (trimmed.length === 0) {
      return null;
    }

    // Test against all compiled rules in order; first match wins
    for (const { rule, regex } of this.compiledRules) {
      if (regex.test(trimmed)) {
        return {
          warningId: 'warn-' + Date.now(),
          ruleId: rule.id,
          riskLevel: rule.riskLevel,
          command: trimmed,
          description: rule.description,
          recommendation: rule.recommendation,
        };
      }
    }

    return null;
  }

  /**
   * Adds a new rule to the engine. The rule is appended to the end of the
   * rule list and immediately compiled for pattern matching.
   *
   * @param rule - The WarningRule to add.
   */
  addRule(rule: WarningRule): void {
    this.allRules.push(rule);
    this.compileRules();
  }

  /**
   * Returns a copy of all currently active rules (both built-in and custom).
   */
  getRules(): WarningRule[] {
    return [...this.allRules];
  }

  /**
   * Enables or disables the entire warning engine.
   * When disabled, evaluate() always returns null.
   *
   * @param enabled - Whether warnings should be active.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Compiles all rule patterns into RegExp objects for efficient matching.
   * Called on construction and whenever the rule set changes.
   *
   * Invalid regex patterns are logged and skipped rather than crashing the engine.
   */
  private compileRules(): void {
    this.compiledRules = [];

    for (const rule of this.allRules) {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        this.compiledRules.push({ rule, regex });
      } catch (err) {
        // Log the error but do not crash — skip the invalid rule
        console.error(
          `[WarningEngine] Invalid regex pattern for rule "${rule.id}": ${rule.pattern}`,
          err
        );
      }
    }
  }
}
