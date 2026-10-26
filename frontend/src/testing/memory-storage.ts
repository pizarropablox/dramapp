/** An in-memory localStorage for tests; failing = true makes every call throw, like Safari's private mode. */
export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  failing = false;

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    this.check();
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.check();
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.check();
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }

  /** The parsed value, bypassing failing. */
  json(key: string): unknown {
    const value = this.items.get(key);
    return value === undefined ? null : JSON.parse(value);
  }

  private check(): void {
    if (this.failing) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
  }
}
