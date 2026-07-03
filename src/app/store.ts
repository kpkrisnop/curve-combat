import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(cb: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      for (const cb of subs) cb();
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

export function useStore<T extends object, U>(store: Store<T>, selector: (s: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
