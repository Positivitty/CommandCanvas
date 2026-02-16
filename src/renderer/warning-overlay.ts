/**
 * Warning Overlay - Modal UI for risky command warnings.
 *
 * Displays a modal overlay when the warning engine detects a potentially
 * dangerous command. Shows the risk level, command text, description, and
 * recommendation. The user can choose to cancel or execute anyway.
 *
 * Integration:
 * - Subscribes to `warning:show` events from the event bus
 * - Publishes `warning:dismissed` events with the user's decision
 * - Calls window.api.warning.confirmExecution / cancelExecution to communicate
 *   the decision back to the main process
 *
 * Security:
 * - All DOM elements are created programmatically via createElement
 * - No innerHTML is used with user data to prevent XSS
 * - Escape key and backdrop click act as cancel
 */

import './styles/warning.css';
import { eventBus } from './event-bus';
import type { WarningDisplayPayload } from '../shared/types';

// ============================================================
// Module State
// ============================================================

/** The container element this module mounts into (#warning-overlay) */
let container: HTMLElement | null = null;

/** Resolve function for the currently displayed warning's Promise */
let currentResolve: ((value: boolean) => void) | null = null;

/** The warningId of the currently displayed warning */
let currentWarningId: string | null = null;

/** Bound keydown handler reference (for cleanup) */
let boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

// ============================================================
// Risk Level Configuration
// ============================================================

const RISK_COLORS: Record<string, string> = {
  critical: '#f38ba8',
  high: '#fab387',
  medium: '#f9e2af',
  low: '#89b4fa',
};

const RISK_ICONS: Record<string, string> = {
  critical: '\u26d4',  // No entry
  high: '\u26a0',      // Warning sign
  medium: '\u26a0',    // Warning sign
  low: '\u2139',       // Information
};

// ============================================================
// Public API
// ============================================================

/**
 * Initializes the warning overlay module.
 * Mounts into the provided container element and subscribes to events.
 *
 * @param containerEl - The #warning-overlay HTMLElement from index.html.
 */
export function init(containerEl: HTMLElement): void {
  container = containerEl;

  // Subscribe to warning:show events from the event bus
  eventBus.on('warning:show', (payload: WarningDisplayPayload) => {
    show(payload);
  });
}

/**
 * Displays the warning overlay with the given warning details.
 * Returns a Promise that resolves to true if the user confirms execution,
 * or false if the user cancels.
 *
 * If a warning is already displayed, the previous one is cancelled first.
 *
 * @param warning - The WarningDisplayPayload from the main process.
 * @returns Promise<boolean> - true = execute anyway, false = cancel.
 */
export function show(warning: WarningDisplayPayload): Promise<boolean> {
  // If there is already a warning displayed, dismiss it as cancel
  if (currentResolve) {
    dismissWithAction('cancel');
  }

  return new Promise<boolean>((resolve) => {
    currentResolve = resolve;
    currentWarningId = warning.warningId;

    renderOverlay(warning);
    showContainer();
    attachKeyboardHandler();
  });
}

/**
 * Hides the warning overlay and clears its contents.
 * Does not resolve any pending promise (use dismissWithAction for that).
 */
export function hide(): void {
  if (container) {
    container.classList.add('hidden');
    clearContainer();
  }
  detachKeyboardHandler();
  currentWarningId = null;
}

// ============================================================
// Internal: Rendering
// ============================================================

/**
 * Builds the entire warning overlay DOM tree programmatically.
 * No innerHTML with user data is used; all text is set via textContent.
 */
function renderOverlay(warning: WarningDisplayPayload): void {
  if (!container) return;

  // Clear any previous content
  clearContainer();

  // Create backdrop (clicking it = cancel)
  const backdrop = document.createElement('div');
  backdrop.className = 'warning-backdrop';
  backdrop.addEventListener('click', (e) => {
    // Only trigger on direct backdrop click, not bubbled events from modal
    if (e.target === backdrop) {
      dismissWithAction('cancel');
    }
  });

  // Create modal card
  const modal = document.createElement('div');
  modal.className = 'warning-modal';
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'warning-title');
  modal.setAttribute('aria-describedby', 'warning-description');

  // Header: icon + title
  const header = document.createElement('div');
  header.className = 'warning-header';

  const icon = document.createElement('span');
  icon.className = 'warning-icon';
  icon.textContent = RISK_ICONS[warning.riskLevel] || RISK_ICONS.medium;
  icon.style.color = RISK_COLORS[warning.riskLevel] || RISK_COLORS.medium;

  const title = document.createElement('span');
  title.className = 'warning-title';
  title.id = 'warning-title';
  title.textContent = 'Risky Command Detected';

  header.appendChild(icon);
  header.appendChild(title);

  // Risk level badge
  const badge = document.createElement('span');
  badge.className = `warning-badge warning-badge--${warning.riskLevel}`;
  badge.textContent = warning.riskLevel;

  // Command display
  const commandSection = document.createElement('div');

  const commandLabel = document.createElement('span');
  commandLabel.className = 'warning-command-label';
  commandLabel.textContent = 'Command';

  const commandText = document.createElement('div');
  commandText.className = 'warning-command';
  commandText.textContent = warning.command;

  commandSection.appendChild(commandLabel);
  commandSection.appendChild(commandText);

  // Description
  const description = document.createElement('p');
  description.className = 'warning-description';
  description.id = 'warning-description';
  description.textContent = warning.description;

  // Recommendation
  const recommendation = document.createElement('p');
  recommendation.className = 'warning-recommendation';
  recommendation.textContent = warning.recommendation;

  // Button row
  const buttons = document.createElement('div');
  buttons.className = 'warning-buttons';

  const executeBtn = document.createElement('button');
  executeBtn.className = 'warning-btn warning-btn--execute';
  executeBtn.textContent = 'Execute Anyway';
  executeBtn.type = 'button';
  executeBtn.addEventListener('click', () => {
    dismissWithAction('confirm');
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'warning-btn warning-btn--cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => {
    dismissWithAction('cancel');
  });

  buttons.appendChild(executeBtn);
  buttons.appendChild(cancelBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(badge);
  modal.appendChild(commandSection);
  modal.appendChild(description);
  modal.appendChild(recommendation);
  modal.appendChild(buttons);

  // Mount into backdrop -> container
  backdrop.appendChild(modal);
  container.appendChild(backdrop);

  // Focus the cancel button (safe default)
  requestAnimationFrame(() => {
    cancelBtn.focus();
  });
}

// ============================================================
// Internal: Dismiss Logic
// ============================================================

/**
 * Dismisses the warning overlay with the specified action.
 * Communicates the decision to the main process via IPC and
 * emits a `warning:dismissed` event on the event bus.
 *
 * @param action - 'confirm' to execute the command, 'cancel' to discard.
 */
function dismissWithAction(action: 'confirm' | 'cancel'): void {
  const warningId = currentWarningId;
  const resolve = currentResolve;

  // Clear state first to prevent re-entrant calls
  currentResolve = null;
  currentWarningId = null;

  // Communicate decision to main process via IPC
  if (warningId) {
    if (action === 'confirm') {
      window.api.warning.confirmExecution(warningId);
    } else {
      window.api.warning.cancelExecution(warningId);
    }

    // Emit event for other renderer modules
    eventBus.emit('warning:dismissed', { warningId, action });
  }

  // Hide the overlay
  hide();

  // Resolve the promise
  if (resolve) {
    resolve(action === 'confirm');
  }
}

// ============================================================
// Internal: Container Management
// ============================================================

/**
 * Shows the container by removing the 'hidden' class.
 */
function showContainer(): void {
  if (container) {
    container.classList.remove('hidden');
  }
}

/**
 * Removes all child elements from the container.
 */
function clearContainer(): void {
  if (container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }
}

// ============================================================
// Internal: Keyboard Handling
// ============================================================

/**
 * Attaches a keydown listener for Escape key (cancel).
 */
function attachKeyboardHandler(): void {
  detachKeyboardHandler();

  boundKeydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dismissWithAction('cancel');
    }
  };

  document.addEventListener('keydown', boundKeydownHandler, true);
}

/**
 * Detaches the keydown listener.
 */
function detachKeyboardHandler(): void {
  if (boundKeydownHandler) {
    document.removeEventListener('keydown', boundKeydownHandler, true);
    boundKeydownHandler = null;
  }
}
