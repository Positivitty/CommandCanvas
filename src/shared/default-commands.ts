/**
 * CommandCanvas - Built-in Default Command Definitions
 *
 * Defines the built-in command packs per category (git, node, python, docker).
 * Provides utility functions for merging built-in commands with user-defined
 * custom commands and for retrieving commands by category.
 *
 * This module is shared between main and renderer processes at build time.
 * It contains only static data and pure functions — no side effects.
 */

import type { CommandDefinition } from './types';

/**
 * Built-in command definitions organized by category.
 * These are the default commands available when the app starts.
 * Each category maps to an array of CommandDefinition objects.
 *
 * Command packs: git (10), node (6), python (5), docker (5).
 */
export const DEFAULT_COMMANDS: Record<string, CommandDefinition[]> = {
  git: [
    { id: 'git-status',   name: 'Status',    command: 'git status',             explanation: 'Shows the working tree status: modified, staged, and untracked files.', category: 'git', order: 0 },
    { id: 'git-add-all',  name: 'Stage All', command: 'git add .',              explanation: 'Stages all changes in the current directory for the next commit.',      category: 'git', order: 1 },
    { id: 'git-commit',   name: 'Commit',    command: 'git commit -m ""',       explanation: 'Creates a snapshot of staged changes with a message.',                  category: 'git', order: 2 },
    { id: 'git-push',     name: 'Push',      command: 'git push',               explanation: 'Uploads local branch commits to the remote repository.',                category: 'git', order: 3 },
    { id: 'git-pull',     name: 'Pull',      command: 'git pull',               explanation: 'Fetches and integrates changes from the remote repository.',             category: 'git', order: 4 },
    { id: 'git-log',      name: 'Log',       command: 'git log --oneline -10',  explanation: 'Shows the last 10 commits in a compact one-line format.',                category: 'git', order: 5 },
    { id: 'git-branch',   name: 'Branches',  command: 'git branch',             explanation: 'Lists all local branches. The current branch is highlighted.',           category: 'git', order: 6 },
    { id: 'git-checkout', name: 'Checkout',  command: 'git checkout ',           explanation: 'Switches to a different branch or restores files.',                      category: 'git', order: 7 },
    { id: 'git-diff',     name: 'Diff',      command: 'git diff',               explanation: 'Shows unstaged changes between working directory and index.',            category: 'git', order: 8 },
    { id: 'git-stash',    name: 'Stash',     command: 'git stash',              explanation: 'Temporarily stores modified tracked files for later use.',               category: 'git', order: 9 },
  ],
  node: [
    { id: 'npm-install',   name: 'Install',  command: 'npm install',       explanation: 'Installs all dependencies listed in package.json.',  category: 'node', order: 0 },
    { id: 'npm-start',     name: 'Start',    command: 'npm start',         explanation: 'Runs the start script defined in package.json.',     category: 'node', order: 1 },
    { id: 'npm-test',      name: 'Test',     command: 'npm test',          explanation: 'Runs the test script defined in package.json.',      category: 'node', order: 2 },
    { id: 'npm-run-build', name: 'Build',    command: 'npm run build',     explanation: 'Runs the build script defined in package.json.',     category: 'node', order: 3 },
    { id: 'npm-run-dev',   name: 'Dev',      command: 'npm run dev',       explanation: 'Runs the dev script for local development.',         category: 'node', order: 4 },
    { id: 'npm-outdated',  name: 'Outdated', command: 'npm outdated',      explanation: 'Lists packages that have newer versions available.', category: 'node', order: 5 },
  ],
  python: [
    { id: 'py-venv',      name: 'Create Venv',    command: 'python -m venv venv',            explanation: 'Creates a virtual environment in a venv/ directory.',  category: 'python', order: 0 },
    { id: 'py-activate',  name: 'Activate Venv',  command: 'source venv/bin/activate',        explanation: 'Activates the Python virtual environment.',            category: 'python', order: 1 },
    { id: 'pip-install',  name: 'Pip Install',    command: 'pip install -r requirements.txt', explanation: 'Installs all dependencies from requirements.txt.',     category: 'python', order: 2 },
    { id: 'py-run',       name: 'Run',            command: 'python ',                         explanation: 'Runs a Python script.',                                category: 'python', order: 3 },
    { id: 'pip-freeze',   name: 'Freeze',         command: 'pip freeze > requirements.txt',   explanation: 'Writes installed packages to requirements.txt.',       category: 'python', order: 4 },
  ],
  docker: [
    { id: 'docker-ps',           name: 'Containers',   command: 'docker ps',             explanation: 'Lists running Docker containers.',                               category: 'docker', order: 0 },
    { id: 'docker-images',       name: 'Images',       command: 'docker images',          explanation: 'Lists locally available Docker images.',                         category: 'docker', order: 1 },
    { id: 'docker-build',        name: 'Build',        command: 'docker build -t  .',     explanation: 'Builds a Docker image from the Dockerfile in current directory.', category: 'docker', order: 2 },
    { id: 'docker-compose-up',   name: 'Compose Up',   command: 'docker compose up',      explanation: 'Starts all services defined in docker-compose.yml.',             category: 'docker', order: 3 },
    { id: 'docker-compose-down', name: 'Compose Down', command: 'docker compose down',    explanation: 'Stops and removes all containers defined in docker-compose.yml.', category: 'docker', order: 4 },
  ],
};

/**
 * Merges built-in commands with user-defined custom commands.
 *
 * Custom commands with the same ID as a built-in command will override the
 * built-in version. Custom commands with unique IDs are appended.
 *
 * @param builtIn - Array of built-in CommandDefinition objects
 * @param custom - Array of user-defined custom CommandDefinition objects
 * @returns Merged array of CommandDefinition objects, sorted by order
 */
export function mergeCommands(
  builtIn: CommandDefinition[],
  custom: CommandDefinition[]
): CommandDefinition[] {
  // Build a map of custom commands keyed by ID for quick lookup
  const customMap = new Map<string, CommandDefinition>();
  for (const cmd of custom) {
    customMap.set(cmd.id, cmd);
  }

  // Start with built-in commands, replacing any that have a custom override
  const merged: CommandDefinition[] = builtIn.map((cmd) => {
    if (customMap.has(cmd.id)) {
      const override = customMap.get(cmd.id)!;
      customMap.delete(cmd.id);
      return override;
    }
    return cmd;
  });

  // Append remaining custom commands that did not override a built-in
  for (const cmd of customMap.values()) {
    merged.push(cmd);
  }

  // Sort by order to maintain a consistent display sequence
  return merged.sort((a, b) => a.order - b.order);
}

/**
 * Retrieves the built-in commands for a specific category.
 *
 * @param category - The category name (e.g., 'git', 'node', 'python', 'docker')
 * @returns Array of CommandDefinition objects for that category, or empty array if not found
 */
export function getCommandsByCategory(category: string): CommandDefinition[] {
  return DEFAULT_COMMANDS[category] ?? [];
}
