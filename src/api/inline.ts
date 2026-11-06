import type { BindingParams } from './factory.js';
import type { BindingApi, MonitorApi, MonitorParams } from './container.js';
import type { ButtonApi, ButtonParams } from './buttons.js';
import type { PaneContext, Row } from './context.js';
import type { SearchMetadata } from '../core/search.js';
import { SearchableRow } from './rows.js';

interface InlineSize {
  /** Relative share of remaining space (default 1), or intrinsic width for an auxiliary action. */
  width?: number | 'auto';
}

export type InlineBindingItem = BindingParams &
  InlineSize & {
    type: 'binding';
    target: object;
    key: PropertyKey;
  };
export type InlineMonitorItem = MonitorParams &
  InlineSize & {
    type: 'monitor';
    target: object;
    key: PropertyKey;
  };
export type InlineButtonItem = ButtonParams & InlineSize & { type: 'button' };
export type InlineItem = InlineBindingItem | InlineMonitorItem | InlineButtonItem;
export type InlineItemApi<T extends InlineItem> = T extends { type: 'button' }
  ? ButtonApi
  : T extends { type: 'monitor' }
    ? MonitorApi
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

export interface InlineRowParams<T extends readonly InlineItem[] = readonly InlineItem[]> {
  items: T;
  name?: string;
  label?: string;
  hidden?: boolean;
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
    params: InlineRowParams,
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

export class InlineRowApi<T extends readonly InlineItem[] = readonly InlineItem[]> {
  constructor(
    private readonly row: InlineRow,
    readonly items: InlineApis<T>,
    private readonly context: PaneContext,
  ) {}
  get hidden(): boolean {
    return this.row.hidden;
  }
  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }
  get disabled(): boolean {
    return this.row.disabled;
  }
  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }
  get element(): HTMLElement {
    return this.row.element;
  }
  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
