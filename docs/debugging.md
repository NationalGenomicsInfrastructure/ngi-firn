# Debugging

## Nuxt Developer Tools

The predominant debugging tool for Nuxt applications are the Nuxt Developer Tools, which provide a comprehensive suite of features. They offer for example module inspection, component analysis, timeline visualization for performance monitoring, state management tools, and server route examination.

The DevTools appear as a small floating panel at the bottom of your browser during development and can be expanded to access the full functionality. Right next to them, you can also activate the _Component inspector_ to hover over any element of the application and learn about the responsible component. For more information, refer to the [official Nuxt DevTools documentation](https://nuxt.com/docs/guide/going-further/debugging).

## Manual inspection

One can also temporarily add `console.log(useNuxtApp())` to the `<script></script>` block of any page component to log the entire Nuxt app context to the Javascript console. This allows inspecting the current state of the app, including all auto-imports. It is therefore particularly useful to understand, if a particular function or component is truly available in the context and for example helps uncovering name collisions in the imports.