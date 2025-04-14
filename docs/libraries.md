# Libraries and dependencies

> :warning: This list is incomplete, as it only comprises the major libraries. Furthermore, some that are listed as a bookmark and are not yet integrated into the application. The authoritative list is therefore the [`package.json`](../package.json) file and the lock file of the package manager [`pnpm-lock.yaml`](../pnpm-lock.yaml).

## Core

This project is built using those major technologies:

- **[Vue.js](https://vuejs.org/)**: A progressive JavaScript framework for building user interfaces, known for its reactivity system and component-based architecture
- **[Nuxt](https://nuxt.com/)**: A web development framwork based on Vue to create performant and production-grade full-stack web apps and websites. It provides features like server-side rendering, automatic routing, and enhanced performance optimizations.

## User interface

### Styles

- **[UnoCSS](https://unocss.dev/)**: An atomic CSS engine that offers instant on-demand atomic CSS generation. It is heavily inspired by Tailwind CSS, but ships with [several improvements](https://unocss.dev/guide/why#tailwind-css) like an [Attributify mode](https://unocss.dev/presets/attributify#attributify-mode) or better handling of icons and webfonts. We load the [wind4 preset](https://unocss.dev/presets/wind4) to achieve maximum compatibility with components styled with Tailwind.

### Components

To find components to add to this project, please preferably use those sources to maintain a consistent visual appearance:

1. **[Nuxt Shadcn Dashboard](https://github.com/dianprata/nuxt-shadcn-dashboard)**
2. **[UnaUI](https://unaui.com/components)**, a UI Framework with native UnoCSS components.
3. **[Shadcn-Vue](https://www.shadcn-vue.com/)**, Vue UI Framework with Tailwind-styled blocks and components.
4. **[Inspira UI](https://github.com/unovue/inspira-ui)**, another Nuxt/Vue UI framework.
5. **[Nuxt UI](https://ui.nuxt.com)**, the official UI toolkit for Nuxt.

## Data

- **[Pinia](https://github.com/vuejs/pinia)** an intuitive, type safe and flexible Store for Vue as Nuxt Module.
- **[Pinia Colada](https://github.com/posva/pinia-colada)** a data fetching layer for Pinia to simplify asynchronous state management, particularly [_optimistic updates_](./data.md#optimistic-updates).
- **[Zod](https://github.com/colinhacks/zod)**: TypeScript-first schema validation with static type inference.

## Users

- **[Jose](https://github.com/panva/jose)**: JWA, JWS, JWE, JWT, JWK, JWKS for Node.js, Browser, Cloudflare Workers, Deno, Bun, and other Web-interoperable runtimes. Combine with native Crypto module from NodeJS and modern browsers for crytpo-safe random numbers.
- **[Permask](https://github.com/dschewchenko/permask)**: A utility library for encoding authorization (access levels) with permission bitmasks.

## Search

- **[Unsearch](https://github.com/productdevbook/unsearch)**: A library designed to add flexible similarity search functionality to own APIs and databases.
