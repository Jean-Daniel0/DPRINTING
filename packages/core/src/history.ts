/** Annuler / rétablir sur des états immuables. Les changements rapprochés portant la même clé (ex. un curseur) sont fusionnés. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;
  constructor(private current: T, private readonly limit = 100, private readonly coalesceMs = 700) {}

  get present(): T { return this.current; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  commit(next: T, coalesceKey?: string, now = Date.now()): T {
    if (Object.is(next, this.current)) return this.current;
    const merge = coalesceKey && coalesceKey === this.lastKey && now - this.lastAt < this.coalesceMs && this.past.length > 0;
    if (!merge) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = next;
    this.future = [];
    this.lastKey = coalesceKey ?? null;
    this.lastAt = now;
    return this.current;
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev === undefined) return this.current;
    this.future.push(this.current);
    this.current = prev;
    this.lastKey = null;
    return this.current;
  }

  redo(): T {
    const next = this.future.pop();
    if (next === undefined) return this.current;
    this.past.push(this.current);
    this.current = next;
    this.lastKey = null;
    return this.current;
  }

  /** Remplace l'état sans créer d'étape d'historique (chargement d'un design). */
  reset(state: T): void { this.current = state; this.past = []; this.future = []; this.lastKey = null; }
}
