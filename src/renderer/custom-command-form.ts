/**
 * CommandCanvas - Custom Command Form
 *
 * Renders a modal form for creating and editing custom commands.
 * Hidden by default; shown when the custom-command:open-form event fires.
 *
 * Form fields:
 * - Name (text input)
 * - Command (text input)
 * - Explanation (textarea)
 * - Category (dropdown: git, node, python, docker, custom)
 * - Animation Trigger (dropdown: none, success, error)
 *
 * Events published:
 * - commands:updated           void
 * - custom-command:close-form  void
 *
 * Events subscribed to:
 * - custom-command:open-form   void | { command: CommandDefinition }
 */

import { eventBus } from './event-bus';
import type { CommandDefinition } from '../shared/types';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** The overlay container element passed in via init() */
let containerEl: HTMLElement | null = null;

/** The modal dialog element */
let modalEl: HTMLElement | null = null;

/** Form field elements */
let nameInput: HTMLInputElement | null = null;
let commandInput: HTMLInputElement | null = null;
let explanationInput: HTMLTextAreaElement | null = null;
let categorySelect: HTMLSelectElement | null = null;
let triggerSelect: HTMLSelectElement | null = null;

/** Error display element */
let errorEl: HTMLElement | null = null;

/** The command being edited (null for new command creation) */
let editingCommand: CommandDefinition | null = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: 'git', label: 'Git' },
  { value: 'node', label: 'Node' },
  { value: 'python', label: 'Python' },
  { value: 'docker', label: 'Docker' },
  { value: 'custom', label: 'Custom' },
];

const ANIMATION_TRIGGERS = [
  { value: 'none', label: 'None' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initializes the custom command form inside the given overlay container.
 * Builds the modal DOM structure and wires up event listeners.
 */
export function init(container: HTMLElement): void {
  containerEl = container;

  // Build the modal structure
  buildModal();

  // Subscribe to the open-form event
  eventBus.on('custom-command:open-form', (payload?: { command?: CommandDefinition }) => {
    if (payload && payload.command) {
      openForEdit(payload.command);
    } else {
      openForCreate();
    }
  });
}

// ---------------------------------------------------------------------------
// Internal: DOM construction
// ---------------------------------------------------------------------------

/**
 * Builds the complete modal DOM structure inside the container.
 */
function buildModal(): void {
  if (!containerEl) return;

  modalEl = document.createElement('div');
  modalEl.className = 'ccf-modal';

  // Title
  const title = document.createElement('h2');
  title.className = 'ccf-title';
  title.textContent = 'Add Custom Command';
  modalEl.appendChild(title);

  // Error display
  errorEl = document.createElement('div');
  errorEl.className = 'ccf-error';
  errorEl.style.display = 'none';
  modalEl.appendChild(errorEl);

  // Form fields
  const form = document.createElement('div');
  form.className = 'ccf-form';

  // Name field
  nameInput = createTextField(form, 'Name', 'ccf-name', 'Command display name');

  // Command field
  commandInput = createTextField(form, 'Command', 'ccf-command', 'e.g., npm run deploy');

  // Explanation field (textarea)
  explanationInput = createTextArea(form, 'Explanation', 'ccf-explanation', 'What does this command do?');

  // Category dropdown
  categorySelect = createSelect(form, 'Category', 'ccf-category', CATEGORIES);

  // Animation Trigger dropdown
  triggerSelect = createSelect(form, 'Animation Trigger', 'ccf-trigger', ANIMATION_TRIGGERS);

  modalEl.appendChild(form);

  // Button row
  const buttonRow = document.createElement('div');
  buttonRow.className = 'ccf-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ccf-btn ccf-btn--cancel';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', handleCancel);
  buttonRow.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'ccf-btn ccf-btn--save';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', handleSave);
  buttonRow.appendChild(saveBtn);

  modalEl.appendChild(buttonRow);
  containerEl.appendChild(modalEl);
}

/**
 * Creates a labeled text input field and appends it to the parent.
 */
function createTextField(
  parent: HTMLElement,
  labelText: string,
  id: string,
  placeholder: string
): HTMLInputElement {
  const group = document.createElement('div');
  group.className = 'ccf-field';

  const label = document.createElement('label');
  label.className = 'ccf-label';
  label.htmlFor = id;
  label.textContent = labelText;
  group.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ccf-input';
  input.id = id;
  input.placeholder = placeholder;
  group.appendChild(input);

  parent.appendChild(group);
  return input;
}

/**
 * Creates a labeled textarea and appends it to the parent.
 */
function createTextArea(
  parent: HTMLElement,
  labelText: string,
  id: string,
  placeholder: string
): HTMLTextAreaElement {
  const group = document.createElement('div');
  group.className = 'ccf-field';

  const label = document.createElement('label');
  label.className = 'ccf-label';
  label.htmlFor = id;
  label.textContent = labelText;
  group.appendChild(label);

  const textarea = document.createElement('textarea');
  textarea.className = 'ccf-textarea';
  textarea.id = id;
  textarea.placeholder = placeholder;
  textarea.rows = 3;
  group.appendChild(textarea);

  parent.appendChild(group);
  return textarea;
}

/**
 * Creates a labeled select dropdown and appends it to the parent.
 */
function createSelect(
  parent: HTMLElement,
  labelText: string,
  id: string,
  options: { value: string; label: string }[]
): HTMLSelectElement {
  const group = document.createElement('div');
  group.className = 'ccf-field';

  const label = document.createElement('label');
  label.className = 'ccf-label';
  label.htmlFor = id;
  label.textContent = labelText;
  group.appendChild(label);

  const select = document.createElement('select');
  select.className = 'ccf-select';
  select.id = id;

  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  }

  group.appendChild(select);
  parent.appendChild(group);
  return select;
}

// ---------------------------------------------------------------------------
// Internal: Open / Close
// ---------------------------------------------------------------------------

/**
 * Opens the modal for creating a new command.
 */
function openForCreate(): void {
  editingCommand = null;
  resetForm();

  if (modalEl) {
    const title = modalEl.querySelector('.ccf-title');
    if (title) title.textContent = 'Add Custom Command';
  }

  showModal();
}

/**
 * Opens the modal for editing an existing command.
 */
function openForEdit(command: CommandDefinition): void {
  editingCommand = command;
  resetForm();

  // Pre-fill form fields
  if (nameInput) nameInput.value = command.name;
  if (commandInput) commandInput.value = command.command;
  if (explanationInput) explanationInput.value = command.explanation;
  if (categorySelect) categorySelect.value = command.category;
  if (triggerSelect) {
    triggerSelect.value = command.animationTrigger || 'none';
  }

  if (modalEl) {
    const title = modalEl.querySelector('.ccf-title');
    if (title) title.textContent = 'Edit Custom Command';
  }

  showModal();
}

/**
 * Shows the modal overlay.
 */
function showModal(): void {
  if (containerEl) {
    containerEl.classList.remove('hidden');
  }
}

/**
 * Hides the modal overlay.
 */
function hideModal(): void {
  if (containerEl) {
    containerEl.classList.add('hidden');
  }
}

/**
 * Resets all form fields and clears errors.
 */
function resetForm(): void {
  if (nameInput) nameInput.value = '';
  if (commandInput) commandInput.value = '';
  if (explanationInput) explanationInput.value = '';
  if (categorySelect) categorySelect.value = 'custom';
  if (triggerSelect) triggerSelect.value = 'none';
  hideError();
}

// ---------------------------------------------------------------------------
// Internal: Error display
// ---------------------------------------------------------------------------

/**
 * Shows an error message in the form.
 */
function showError(message: string): void {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

/**
 * Hides the error message.
 */
function hideError(): void {
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Internal: Form handlers
// ---------------------------------------------------------------------------

/**
 * Handles the Save button click.
 * Validates the form, constructs a CommandDefinition, persists it
 * to config, and emits the appropriate events.
 */
async function handleSave(): Promise<void> {
  const name = nameInput?.value.trim() || '';
  const command = commandInput?.value.trim() || '';
  const explanation = explanationInput?.value.trim() || '';
  const category = categorySelect?.value || 'custom';
  const triggerValue = triggerSelect?.value || 'none';

  // Validation
  if (!name) {
    showError('Name is required.');
    return;
  }
  if (!command) {
    showError('Command is required.');
    return;
  }

  hideError();

  // Determine animation trigger
  const animationTrigger: 'success' | 'error' | null =
    triggerValue === 'none' ? null : (triggerValue as 'success' | 'error');

  // Build the CommandDefinition
  const id = editingCommand ? editingCommand.id : 'custom-' + Date.now();

  const newCommand: CommandDefinition = {
    id,
    name,
    command,
    explanation,
    category,
    animationTrigger,
    order: editingCommand ? editingCommand.order : 0,
  };

  try {
    // Load current config
    const config = await window.api.config.load();

    if (editingCommand) {
      // Replace the existing command in the array
      const idx = config.customCommands.findIndex((c: CommandDefinition) => c.id === editingCommand!.id);
      if (idx !== -1) {
        config.customCommands[idx] = newCommand;
      } else {
        config.customCommands.push(newCommand);
      }
    } else {
      // Append new command
      config.customCommands.push(newCommand);
    }

    // Save updated config
    await window.api.config.save(config);

    // Emit events
    eventBus.emit('commands:updated');
    eventBus.emit('custom-command:close-form');

    // Hide the modal
    hideModal();
  } catch (err) {
    showError('Failed to save command. Please try again.');
  }
}

/**
 * Handles the Cancel button click.
 * Hides the modal and emits the close event.
 */
function handleCancel(): void {
  hideModal();
  eventBus.emit('custom-command:close-form');
}
