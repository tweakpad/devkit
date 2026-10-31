# Inline controls: a `.value` update re-runs presentation work and rewrites unchanged attributes

**Affects:** `tp-slider`, `tp-input` (text and number), `tp-select`, `tp-checkbox`, `tp-switch`,
`tp-color-input`, in `variant="inline"`. The code paths involved are shared by every
`TpElement`/`TpFormElement`.

## Summary

Every update of an inline control re-runs work that does not depend on its value. This includes
updates where only `.value` or `.checked` changed, which is what a tweak panel does at frame rate:

1. **`PresentationController.refresh()` runs after every update.** It re-resolves the recipe,
   re-serializes all recipe CSS and runs `querySelectorAll` for every part binding. It also
   re-adds `part` tokens, re-sets `data-tp-presentation-owner` and re-applies hooks.
   - It accounts for **26–76 %** of the synchronous update time (more than 100 % for `tp-select`,
     where it also runs outside the measured window).
   - It makes **3–52 `querySelectorAll` calls** per update.
   - Its output did not change once in any value-only update measured (safety check below).
2. **Updates rewrite attributes with the values they already have.** Per value change,
   **13–62 DOM mutation records** are produced, and **66–100 %** of them set an attribute to
   its existing value. Every one is delivered to the library's own MutationObservers.

Two runtime patches show the cost is avoidable. Both are applied to the library's prototypes;
the library source is not modified. Measured per value-only update:

- Skipping `refresh()` when no presentation input changed cuts the synchronous update cost by
  **14–49 %**.
- Making the writes idempotent removes **61–100 %** of the mutation records.
- Together they halve frame work for `tp-select` with 30 updates per frame (28.0 → 13.2 ms).
- A safety check found **0 differences** across all controllers.

## Environment

|         |                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------- |
| Library | `@tweakpad/ui` `development` (dist built from the tree at `3eeb6b4`; component sources identical) |
| Lit     | 3.3.3, **production build** (no dev-mode warnings)                                                |
| Browser | Chrome 156, macOS, Apple M1, DPR 2                                                                |
| Setup   | 40 controls, `variant="inline"`, `dir="ltr"`, controlled value, inside one shadow root            |

## Reproduce

The harness is `demo/library-proof.html` / `demo/library-proof.ts` in
[tweakpad/devkit](https://github.com/tweakpad/devkit). It is not pushed yet; it will be
available there with the project's initial commit.

```sh
npm install                      # links ../library as @tweakpad/ui (build the library first)
NODE_ENV=production npx vite --port 5275
# open http://localhost:5275/demo/library-proof.html, press Run
# or in the console: await runProof(['slider']); await countOnly('select', 'baseline')
```

The harness runs two measurements:

- **Counters.** 20 single value changes per control. Each is a real change: booleans are
  flipped. Every follow-up microtask is waited for. The counters are deterministic.
- **Timing.** 30 of the 40 controls change per frame, flushed with `performUpdate()`. The four
  variants are interleaved over 5 rounds of 45 frames, and medians are reported.
  - "µs/update" is the synchronous update time.
  - "Frame work" runs from the rAF timestamp to the first task after rendering, so it includes
    style, layout and paint.

### Variants

| Variant      | What it does                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseline`   | The library as is.                                                                                                                                                                                        |
| `idempotent` | Inside `refresh()` only: `DOMTokenList.add` skips tokens already present, and `setAttribute` skips values already set.                                                                                    |
| `skip`       | `idempotent`, plus `hostUpdated()` skips `refresh()` when the update changed no presentation input: no axis of the element's family or member families, and not `partPresentation` / `presentationOwner`. |
| `quiet`      | `skip`, plus the same guards on `setAttribute`, `toggleAttribute`, `removeAttribute` and `classList` for the whole Lit update cycle (`performUpdate`).                                                    |

**Safety check.** After the `skip` and `quiet` runs, and again after all timing rounds, the
original `refresh()` is run on every controller that was skipped. The check records each
element's adopted sheets plus its `part`, `data-tp-presentation-part` and
`data-tp-presentation-owner` attributes before and after. Any difference means skipping lost
something.

## Results

**Counters per value change** (baseline unless noted):

| Control        | Lit updates | `refresh()` calls | `querySelectorAll` (base → skip) | Mutation records (base → quiet) | of which no-op (base) |
| -------------- | ----------- | ----------------- | -------------------------------- | ------------------------------- | --------------------- |
| slider         | 1.9         | 1.9               | 11.4 → 1.9                       | 61.8 → 12.4                     | 49.4                  |
| input (number) | 1           | 1                 | 7 → 1                            | 18.7 → 0.7                      | 18                    |
| input (text)   | 1           | 1                 | 7 → 1                            | 13 → 0                          | 13                    |
| select         | 2.3         | 2.3               | 51.8 → 0                         | 59.3 → 0.8                      | 58.5                  |
| checkbox       | 2.5         | 3                 | 5.8 → 1.6                        | 39.5 → 15.5                     | 26                    |
| switch         | 1           | 1                 | 3 → 0                            | 29 → 10                         | 20                    |
| color input    | 2           | 2                 | 13 → 1                           | 61 → 3                          | 59                    |

**Timing**, as medians. µs is per update; frame work is for 30 updates per frame.

| Control        | µs/update base → skip → quiet | Frame work avg (ms) base → skip → quiet | Frame work p95 (ms) base → quiet | `refresh()` share of sync time |
| -------------- | ----------------------------- | --------------------------------------- | -------------------------------- | ------------------------------ |
| slider         | 157 → 104 → 96                | 14.8 → 12.0 → 12.5                      | 22.3 → 15.1                      | 72 %                           |
| input (number) | 168 → 120 → 114               | 9.6 → 10.7 → 7.9                        | 11.8 → 12.4                      | 34 %                           |
| input (text)   | 99 → 54 → 50                  | 5.4 → 4.1 → 3.8                         | 5.9 → 4.2                        | 54 %                           |
| select         | 154 → 78 → 79                 | **28.0 → 13.7 → 13.2**                  | 37.1 → 16.9                      | 100 %+ (\*)                    |
| checkbox       | 94 → 81 → 77                  | 20.1 → 17.7 → 17.1                      | 28.5 → 25.0                      | 76 %                           |
| switch         | 104 → 80 → 77                 | 11.1 → 9.2 → 9.4                        | 14.1 → 10.7                      | 26 %                           |
| color input    | 136 → 98 → 98                 | 17.6 → 15.5 → 14.6                      | 26.3 → 23.6                      | 58 %                           |

(\*) For `tp-select`, `refresh()` time exceeds the synchronous update time. It runs about 2.3
times per change; the extra runs happen outside the measured window, from the deferred update
described below.

**Safety:** 0 differences for every control. Checked: slider 80, input number 200, input text
40, select 80, checkbox 60, switch 80, color 80 controllers, both after the counter run and
after all timing rounds.

**Reading the numbers:**

- The synchronous cost and the counters are stable from run to run.
- Frame work includes painting the 30 changed controls, so it has a floor that no fix removes.
  It also varies more between runs.
- The `skip` effect on frame work is clear for select, slider p95, input (text) and switch.
- For input (number), the frame-work difference is within noise.

## Where the cost comes from

### 1. `refresh()` on every update (`src/presentation/controller.ts`)

`hostUpdated()` calls `refresh()` unconditionally. For a value-only update, each run does the
following, and none of its inputs changed:

- Calls `resolveComponentPresentation()` for the family and each member family, then merges
  parts and re-serializes every rule into a CSS string. `GeneratedStyleResource.setText()` then
  finds the text unchanged; the work was already spent.
- Runs `this.host.renderRoot.querySelectorAll(selector)` for every binding selector, and calls
  `element.part.add(part)` on each match plus `this.host.part.add(part)`.
  `DOMTokenList.add` runs the update steps even when the token is present, so each call re-sets
  `part` and queues a mutation record.
- Sets `this.host.setAttribute('data-tp-presentation-owner', this.#id)` each time.
- Calls `#applyHooks()` → `#restoreHooks()`, which undoes and re-applies all hook classes and
  styles.

### 2. Rewrites of unchanged attributes during the update

These are the attributes recorded as no-op writes on value changes, after `refresh()`'s own
writes were removed (`skip` vs `quiet`):

| Source                                                                                   | Writes                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TpElement.updated()` (`src/foundation/element.ts:181`)                                  | `setAttribute('data-orientation', …)` on every update                                                                                                                     |
| `applyMarkers()` (`src/foundation/state-markers.ts:84`)                                  | Always calls `setAttribute` for present markers (`data-dirty`, `data-valid`, `data-index`, …). Used by slider and slider thumb (`slider.ts:1335`, `slider-thumb.ts:225`). |
| `TpFormElement.updated()` → `#syncFieldAssociation()` (`src/foundation/form-element.ts`) | Restores, then re-applies `aria-label` / `aria-describedby` / … on the inner control on every update                                                                      |
| Slider and thumb templates / `#syncThumbs`                                               | `role`, `id`, `for`, `aria-*`, `tabindex`, `type` on each update                                                                                                          |

`toggleAttribute(name, force)` is already a no-op by spec when the state does not change, so it
does not contribute.

Apart from the DOM work itself, every record is delivered to the library's own observers:

- the slider's subtree MutationObserver;
- the `ComposedEnvironmentObserver` on ancestors;
- the checkbox root-node observer.

### 3. Extra updates per change (for information)

- `tp-slider`: 1.9 Lit updates per change, because `#syncThumbs` requests a second update of
  `tp-slider-thumb`.
- `tp-select`: 2.1–2.3, and `tp-checkbox`: 2.4–2.5. In both, the change starts a
  `PresenceController` transition that requests one more update of the same element on the next
  animation frame (`presence.js` `#_` → `requestUpdate()`). Each of those also runs `refresh()`.
- No value change caused an update of another control. This was checked by tracing every bare
  `requestUpdate()` aimed at an untouched control: there were none.

## Proposed fixes

1. **Run `refresh()` only when its inputs change.** The inputs are:
   - the family's and member families' axis values;
   - the document dictionary (already handled by `setPresentationDictionary`);
   - `partPresentation` and compositions (already routed through `requestRefresh()`);
   - registered parts (already routed through `#scheduleRefresh()`);
   - the rendered part structure.

   A cheap version: in `hostUpdated()`, refresh only if `changedProperties` contains an axis
   name, `partPresentation` or `presentationOwner`, or if render changed part-bearing structure.
   Better still, give binding-selector parts a static `part` in the templates, so no
   post-render `querySelectorAll` pass is needed.

   This is the `skip` variant above, which saved 14–49 % of the synchronous update cost with 0
   safety differences.

2. **Memoize the recipe CSS** by axis signature and dictionary identity, so a refresh that does
   run does not re-resolve or re-serialize unchanged recipes.
3. **Make DOM writes idempotent:**
   - `part.add` only when `!part.contains(token)`;
   - `setAttribute` for the owner, markers (`applyMarkers`), `data-orientation` and the field
     association only when the value differs.

   This is the `quiet` variant: 61–100 % fewer mutation records per update.

4. Optional: for `tp-select` and `tp-checkbox`, skip starting a presence transition when the
   presented state did not change. For the slider, update the thumb in the same cycle instead
   of requesting a second update.

## Caveats

- The patches are proofs of effect, not implementations. In particular, the `skip` rule is a
  heuristic that the safety check validates only for value-only updates of these six controls.
- The measurements are from one machine and one browser.
- Frame-work medians move by about ±15 % between runs. Counters and µs/update are stable.
