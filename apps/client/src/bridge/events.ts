/** The only link between React and Phaser. See docs/ARCHITECTURE.md, rule 1. */
export interface BridgeEvents {
  "game:ready": { scene: string };
}

type EventName = keyof BridgeEvents;
type Handler<K extends EventName> = (payload: BridgeEvents[K]) => void;

type AnyHandler = (payload: never) => void;

const handlers = new Map<EventName, Set<AnyHandler>>();

export const bridge = {
  /** Subscribes to an event and returns a function that unsubscribes. */
  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    const set = handlers.get(event) ?? new Set<AnyHandler>();
    handlers.set(event, set);
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  },

  emit<K extends EventName>(event: K, payload: BridgeEvents[K]): void {
    handlers.get(event)?.forEach((handler) => {
      (handler as Handler<K>)(payload);
    });
  },
};
