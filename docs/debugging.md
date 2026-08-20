# Debugging

## Nuxt Developer Tools

The predominant debugging tool for Nuxt applications are the Nuxt Developer Tools, which provide a comprehensive suite of features. They offer for example module inspection, component analysis, timeline visualization for performance monitoring, state management tools, and server route examination.

The DevTools appear as a small floating panel at the bottom of your browser during development and can be expanded to access the full functionality. Right next to them, you can also activate the _Component inspector_ to hover over any element of the application and learn about the responsible component. For more information, refer to the [official Nuxt DevTools documentation](https://nuxt.com/docs/guide/going-further/debugging).

## Manual inspection

One can also temporarily add `console.log(useNuxtApp())` to the `<script></script>` block of any page component to log the entire Nuxt app context to the Javascript console. This allows inspecting the current state of the app, including all auto-imports. It is therefore particularly useful to understand, if a particular function or component is truly available in the context and for example helps uncovering name collisions in the imports.

## Frequent issues

### A component is missing

If you used a non-existing component, you will get two warnings when the respective components needs to be rendered:

```console
WARN  [Vue warn]: Failed to resolve component: LoginForm
```

This warning is followed by a second warning:

```console
WARN  [Vue warn]: Component <Anonymous> is missing template or render function.
```

Because both print the whole app context as JSON to stderr, it is easy to overlook the actual cause.

### Some Lucide icons are missing even though the names are valid

If icons are passed indirectly (for example from utility functions, computed maps, or constants), UnoCSS can miss some `i-lucide-*` classes during extraction. The result is often inconsistent rendering where one icon in a component appears but others do not.

Typical symptom patterns:

- In one list/card, only a subset of icons render
- Badge labels render correctly, but some badge icons are missing
- The same icon name works in one component and fails in another

To verify an icon name exists in the installed Lucide set, search the local icon dataset:

```bash
rg '"(align-left|layers|door-open|arrow-down-to-line|briefcase|package|shapes)"' node_modules/.pnpm/@iconify-json+lucide@*/node_modules/@iconify-json/lucide/icons.json
```

If names are valid, add the exact missing `i-lucide-*` classes to the `safelist` in `uno.config.ts`.

This is especially important for icons coming from:

- utility field builders (for example room/project info field arrays)
- badge style maps used via dynamic `:icon` bindings

### A badge icon renders but its colour is missing

This is the colour analog of the missing-icon issue above, with a subtly different root cause. Symptom: an `NBadge` shows the correct **icon and label, but no colour** — while some other colours on the same page render fine. Frequently only a couple of colours "work" (for example `red`, `success`, `gray`) and the rest (for example `emerald`, `amber`, `indigo`, `yellow`) do not, which looks arbitrary.

The cause is how `@una-ui`'s `NBadge` applies the variant. It sets a `badge="solid-<color>"` **HTML attribute** (plus a static `class="badge"`) — it does **not** add a `badge-solid-<color>` class. UnoCSS therefore styles the colour through **attributify**, generating `[badge~="solid-<color>"]`. Two consequences follow:

1. Safelisting the class form `badge-solid-<color>` does nothing: it generates `.badge-solid-<color>`, a selector that never matches the element (which only has the attribute and the base `badge` class).
2. A colour is only styled when the exact `solid-<color>` string appears somewhere UnoCSS extracts as an attributify value — typically a literal `badge="solid-<color>"` (or the string `'solid-<color>'`) inside a `.vue` file. A colour that exists **only** in a `.ts` map (for example `FLAG_META` / `ACTION_TYPE_META` in `app/utils/inventory/actionLog.ts`, or `ROOM_TYPE_BADGE_STYLES` in `app/utils/inventory/room.ts`) gets no attribute rule and renders uncoloured.

Fix: add the **attributify form** of each dynamically-bound badge colour to the `safelist` in `uno.config.ts` — not the class form:

```ts
// ❌ no-op: generates `.badge-solid-emerald`, never matches the element
'badge-solid-emerald',

// ✅ correct: generates `[badge~="solid-emerald"]`, matches `badge="solid-emerald"`
'[badge~="solid-emerald"]',
```

Verify the rule is emitted by running a UnoCSS generator over the real config and grepping the output:

```bash
node -e '
import("jiti").then(async ({ createJiti }) => {
  const jiti = createJiti(import.meta.url)
  const config = (await jiti.import("./uno.config.ts")).default
  const { createGenerator } = await import("unocss")
  const gen = await createGenerator(config)
  const { css } = await gen.generate("", { preflights: false })
  for (const c of ["emerald", "amber", "red", "indigo", "success", "yellow", "gray"])
    console.log((css.includes(`[badge~="solid-${c}"]`) ? "OK  " : "MISS") + ` [badge~="solid-${c}"]`)
})'
```

Each present colour should print `OK` and, in the CSS, carry a `--una-brand` custom property — that variable drives the badge text/icon colour via the base `badge` shortcut's `text-brand`. The variant-to-utilities map (`badge-solid-<c>` → `bg-${c}-100 dark:bg-${c}-800 n-${c}-700 dark:n-${c}-200`) lives in the `@una-ui/preset` badge shortcuts.
