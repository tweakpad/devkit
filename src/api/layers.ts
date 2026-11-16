import type { IconDefinition } from '@tweakpad/ui';
import type {
  Layer,
  LayerState,
  LayerStateValue,
  LayersChange,
  LayersMove,
} from '@tweakpad/ui/widgets';
import { plusIcon } from '@tweakpad/ui/icons/plus';
import { trashIcon } from '@tweakpad/ui/icons/trash';
import type { SearchControlNode, SearchGroupNode, SearchNode } from '../core/search.js';
import { TweakLayers } from '../elements/layers.js';
import { TweakTabPage } from '../elements/tabs.js';
import {
  declaredIds,
  decodeStructure,
  encodeStructure,
  nextLayerId,
  startingStack,
  type StartEntry,
  type Structure,
} from '../layers/model.js';
import { ButtonRow, type ButtonParams } from './buttons.js';
import { Chunk, type PaneContext } from './context.js';
import { ContainerApi, TabPageApi } from './container.js';
import type { InlineBindingItem, InlineRow } from './inline.js';
import { MenuRow, type MenuEntry } from './menu.js';

/** A state every layer of a stack has, toggled in its row; `enabled` is always the first. */
export interface LayerStateParams<S extends string = string> {
  /** Name of the state in `LayerApi.states`, events and history paths. */
  key: S;
  /** Accessible name of the state's control in each row. */
  label: string;
  /**
   * Icon of the state's control in each row while on. Without one the row shows no control for
   * the state, which code and bar actions still change.
   */
  icon?: IconDefinition;
  /**
   * Icon of the control while off. Without one the control shows only while on, and while off
   * shows faded when the pointer is over the row or it has focus.
   */
  offIcon?: IconDefinition;
  /**
   * Value of the state for layers that do not set it.
   * @default false
   */
  default?: boolean;
  /**
   * When the control shows at rest: always, or only while the state is on or off. A control shown
   * only sometimes keeps its place, and shows faded while the row is hovered or has focus.
   * @default 'always'
   */
  display?: 'always' | 'on' | 'off';
  /**
   * Shows the layer's name and icon dimmed while the state is off.
   * @default false
   */
  mutes?: boolean;
  /**
   * What a press on the control of a selected layer changes: that layer, or every selected layer.
   * @default 'layer'
   */
  scope?: 'layer' | 'selection';
}

/**
 * How the `enabled` state shows in each row. A disabled layer is frozen: it shows dimmed, and
 * the user cannot select, move, rename or remove it, or change its other states. With no `icon`
 * the row shows no control for it.
 */
export interface LayerEnabledParams {
  /**
   * Accessible name of the control.
   * @default 'Enabled'
   */
  label?: string;
  /** Icon of the control while enabled; without one the row shows no control for `enabled`. */
  icon?: IconDefinition;
  /** Icon of the control while disabled, in place of `icon`. */
  offIcon?: IconDefinition;
  /**
   * When the control shows at rest: always, or only while the layer is enabled or disabled.
   * @default 'always'
   */
  display?: 'always' | 'on' | 'off';
}

/** One layer: declared in `LayersParams.layers`, or added with `LayersApi.add()`. */
export interface LayerParams<S extends string = never, D = unknown, T extends string = string> {
  /**
   * Stable id: the layer's name in history paths and `LayersApi.get()`. Declared layers default
   * to their name; added layers get `<type>-<n>`.
   */
  id?: string;
  /** The type the layer is, from `LayersParams.types`; it gives the defaults below. */
  type?: NoInfer<T>;
  /** Name shown in the row; defaults to the type's title. A layer needs a name or a type. */
  name?: string;
  /** Icon before the name; defaults to the type's icon. */
  icon?: IconDefinition;
  /**
   * Starting values of the states; the rest take the type's, then the stack's defaults. An
   * `enabled` of false freezes the layer.
   */
  states?: Partial<Record<'enabled' | NoInfer<S>, boolean>>;
  /** Whether the user may move this layer, in place of the stack's `reorder`. */
  reorder?: boolean;
  /** Whether the user may rename this layer, in place of the stack's `rename`. */
  rename?: boolean;
  /** Whether the user may remove this layer, in place of the stack's `remove`. */
  remove?: boolean;
  /**
   * Builds the layer's panel, shown while it is the active layer: add controls to `panel` as to
   * the pane. It runs once, when the layer is created. Without it, and without the type's, the
   * layer has no panel.
   */
  controls?: (panel: ContainerApi, layer: LayerApi<S, D, T>) => void;
  /** Anything the application keeps with the layer, such as the object it stands for. */
  data?: D;
}

/** A kind of layer the user can add, and the defaults of layers of that type. */
export interface LayerTypeParams<S extends string = never, D = unknown, T extends string = string> {
  /** Name of the type in the add menu, and of its new layers. */
  title: string;
  /** Icon of the type in the add menu, and of its layers. */
  icon?: IconDefinition;
  /** Starting values of the states for layers of this type. */
  states?: Partial<Record<'enabled' | NoInfer<S>, boolean>>;
  /** Builds the panel of each layer of this type, unless the layer has its own `controls`. */
  controls?: (panel: ContainerApi, layer: LayerApi<S, D, T>) => void;
  /** Makes the `data` of a new layer of this type, unless the layer has its own. */
  data?: (layer: LayerApi<S, D, T>) => D;
  /**
   * Whether the add menu offers the type. Layers of a type left out can still be declared, added
   * with `add()` and re-created by history.
   * @default true
   */
  menu?: boolean;
}

/**
 * Rules the application decides on each user action. They gate what the user does, not what
 * code does through the API.
 */
export interface LayersRules<S extends string = never, D = unknown, T extends string = string> {
  /** Whether the user may add a layer of `type`; the add menu shows refused types dimmed. */
  add?: (type: NoInfer<T>, layers: LayersApi<S, D, T>) => boolean;
  /** Whether the user may move `layer` to index `to`; a refused place is never offered. */
  move?: (layer: LayerApi<S, D, T>, to: number, layers: LayersApi<S, D, T>) => boolean;
  /** Whether the user may rename `layer` to `name`; return a string to use that name instead. */
  rename?: (layer: LayerApi<S, D, T>, name: string, layers: LayersApi<S, D, T>) => boolean | string;
  /** Whether the user may remove `layer`. */
  remove?: (layer: LayerApi<S, D, T>, layers: LayersApi<S, D, T>) => boolean;
}

/** A button in a stack's header or footer; `onClick` also receives the stack. */
export type LayersButtonItem<
  S extends string = never,
  D = unknown,
  T extends string = string,
> = Omit<ButtonParams, 'onClick'> & {
  /** The item's kind. */
  type: 'button';
  /** Called when the button is pressed, with the stack it acts on. */
  onClick: (event: MouseEvent, layers: LayersApi<S, D, T>) => void;
  /**
   * Share of the bar's free space, or `'auto'` for the item's own width.
   * @default 1
   */
  width?: number | 'auto';
};

/** A menu button in a stack's header or footer. */
export interface LayersMenuItem<S extends string = never, D = unknown, T extends string = string> {
  /** The item's kind. */
  type: 'menu';
  /** Text of the button, or with `iconOnly` its accessible name and tooltip. */
  title: string;
  /** Icon of the button. */
  icon?: IconDefinition;
  /**
   * Shows only the icon.
   * @default false
   */
  iconOnly?: boolean;
  /** Stable searchable name; defaults to the title. */
  name?: string;
  /** The entries, or a function that lists them from the stack each time the menu opens. */
  items: readonly MenuEntry[] | ((layers: LayersApi<S, D, T>) => readonly MenuEntry[]);
  /** Called with the picked entry's value and the stack. */
  onSelect: (value: string, layers: LayersApi<S, D, T>) => void;
  /**
   * Share of the bar's free space, or `'auto'` for the item's own width.
   * @default 'auto'
   */
  width?: number | 'auto';
}

/** The built-in add action: a menu of the stack's types, or a button when it has one. */
export interface LayersAddItem {
  /** The item's kind. */
  type: 'add';
  /**
   * Accessible name and tooltip.
   * @default 'Add layer'
   */
  title?: string;
  /** Icon in place of the plus. */
  icon?: IconDefinition;
  /**
   * Share of the bar's free space, or `'auto'` for the item's own width.
   * @default 'auto'
   */
  width?: number | 'auto';
}

/** The built-in remove action: removes the selected layers the user may remove. */
export interface LayersRemoveItem {
  /** The item's kind. */
  type: 'remove';
  /**
   * Accessible name and tooltip.
   * @default 'Remove layer'
   */
  title?: string;
  /** Icon in place of the trash can. */
  icon?: IconDefinition;
  /**
   * Share of the bar's free space, or `'auto'` for the item's own width.
   * @default 'auto'
   */
  width?: number | 'auto';
}

/** One item of a stack's header or footer: a row item, a menu, or a built-in action. */
export type LayersBarItem<S extends string = never, D = unknown, T extends string = string> =
  | InlineBindingItem
  | LayersButtonItem<S, D, T>
  | LayersMenuItem<S, D, T>
  | LayersAddItem
  | LayersRemoveItem;

/** Options of `addLayers()`. */
export interface LayersParams<S extends string = never, D = unknown, T extends string = string> {
  /**
   * Accessible name of the list, also matched by search.
   * @default 'Layers'
   */
  title?: string;
  /** Stable name in the pane's history paths, in place of the title. */
  id?: string;
  /** The states every layer has besides `enabled`, with controls in each row in this order. */
  states?: readonly LayerStateParams<S>[];
  /** How the always-present `enabled` state shows. */
  enabled?: LayerEnabledParams;
  /**
   * How the user moves layers: dragging the whole row (`true` or `'item'`), only its handle
   * (`'handle'`), or not at all. The keyboard moves them too.
   * @default 'item'
   */
  reorder?: boolean | 'item' | 'handle';
  /**
   * How a drag shows where the layer lands: a line between the rows, or the rows making space.
   * @default 'line'
   */
  drop?: 'line' | 'displace';
  /**
   * Whether the user may rename layers, with a double-click or F2.
   * @default false
   */
  rename?: boolean;
  /**
   * Whether the user may remove layers, with Delete or a `remove` bar item.
   * @default false
   */
  remove?: boolean;
  /** Id of the layer active first, or null for none; defaults to the top enabled layer. */
  selected?: string | null;
  /** The kinds of layers, by type key, for `add` and for re-creating added layers. */
  types?: { readonly [K in T]: LayerTypeParams<S, D, T> };
  /** Rules that decide whether the user may add, move, rename or remove. */
  allow?: LayersRules<S, D, T>;
  /** The layers the stack starts with, top first. */
  layers?: readonly LayerParams<S, D, T>[];
  /** Items above the list, acting on the stack. */
  header?: readonly LayersBarItem<S, D, T>[];
  /** Items below the list, acting on the stack. */
  footer?: readonly LayersBarItem<S, D, T>[];
  /** Text shown in the list's place while the stack has no layers. */
  empty?: string;
  /**
   * Starts the stack hidden, which also leaves it out of search.
   * @default false
   */
  hidden?: boolean;
  /**
   * Starts the stack disabled: the list and its bars ignore input.
   * @default false
   */
  disabled?: boolean;
}

/** Where a change to a stack came from: the user, the API, or a history restore. */
export type LayersSource = 'user' | 'api' | 'restore';

/** What each event of `LayersApi.on()` receives. */
export interface LayersEvents<S extends string = never, D = unknown, T extends string = string> {
  /**
   * The selection or the active layer changed; `layer` is the active layer, null when nothing is
   * selected, and `selection` every selected layer, top first.
   */
  select: {
    layer: LayerApi<S, D, T> | null;
    previous: LayerApi<S, D, T> | null;
    selection: readonly LayerApi<S, D, T>[];
    source: LayersSource;
  };
  /** A layer moved from index `from` to index `to`. */
  reorder: { layer: LayerApi<S, D, T>; from: number; to: number; source: LayersSource };
  /** A layer was renamed. */
  rename: { layer: LayerApi<S, D, T>; name: string; previous: string; source: LayersSource };
  /** A state of a layer changed. */
  state: { layer: LayerApi<S, D, T>; key: 'enabled' | S; value: boolean; source: LayersSource };
  /** A layer was added. */
  add: { layer: LayerApi<S, D, T>; source: LayersSource };
  /** A layer was removed from index `index`. */
  remove: { layer: LayerApi<S, D, T>; index: number; source: LayersSource };
  /** Anything above happened; fires once after them, with the layers top first. */
  change: { layers: readonly LayerApi<S, D, T>[]; source: LayersSource };
}

interface Entry<S extends string, D, T extends string> {
  readonly id: string;
  readonly type: T | null;
  name: string;
  icon: IconDefinition | undefined;
  readonly states: Record<string, boolean>;
  readonly flags: { reorder?: boolean; rename?: boolean; remove?: boolean };
  readonly api: LayerApi<S, D, T>;
  page: TweakTabPage | null;
  panel: TabPageApi | null;
  readonly untrack: (() => void)[];
  readonly finish: Map<string, Set<(value: unknown) => void>>;
}

/** A state as the stack declares it, with the values the widget steps through. */
interface StateView {
  readonly key: string;
  readonly label: string;
  readonly default: boolean;
  readonly scope: 'layer' | 'selection';
  readonly values: readonly LayerStateValue[];
}

/** What the widget proposed, gathered until its proposals of one change have all arrived. */
interface Proposal {
  change?: { change: LayersChange; order: readonly string[]; keyboard: boolean };
  value?: readonly string[];
  active?: string | null;
}

/** What a `LayerApi` asks of its stack. */
interface LayerHost {
  entry(layer: LayerApi<string, unknown, string>): Entry<string, unknown, string>;
  index(layer: LayerApi<string, unknown, string>): number;
  selected(): LayerApi<string, unknown, string> | null;
  select(layer: LayerApi<string, unknown, string> | null): void;
  rename(layer: LayerApi<string, unknown, string>, name: string): void;
  setIcon(layer: LayerApi<string, unknown, string>, icon: IconDefinition | undefined): void;
  setState(layer: LayerApi<string, unknown, string>, key: string, value: boolean): void;
  remove(layer: LayerApi<string, unknown, string>): void;
}

/** One layer of a stack, from `LayersApi.layers`, `get()` or `add()`. */
export class LayerApi<S extends string = never, D = unknown, T extends string = string> {
  /** Anything the application keeps with the layer, from `data` or its type's `data()`. */
  data: D;
  readonly #host: LayerHost;

  constructor(
    host: LayerHost,
    /** Stable id, in history paths and `LayersApi.get()`. */
    readonly id: string,
    /** The layer's type key, or null for a layer declared without one. */
    readonly type: T | null,
  ) {
    this.#host = host;
    this.data = undefined as D;
  }

  get #self(): LayerApi<string, unknown, string> {
    return this as unknown as LayerApi<string, unknown, string>;
  }

  /** Name shown in the row. Setting it renames the layer and fires `rename`. */
  get name(): string {
    return this.#host.entry(this.#self).name;
  }

  set name(name: string) {
    this.#host.rename(this.#self, name);
  }

  /** Icon before the name. */
  get icon(): IconDefinition | undefined {
    return this.#host.entry(this.#self).icon;
  }

  set icon(icon: IconDefinition | undefined) {
    this.#host.setIcon(this.#self, icon);
  }

  /** Index in the stack, 0 being the top. -1 once removed. */
  get index(): number {
    return this.#host.index(this.#self);
  }

  /** The states' values, by key; `setState()` changes them. */
  get states(): Readonly<Record<'enabled' | S, boolean>> {
    return { ...this.#host.entry(this.#self).states } as Record<'enabled' | S, boolean>;
  }

  /** Sets a state and fires `state` when it changes. */
  setState(key: 'enabled' | S, value: boolean): void {
    this.#host.setState(this.#self, key, value);
  }

  /** The panel shown while the layer is active, or null for a layer without controls. */
  get panel(): ContainerApi | null {
    return this.#host.entry(this.#self).panel;
  }

  /** Whether the layer is the active one, whose panel shows. */
  get selected(): boolean {
    return this.#host.selected() === this.#self;
  }

  /** Selects the layer alone and makes it active, firing `select`. */
  select(): void {
    this.#host.select(this.#self);
  }

  /** Removes the layer and its panel, firing `remove`. */
  remove(): void {
    this.#host.remove(this.#self);
  }
}

const ENABLED = 'enabled';

/** The values of a two-valued state, as the widget steps through them: on, then off. */
function stateValues(
  icon: IconDefinition | undefined,
  offIcon: IconDefinition | undefined,
  display: 'always' | 'on' | 'off',
  mutes: boolean,
): LayerStateValue[] {
  // A state without an icon has no control. One icon cannot show both values, so without an
  // `offIcon` the control shows while on and, while off, only on the row's hover or focus.
  const on: LayerStateValue = { value: 'true', label: 'On' };
  const off: LayerStateValue = { value: 'false', label: 'Off' };
  if (icon) {
    on.icon = icon;
    on.display = display === 'off' ? 'hover' : 'always';
    off.icon = offIcon ?? icon;
    off.display = display === 'on' || !offIcon ? 'hover' : 'always';
  }
  if (mutes) off.dims = true;
  return [on, off];
}

/** A stack of layers, as `addLayers` returns it. */
export class LayersApi<S extends string = never, D = unknown, T extends string = string> {
  /** The stack's `<tweak-layers>` element. */
  readonly element: TweakLayers;
  /** @internal This stack's place in the search tree. */
  readonly searchNode: SearchGroupNode;
  readonly #context: PaneContext;
  readonly #params: LayersParams<S, D, T>;
  /** History segments of the stack: its container's path and its own name. */
  readonly #path: readonly string[];
  readonly #states: readonly StateView[];
  readonly #declaredIds: readonly string[];
  #entries: Entry<S, D, T>[] = [];
  readonly #byId = new Map<string, Entry<S, D, T>>();
  readonly #byApi = new Map<LayerApi<S, D, T>, Entry<S, D, T>>();
  /** The active layer, whose panel shows. */
  #selected: Entry<S, D, T> | null = null;
  /** Every selected layer; the active one among them. */
  #selection = new Set<Entry<S, D, T>>();
  /** Whether the widget's records are out of date. */
  #stale = true;
  #counter = 1;
  #hidden = false;
  #filtered = false;
  #disabled = false;
  #disposed = false;
  #proposal: Proposal | null = null;
  readonly #listeners = new Map<keyof LayersEvents, Set<(event: never) => void>>();
  readonly #structureListeners = new Set<(value: unknown) => void>();
  readonly #untrack: (() => void)[] = [];
  readonly #bars: { row: InlineRow; chunk: Chunk }[] = [];
  readonly #barRefresh: (() => void)[] = [];
  readonly #host: LayerHost;
  /** Events held while one change runs, so `change` fires once after them. */
  #batch: { source: LayersSource; events: [keyof LayersEvents, unknown][] } | null = null;

  constructor(
    context: PaneContext,
    params: LayersParams<S, D, T>,
    /** The path of the container the stack is in. */
    path: readonly string[],
  ) {
    this.#context = context;
    this.#params = params;
    this.#path = [...path, params.id ?? params.title ?? 'layers'];
    const enabled = params.enabled ?? {};
    this.#states = [
      {
        key: ENABLED,
        label: enabled.label ?? 'Enabled',
        default: true,
        scope: 'layer',
        values: stateValues(enabled.icon, enabled.offIcon, enabled.display ?? 'always', true),
      },
      ...(params.states ?? []).map((state) => ({
        key: state.key,
        label: state.label,
        default: state.default ?? false,
        scope: state.scope ?? 'layer',
        values: stateValues(
          state.icon,
          state.offIcon,
          state.display ?? 'always',
          state.mutes ?? false,
        ),
      })),
    ];
    const keys = new Set<string>();
    for (const state of this.#states) {
      if (keys.has(state.key))
        throw new Error(`devkit: layer state ${state.key} is declared twice`);
      keys.add(state.key);
    }
    const declared = params.layers ?? [];
    for (const layer of declared)
      if (layer.name === undefined && layer.type === undefined)
        throw new Error('devkit: a layer needs a name or a type');
    for (const layer of declared)
      if (layer.type !== undefined && !this.#type(layer.type))
        throw new Error(`devkit: layer type ${layer.type} is not in types`);
    this.#declaredIds = declaredIds(
      declared.map((layer) => ({
        ...(layer.id !== undefined ? { id: layer.id } : {}),
        name: layer.name ?? this.#type(layer.type!)!.title,
      })),
    );
    this.#host = this.#makeHost();

    const element = document.createElement(TweakLayers.tagName) as TweakLayers;
    this.element = element;
    this.#configureWidget();

    const listNode: SearchControlNode = {
      kind: 'control',
      metadata: {
        name: params.id ?? params.title ?? 'layers',
        label: params.title ?? 'Layers',
        terms: [],
      },
      target: {
        get hidden() {
          return false;
        },
        disposed: false,
        // The list stays visible while its stack is: a stack shown for a match in a panel
        // still needs the list to reach that panel.
        setFiltered: () => {},
      },
    };
    const entries = () => this.#entries;
    Object.defineProperty(listNode.metadata, 'terms', {
      get: () => entries().map((entry) => entry.name),
    });
    this.searchNode = {
      kind: 'group',
      get children(): Iterable<SearchNode> {
        return [
          listNode,
          ...entries().flatMap((entry) => (entry.panel ? [entry.panel.searchNode] : [])),
        ];
      },
      hideWhenEmpty: 'searching',
      setFiltered: (filtered) => {
        this.#filtered = filtered;
        this.#syncHidden();
      },
    };

    this.#build();
    this.#makeBar(params.header ?? [], 'header');
    this.#makeBar(params.footer ?? [], 'footer');
    this.#hidden = params.hidden ?? false;
    this.#syncHidden();
    this.disabled = params.disabled ?? false;
  }

  /** The layers, top first. */
  get layers(): readonly LayerApi<S, D, T>[] {
    return this.#entries.map((entry) => entry.api);
  }

  /** The layer with this id, if the stack has it. */
  get(id: string): LayerApi<S, D, T> | undefined {
    return this.#byId.get(id)?.api;
  }

  /**
   * The active layer, whose panel shows, or null. Setting it to a layer, its id or null selects
   * that layer alone; it fires `select`.
   */
  get selected(): LayerApi<S, D, T> | null {
    return this.#selected?.api ?? null;
  }

  set selected(layer: LayerApi<S, D, T> | string | null) {
    const entry = layer === null ? null : this.#find(layer);
    this.#run('api', () => this.#select(entry));
  }

  /** Every selected layer, top first; the user selects several with Shift and Control or Command. */
  get selection(): readonly LayerApi<S, D, T>[] {
    return this.#selectedEntries().map((entry) => entry.api);
  }

  /**
   * Adds a layer at `index` (default: the top) and returns it, firing `add`. A layer of a type
   * takes its defaults; `select` also selects it. Rules in `allow` do not apply to code.
   */
  add(params: LayerParams<S, D, T> & { index?: number; select?: boolean }): LayerApi<S, D, T> {
    if (params.name === undefined && params.type === undefined)
      throw new Error('devkit: a layer needs a name or a type');
    if (params.type !== undefined && !this.#type(params.type))
      throw new Error(`devkit: layer type ${params.type} is not in types`);
    if (params.id !== undefined && this.#byId.has(params.id))
      throw new Error(`devkit: the stack already has a layer ${params.id}`);
    let entry!: Entry<S, D, T>;
    this.#run('api', () => {
      entry = this.#addLayer(params, params.index ?? 0);
      if (params.select) this.#select(entry);
    });
    return entry.api;
  }

  /** Moves a layer to `index` (0 is the top), firing `reorder`. */
  move(layer: LayerApi<S, D, T> | string, index: number): void {
    const entry = this.#find(layer);
    this.#run('api', () => this.#move(entry, index));
  }

  /** Whether the stack is hidden, which also leaves it out of search. */
  get hidden(): boolean {
    return this.#hidden;
  }

  set hidden(hidden: boolean) {
    this.#hidden = hidden;
    this.#syncHidden();
    this.#context.refreshSearch?.();
  }

  /** Whether the list and its bars ignore input. The panels stay as they are. */
  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(disabled: boolean) {
    this.#disabled = disabled;
    this.element.layers.disabled = disabled;
    for (const { row } of this.#bars) row.setParentDisabled(disabled);
    this.#render();
  }

  /**
   * Listens for changes to the stack. Returns a function that removes the listener. Each event
   * says whether the user, the API or a history restore caused it.
   * @event select - The selection or the active layer changed, with `{ layer, previous, selection, source }`.
   * @event reorder - A layer moved, with `{ layer, from, to, source }`.
   * @event rename - A layer was renamed, with `{ layer, name, previous, source }`.
   * @event state - A layer's state changed, with `{ layer, key, value, source }`.
   * @event add - A layer was added, with `{ layer, source }`.
   * @event remove - A layer was removed, with `{ layer, index, source }`.
   * @event change - Once after any of the above, with `{ layers, source }`.
   */
  on<E extends keyof LayersEvents>(
    type: E,
    listener: (event: LayersEvents<S, D, T>[E]) => void,
  ): () => void {
    let set = this.#listeners.get(type);
    if (!set) this.#listeners.set(type, (set = new Set()));
    const added = listener as (event: never) => void;
    set.add(added);
    return () => set.delete(added);
  }

  /** Removes the stack, its layers and their panels, and stops recording them in the history. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const entry of this.#entries) this.#destroy(entry);
    this.#entries = [];
    for (const untrack of this.#untrack) untrack();
    for (const { row, chunk } of this.#bars) {
      row.dispose();
      this.#context.unobserve(chunk);
    }
    this.#bars.length = 0;
    this.#listeners.clear();
    this.element.remove();
    this.#context.refreshSearch?.();
  }

  // --- Building -------------------------------------------------------------------------------

  #type(type: string): LayerTypeParams<S, D, T> | undefined {
    const types = this.#params.types as Record<string, LayerTypeParams<S, D, T>> | undefined;
    return types && Object.hasOwn(types, type) ? types[type] : undefined;
  }

  #find(layer: LayerApi<S, D, T> | string): Entry<S, D, T> {
    const entry = typeof layer === 'string' ? this.#byId.get(layer) : this.#byApi.get(layer);
    if (!entry)
      throw new RangeError(`devkit: no layer ${typeof layer === 'string' ? layer : layer.id}`);
    return entry;
  }

  /** The widget: the stack's own options, and its proposals turned into the stack's changes. */
  #configureWidget(): void {
    const widget = this.element.layers;
    const { reorder, title, empty } = this.#params;
    widget.label = title ?? 'Layers';
    widget.canReorder = reorder !== false;
    widget.dragActivation = reorder === 'handle' ? 'handle' : 'item';
    widget.dropIndicator = this.#params.drop ?? 'line';
    // Each record says whether its layer can be renamed or removed.
    widget.canRename = false;
    widget.canRemove = false;
    widget.canDrop = (move) => this.#canDrop(move);
    widget.addEventListener('tp-layers-change', this.#onLayersProposal);
    widget.addEventListener('tp-value-change', this.#onValueProposal);
    widget.addEventListener('tp-active-change', this.#onActiveProposal);
    if (empty !== undefined) {
      const text = document.createElement('span');
      text.slot = 'empty';
      text.textContent = empty;
      widget.append(text);
    }
  }

  /** The starting stack: the stored structure, if the history has one, merged with the code. */
  #build(): void {
    const history = this.#context.history;
    const declared = this.#params.layers ?? [];
    let stored: Structure | undefined;
    let start: StartEntry[] | undefined;
    let building = true;
    const plan = () =>
      (start ??= startingStack(this.#declaredIds, stored, (type) => !!this.#type(type)));
    if (history) {
      this.#untrack.push(
        history.track(this.#path, '@layers', {
          descriptor: { type: 'layers' },
          read: () =>
            building
              ? encodeStructure({
                  l: plan().map((entry) => [
                    entry.id,
                    entry.declared === -1 ? entry.type : (declared[entry.declared]!.type ?? null),
                  ]),
                  d: this.#declaredIds,
                  n: this.#counter,
                })
              : this.#encode(),
          load: (value) => {
            stored = decodeStructure(value);
            if (stored) this.#counter = Math.max(this.#counter, stored.n);
          },
          set: (value) => {
            const structure = decodeStructure(value);
            if (structure) this.#run('restore', () => this.#apply(structure));
          },
          onFinish: (listener) => {
            this.#structureListeners.add(listener);
            return () => this.#structureListeners.delete(listener);
          },
        }),
      );
    }
    for (const entry of plan()) {
      const created =
        entry.declared === -1
          ? this.#create({ type: entry.type as T }, entry.id)
          : this.#create(declared[entry.declared]!, entry.id);
      this.#entries.push(created);
    }
    building = false;
    const first = this.#params.selected;
    const active =
      first === null
        ? null
        : first !== undefined
          ? (this.#byId.get(first) ?? null)
          : this.#firstEnabled(this.#entries);
    this.#selected = active;
    this.#selection = new Set(active ? [active] : []);
    this.#render();
  }

  /** Creates a layer's entry, handle, history tracking and panel; does not place it. */
  #create(params: LayerParams<S, D, T>, id: string): Entry<S, D, T> {
    const type = params.type !== undefined ? this.#type(params.type) : undefined;
    const api = new LayerApi<S, D, T>(this.#host, id, params.type ?? null);
    const states: Record<string, boolean> = {};
    for (const state of this.#states)
      states[state.key] =
        (params.states as Record<string, boolean> | undefined)?.[state.key] ??
        (type?.states as Record<string, boolean> | undefined)?.[state.key] ??
        state.default;
    const entry: Entry<S, D, T> = {
      id,
      type: params.type ?? null,
      name: params.name ?? type?.title ?? id,
      icon: params.icon ?? type?.icon,
      states,
      flags: {
        ...(params.reorder !== undefined ? { reorder: params.reorder } : {}),
        ...(params.rename !== undefined ? { rename: params.rename } : {}),
        ...(params.remove !== undefined ? { remove: params.remove } : {}),
      },
      api,
      page: null,
      panel: null,
      untrack: [],
      finish: new Map(),
    };
    this.#byId.set(id, entry);
    this.#byApi.set(api, entry);
    this.#track(entry);
    api.data = (params.data !== undefined ? params.data : type?.data?.(api)) as D;
    const controls = params.controls ?? type?.controls;
    if (controls) {
      const page = document.createElement(TweakTabPage.tagName) as TweakTabPage;
      page.hidden = true;
      this.element.panels.append(page);
      entry.page = page;
      entry.panel = new TabPageApi(this.#context, page, [...this.#path, id]);
      controls(entry.panel, api);
    }
    return entry;
  }

  /** Records the layer's name and states in the history, under the stack's path and its id. */
  #track(entry: Entry<S, D, T>): void {
    const history = this.#context.history;
    if (!history) return;
    const segments = [...this.#path, entry.id];
    const finish = (key: string) => (listener: (value: unknown) => void) => {
      let set = entry.finish.get(key);
      if (!set) entry.finish.set(key, (set = new Set()));
      set.add(listener);
      return () => set.delete(listener);
    };
    entry.untrack.push(
      history.track(segments, '@name', {
        descriptor: { type: 'string' },
        read: () => entry.name,
        load: (value) => {
          if (typeof value === 'string' && value.trim()) entry.name = value;
        },
        set: (value) => this.#run('restore', () => this.#rename(entry, String(value))),
        onFinish: finish('@name'),
      }),
    );
    for (const state of this.#states)
      entry.untrack.push(
        history.track(segments, `@${state.key}`, {
          descriptor: { type: 'boolean' },
          read: () => entry.states[state.key],
          load: (value) => {
            entry.states[state.key] = value === true;
          },
          set: (value) =>
            this.#run('restore', () => this.#setState(entry, state.key, value === true)),
          onFinish: finish(`@${state.key}`),
        }),
      );
  }

  /** Places a new layer at `index` and announces it. */
  #addLayer(params: LayerParams<S, D, T>, index: number): Entry<S, D, T> {
    let id = params.id;
    if (id === undefined) {
      const next = nextLayerId(params.type ?? null, this.#counter, new Set(this.#byId.keys()));
      id = next.id;
      this.#counter = next.counter;
    }
    const entry = this.#create(params, id);
    const at = Math.max(0, Math.min(index, this.#entries.length));
    this.#entries.splice(at, 0, entry);
    this.#emit('add', { layer: entry.api });
    this.#structureChanged();
    return entry;
  }

  #makeBar(items: readonly LayersBarItem<S, D, T>[], slot: 'header' | 'footer'): void {
    if (items.length === 0) return;
    const { row } = ContainerApi.inlineRow(
      this.#context,
      this.#path,
      {
        items: items.map((item) =>
          item.type === 'button' || item.type === 'binding'
            ? item
            : { ...item, width: item.width ?? 'auto' },
        ),
      },
      (item, content, add) => {
        switch (item.type) {
          case 'button': {
            const button = item as LayersButtonItem<S, D, T>;
            const params = {
              ...button,
              onClick: (event: MouseEvent) => button.onClick(event, this),
            };
            if (!button.iconOnly) return content.addButton(params);
            // Icon buttons in a bar look like its built-in actions.
            const row = new ButtonRow(this.#context, params, { variant: 'ghost', size: 'icon-sm' });
            add(row, row.metadata);
            return row;
          }
          case 'menu': {
            const menu = item as LayersMenuItem<S, D, T>;
            const row = new MenuRow(this.#context, {
              title: menu.title,
              icon: menu.icon,
              iconOnly: menu.iconOnly,
              name: menu.name,
              entries: () => (typeof menu.items === 'function' ? menu.items(this) : menu.items),
              onSelect: (value) => menu.onSelect(value, this),
            });
            add(row, row.metadata);
            return row;
          }
          case 'add':
            return this.#addAction(item as LayersAddItem, add);
          case 'remove':
            return this.#removeAction(item as LayersRemoveItem, add);
          default:
            return undefined;
        }
      },
    );
    const chunk = new Chunk();
    this.element.setBar(slot, chunk.element);
    chunk.add(row, row.metadata);
    this.#context.observe(chunk);
    this.#bars.push({ row, chunk });
  }

  #addAction(
    item: LayersAddItem,
    add: (row: InlineRow | ButtonRow | MenuRow, metadata: ButtonRow['metadata']) => void,
  ): { readonly element: HTMLElement } {
    const title = item.title ?? 'Add layer';
    const icon = item.icon ?? plusIcon;
    const types = Object.entries(
      (this.#params.types ?? {}) as Record<string, LayerTypeParams<S, D, T>>,
    ).filter(([, type]) => type.menu !== false);
    const allowed = (type: string) => this.#params.allow?.add?.(type as T, this) !== false;
    const addType = (type: string) => {
      if (this.#disabled || !allowed(type)) return;
      this.#run('user', () => {
        const at = this.#selected ? this.#entries.indexOf(this.#selected) : 0;
        const entry = this.#addLayer({ type: type as T }, at);
        this.#select(entry);
      });
    };
    if (types.length === 1) {
      const [type] = types[0]!;
      const row = new ButtonRow(
        this.#context,
        { title, icon, iconOnly: true, onClick: () => addType(type) },
        { variant: 'ghost', size: 'icon-sm' },
      );
      this.#barRefresh.push(() => row.setDisabled(!allowed(type)));
      add(row, row.metadata);
      return row;
    }
    const row = new MenuRow(this.#context, {
      title,
      icon,
      iconOnly: true,
      entries: () =>
        types.map(([key, type]) => ({
          value: key,
          label: type.title,
          ...(type.icon ? { icon: type.icon } : {}),
          disabled: !allowed(key),
        })),
      onSelect: addType,
    });
    this.#barRefresh.push(() => row.refresh());
    add(row, row.metadata);
    return row;
  }

  #removeAction(
    item: LayersRemoveItem,
    add: (row: ButtonRow, metadata: ButtonRow['metadata']) => void,
  ): { readonly element: HTMLElement } {
    const removable = () => this.#selectedEntries().filter((entry) => this.#canRemove(entry));
    const row = new ButtonRow(
      this.#context,
      {
        title: item.title ?? 'Remove layer',
        icon: item.icon ?? trashIcon,
        iconOnly: true,
        onClick: () => {
          const targets = removable();
          if (targets.length && !this.#disabled)
            this.#run('user', () => this.#removeEntries(targets));
        },
      },
      { variant: 'ghost', size: 'icon-sm' },
    );
    this.#barRefresh.push(() => row.setDisabled(removable().length === 0));
    add(row, row.metadata);
    return row;
  }

  // --- Changes --------------------------------------------------------------------------------

  /**
   * Runs one change: events are held until it ends, then fire in order and `change` once after
   * them; the widget renders once.
   */
  #run(source: LayersSource, change: () => void): void {
    if (this.#batch) {
      change();
      return;
    }
    const batch = { source, events: [] as [keyof LayersEvents, unknown][] };
    this.#batch = batch;
    try {
      change();
    } finally {
      this.#batch = null;
      this.#render();
    }
    if (batch.events.length === 0) return;
    for (const [type, event] of batch.events)
      this.#dispatch(type, { ...(event as object), source });
    this.#dispatch('change', { layers: this.layers, source });
  }

  #emit<E extends Exclude<keyof LayersEvents, 'change'>>(
    type: E,
    event: Omit<LayersEvents<S, D, T>[E], 'source'>,
  ): void {
    this.#batch?.events.push([type, event]);
  }

  #dispatch(type: keyof LayersEvents, event: unknown): void {
    const set = this.#listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) (listener as (event: unknown) => void)(event);
  }

  #selectedEntries(): Entry<S, D, T>[] {
    return this.#entries.filter((entry) => this.#selection.has(entry));
  }

  #firstEnabled(entries: readonly Entry<S, D, T>[]): Entry<S, D, T> | null {
    return entries.find((entry) => entry.states[ENABLED]) ?? null;
  }

  /**
   * Selects `entries` with `active` among them; without an active one, the top selected layer is
   * active. Fires `select` when either changes.
   */
  #setSelection(entries: readonly Entry<S, D, T>[], active: Entry<S, D, T> | null): void {
    const selection = new Set(entries);
    if (active) selection.add(active);
    const next = active ?? this.#entries.find((entry) => selection.has(entry)) ?? null;
    const previous = this.#selected;
    const same =
      selection.size === this.#selection.size &&
      [...selection].every((entry) => this.#selection.has(entry));
    if (next === previous && same) return;
    this.#selected = next;
    this.#selection = selection;
    this.#emit('select', {
      layer: next?.api ?? null,
      previous: previous?.api ?? null,
      selection: this.selection,
    });
  }

  #select(entry: Entry<S, D, T> | null): void {
    this.#setSelection(entry ? [entry] : [], entry);
  }

  #rename(entry: Entry<S, D, T>, name: string): void {
    if (name === entry.name) return;
    const previous = entry.name;
    entry.name = name;
    this.#stale = true;
    this.#emit('rename', { layer: entry.api, name, previous });
    this.#finish(entry, '@name', name);
    this.#context.refreshSearch?.();
  }

  #setState(entry: Entry<S, D, T>, key: string, value: boolean): void {
    if (!(key in entry.states)) throw new RangeError(`devkit: no layer state ${key}`);
    if (entry.states[key] === value) return;
    entry.states[key] = value;
    this.#stale = true;
    this.#emit('state', { layer: entry.api, key: key as 'enabled' | S, value });
    this.#finish(entry, `@${key}`, value);
  }

  #move(entry: Entry<S, D, T>, index: number): void {
    const from = this.#entries.indexOf(entry);
    const to = Math.max(0, Math.min(index, this.#entries.length - 1));
    if (from === to || from === -1) return;
    const order = this.#entries.slice();
    order.splice(from, 1);
    order.splice(to, 0, entry);
    this.#reorder(order, [entry]);
  }

  /** Puts the stack in `order`, announcing each of `moving` that changed place. */
  #reorder(order: Entry<S, D, T>[], moving: readonly Entry<S, D, T>[]): void {
    const from = new Map(this.#entries.map((entry, index) => [entry, index]));
    this.#entries = order;
    this.#stale = true;
    let moved = false;
    for (const entry of moving) {
      const to = order.indexOf(entry);
      if (from.get(entry) === to) continue;
      moved = true;
      this.#emit('reorder', { layer: entry.api, from: from.get(entry)!, to });
    }
    if (moved) this.#structureChanged();
  }

  /**
   * Removes layers. When the active layer goes, the nearest layer below it (or above, at the
   * bottom) that stays takes its place, unless other selected layers stay.
   */
  #removeEntries(targets: readonly Entry<S, D, T>[]): void {
    const removing = new Set(targets);
    if (removing.size === 0) return;
    const before = this.#entries.slice();
    const kept = this.#selectedEntries().filter((entry) => !removing.has(entry));
    let active = this.#selected && !removing.has(this.#selected) ? this.#selected : null;
    if (!active && kept.length === 0 && this.#selected) {
      const at = before.indexOf(this.#selected);
      const staying = (entry: Entry<S, D, T>) => !removing.has(entry) && entry.states[ENABLED];
      active =
        before.slice(at).find(staying) ?? before.slice(0, at).reverse().find(staying) ?? null;
    }
    for (const entry of before) if (removing.has(entry)) this.#remove(entry);
    this.#setSelection(kept.length ? kept : active ? [active] : [], active);
    this.#context.refreshSearch?.();
  }

  /** Takes one layer out of the stack and destroys it; the selection is the caller's. */
  #remove(entry: Entry<S, D, T>): void {
    const index = this.#entries.indexOf(entry);
    if (index === -1) return;
    this.#entries.splice(index, 1);
    this.#stale = true;
    this.#destroy(entry);
    this.#emit('remove', { layer: entry.api, index });
    this.#structureChanged();
  }

  #destroy(entry: Entry<S, D, T>): void {
    for (const untrack of entry.untrack) untrack();
    entry.untrack.length = 0;
    entry.panel?.dispose();
    entry.page?.remove();
    this.#byId.delete(entry.id);
    this.#byApi.delete(entry.api);
  }

  /** Makes the stack match a stored structure, for a history restore. */
  #apply(structure: Structure): void {
    this.#counter = Math.max(this.#counter, structure.n);
    const declared = this.#params.layers ?? [];
    const plan = startingStack(this.#declaredIds, structure, (type) => !!this.#type(type));
    const wanted = new Set(plan.map((entry) => entry.id));
    for (const entry of [...this.#entries]) if (!wanted.has(entry.id)) this.#remove(entry);
    plan.forEach((planned, index) => {
      const existing = this.#byId.get(planned.id);
      if (existing) {
        this.#move(existing, index);
        return;
      }
      const params: LayerParams<S, D, T> =
        planned.declared === -1 ? { type: planned.type as T } : declared[planned.declared]!;
      const entry = this.#create(params, planned.id);
      this.#entries.splice(Math.min(index, this.#entries.length), 0, entry);
      this.#stale = true;
      this.#emit('add', { layer: entry.api });
    });
    const kept = this.#selectedEntries();
    const active = this.#selected && this.#byApi.has(this.#selected.api) ? this.#selected : null;
    if (active) this.#setSelection(kept, active);
    else this.#select(this.#firstEnabled(this.#entries));
  }

  #encode(): string {
    return encodeStructure({
      l: this.#entries.map((entry) => [entry.id, entry.type]),
      d: this.#declaredIds,
      n: this.#counter,
    });
  }

  #structureChanged(): void {
    if (this.#structureListeners.size === 0) return;
    const value = this.#encode();
    for (const listener of [...this.#structureListeners]) listener(value);
  }

  #finish(entry: Entry<S, D, T>, key: string, value: unknown): void {
    const set = entry.finish.get(key);
    if (set) for (const listener of [...set]) listener(value);
  }

  // --- User actions ---------------------------------------------------------------------------

  #canReorder(entry: Entry<S, D, T>): boolean {
    return entry.flags.reorder ?? this.#params.reorder !== false;
  }

  #canRename(entry: Entry<S, D, T>): boolean {
    return entry.flags.rename ?? this.#params.rename ?? false;
  }

  #canRemove(entry: Entry<S, D, T>): boolean {
    return (
      entry.states[ENABLED] === true &&
      (entry.flags.remove ?? this.#params.remove ?? false) &&
      this.#params.allow?.remove?.(entry.api, this) !== false
    );
  }

  /** The widget asks before it offers a place: no groups, and the stack's rules. */
  #canDrop(move: LayersMove): boolean {
    const entry = this.#byId.get(move.itemId);
    if (!entry || move.toParentId !== null || !this.#canReorder(entry)) return false;
    return this.#params.allow?.move?.(entry.api, move.toIndex, this) !== false;
  }

  /*
   * The widget proposes each change the user makes, as one or more events: the records, the
   * selection and the active layer. The stack refuses every proposal and makes the change itself,
   * under its rules, once they have all arrived; then it gives the widget its new state.
   */

  #proposed(): Proposal {
    if (!this.#proposal) {
      this.#proposal = {};
      queueMicrotask(() => this.#applyProposal());
    }
    return this.#proposal;
  }

  #own(event: Event): boolean {
    // Controls in the bars are the widget's children: their own proposals pass through it.
    if (event.target !== this.element.layers || this.#disposed) return false;
    event.preventDefault();
    return true;
  }

  #onLayersProposal = (event: Event): void => {
    if (!this.#own(event)) return;
    const { detail } = event as CustomEvent<{
      value: readonly Layer[];
      reason: string;
      metadata: { change: LayersChange };
    }>;
    this.#proposed().change = {
      change: detail.metadata.change,
      order: detail.value.map((layer) => layer.id),
      keyboard: detail.reason === 'keyboard',
    };
  };

  #onValueProposal = (event: Event): void => {
    if (!this.#own(event)) return;
    this.#proposed().value = (event as CustomEvent<{ value: readonly string[] }>).detail.value;
  };

  #onActiveProposal = (event: Event): void => {
    if (!this.#own(event)) return;
    this.#proposed().active = (event as CustomEvent<{ value: string | null }>).detail.value;
  };

  #applyProposal(): void {
    const proposal = this.#proposal;
    this.#proposal = null;
    if (!proposal || this.#disposed || this.#disabled) {
      this.#render();
      return;
    }
    const { change } = proposal;
    let refocus = false;
    this.#run('user', () => {
      if (change) {
        this.#userChange(change.change, change.order);
        // A removal moves the selection itself; a press that also selects goes on below.
        if (change.change.action === 'remove') {
          refocus = change.keyboard;
          return;
        }
      }
      if (proposal.value === undefined && proposal.active === undefined) return;
      const entries = (proposal.value ?? this.#selectedEntries().map((entry) => entry.id))
        .map((id) => this.#byId.get(id))
        .filter((entry): entry is Entry<S, D, T> => entry !== undefined);
      const active =
        proposal.active === undefined
          ? this.#selected
          : proposal.active === null
            ? null
            : (this.#byId.get(proposal.active) ?? null);
      this.#setSelection(
        entries,
        active && entries.includes(active) ? active : (entries[0] ?? null),
      );
    });
    // The removed row had focus: it goes to the layer that took its place.
    const target = this.#selected;
    if (refocus && target) {
      const widget = this.element.layers;
      void widget.updateComplete.then(() => widget.focusLayer(target.id));
    }
  }

  #userChange(change: LayersChange, order: readonly string[]): void {
    switch (change.action) {
      case 'move': {
        const next = order.map((id) => this.#byId.get(id));
        if (next.length !== this.#entries.length || next.some((entry) => !entry)) return;
        const entries = next as Entry<S, D, T>[];
        const moving = change.ids
          .map((id) => this.#byId.get(id))
          .filter((entry): entry is Entry<S, D, T> => entry !== undefined);
        const refused = moving.some(
          (entry) =>
            !this.#canReorder(entry) ||
            this.#params.allow?.move?.(entry.api, entries.indexOf(entry), this) === false,
        );
        if (!refused) this.#reorder(entries, moving);
        return;
      }
      case 'rename': {
        const entry = this.#byId.get(change.id);
        if (!entry || !this.#canRename(entry)) return;
        const rule = this.#params.allow?.rename?.(entry.api, change.label, this);
        if (rule === false) return;
        const name = (typeof rule === 'string' ? rule : change.label).trim();
        if (name) this.#rename(entry, name);
        // A refused or corrected name shows again in the row.
        this.#stale = true;
        return;
      }
      case 'state':
        for (const id of change.ids) {
          const entry = this.#byId.get(id);
          if (entry && change.name in entry.states)
            this.#setState(entry, change.name, change.value === 'true');
        }
        return;
      case 'remove':
        this.#removeEntries(
          change.ids
            .map((id) => this.#byId.get(id))
            .filter((entry): entry is Entry<S, D, T> => !!entry && this.#canRemove(entry)),
        );
        return;
      default:
        // Adding, duplicating and grouping go through the stack's own API.
        return;
    }
  }

  // --- Rendering ------------------------------------------------------------------------------

  #record(entry: Entry<S, D, T>): Layer {
    return {
      id: entry.id,
      label: entry.name,
      ...(entry.icon ? { icon: entry.icon } : {}),
      states: this.#states.map((state): LayerState => ({
        name: state.key,
        label: state.label,
        value: entry.states[state.key] ? 'true' : 'false',
        values: state.values,
        scope: state.scope,
      })),
      canRename: this.#canRename(entry),
      canRemove: this.#canRemove(entry),
    };
  }

  #render(): void {
    if (this.#batch || this.#disposed) return;
    const widget = this.element.layers;
    // The records change only with the layers; a new selection keeps them.
    if (this.#stale || widget.layers.length !== this.#entries.length) {
      this.#stale = false;
      widget.layers = this.#entries.map((entry) => this.#record(entry));
    }
    widget.value = this.#selectedEntries().map((entry) => entry.id);
    widget.active = this.#selected?.id ?? null;
    for (const entry of this.#entries) if (entry.page) entry.page.hidden = entry !== this.#selected;
    this.element.panels.hidden = !this.#selected?.page;
    for (const refresh of this.#barRefresh) refresh();
  }

  #syncHidden(): void {
    this.element.hidden = this.#hidden || this.#filtered;
    for (const { row } of this.#bars) row.setParentHidden(this.#hidden || this.#filtered);
  }

  #makeHost(): LayerHost {
    const entry = (layer: LayerApi<string, unknown, string>) => {
      const found = this.#byApi.get(layer as unknown as LayerApi<S, D, T>);
      if (!found) throw new RangeError(`devkit: layer ${layer.id} was removed`);
      return found;
    };
    return {
      entry: (layer) => entry(layer) as unknown as Entry<string, unknown, string>,
      index: (layer) =>
        this.#entries.findIndex((candidate) => (candidate.api as unknown) === layer),
      selected: () => (this.#selected?.api ?? null) as LayerApi<string, unknown, string> | null,
      select: (layer) =>
        this.#run('api', () =>
          this.#select(layer ? (entry(layer) as unknown as Entry<S, D, T>) : null),
        ),
      rename: (layer, name) => {
        if (!name.trim()) throw new RangeError('devkit: a layer name cannot be empty');
        this.#run('api', () => this.#rename(entry(layer) as unknown as Entry<S, D, T>, name));
      },
      setIcon: (layer, icon) => {
        entry(layer).icon = icon;
        this.#stale = true;
        this.#render();
      },
      setState: (layer, key, value) =>
        this.#run('api', () =>
          this.#setState(entry(layer) as unknown as Entry<S, D, T>, key, value),
        ),
      remove: (layer) => {
        const found = this.#byApi.get(layer as unknown as LayerApi<S, D, T>);
        if (found) this.#run('api', () => this.#removeEntries([found]));
      },
    };
  }
}
