/**
 * CommandCanvas - Command Panel
 *
 * Renders categorized command buttons inside a container element.
 * Provides category tabs at the top (Git, Node, Python, Docker, Custom)
 * and a vertical list of command buttons for the active category.
 *
 * Events published:
 * - command:selected  { command, explanation, id }
 * - command:hovered   { explanation, id }
 * - command:hover-end void
 * - custom-command:open-form void
 *
 * Events subscribed to:
 * - project:detected  { types: string[] } -> update visible categories
 * - commands:updated   void -> re-render
 */

import { eventBus } from './event-bus';
import { DEFAULT_COMMANDS, mergeCommands } from '../shared/default-commands';
import type { CommandDefinition } from '../shared/types';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** The root container element passed in via init() */
let containerEl: HTMLElement | null = null;

/** Currently loaded commands (built-in merged with custom) */
let allCommands: CommandDefinition[] = [];

/** Category names that should be visible based on project detection */
let visibleCategories: string[] = ['git', 'node', 'python', 'docker', 'custom'];

/** The currently active (selected) category tab */
let activeCategory: string = 'git';

/** Tab bar container element */
let tabBarEl: HTMLElement | null = null;

/** Command list container element */
let commandListEl: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Category display labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  git: 'Git',
  node: 'Node',
  python: 'Python',
  docker: 'Docker',
  custom: 'Custom',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initializes the command panel inside the given container element.
 * Creates the tab bar and command list DOM structure, loads initial
 * commands from defaults and config, and wires up event listeners.
 */
export function init(container: HTMLElement): void {
  containerEl = container;

  // Create tab bar
  tabBarEl = document.createElement('div');
  tabBarEl.className = 'cp-tab-bar';
  containerEl.appendChild(tabBarEl);

  // Create command list container
  commandListEl = document.createElement('div');
  commandListEl.className = 'cp-command-list';
  containerEl.appendChild(commandListEl);

  // Load initial commands
  loadCommands();

  // Subscribe to events
  eventBus.on('project:detected', (payload: { types: string[] }) => {
    setVisibleCategories([...payload.types, 'custom']);
  });

  eventBus.on('commands:updated', () => {
    loadCommands();
  });
}

/**
 * Replaces the current command set with the provided commands and re-renders.
 */
export function setCommands(commands: CommandDefinition[]): void {
  allCommands = commands;
  render();
}

/**
 * Sets which category tabs are visible. The 'custom' category is
 * always included regardless of the provided array.
 */
export function setVisibleCategories(categories: string[]): void {
  // Ensure 'custom' is always present
  const cats = new Set(categories);
  cats.add('custom');
  visibleCategories = Array.from(cats);

  // If the active category is no longer visible, switch to the first visible one
  if (!visibleCategories.includes(activeCategory)) {
    activeCategory = visibleCategories[0] || 'custom';
  }

  render();
}

/**
 * Forces a full re-render of the command panel (tabs + buttons).
 */
export function refresh(): void {
  render();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Loads commands from the built-in defaults and merges with custom
 * commands from the user's configuration.
 */
async function loadCommands(): Promise<void> {
  // Gather all built-in commands into a flat array
  const builtIn: CommandDefinition[] = [];
  for (const category of Object.keys(DEFAULT_COMMANDS)) {
    builtIn.push(...DEFAULT_COMMANDS[category]);
  }

  // Load custom commands from config
  let customCommands: CommandDefinition[] = [];
  try {
    const config = await window.api.config.load();
    customCommands = config.customCommands || [];
  } catch {
    // If config fails to load, continue with empty custom commands
  }

  allCommands = mergeCommands(builtIn, customCommands);
  render();
}

/**
 * Renders the full command panel: tab bar + command button list.
 */
function render(): void {
  renderTabs();
  renderCommands();
}

/**
 * Renders the category tab bar.
 */
function renderTabs(): void {
  if (!tabBarEl) return;

  // Clear existing tabs
  tabBarEl.textContent = '';

  for (const category of visibleCategories) {
    const tab = document.createElement('button');
    tab.className = 'cp-tab';
    tab.type = 'button';
    if (category === activeCategory) {
      tab.classList.add('cp-tab--active');
    }
    tab.textContent = CATEGORY_LABELS[category] || category;
    tab.dataset.category = category;

    tab.addEventListener('click', () => {
      activeCategory = category;
      render();
    });

    tabBarEl.appendChild(tab);
  }
}

/**
 * Renders the command button list for the active category.
 */
function renderCommands(): void {
  if (!commandListEl) return;

  // Clear existing buttons
  commandListEl.textContent = '';

  // Filter commands for the active category and sort by order
  const categoryCommands = allCommands
    .filter((cmd) => cmd.category === activeCategory)
    .sort((a, b) => a.order - b.order);

  for (const cmd of categoryCommands) {
    const button = document.createElement('button');
    button.className = 'cp-command-btn';
    button.type = 'button';
    button.textContent = cmd.name;
    button.dataset.commandId = cmd.id;

    // Click: emit command:selected
    button.addEventListener('click', () => {
      eventBus.emit('command:selected', {
        command: cmd.command,
        explanation: cmd.explanation,
        id: cmd.id,
      });
    });

    // Hover start: emit command:hovered
    button.addEventListener('mouseenter', () => {
      eventBus.emit('command:hovered', {
        explanation: cmd.explanation,
        id: cmd.id,
      });
    });

    // Hover end: emit command:hover-end
    button.addEventListener('mouseleave', () => {
      eventBus.emit('command:hover-end');
    });

    commandListEl.appendChild(button);
  }

  // Add the "+ Add Command" button at the bottom
  const addButton = document.createElement('button');
  addButton.className = 'cp-add-btn';
  addButton.type = 'button';
  addButton.textContent = '+ Add Command';

  addButton.addEventListener('click', () => {
    eventBus.emit('custom-command:open-form');
  });

  commandListEl.appendChild(addButton);
}
