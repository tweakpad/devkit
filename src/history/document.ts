import { isPrimitive } from './values.js';
import type { HistoryDocument, StoredChange, StoredValue, StoredVersion } from './types.js';

/** The document format this build reads and writes. */
export const FORMAT = 1;

/** Upgrades a document of format `n` to `n + 1`. None yet; format 1 is the first. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

export interface ParsedDocument {
  doc: HistoryDocument;
  warnings: string[];
  /** Written by a newer devkit: usable, but must not be overwritten. */
  newer: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function emptyDocument(now: number): HistoryDocument {
  return { format: FORMAT, versions: [newVersion(1, now, {})] };
}

export function newVersion(
  id: number,
  now: number,
  values: Record<string, StoredValue>,
): StoredVersion {
  return { id, created: now, updated: now, frozen: false, values, changes: [] };
}

function parseValue(value: unknown): StoredValue | undefined {
  if (isPrimitive(value)) return value;
  if (isRecord(value) && isPrimitive(value.v) && typeof value.l === 'string')
    return { v: value.v, l: value.l };
  return undefined;
}

function parseChange(value: unknown): StoredChange | undefined {
  if (!isRecord(value) || typeof value.p !== 'string' || !isTime(value.at)) return undefined;
  const to = parseValue(value.t);
  if (to === undefined) return undefined;
  const change: StoredChange = { p: value.p, t: to, at: value.at };
  const from = parseValue(value.f);
  if (from !== undefined) change.f = from;
  if (value.s === 'restore') change.s = 'restore';
  if (typeof value.g === 'number' && Number.isInteger(value.g)) change.g = value.g;
  return change;
}

function parseVersion(value: unknown, now: number): StoredVersion | undefined {
  if (!isRecord(value)) return undefined;
  const id = value.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return undefined;
  const values: Record<string, StoredValue> = {};
  if (isRecord(value.values))
    for (const [path, entry] of Object.entries(value.values)) {
      const parsed = parseValue(entry);
      if (parsed !== undefined) values[path] = parsed;
    }
  const changes = Array.isArray(value.changes)
    ? value.changes.map(parseChange).filter((change) => change !== undefined)
    : [];
  const created = isTime(value.created) ? value.created : now;
  const version: StoredVersion = {
    id,
    created,
    updated: isTime(value.updated) ? value.updated : created,
    frozen: value.frozen === true,
    values,
    changes,
  };
  if (typeof value.label === 'string') version.label = value.label;
  return version;
}

/**
 * Reads stored text into a valid document, keeping whatever can be kept: corrupt text gives an
 * empty history, malformed versions, values and changes are dropped one by one. Never throws.
 */
export function parseDocument(raw: string | null | unknown, now: number): ParsedDocument {
  const warnings: string[] = [];
  const empty = (warning?: string): ParsedDocument => {
    if (warning) warnings.push(warning);
    return { doc: emptyDocument(now), warnings, newer: false };
  };
  if (raw === null || raw === undefined) return empty();
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return empty('devkit: stored history is not valid JSON; starting a new one');
    }
  }
  if (!isRecord(data) || typeof data.format !== 'number' || !Number.isInteger(data.format))
    return empty('devkit: stored history has no known format; starting a new one');
  if (data.format > FORMAT) {
    warnings.push(
      `devkit: stored history has format ${data.format}, newer than ${FORMAT}; it is left untouched and this session is not saved`,
    );
    return { doc: emptyDocument(now), warnings, newer: true };
  }
  let record = data;
  for (let format = record.format as number; format < FORMAT; format++) {
    const migrate = MIGRATIONS[format];
    if (!migrate) return empty(`devkit: stored history format ${format} cannot be upgraded`);
    record = migrate(record);
  }

  const versions: StoredVersion[] = [];
  let dropped = 0;
  for (const entry of Array.isArray(record.versions) ? record.versions : []) {
    const version = parseVersion(entry, now);
    // Ids increase; anything out of order or repeated is dropped.
    if (!version || (versions.length > 0 && version.id <= versions.at(-1)!.id)) dropped++;
    else versions.push(version);
  }
  if (dropped > 0) warnings.push(`devkit: dropped ${dropped} malformed history version(s)`);
  // Every version but the last is frozen; the last is the working one.
  for (const version of versions.slice(0, -1)) version.frozen = true;
  const last = versions.at(-1);
  if (!last) versions.push(newVersion(1, now, {}));
  else if (last.frozen) versions.push(newVersion(last.id + 1, now, { ...last.values }));
  return { doc: { format: FORMAT, versions }, warnings, newer: false };
}

/** A deep copy that shares nothing with the live history. */
export function cloneDocument(doc: HistoryDocument): HistoryDocument {
  return {
    format: FORMAT,
    versions: doc.versions.map((version) => ({
      ...version,
      values: Object.fromEntries(
        Object.entries(version.values).map(([path, value]) => [
          path,
          typeof value === 'object' && value !== null ? { ...value } : value,
        ]),
      ),
      changes: version.changes.map((change) => ({ ...change })),
    })),
  };
}
