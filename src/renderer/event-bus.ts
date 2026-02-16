/**
 * Renderer-side pub/sub event system.
 *
 * A singleton EventBus used by all renderer modules for decoupled
 * communication. Supports subscribe, unsubscribe, one-time listeners,
 * and bulk listener removal.
 *
 * Event catalog (see ARCHITECTURE.md Section 6):
 * - command:selected     { command: string; explanation: string; id: string }
 * - command:inserted     { command: string }
 * - command:hovered      { explanation: string; id: string }
 * - command:hover-end    void
 * - commands:updated     void
 * - shell:exit           { exitCode: number }
 * - shell:spawned        {}
 * - shell:input-start    void
 * - shell:idle           void
 * - project:detected     { types: string[] }
 * - warning:show         WarningDisplayPayload
 * - warning:dismissed    { warningId: string; action: 'confirm' | 'cancel' }
 * - animation:state-change  { state: string }
 * - custom-command:open-form   {} | { command: CommandDefinition }
 * - custom-command:close-form  {}
 * - config:changed       { key: string; value: any }
 * - terminal:focused     {}
 * - terminal:blurred     {}
 * - terminal:resized     { cols: number; rows: number }
 * - error:show           { message: string; details?: string }
 */

type EventCallback = (...args: any[]) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Unsubscribe a specific callback from an event.
   */
  off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event with optional payload arguments.
   * All registered listeners are called synchronously in registration order.
   */
  emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      // Iterate over a copy to avoid issues if a listener modifies the set
      for (const callback of [...callbacks]) {
        try {
          callback(...args);
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err);
        }
      }
    }
  }

  /**
   * Subscribe to an event for a single invocation only.
   * Returns an unsubscribe function that can cancel before the event fires.
   */
  once(event: string, callback: EventCallback): () => void {
    const wrapper: EventCallback = (...args: any[]) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove all listeners, optionally for a specific event only.
   * If no event is provided, all listeners for all events are removed.
   */
  removeAllListeners(event?: string): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
