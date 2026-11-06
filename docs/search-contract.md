# Search contract

Search operates on a logical ownership tree. Its unit is a complete authored control,
including a control composed of several editors, labels, buttons or visualizations.
The model is defined in `src/core/search.ts`; the visibility boundary is `SearchableRow`
in `src/api/rows.ts`.

## Atomic controls

A `SearchControlNode` registers explicit `SearchMetadata` (`name` and `label`) and one
`SearchTarget`. A query is trimmed and matched case-insensitively as a substring of either
metadata field. Rendered text, live values, canvas contents and descendant elements are
not search metadata. A placeholder and its mounted control have the same identity.

An atomic control contributes exactly one result when its metadata matches and it is
neither explicitly hidden nor disposed. Internal implementation parts never contribute
additional results. Matching one part's authored label retains the complete atomic control.

A composed control with independently searchable fields must instead register a group
containing one atomic node per complete field. Its heading and decorative parts do not count
as results. This distinction is explicit in the node type; search never infers it from DOM shape.

## Visibility ownership

Every atomic control uses `SearchableRow`. Devkit owns its stable outer `.search-item` shell;
the component renderer owns only the surface inside it. The shell encloses **all** of the
control's UI, including its label, editor, value, decorations and visualizations. A component
must not leave visible siblings or externally rendered UI outside that ownership boundary.

`setFiltered(true)` hides that shell as a unit. The shared stylesheet enforces
`.search-item[hidden] { display: none !important; }`. Component layout rules belong to the
inner surface and must never target the shell. Changing a component from flex to grid,
replacing its template, or rendering nested shadow roots cannot override search visibility.
Hidden shells occupy no layout space and expose no focusable descendants in the document.

The independent visibility inputs are:

- `hidden`: authored API state. Search never changes it.
- Filter match: the current query's decision on the atomic owner.
- Viewport visibility: intersection, selected tab, and expanded ancestors govern active work.
- `disposed`: removes the control from eligibility permanently.

`searchVisible` means not explicitly hidden, not filtered, and not disposed. `visible` also
requires viewport visibility. Off-screen, unmounted, inactive-tab and collapsed-folder controls
are still evaluated by search. Renderers receive the combined visibility state for scheduled
work; filtering never edits their internal parts or values.

## Structural groups and navigation

A `SearchGroupNode` recursively sums eligible atomic results. A folder uses
`hideWhenEmpty: 'searching'`: no matching children hides its entire panel during a query.
A layout chunk uses `hideWhenEmpty: 'always'`: it cannot reserve space for excluded rows.
Nested empty groups propagate zero to their parents. Explicitly hidden and disposed controls
cannot keep a parent visible. Clearing the query restores panels according to this policy.

A `SearchScopeNode` recurses without hiding or selecting itself. Pane roots and tab navigation
are scopes, so every tab is searched and tab buttons remain available. Search never changes
the selected tab or folder expansion, including navigation performed while searching.

Group visibility and result counts come from the same traversal, not from `textContent`,
DOM queries, mounted child counts, or computed styles. Disposal clears child registrations;
disposed atomic targets contribute zero. The pane reapplies an active query when controls
are added, removed or explicitly hidden.

## Adding a composed control

1. Decide whether it is one atomic control or a group of independent fields.
2. Supply explicit metadata for each atomic field, even before it mounts.
3. Put each complete field surface inside a `SearchableRow` shell. Keep component CSS inside it.
4. Register those nodes in the containing chunk/group; use eligible descendant counts to hide panels.
5. Preserve authored hidden state, selection and expansion. Dispose targets with their controls.
6. Verify matches, nonmatches, clear, explicit hiding, disposal and nested empty-group propagation.

`npm test` runs the model contract tests in `src/core/search.test.ts`. The browser regression
at `/demo/search-contract.html` checks that composed surfaces with strong display rules and
nested shadow content disappear completely while an unrelated matching sibling stays visible.
This fixture is independent of any particular monitor or control implementation.
