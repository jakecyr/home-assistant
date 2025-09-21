import type { EventBus, Subscription } from "../../domain/events/EventBus";

type Handler = (payload: any) => void;

type TopicMap = Map<string, Set<Handler>>;

export class SimpleEventBus implements EventBus {
  private readonly handlers: TopicMap = new Map();

  publish<T>(topic: string, payload: T): void {
    const listeners = this.handlers.get(topic);
    if (!listeners) return;
    for (const handler of Array.from(listeners)) {
      try {
        handler(payload);
      } catch (err) {
        console.warn(`Event handler for topic ${topic} failed:`, err);
      }
    }
  }

  subscribe<T>(topic: string, handler: (payload: T) => void): Subscription {
    let listeners = this.handlers.get(topic);
    if (!listeners) {
      listeners = new Set();
      this.handlers.set(topic, listeners);
    }
    listeners.add(handler as Handler);

    return {
      unsubscribe: () => {
        listeners?.delete(handler as Handler);
        if (listeners && listeners.size === 0) {
          this.handlers.delete(topic);
        }
      },
    };
  }
}
