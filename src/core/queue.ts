/**
 * Growable ring buffer used by the scheduler's hot path. It allocates only when it grows past
 * its high-water mark, so a steady frame loop creates no garbage.
 */
export class RingQueue<T> {
  #items: (T | undefined)[];
  #mask: number;
  #head = 0;
  #size = 0;

  constructor(capacity = 64) {
    let size = 1;
    while (size < capacity) size <<= 1;
    this.#items = new Array<T | undefined>(size);
    this.#mask = size - 1;
  }

  get size(): number {
    return this.#size;
  }

  push(item: T): void {
    if (this.#size === this.#items.length) this.#grow();
    this.#items[(this.#head + this.#size) & this.#mask] = item;
    this.#size++;
  }

  shift(): T | undefined {
    if (this.#size === 0) return undefined;
    const index = this.#head;
    const item = this.#items[index];
    this.#items[index] = undefined;
    this.#head = (index + 1) & this.#mask;
    this.#size--;
    return item;
  }

  clear(): void {
    this.#items.fill(undefined);
    this.#head = 0;
    this.#size = 0;
  }

  #grow(): void {
    const next = new Array<T | undefined>(this.#items.length * 2);
    for (let i = 0; i < this.#size; i++) next[i] = this.#items[(this.#head + i) & this.#mask];
    this.#items = next;
    this.#mask = next.length - 1;
    this.#head = 0;
  }
}
