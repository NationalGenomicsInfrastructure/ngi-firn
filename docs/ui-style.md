# UI style guide

The visual language of Firn, first applied to the inventory search, the project list and the room list. New and reworked pages should follow it; older pages are migrated gradually (see [Migration](#migration)).

For general UI mechanics (slots, Una pitfalls) see [ui.md](ui.md).

## Principles

1. **One blue, used sparingly.** `primary-700` (`primary-500` in dark mode) marks *structure and state*: the left edge of a card, active filter chips, the main action, project numbers, links to entities. Everything else is white, slate gray and `bg-muted/40`.
2. **Alkatra is the playful accent, not the body.** The display font (`font-display`) is for page titles (`PageTitle`) and section headings (`SectionHeading variant="section"`). Names, labels, data and buttons use the regular font. Project and entity names are regular weight 600 in blue, never display font.
3. **Quiet by default.** No heavy filled cards. Surfaces are white with a hairline border (`border-base`) and a small shadow; secondary information is muted (`text-muted`), small and uppercase only when it is a *caption*.
4. **The left edge is the signature.** Anything that represents a result or a filter area carries the accent edge (same cue as the expanded rows of the project table).
5. **Colour must not be the only signal.** Open/closed, active/inactive always come with text or an icon. Open is blue, closed is gray; do not introduce further hues for state.
6. **Layout stability.** Controls that appear and disappear (e.g. "Clear filters") are rendered in place and hidden with `invisible`, never added to or removed from the flow, so the surrounding bar does not jump.

## Building blocks

| Need | Use | Where |
| --- | --- | --- |
| Search or filter area above a list | `<FilterBar>` | `app/components/filter/FilterBar.vue` |
| Caption for a filter group or a form field | `<FilterLabel>` or `UI_LABEL_STYLE` | `app/components/filter/FilterLabel.vue`, `app/utils/ui.ts` |
| Introduce a list/table ("Results") | `<SectionHeading title="…" meta="12 matches">` | `app/components/page/SectionHeading.vue` |
| Separate categories ("Matching projects") | `<SectionHeading variant="section" icon="…">` with `#badge` | same |
| Card without header that carries the accent edge | `<CardAccent>` (`edge="sm"` for small cards in a grid) | `app/components/card/CardAccent.vue` |
| Project numbers (`P.Name_45_11` → 45, 11) | `<ProjectNumberCircles :project-name :status>` | `app/components/project/ProjectNumberCircles.vue` |
| Single clickable result | follow `InventorySearchHitCard` | `app/components/inventory/search/SearchHitCard.vue` |
| Raw class strings | `UI_LABEL_STYLE`, `UI_ACCENT_EDGE`, `UI_ACCENT_EDGE_SM` | `app/utils/ui.ts` (auto-imported) |

### FilterBar

One raised surface with the accent edge and a focus ring around the whole surface. Two flavours:

```vue
<!-- Search-first: big borderless input on top, chips in the tinted strip -->
<FilterBar label="Search filters">
  <template #primary>
    <NInput input="~" size="lg" leading="i-lucide-search" … />
  </template>
  <!-- chips, selects … -->
</FilterBar>

<!-- Form-style: slim header, fields in the tinted strip -->
<FilterBar title="Filter rooms" :description="`Showing ${n} of ${total} rooms`" icon="i-lucide-filter">
  <template #actions><NButton btn="link-primary" size="xs" label="Clear filters" /></template>
  <!-- NFormField + NSelect … -->
</FilterBar>
```

- Toggle chips: `size="xs"`, `class="rounded-full"`, `btn="solid-primary"` when active and `btn="outline-gray"` otherwise, plus `:aria-pressed`.
- Form fields: `NFormField` with `:una="{ formLabel: UI_LABEL_STYLE }"`.
- The submit button of a form is `btn="solid-primary"`; "clear" actions are `btn="link-primary"`.

### Result cards

- Whole card is one `NuxtLink` (one interactive target, no extra "Open" button).
- Icon tile (`bg-primary-50 text-primary-700`) + muted uppercase caption (kind · subtype) + headline + badges + a quiet `<dl>` for identifiers, barcode and location.
- Group cards (`SearchProjectGroupCard`) use `CardAccent`; the hits inside are plain bordered cards.

## Do and don't

```vue
<!-- Do: label via the shared constant -->
<NFormField :una="{ formLabel: UI_LABEL_STYLE }" />

<!-- Don't: re-typing the class string, or the old low-contrast variant -->
<NFormField :una="{ formLabel: 'text-xs uppercase tracking-wide text-primary-400 dark:text-primary-600 font-medium' }" />
```

- **Do** use `CardAccent` for a card without header. **Don't** put `border-l-8` on a bare `NCard`: Una removes the content's top padding when it expects a header, so the content sticks to the top edge.
- **Do** keep dynamic colour classes out of the markup. Variants built from variables (`bg-${color}-100`) are not found by UnoCSS; use fixed classes or add them to the `safelist` in `uno.config.ts`.
- **Don't** wrap the filter bar in another card or give it its own background.
- **Don't** use `NSeparator` with a label for headings; use `SectionHeading`.

## Migration

Gradual, in reviewable batches:

1. Replace the old caption/label class string (`text-xs uppercase tracking-wide text-primary-400 …`, about 46 files, many as a local `FORM_LABEL_STYLE` constant) with `UI_LABEL_STYLE`. Where the background is gray the old guidance was `text-primary-700`; the new muted style works on both.
2. Pages and cards that use `soft-gray`/`soft-primary` `NCard`s: switch to `FilterBar` (if they hold filters) or `CardAccent`/plain `outline-gray`.
3. Remaining list and detail pages: `SectionHeading`, `ProjectNumberCircles` where project names appear.
4. Check dark mode and phone width for each migrated page.

Already migrated: `/inventory/search`, `/projects`, `/inventory/rooms` (filter bars), `CardRoom`, the search result components.
