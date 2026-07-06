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
