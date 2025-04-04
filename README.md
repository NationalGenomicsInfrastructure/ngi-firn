# Noetic (NGI frontend)

## Namesake

The adjective [_noetic_](https://www.merriam-webster.com/dictionary/noetic) means "of, relating to, or based on the intellect" and can be considered a synonym for "thoughtful". It is derived from the Greek word _noesis_, meaning "purely intellectual knowledge" and can also refer to "an act of thinking."

## Technology stack

### Framework

This project is built using those major technologies:

- **[Vue.js](https://vuejs.org/)**: A progressive JavaScript framework for building user interfaces, known for its reactivity system and component-based architecture
- **[Nuxt](https://nuxt.com/)**: A web development framwork based on Vue to create performant and production-grade full-stack web apps and websites. It provides features like server-side rendering, automatic routing, and enhanced performance optimizations.
- **[UnoCSS](https://unocss.dev/)**: An atomic CSS engine that offers instant on-demand atomic CSS generation. It is heavily inspired by Tailwind CSS, but ships with [several improvements](https://unocss.dev/guide/why#tailwind-css) like an [Attributify mode](https://unocss.dev/presets/attributify#attributify-mode) or better handling of icons and webfonts. We load the [wind4 preset](https://unocss.dev/presets/wind4) to achieve maximum compatibility with components styled with Tailwind.

To find components to add to this project, please preferably use those sources to maintain a consistent visual appearance:

1. [Nuxt Shadcn Dashboard](https://github.com/dianprata/nuxt-shadcn-dashboard)
2. [UnaUI](https://unaui.com/components), a UI Framework with native UnoCSS components.
3. [Shadcn-Vue](https://www.shadcn-vue.com/), Vue UI Framework with Tailwind-styled blocks and components.
4. [Inspira UI](https://github.com/unovue/inspira-ui), another Nuxt/Vue UI framework.

### Libraries

- **[Permask](https://github.com/dschewchenko/permask)**: A utility library for encoding authorization (access levels) with permission bitmasks.
- **[Unsearch](https://github.com/productdevbook/unsearch)**: A utility library for encoding authorization (access levels) with permission bitmasks.


## Architecture overview

### Directory Tree

The directory tree of _Noetic_ already follows the upcoming Nuxt4 standard with `use compatibility version 4`:

```Bash
├── app/                   # Main application directory
│   ├── assets/            # Static assets like images, fonts, and global styles
│   ├── components/        # Reusable Vue components that make up the UI
│   ├── composables/       # Vue composables for shared logic and state management
│   ├── layouts/           # Layout components that define the page structure
│   ├── middleware/        # Route middleware for authentication
│   ├── pages/             # Vue pages that define the application routes
│   └── utils/             # Utility functions and helper methods
├── docs/                  # Documentation for the app itself
├── public/                # Public static files served as-is
├── server/                # Server-side code, API routes, and database logic
│   ├── api/               # API endpoints and route handlers
│   │   ├── auth/          # Authentication-related API routes
│   │   └── .../           # Other feature API routes
│   ├── database/          # Database configuration and schema
│   │   ├── migrations/    # Database migration files
│   │   └── schema.ts      # Database schema definitions
│   └── utils/             # Server-side utility functions
├── shared/                # Shared types, constants, and utilities
├── types/                 # TypeScript type definitions
├── .data/                 # Local development SQLite database file
└── .github/               # GitHub configuration and workflows
```

Each directory serves a specific purpose in the application:

- **app/components**: Contains reusable Vue components that make up the user interface, following the component-based architecture of Vue.js.
- **app/composables**: Houses Vue composables that encapsulate reusable logic and state management, following Vue 3's Composition API patterns.
- **app/layouts**: Defines the structural layouts for different pages, providing consistent page structures across the application.
- **app/pages**: Contains the main page components that define the application's routes and views.
- **app/middleware**: Implements route middleware for handling authentication, authorization, and other request processing.
- **server**: Contains server-side code, API endpoints, and database interactions using Drizzle ORM.
  - **server/api**: Houses all API endpoints, organized by feature (auth, todos, etc.)
  - **server/database**: Contains database configuration, schema definitions, and migration files
  - **server/utils**: Server-specific utility functions and helpers
- **shared**: Stores shared utilities, constants, and types that are used across the application.
- **types**: Contains TypeScript type definitions for better type safety and developer experience.
- **public**: Holds static assets that are served directly to the client without processing.
- **.data**: Stores local development database files and migrations.

### Main configuration files

The main configuration files in the root directory include:

- **.env**: *To be created by you from the `.env.example`*
- **.env.example**: Template file showing the required environment variables without sensitive values.
- **package.json**: Project metadata and dependency management, including scripts for development, building, and testing. Read by the package manager, in this case `pnpm`.

#### Nuxt configuration files

- **nuxt.config.ts**: The primary configuration file for Nuxt.js, where you can customize build settings, modules, plugins, and other Nuxt-specific options.
- **app/app.config.ts**: Application-specific configuration that can be accessed throughout the app.

#### Database configuration

- **drizzle.config.ts**: Configuration for Drizzle ORM, specifying database connections and migration settings.

#### Linter and development config

- **eslint.config.js**: ESLint configuration for maintaining consistent code style and catching potential errors.

## Initial Setup

## Modern Javascript setups

If you are unfamiliar with the setup for a web application using JavaScript, the introduction [Modern Javascript explained for dinosaurs](https://peterxjang.com/blog/modern-javascript-explained-for-dinosaurs.html) is highly recommended not only for dinosaurs, but also for beginners. 

This project uses `pnpm` as [package manager](https://peterxjang.com/blog/modern-javascript-explained-for-dinosaurs.html#using-a-javascript-package-manager-(npm)) and since mixing them can cause conflicts in the `package.json`, it is recommended to stick with that when working on **Syndecan**. `pnpm` will help you to install, update, and manage the dependencies (external libraries and tools) that our project needs.

## Set up pnpm

First, install pnpm if you haven't already:

```bash
# Using npm to install pnpm globally
npm install -g pnpm

# On macOS, you can also use Homebrew
brew install pnpm
```

Then install the project dependencies:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

## Features

- [Server-Side Rendering on the Edge](https://nuxt.com/blog/nuxt-on-the-edge)
- Authentication backed-in using [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)
- Leverage [Cloudflare D1](https://developers.cloudflare.com/d1/) as database and [drizzle ORM](https://orm.drizzle.team/) using [`hubDatabase()`](https://hub.nuxt.com/docs/storage/database)
- [Automatic database migrations](https://hub.nuxt.com/docs/features/database#database-migrations) in development & when deploying
- User interface made with [Nuxt UI](https://ui.nuxt.com)
- Embed [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview/) in the [Nuxt DevTools](https://devtools.nuxt.com)
- Cache invalidation and Optimistic UI with [Pinia Colada](https://pinia-colada.esm.dev)

## Creating OAuth apps

Create a [GitHub Oauth Application](https://github.com/settings/applications/new) with:
- Homepage url: `http://localhost:3000`
- Callback url: `http://localhost:3000/api/auth/github`

Add the variables in the `.env` file:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID="my-github-oauth-app-id"
NUXT_OAUTH_GITHUB_CLIENT_SECRET="my-github-oauth-app-secret"
```

To create sealed sessions, you also need to add `NUXT_SESSION_PASSWORD` in the `.env` with at least 32 characters:

```bash
NUXT_SESSION_PASSWORD="your-super-long-secret-for-session-encryption"
```

## Deploy

You can deploy this project on your Cloudflare account for free and with zero configuration using [NuxtHub](https://hub.nuxt.com).

```bash
npx nuxthub deploy
```

It's also possible to leverage Cloudflare Pages CI for deploying, learn more about the different options on https://hub.nuxt.com/docs/getting-started/deploy

## Remote Storage

Once you deployed your project, you can connect to your remote database locally running:
  
```bash
pnpm dev --remote
```

Learn more about remote storage on https://hub.nuxt.com/docs/getting-started/remote-storage

## License

[MIT License](./LICENSE)
