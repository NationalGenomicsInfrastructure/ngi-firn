# Libraries and dependencies

> :warning: This list is incomplete, as it only comprises the major libraries. Furthermore, some that are listed as a bookmark and are not yet integrated into the application. The authoritative list is therefore the [`package.json`](../package.json) file and the lock file of the package manager [`pnpm-lock.yaml`](../pnpm-lock.yaml).

## Core

This project is built using those major technologies:

- **[Vue.js](https://vuejs.org/)**: A progressive JavaScript framework for building user interfaces, known for its reactivity system and component-based architecture
- **[Nuxt](https://nuxt.com/)**: A web development framwork based on Vue to create performant and production-grade full-stack web apps and websites. It provides features like server-side rendering, automatic routing, and enhanced performance optimizations.

## User interface

### Styles

- **[UnoCSS](https://unocss.dev/)**: An atomic CSS engine that offers instant on-demand atomic CSS generation. It is heavily inspired by Tailwind CSS, but ships with [several improvements](https://unocss.dev/guide/why#tailwind-css) like an [Attributify mode](https://unocss.dev/presets/attributify#attributify-mode) or better handling of icons and webfonts.

### Components

#### Main source

This project uses **[UnaUI](https://www.unaui.com)**, a modern UI Framework  enabling the creation of modern and lightweight components. It combines the [UnoCSS engine](https://unocss.dev) with **[Reka UI](https://reka-ui.com)**, an open-source library with unstyled, primitive components.

To find components to add to this project, please preferably use [components from UnaUI](https://unaui.com/components). You can also use unstyled components from RekaUI directly without additional configuration, because they are imported by UnaUI.

Please refer to [the UI manual for details on using components](./ui.md#components).

#### Further component sources and inspiration

Further sources for components can be those projects, which, however, use TailwindCSS instead of UnaCSS. Since the latter is modelled after the former, some styles and classes will work out of the box, but some won't:

1. **[Nuxt Shadcn Dashboard](https://github.com/dianprata/nuxt-shadcn-dashboard)**
2. **[Shadcn-Vue](https://www.shadcn-vue.com/)**, Vue UI Framework with Tailwind-styled blocks and components.
3. **[Inspira UI](https://github.com/unovue/inspira-ui)**, another Nuxt/Vue UI framework.

## Data

- **[Luxon](https://moment.github.io/luxon/)** for dealing with dates and times.
- **[Legid](https://github.com/shuding/legid)** to create client-side URIs safely.
- **[Pinia](https://github.com/vuejs/pinia)** an intuitive, type safe and flexible Store for Vue as Nuxt Module.
- **[Pinia Colada](https://github.com/posva/pinia-colada)** a data fetching layer for Pinia to simplify asynchronous state management, particularly [_optimistic updates_](./data.md#optimistic-updates).
- **[Zod](https://github.com/colinhacks/zod)**: TypeScript-first schema validation with static type inference.

## Users

- **[Jose](https://github.com/panva/jose)**: JWA, JWS, JWE, JWT, JWK, JWKS for Node.js, Browser, Cloudflare Workers, Deno, Bun, and other Web-interoperable runtimes. Combine with native Crypto module from NodeJS and modern browsers for crytpo-safe random numbers.
- **[Permask](https://github.com/dschewchenko/permask)**: A utility library for encoding authorization (access levels) with permission bitmasks.

## Search

- **[Unsearch](https://github.com/productdevbook/unsearch)**: A library designed to add flexible similarity search functionality to own APIs and databases.
