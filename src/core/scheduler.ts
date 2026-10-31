import { animationFrames, type FrameSource } from './frames.js';
import { RingQueue } from './queue.js';

/** Pulled once per frame while active: reads its source and queues a write when it changed. */
export interface Sampler {
  /** Position in the scheduler's active list; -1 while inactive. Owned by the scheduler. */
  slot: number;
  sample(now: number): void;
}

/** Pushes a value to the screen. Writes are coalesced: a queued writer is queued once. */
export interface Writer {
  /** True while waiting in a write queue. Owned by the scheduler. */
  queued: boolean;
  /**
   * Heavy writers (library elements, a full Lit update each) share the frame budget and may be
   * deferred to a later frame; light writers (text nodes, canvas) always flush in the frame.
   */
  readonly heavy: boolean;
  write(): void;
}

/** Deferred, budgeted work such as instantiating a library element for a newly visible row. */
export interface Job {
  /** True while waiting in the job queue. Owned by the scheduler. */
  queued: boolean;
  run(): void;
}

/** Runs after the write phase, once per frame, e.g. coalesced change notifications. */
export interface Notifier {
  queued: boolean;
  notify(): void;
}

export interface SchedulerOptions {
  frames?: FrameSource;
  /**
   * Milliseconds per frame for heavy writes and jobs together. At least one heavy write and one
   * job still run in every frame, so work never starves.
   */
  budget?: number;
}

/** Counters of the last frame, mutated in place (no allocation) for overlays and tests. */
export interface FrameStats {
  active: number;
  sampled: number;
  lightWrites: number;
  heavyWrites: number;
  deferredWrites: number;
  jobs: number;
  deferredJobs: number;
  /** Time spent inside the frame callback, in ms. */
  duration: number;
}

/**
 * The single frame loop behind every pane on the page.
 *
 * Each frame runs four phases, without allocating and without reading layout:
 *
 * 1. sample: every active sampler reads its source and queues a writer when it changed;
 * 2. light writes: flushed in full;
 * 3. heavy writes, then jobs: run until the frame budget is spent, the rest carries over and
 *    stays coalesced (a writer always writes its latest value, however late);
 * 4. notify: coalesced change listeners.
 *
 * The loop stops itself when nothing is active or queued.
 */
export class Scheduler {
  readonly stats: FrameStats = {
    active: 0,
    sampled: 0,
    lightWrites: 0,
    heavyWrites: 0,
    deferredWrites: 0,
    jobs: 0,
    deferredJobs: 0,
    duration: 0,
  };
  budget: number;

  readonly #frames: FrameSource;
  #active: Sampler[] = [];
  #activeCount = 0;
  readonly #light = new RingQueue<Writer>();
  readonly #heavy = new RingQueue<Writer>();
  readonly #jobs = new RingQueue<Job>();
  readonly #notifiers = new RingQueue<Notifier>();
  #handle = 0;
  #running = false;
  readonly #tick = (time: number): void => this.#frame(time);

  constructor(options: SchedulerOptions = {}) {
    this.#frames = options.frames ?? animationFrames;
    this.budget = options.budget ?? 2;
  }

  get activeCount(): number {
    return this.#activeCount;
  }

  activate(sampler: Sampler): void {
    if (sampler.slot !== -1) return;
    sampler.slot = this.#activeCount;
    this.#active[this.#activeCount++] = sampler;
    this.#wake();
  }

  deactivate(sampler: Sampler): void {
    const slot = sampler.slot;
    if (slot === -1) return;
    const lastIndex = --this.#activeCount;
    const last = this.#active[lastIndex]!;
    this.#active[slot] = last;
    last.slot = slot;
    this.#active[lastIndex] = undefined as unknown as Sampler;
    sampler.slot = -1;
  }

  enqueueWrite(writer: Writer): void {
    if (writer.queued) return;
    writer.queued = true;
    (writer.heavy ? this.#heavy : this.#light).push(writer);
    this.#wake();
  }

  enqueueJob(job: Job): void {
    if (job.queued) return;
    job.queued = true;
    this.#jobs.push(job);
    this.#wake();
  }

  enqueueNotify(notifier: Notifier): void {
    if (notifier.queued) return;
    notifier.queued = true;
    this.#notifiers.push(notifier);
    this.#wake();
  }

  /** Runs one frame now, outside the loop (pane.refresh, tests). */
  flush(): void {
    this.#frame(this.#frames.now());
  }

  dispose(): void {
    if (this.#running) this.#frames.cancel(this.#handle);
    this.#running = false;
    for (let i = 0; i < this.#activeCount; i++) this.#active[i]!.slot = -1;
    this.#active = [];
    this.#activeCount = 0;
    this.#light.clear();
    this.#heavy.clear();
    this.#jobs.clear();
    this.#notifiers.clear();
  }

  #wake(): void {
    if (this.#running) return;
    this.#running = true;
    this.#handle = this.#frames.request(this.#tick);
  }

  #frame(time: number): void {
    const frames = this.#frames;
    const start = frames.now();
    const stats = this.stats;
    this.#running = false;

    // 1. Sample. Iterating by index tolerates deactivation from inside sample(): the swapped-in
    // sampler lands at the current slot and is visited by re-checking that slot.
    let sampled = 0;
    for (let i = 0; i < this.#activeCount; i++) {
      const sampler = this.#active[i]!;
      try {
        sampler.sample(time);
      } catch (error) {
        this.deactivate(sampler);
        reportError(error);
      }
      sampled++;
      if (this.#active[i] !== sampler) i--;
    }

    // 2. Light writes, in full.
    let lightWrites = 0;
    for (let writer = this.#light.shift(); writer; writer = this.#light.shift()) {
      writer.queued = false;
      runWriter(writer);
      lightWrites++;
    }

    // 3. Heavy writes, then jobs, inside the budget.
    const deadline = start + this.budget;
    let heavyWrites = 0;
    while (this.#heavy.size > 0 && (heavyWrites === 0 || frames.now() < deadline)) {
      const writer = this.#heavy.shift()!;
      writer.queued = false;
      runWriter(writer);
      heavyWrites++;
    }
    let jobs = 0;
    while (this.#jobs.size > 0 && (jobs === 0 || frames.now() < deadline)) {
      const job = this.#jobs.shift()!;
      job.queued = false;
      try {
        job.run();
      } catch (error) {
        reportError(error);
      }
      jobs++;
    }

    // 4. Notify.
    for (let notifier = this.#notifiers.shift(); notifier; notifier = this.#notifiers.shift()) {
      notifier.queued = false;
      try {
        notifier.notify();
      } catch (error) {
        reportError(error);
      }
    }

    stats.active = this.#activeCount;
    stats.sampled = sampled;
    stats.lightWrites = lightWrites;
    stats.heavyWrites = heavyWrites;
    stats.deferredWrites = this.#heavy.size;
    stats.jobs = jobs;
    stats.deferredJobs = this.#jobs.size;
    stats.duration = frames.now() - start;

    if (
      this.#activeCount > 0 ||
      this.#heavy.size > 0 ||
      this.#jobs.size > 0 ||
      this.#light.size > 0 ||
      this.#notifiers.size > 0
    )
      this.#wake();
  }
}

function runWriter(writer: Writer): void {
  try {
    writer.write();
  } catch (error) {
    reportError(error);
  }
}

function reportError(error: unknown): void {
  // One failing binding must not stop the loop for every other one.
  console.error('[tweakpad]', error);
}

let shared: Scheduler | undefined;

/** The page-wide scheduler every pane uses unless it is given its own. */
export function sharedScheduler(): Scheduler {
  return (shared ??= new Scheduler());
}
