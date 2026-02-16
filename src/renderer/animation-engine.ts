/**
 * Animation Engine — ASCII animation playback with state machine.
 *
 * Manages ASCII art animation frames loaded from the main process via IPC.
 * Uses requestAnimationFrame for smooth, non-blocking playback.
 *
 * State machine: idle -> running -> success/error -> idle
 *
 * Exported API (integration contract):
 *   init(container)   — Mount into #animation-area, create <pre>, start idle
 *   setState(state)   — Transition to idle|running|success|error
 *   setTheme(theme)   — Load a new theme's frame data via IPC
 *   setEnabled(flag)  — Show/hide the animation area
 *   setSpeed(speed)   — Multiplier for frame delay (1.0 = normal)
 *   dispose()         — Cancel all timers and clean up
 */

import './styles/animation.css';
import { eventBus } from './event-bus';
import type { AnimationThemeData, AnimationFrameFile, AnimationState } from '../shared/types';

// ============================================================
// Module State
// ============================================================

/** Reference to the #animation-area container element */
let container: HTMLElement | null = null;

/** The <pre> element used to render ASCII frames */
let frameElement: HTMLPreElement | null = null;

/** Current animation state */
let currentState: AnimationState = 'idle';

/** Whether animations are enabled (visible) */
let enabled = true;

/** Playback speed multiplier (1.0 = normal, 2.0 = faster, 0.5 = slower) */
let speed = 1.0;

/** Duration in ms that success/error animations play before returning to idle */
let transitionDuration = 2000;

/** Currently loaded theme data (contains idle, success, error frame files) */
let themeData: AnimationThemeData | null = null;

/** Current frame index within the active animation */
let currentFrameIndex = 0;

/** Timestamp of the last frame change (for elapsed time tracking) */
let lastFrameTime = 0;

/** requestAnimationFrame handle for the playback loop */
let rafHandle: number | null = null;

/** setTimeout handle for the transition back to idle after success/error */
let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

/** Flag to track whether init has been called */
let initialized = false;

// ============================================================
// Public API
// ============================================================

/**
 * Initialize the animation engine.
 * Creates a <pre> element inside the container for rendering ASCII frames.
 * Starts in idle state. Theme loading happens when setTheme() is called.
 */
export function init(containerEl: HTMLElement): void {
  if (initialized) {
    return;
  }

  container = containerEl;

  // Create the <pre> element for rendering ASCII art frames
  frameElement = document.createElement('pre');
  frameElement.className = 'animation-frame';
  frameElement.setAttribute('aria-hidden', 'true');
  container.appendChild(frameElement);

  // Apply initial state class
  applyStateClass('idle');

  // Subscribe to events
  subscribeToEvents();

  initialized = true;
}

/**
 * Transition to a new animation state.
 *
 * - 'idle': Start/resume the idle animation loop.
 * - 'running': Can show a running animation or pause idle. Typically
 *   triggered when the user is typing / a command is in progress.
 * - 'success': Play success animation for transitionDuration ms, then
 *   automatically return to idle.
 * - 'error': Play error animation for transitionDuration ms, then
 *   automatically return to idle.
 */
export function setState(state: AnimationState): void {
  if (state === currentState) {
    return;
  }

  const previousState = currentState;
  currentState = state;

  // Clear any pending transition timeout
  clearTransitionTimeout();

  // Reset frame index for the new state
  currentFrameIndex = 0;
  lastFrameTime = 0;

  // Apply CSS class for state-based styling (colors)
  applyStateClass(state);

  // Emit the state change event
  eventBus.emit('animation:state-change', { state });

  // Start/restart the playback loop
  if (enabled && themeData) {
    stopPlaybackLoop();
    startPlaybackLoop();
  }

  // For success and error states, schedule automatic return to idle
  if (state === 'success' || state === 'error') {
    transitionTimeout = setTimeout(() => {
      transitionTimeout = null;
      setState('idle');
    }, transitionDuration);
  }
}

/**
 * Load a new animation theme by name.
 * Fetches theme data from the main process via IPC.
 * If currently playing, switches to the new theme's frames immediately.
 */
export function setTheme(theme: string): void {
  loadTheme(theme);
}

/**
 * Enable or disable animation display.
 * When disabled, hides the animation area and stops the playback loop.
 * When re-enabled, shows the area and resumes playback.
 */
export function setEnabled(flag: boolean): void {
  enabled = flag;

  if (!container) {
    return;
  }

  if (enabled) {
    container.classList.remove('animation-disabled');
    // Resume playback if we have theme data
    if (themeData) {
      stopPlaybackLoop();
      startPlaybackLoop();
    }
  } else {
    container.classList.add('animation-disabled');
    stopPlaybackLoop();
  }
}

/**
 * Set the playback speed multiplier.
 * 1.0 = normal speed, 2.0 = twice as fast, 0.5 = half speed.
 * Clamps to a reasonable range [0.1, 10.0].
 */
export function setSpeed(newSpeed: number): void {
  speed = Math.max(0.1, Math.min(10.0, newSpeed));
}

/**
 * Clean up the animation engine.
 * Cancels all running timers and removes event subscriptions.
 */
export function dispose(): void {
  stopPlaybackLoop();
  clearTransitionTimeout();
  unsubscribeFromEvents();

  if (frameElement && container) {
    container.removeChild(frameElement);
  }

  container = null;
  frameElement = null;
  themeData = null;
  currentState = 'idle';
  currentFrameIndex = 0;
  lastFrameTime = 0;
  initialized = false;
}

// ============================================================
// Theme Loading
// ============================================================

/**
 * Load theme data from the main process via IPC.
 */
async function loadTheme(themeName: string): Promise<void> {
  try {
    const data = await (window as any).api.animation.loadTheme(themeName) as AnimationThemeData;

    if (!data || !data.idle || !data.success || !data.error) {
      console.error('[AnimationEngine] Invalid theme data received for:', themeName);
      return;
    }

    themeData = data;

    // Reset frame index and restart playback with new theme
    currentFrameIndex = 0;
    lastFrameTime = 0;

    if (enabled) {
      stopPlaybackLoop();
      renderCurrentFrame();
      startPlaybackLoop();
    }
  } catch (err) {
    console.error('[AnimationEngine] Failed to load theme:', themeName, err);
  }
}

// ============================================================
// Playback Loop
// ============================================================

/**
 * Get the frame file for the current animation state.
 */
function getActiveFrameFile(): AnimationFrameFile | null {
  if (!themeData) {
    return null;
  }

  switch (currentState) {
    case 'idle':
      return themeData.idle;
    case 'running':
      // Running uses idle frames (subtle animation while command executes)
      return themeData.idle;
    case 'success':
      return themeData.success;
    case 'error':
      return themeData.error;
    default:
      return themeData.idle;
  }
}

/**
 * Render the current frame to the <pre> element.
 * Sets textContent to the frame lines joined by newline.
 */
function renderCurrentFrame(): void {
  if (!frameElement) {
    return;
  }

  const frameFile = getActiveFrameFile();
  if (!frameFile || !frameFile.frames || frameFile.frames.length === 0) {
    frameElement.textContent = '';
    return;
  }

  // Clamp frame index to valid range
  const frameIndex = currentFrameIndex % frameFile.frames.length;
  const frame = frameFile.frames[frameIndex];

  if (frame) {
    frameElement.textContent = frame.join('\n');
  }
}

/**
 * The main playback loop, driven by requestAnimationFrame.
 * Tracks elapsed time since the last frame change. When enough time
 * has passed (frameDelayMs / speed), advances to the next frame.
 *
 * This approach ensures smooth rendering without blocking the main
 * thread or terminal responsiveness.
 */
function playbackLoop(timestamp: number): void {
  if (!enabled || !themeData) {
    rafHandle = null;
    return;
  }

  const frameFile = getActiveFrameFile();
  if (!frameFile || !frameFile.frames || frameFile.frames.length === 0) {
    rafHandle = null;
    return;
  }

  // Initialize lastFrameTime on first call
  if (lastFrameTime === 0) {
    lastFrameTime = timestamp;
    renderCurrentFrame();
  }

  // Calculate effective delay (accounting for speed multiplier)
  const effectiveDelay = frameFile.meta.frameDelayMs / speed;
  const elapsed = timestamp - lastFrameTime;

  if (elapsed >= effectiveDelay) {
    // Advance to next frame (wrapping around)
    currentFrameIndex = (currentFrameIndex + 1) % frameFile.frames.length;
    renderCurrentFrame();
    lastFrameTime = timestamp;
  }

  // Schedule next iteration
  rafHandle = requestAnimationFrame(playbackLoop);
}

/**
 * Start the requestAnimationFrame playback loop.
 */
function startPlaybackLoop(): void {
  if (rafHandle !== null) {
    return; // Already running
  }

  lastFrameTime = 0;
  rafHandle = requestAnimationFrame(playbackLoop);
}

/**
 * Stop the requestAnimationFrame playback loop.
 */
function stopPlaybackLoop(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

// ============================================================
// State Styling
// ============================================================

/**
 * Apply the CSS class for the given animation state.
 * Removes all state classes and adds the appropriate one.
 */
function applyStateClass(state: AnimationState): void {
  if (!container) {
    return;
  }

  container.classList.remove(
    'animation-state-idle',
    'animation-state-running',
    'animation-state-success',
    'animation-state-error'
  );
  container.classList.add(`animation-state-${state}`);
}

// ============================================================
// Transition Timeout
// ============================================================

/**
 * Clear any pending transition timeout (success/error -> idle).
 */
function clearTransitionTimeout(): void {
  if (transitionTimeout !== null) {
    clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }
}

// ============================================================
// Event Subscriptions
// ============================================================

/** Stored unsubscribe functions for event bus listeners */
let unsubscribers: Array<() => void> = [];

/**
 * Subscribe to relevant events from the event bus.
 */
function subscribeToEvents(): void {
  // shell:exit — transition to success or error based on exit code
  unsubscribers.push(
    eventBus.on('shell:exit', (payload: { exitCode: number }) => {
      if (payload.exitCode === 0) {
        setState('success');
      } else {
        setState('error');
      }
    })
  );

  // shell:spawned — return to idle when a new shell is spawned
  unsubscribers.push(
    eventBus.on('shell:spawned', () => {
      setState('idle');
    })
  );

  // config:changed — reload animation settings if the animation config changed
  unsubscribers.push(
    eventBus.on('config:changed', (payload: { key: string; value?: any }) => {
      if (payload.key === 'animation') {
        reloadConfigFromPayload(payload.value);
      }
    })
  );
}

/**
 * Unsubscribe from all event bus listeners.
 */
function unsubscribeFromEvents(): void {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers = [];
}

/**
 * Reload animation settings from a config payload or by fetching from main.
 */
async function reloadConfigFromPayload(value?: any): Promise<void> {
  if (value && typeof value === 'object') {
    // If the value is provided inline, apply it directly
    applyConfig(value);
  } else {
    // Otherwise, fetch the animation config from main
    try {
      const config = await (window as any).api.config.get('animation');
      if (config) {
        applyConfig(config);
      }
    } catch (err) {
      console.error('[AnimationEngine] Failed to reload config:', err);
    }
  }
}

/**
 * Apply animation configuration values.
 */
function applyConfig(config: {
  enabled?: boolean;
  theme?: string;
  speed?: number;
  transitionDuration?: number;
}): void {
  if (typeof config.enabled === 'boolean') {
    setEnabled(config.enabled);
  }
  if (typeof config.speed === 'number') {
    setSpeed(config.speed);
  }
  if (typeof config.transitionDuration === 'number') {
    transitionDuration = config.transitionDuration;
  }
  if (typeof config.theme === 'string') {
    setTheme(config.theme);
  }
}
