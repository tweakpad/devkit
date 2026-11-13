import { html, nothing, type TemplateResult } from 'lit';
import type { IconDefinition } from '@tweakpad/ui';
import { plusIcon } from '@tweakpad/ui/icons/plus';
import { trashIcon } from '@tweakpad/ui/icons/trash';
import type { SearchControlNode, SearchGroupNode, SearchNode } from '../core/search.js';
import {
  LAYER_ACTION,
  TweakLayerRow,
  TweakLayers,
  type LayerAction,
  type LayerStateView,
} from '../elements/layers.js';
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
  /** Accessible name and tooltip of the toggle. */
  label: string;
  /**
   * Icon of the state's toggle in each row while on. Without one the row shows no toggle for
   * the state, which code and bar actions still change.
   */
  icon?: IconDefinition;
  /** Icon of the toggle while off, in place of `icon`. */
  offIcon?: IconDefinition;
  /**
   * Value of the state for layers that do not set it.
   * @default false
   */
  default?: boolean;
  /**
   * When the toggle shows: always, or only while the state is on or off. A toggle shown only
   * sometimes keeps its place, and shows while the pointer is over the row's toggles.
   * @default 'always'
   */
  display?: 'always' | 'on' | 'off';
  /**
   * Shows the layer's name dimmed while the state is off, as `enabled` does.
   * @default false
   */
  mutes?: boolean;
}

/**
 * How the `enabled` state shows in each row. It is on by default and dims its row when off; with
 * no `icon` the row shows no toggle for it.
 */
export interface LayerEnabledParams {
  /**
   * Accessible name and tooltip of the toggle.
   * @default 'Enabled'
   */
  label?: string;
  /** Icon of the toggle while enabled; without one the row shows no toggle for `enabled`. */
  icon?: IconDefinition;
  /** Icon of the toggle while disabled, in place of `icon`. */
  offIcon?: IconDefinition;
  /**
   * When the toggle shows: always, or only while the layer is enabled or disabled.
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
  /** Starting values of the states; the rest take the type's, then the stack's defaults. */
  states?: Partial<Record<'enabled' | NoInfer<S>, boolean>>;
  /**
   * Shows the layer dimmed: it cannot be selected, dragged, renamed or toggled.
   * @default false
   */
  disabled?: boolean;
  /** Whether the user may drag this layer, in place of the stack's `reorder`. */
  reorder?: boolean;
  /** Whether the user may rename this layer, in place of the stack's `rename`. */
  rename?: boolean;
  /** Whether the user may remove this layer, in place of the stack's `remove`. */
  remove?: boolean;
  /**
   * Builds the layer's panel, shown while it is selected: add controls to `panel` as to the
   * pane. It runs once, when the layer is created. Without it, and without the type's, the layer
   * has no panel.
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
  /** Whether the user may drop `layer` at index `to`; a refused drop goes back. */
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

/** The built-in remove action: removes the selected layer, when the user may. */
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
  /** The states every layer has besides `enabled`, toggled in each row in this order. */
  states?: readonly LayerStateParams<S>[];
  /** How the always-present `enabled` state shows. */
  enabled?: LayerEnabledParams;
  /**
   * How the user reorders layers: dragging the whole row (`true` or `'item'`), only its grip
   * (`'handle'`), or not at all. The grip also moves a row from the keyboard.
   * @default 'item'
   */
  reorder?: boolean | 'item' | 'handle';
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
  /** Id of the layer selected first, or null for none; defaults to the top layer. */
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
  /** The selection changed; `layer` is null when nothing is selected. */
  select: {
    layer: LayerApi<S, D, T> | null;
    previous: LayerApi<S, D, T> | null;
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
  disabled: boolean;
  readonly flags: { reorder?: boolean; rename?: boolean; remove?: boolean };
  readonly api: LayerApi<S, D, T>;
  page: TweakTabPage | null;
  panel: TabPageApi | null;
  readonly untrack: (() => void)[];
  readonly finish: Map<string, Set<(value: unknown) => void>>;
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
  setDisabled(layer: LayerApi<string, unknown, string>, disabled: boolean): void;
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

  /** The panel shown while the layer is selected, or null for a layer without controls. */
  get panel(): ContainerApi | null {
    return this.#host.entry(this.#self).panel;
  }

  /** Whether the layer is the selected one. */
  get selected(): boolean {
    return this.#host.selected() === this.#self;
  }

  /** Selects the layer, firing `select`. */
  select(): void {
    this.#host.select(this.#self);
  }

  /** Whether the layer is dimmed: not selectable, draggable, renameable or toggleable. */
  get disabled(): boolean {
    return this.#host.entry(this.#self).disabled;
  }

  set disabled(disabled: boolean) {
    this.#host.setDisabled(this.#self, disabled);
  }

  /** Removes the layer and its panel, firing `remove`. */
  remove(): void {
    this.#host.remove(this.#self);
  }
}

const ENABLED = 'enabled';

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
  readonly #states: readonly (LayerStateView & { default: boolean; mutes: boolean })[];
  readonly #declaredIds: readonly string[];
  /** Whether any state has an icon, and so a toggle in the rows. */
  readonly #toggles: boolean;
  #entries: Entry<S, D, T>[] = [];
  readonly #byId = new Map<string, Entry<S, D, T>>();
  readonly #byApi = new Map<LayerApi<S, D, T>, Entry<S, D, T>>();
  #selected: Entry<S, D, T> | null = null;
  #renaming: string | null = null;
  #counter = 1;
  #hidden = false;
  #filtered = false;
  #disabled = false;
  #disposed = false;
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
        icon: enabled.icon,
        offIcon: enabled.offIcon,
        display: enabled.display ?? 'always',
        default: true,
        mutes: true,
      },
      ...(params.states ?? []).map((state) => ({
        key: state.key,
        label: state.label,
        icon: state.icon,
        offIcon: state.offIcon,
        display: state.display ?? 'always',
        default: state.default ?? false,
        mutes: state.mutes ?? false,
      })),
    ];
    this.#toggles = this.#states.some((state) => state.icon !== undefined);
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
    element.activation = this.#activation();
    this.#configureList();
    element.addEventListener(LAYER_ACTION, this.#onAction);

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
    this.#makeBar(params.header ?? [], element.header);
    this.#makeBar(params.footer ?? [], element.footer);
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

  /** The selected layer, or null. Set it to a layer, its id or null; it fires `select`. */
  get selected(): LayerApi<S, D, T> | null {
    return this.#selected?.api ?? null;
  }

  set selected(layer: LayerApi<S, D, T> | string | null) {
    const entry =
      layer === null
        ? null
        : typeof layer === 'string'
          ? this.#byId.get(layer)
          : this.#byApi.get(layer);
    if (entry === undefined) throw new RangeError(`devkit: no layer ${String(layer)}`);
    this.#run('api', () => this.#select(entry));
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
    const entry = typeof layer === 'string' ? this.#byId.get(layer) : this.#byApi.get(layer);
    if (!entry) throw new RangeError(`devkit: no layer ${String(layer)}`);
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
    this.element.list.disabled = disabled;
    for (const { row } of this.#bars) row.setParentDisabled(disabled);
    this.#render();
  }

  /**
   * Listens for changes to the stack. Returns a function that removes the listener. Each event
   * says whether the user, the API or a history restore caused it.
   * @event select - The selection changed, with `{ layer, previous, source }`.
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
    this.element.removeEventListener(LAYER_ACTION, this.#onAction);
    this.element.remove();
    this.#context.refreshSearch?.();
  }

  // --- Building -------------------------------------------------------------------------------

  #type(type: string): LayerTypeParams<S, D, T> | undefined {
    const types = this.#params.types as Record<string, LayerTypeParams<S, D, T>> | undefined;
    return types && Object.hasOwn(types, type) ? types[type] : undefined;
  }

  #activation(): 'item' | 'handle' | 'none' {
    const { reorder } = this.#params;
    return reorder === false ? 'none' : reorder === 'handle' ? 'handle' : 'item';
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
    this.#selected =
      first === null ? null : first !== undefined ? (this.#byId.get(first) ?? null) : null;
    if (first === undefined)
      this.#selected = this.#entries.find((entry) => !entry.disabled) ?? null;
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
      disabled: params.disabled ?? false,
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

  #makeBar(items: readonly LayersBarItem<S, D, T>[], host: HTMLElement): void {
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
    host.append(chunk.element);
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
    const row = new ButtonRow(
      this.#context,
      {
        title: item.title ?? 'Remove layer',
        icon: item.icon ?? trashIcon,
        iconOnly: true,
        onClick: () => {
          const entry = this.#selected;
          if (entry && this.#canRemove(entry)) this.#userRemove(entry);
        },
      },
      { variant: 'ghost', size: 'icon-sm' },
    );
    this.#barRefresh.push(() =>
      row.setDisabled(!this.#selected || !this.#canRemove(this.#selected)),
    );
    add(row, row.metadata);
    return row;
  }

  // --- Changes --------------------------------------------------------------------------------

  /**
   * Runs one change: events are held until it ends, then fire in order and `change` once after
   * them; the list renders once.
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

  #select(entry: Entry<S, D, T> | null): void {
    if (entry === this.#selected) return;
    const previous = this.#selected;
    this.#selected = entry;
    this.#emit('select', { layer: entry?.api ?? null, previous: previous?.api ?? null });
  }

  #rename(entry: Entry<S, D, T>, name: string): void {
    if (name === entry.name) return;
    const previous = entry.name;
    entry.name = name;
    this.#emit('rename', { layer: entry.api, name, previous });
    this.#finish(entry, '@name', name);
    this.#context.refreshSearch?.();
  }

  #setState(entry: Entry<S, D, T>, key: string, value: boolean): void {
    if (!(key in entry.states)) throw new RangeError(`devkit: no layer state ${key}`);
    if (entry.states[key] === value) return;
    entry.states[key] = value;
    this.#emit('state', { layer: entry.api, key: key as 'enabled' | S, value });
    this.#finish(entry, `@${key}`, value);
  }

  #move(entry: Entry<S, D, T>, index: number): void {
    const from = this.#entries.indexOf(entry);
    const to = Math.max(0, Math.min(index, this.#entries.length - 1));
    if (from === to || from === -1) return;
    this.#entries.splice(from, 1);
    this.#entries.splice(to, 0, entry);
    this.#emit('reorder', { layer: entry.api, from, to });
    this.#structureChanged();
  }

  #remove(entry: Entry<S, D, T>): void {
    const index = this.#entries.indexOf(entry);
    if (index === -1) return;
    this.#entries.splice(index, 1);
    if (this.#selected === entry) {
      const next = this.#entries.slice(index).concat(this.#entries.slice(0, index).reverse());
      this.#select(next.find((candidate) => !candidate.disabled) ?? null);
    }
    this.#destroy(entry);
    this.#emit('remove', { layer: entry.api, index });
    this.#structureChanged();
    this.#context.refreshSearch?.();
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
      this.#emit('add', { layer: entry.api });
    });
    if (!this.#selected) this.#select(this.#entries.find((entry) => !entry.disabled) ?? null);
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
    return (
      !entry.disabled &&
      !this.#disabled &&
      this.#renaming !== entry.id &&
      (entry.flags.reorder ?? this.#params.reorder !== false)
    );
  }

  #canRename(entry: Entry<S, D, T>): boolean {
    return (
      !entry.disabled && !this.#disabled && (entry.flags.rename ?? this.#params.rename ?? false)
    );
  }

  #canRemove(entry: Entry<S, D, T>): boolean {
    return (
      !entry.disabled &&
      !this.#disabled &&
      (entry.flags.remove ?? this.#params.remove ?? false) &&
      this.#params.allow?.remove?.(entry.api, this) !== false
    );
  }

  #userRemove(entry: Entry<S, D, T>): void {
    this.#run('user', () => this.#remove(entry));
    if (this.#selected) this.#focus(this.#selected);
  }

  #onAction = (event: Event): void => {
    const detail = (event as CustomEvent<LayerAction & { accepted?: boolean }>).detail;
    const entry = this.#byId.get(detail.id);
    if (!entry || this.#disposed) return;
    event.stopPropagation();
    switch (detail.action) {
      case 'select':
        if (entry.disabled || this.#disabled) return;
        this.#run('user', () => this.#select(entry));
        break;
      case 'step': {
        const enabled = this.#entries.filter((candidate) => !candidate.disabled);
        const next = enabled[enabled.indexOf(entry) + detail.delta];
        if (!next || this.#disabled) return;
        this.#run('user', () => this.#select(next));
        this.#focus(next);
        break;
      }
      case 'rename-start':
        if (!this.#canRename(entry)) return;
        this.#renaming = entry.id;
        this.#render();
        break;
      case 'rename': {
        this.#renaming = null;
        const name = detail.name?.trim();
        if (name) {
          const rule = this.#params.allow?.rename?.(entry.api, name, this);
          if (rule !== false)
            this.#run('user', () => this.#rename(entry, typeof rule === 'string' ? rule : name));
        }
        this.#render();
        if (detail.keyboard) this.#focus(entry);
        break;
      }
      case 'remove':
        if (this.#canRemove(entry)) this.#userRemove(entry);
        break;
      case 'state':
        if (entry.disabled || this.#disabled) return;
        this.#run('user', () => this.#setState(entry, detail.key, detail.value));
        detail.accepted = true;
        break;
    }
  };

  /** A drop proposes the new order: assigning it to the list accepts it, as the list asks. */
  #onProposal = (event: Event): void => {
    const list = this.element.list;
    const proposal = event as CustomEvent<{
      value: readonly Entry<S, D, T>[];
      cancelled?: boolean;
      metadata?: { itemId?: unknown; toIndex?: number };
    }>;
    // Proposals of the rows' own controls reach the list retargeted to it: only its own count.
    if (event.composedPath()[0] !== list || event.defaultPrevented || proposal.detail.cancelled)
      return;
    if (!Array.isArray(proposal.detail.value)) return;
    const order = proposal.detail.value.map((item) => this.#byId.get(item.id));
    if (order.some((entry) => !entry) || order.length !== this.#entries.length) return;
    const itemId = proposal.detail.metadata?.itemId;
    const entry = typeof itemId === 'string' ? this.#byId.get(itemId) : undefined;
    if (!entry) return;
    const to = order.indexOf(entry);
    if (this.#params.allow?.move?.(entry.api, to, this) === false) return;
    const next = order as Entry<S, D, T>[];
    list.value = next;
    this.#run('user', () => this.#move(entry, to));
  };

  #focus(entry: Entry<S, D, T>): void {
    void this.element.list.updateComplete.then(() => {
      for (const row of this.element.list.renderRoot.querySelectorAll<TweakLayerRow>(
        TweakLayerRow.tagName,
      ))
        if (row.layerId === entry.id) void row.updateComplete.then(() => row.focusName());
    });
  }

  // --- Rendering ------------------------------------------------------------------------------

  #configureList(): void {
    const list = this.element.list as unknown as {
      label: string;
      activation: 'item' | 'handle';
      getItemId: (entry: Entry<S, D, T>) => string;
      getItemLabel: (entry: Entry<S, D, T>) => string;
      getItemOptions: (entry: Entry<S, D, T>) => { disabled: { draggable: boolean } };
      isItemSelected: (entry: Entry<S, D, T>) => boolean;
      renderItem: (entry: Entry<S, D, T>) => TemplateResult;
      addEventListener: HTMLElement['addEventListener'];
    };
    list.label = this.#params.title ?? 'Layers';
    list.activation = this.#activation() === 'handle' ? 'handle' : 'item';
    list.getItemId = (entry) => entry.id;
    list.getItemLabel = (entry) => entry.name;
    list.getItemOptions = (entry) => ({ disabled: { draggable: !this.#canReorder(entry) } });
    list.isItemSelected = (entry) => entry === this.#selected;
    list.renderItem = (entry) => this.#row(entry);
    list.addEventListener('tp-value-change', this.#onProposal);
  }

  #row(entry: Entry<S, D, T>): TemplateResult {
    const muted = this.#states.some((state) => state.mutes && !entry.states[state.key]);
    const tabStop = this.#selected ?? this.#entries.find((candidate) => !candidate.disabled);
    return html`<tweak-layer-row
        .layerId=${entry.id}
        .name=${entry.name}
        .icon=${entry.icon}
        .reserveIcon=${this.element.hasIcons}
        .trailing=${this.#toggles}
        .muted=${muted}
        .disabled=${entry.disabled}
        .renaming=${this.#renaming === entry.id}
        .focusable=${entry === tabStop}
      ></tweak-layer-row
      >${
        this.#toggles
          ? html`<tweak-layer-states
              slot="actions"
              .layerId=${entry.id}
              .states=${this.#states}
              .values=${{ ...entry.states }}
              .disabled=${entry.disabled || this.#disabled}
            ></tweak-layer-states>`
          : nothing
      }`;
  }

  #render(): void {
    if (this.#batch || this.#disposed) return;
    const element = this.element;
    element.hasIcons = this.#entries.some((entry) => entry.icon);
    const list = element.list as unknown as { value: readonly Entry<S, D, T>[] };
    list.value = [...this.#entries];
    element.list.requestUpdate();
    for (const entry of this.#entries) if (entry.page) entry.page.hidden = entry !== this.#selected;
    element.panels.hidden = !this.#selected?.page;
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
        this.#render();
      },
      setState: (layer, key, value) =>
        this.#run('api', () =>
          this.#setState(entry(layer) as unknown as Entry<S, D, T>, key, value),
        ),
      setDisabled: (layer, disabled) => {
        entry(layer).disabled = disabled;
        this.#render();
      },
      remove: (layer) => {
        const found = this.#byApi.get(layer as unknown as LayerApi<S, D, T>);
        if (found) this.#run('api', () => this.#remove(found));
      },
    };
  }
}
