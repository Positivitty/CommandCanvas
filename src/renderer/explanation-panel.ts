/**
 * CommandCanvas - Explanation Panel
 *
 * Displays contextual explanation text when a command button is
 * hovered over or selected in the command panel.
 *
 * Behavior:
 * - On command:selected -> show explanation (persists until another is selected)
 * - On command:hovered  -> show explanation (temporary)
 * - On command:hover-end -> revert to selected explanation, or clear if none
 *
 * Events subscribed to:
 * - command:selected  { command, explanation, id }
 * - command:hovered   { explanation, id }
 * - command:hover-end void
 */

import { eventBus } from './event-bus';
import type { CommandExplanation } from '../shared/types';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** The root container element passed in via init() */
let containerEl: HTMLElement | null = null;

/** The text element that displays the explanation */
let textEl: HTMLElement | null = null;

/** The currently selected (persisted) explanation, if any */
let selectedExplanation: CommandExplanation | null = null;

/** Whether the panel is currently showing a hover-triggered explanation */
let isShowingHover: boolean = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initializes the explanation panel inside the given container element.
 * Creates the text display element and wires up event listeners.
 */
export function init(container: HTMLElement): void {
  containerEl = container;

  // Create the text element for explanation display
  textEl = document.createElement('span');
  textEl.className = 'ep-text';
  containerEl.appendChild(textEl);

  // Subscribe to events
  eventBus.on('command:selected', (payload: { command: string; explanation: string; id: string }) => {
    selectedExplanation = {
      text: payload.explanation,
      commandId: payload.id,
    };
    isShowingHover = false;
    show(selectedExplanation);
  });

  eventBus.on('command:hovered', (payload: { explanation: string; id: string }) => {
    isShowingHover = true;
    show({
      text: payload.explanation,
      commandId: payload.id,
    });
  });

  eventBus.on('command:hover-end', () => {
    if (isShowingHover) {
      isShowingHover = false;
      // Revert to selected explanation if one exists, otherwise clear
      if (selectedExplanation) {
        show(selectedExplanation);
      } else {
        clear();
      }
    }
  });
}

/**
 * Displays the given explanation text in the panel.
 */
export function show(explanation: { text: string; commandId: string }): void {
  if (!textEl) return;

  textEl.textContent = explanation.text;
  textEl.classList.add('ep-text--visible');
}

/**
 * Clears the explanation panel text.
 */
export function clear(): void {
  if (!textEl) return;

  textEl.textContent = '';
  textEl.classList.remove('ep-text--visible');
  selectedExplanation = null;
  isShowingHover = false;
}
