import type { BindingParams } from './factory.js';
import type { BindingApi } from './container.js';
import type { ButtonApi, ButtonParams } from './buttons.js';
import type { PaneContext, Row } from './context.js';
import type { SearchMetadata } from '../core/search.js';
import { SearchableRow } from './rows.js';

interface InlineSize {
  /**
   * Share of the row's free space, relative to the other items, or `'auto'` for the item's own
   * width, e.g. for a Reset button.
   * @default 1
   */
  width?: number | 'auto';
}

/** A binding in an inline row: a target, a key, and any `BindingParams`. */
export type InlineBindingItem = BindingParams &
  InlineSize & {
    /** The item's kind: a binding of `target[key]`, or a button. */
    type: 'binding';
    /** The object whose property the item binds. */
    target: object;
    /** The property of `target` the item binds; it must exist on `target`. */
    key: PropertyKey;
  };
/** A button in an inline row: any `ButtonParams`. */
export type InlineButtonItem = ButtonParams &
  InlineSize & {
    /** The item's kind: a binding of `target[key]`, or a button. */
    type: 'button';
  };
/** One item of an inline row, a binding or a button as its `type` says. */
export type InlineItem = InlineBindingItem | InlineButtonItem;
export type InlineItemApi<T extends InlineItem> = T extends { type: 'button' }
  ? ButtonApi
  : T extends { target: infer O; key: infer K }
    ? K extends keyof O
      ? BindingApi<O[K]>
      : never
    : never;
export type InlineApis<T extends readonly InlineItem[]> = {
  readonly [I in keyof T]: InlineItemApi<T[I]>;
};
export type ValidatedInlineItems<T extends readonly InlineItem[]> = {
  readonly [I in keyof T]: T[I] extends { target: infer O; key: PropertyKey }
    ? T[I] & { key: keyof O }
    : T[I];
};

/** Options of `addRow()`. */
export interface InlineRowParams<T extends readonly InlineItem[] = readonly InlineItem[]> {
  /** The items, in display order; at least one. The list is fixed once the row exists. */
  items: T;
  /** Stable searchable name of the whole row. */
  name?: string;
  /** Additional search label of the whole row; it adds nothing visible. */
  label?: string;
  /**
   * Starts the row hidden, leaving the items' own `hidden` flags as they are.
   * @default false
   */
  hidden?: boolean;
  /**
   * Starts the row disabled, leaving the items' own `disabled` flags as they are.
   * @default false
   */
  disabled?: boolean;
}

/** The container provides every item through its existing control APIs. */
export interface InlineContents {
  readonly entries: readonly { row: Row; metadata: SearchMetadata }[];
  setVisible(visible: boolean): void;
  setParentDisabled(disabled: boolean): void;
  dispose(): void;
}

/** A composition has one stable search boundary, irrespective of the kinds of controls inside. */
export class InlineRow extends SearchableRow {
  readonly metadata: SearchMetadata;
  constructor(
    surface: HTMLElement,
    private readonly contents: InlineContents,
    params: Omit<InlineRowParams, 'items'>,
  ) {
    super(surface);
    const eligible = () => contents.entries.filter(({ row }) => !row.hidden && !row.disposed);
    this.metadata = {
      name: params.name ?? '',
      label: params.label ?? '',
      get terms() {
        return eligible().flatMap(({ metadata }) => [
          metadata.name,
          metadata.label,
          ...(metadata.terms ?? []),
        ]);
      },
    };
    for (const { row } of contents.entries)
      row.onEligibilityChange = () => this.refreshVisibility();
    this.setDisabled(params.disabled ?? false);
    this.setHidden(params.hidden ?? false);
  }

  override get hidden(): boolean {
    return super.hidden || !this.contents.entries.some(({ row }) => !row.hidden && !row.disposed);
  }

  protected override syncVisibility(visible: boolean): void {
    for (const { row } of this.contents.entries) row.setParentHidden(!this.searchVisible);
    this.contents.setVisible(visible);
  }
  protected override syncDisabled(disabled: boolean): void {
    this.contents.setParentDisabled(disabled);
  }
  override dispose(): void {
    for (const { row } of this.contents.entries) row.onEligibilityChange = undefined;
    this.contents.dispose();
    super.dispose();
  }
}

/** The handle `addRow` returns. */
export class InlineRowApi<T extends readonly InlineItem[] = readonly InlineItem[]> {
  constructor(
    private readonly row: InlineRow,
    /** Handles of the items in order: a `BindingApi` per binding, a `ButtonApi` per button. */
    readonly items: InlineApis<T>,
    private readonly context: PaneContext,
  ) {}
  /**
   * Whether the whole row is hidden, which leaves it out of search. A row whose items are all
   * hidden or disposed reads as hidden too.
   */
  get hidden(): boolean {
    return this.row.hidden;
  }
  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }
  /**
   * Whether the whole row is disabled. It combines with each item's own `disabled`, which it
   * never overwrites.
   */
  get disabled(): boolean {
    return this.row.disabled;
  }
  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }
  /** The stable visibility shell containing the complete row. */
  get element(): HTMLElement {
    return this.row.element;
  }
  /** Removes the row and every item in it. */
  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
