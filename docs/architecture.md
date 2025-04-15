# Architecture overview

## Imports

If you have developed with other frontend frameworks before, you will be familiar with the necessity to import what you are using. Take [React](https://react.dev) for example:

```js
import React, { useState, useEffect } from 'react';
import { useStaticQuery, graphql } from "gatsby"
import PreviewIcon from '../../components/icon';
import AnchorLink from 'react-anchor-link-smooth-scroll';
import { longArrowLeft } from 'react-icons-kit/fa'
import './menu.scss';
```

Opposed to that, **Nuxt [will import components, composables, helper functions and Vue APIs implicitly](https://nuxt.com/docs/guide/concepts/auto-imports)**. 

This means you can use Vue components, composables, and utilities without explicitly importing them. For example, you can directly get access to the app context and runtime config, use `useState` or your custom components without import statements, making the code tidier.

On the other hand, one must comply with an [opinionated directory structure](#directory-tree), so Nuxt will find everything it needs to import.

More importantly, auto-import complicates state management for server-side rendered code, since extra care must be taken to avoid cross-request state pollution (leaking a shared reference between two users) and leakage between different components.

## Directory Tree

The directory tree of _Firn_ already follows the upcoming Nuxt4 standard with `use compatibility version 4`.

The main difference to Nuxt3 is the deeper nesting with `app`, `server` and `shared` folders. This this is a recent introduction, even tutorials that are barely a few months old are already outdated. Keep this in mind, if you are following a tutorial that asks you to place a file in a particular folder.

```Bash
├── app/                   # Main application directory
│   ├── assets/            # Static assets like images, fonts, and global styles
│   ├── components/        # Reusable Vue components that make up the UI
│   ├── composables/       # Vue composables for shared logic and state management
│   ├── layouts/           # Layout components that define the page structure
│   ├── middleware/        # Route middleware for authentication
│   ├── pages/             # Vue pages that define the application routes
│   ├── plugins/           # Plugins extend the core functionality of the application
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
- **app/composables**: Composables are a powerful feature in Vue 3 that allow you to extract and reuse reactive state logic. They are essentially functions that encapsulate and reuse stateful logic. Think of them as reusable pieces of code that can contain their own reactive state, computed properties, and methods and can help to organize complex logic outside of components. Default composables we use are for example `useUserSession()`, `useDB()` or `useColorMode()`. If you wish to write your own, [mind the peculiarities around context](https://nuxt.com/docs/guide/concepts/auto-imports#vue-and-nuxt-composables).
- **app/layouts**: Defines the structural layouts for different pages, providing consistent page structures across the application.
- **app/middleware**: Implements route middleware for handling authentication, authorization, and other request processing.
- **app/pages**: Contains the main page components that define the application's routes and views. Nuxt provides file-based routing to create routes within a web application based on the page names.
- **app/plugins**: Plugins extend the core functionality of the application. Plugins are executed before instantiating the Vue application and can be used to inject functions or constants, register components globally, or add third-party libraries.
- **server**: Contains server-side code, API endpoints, and database interactions using Drizzle ORM.
  - **server/api**: Houses all API endpoints, organized by feature (auth, todos, etc.)
  - **server/database**: Contains database configuration, schema definitions, and migration files
  - **server/utils**: Server-specific utility functions and helpers
- **shared**: Stores shared utilities, constants, and types that are used across the application.
- **types**: Contains TypeScript type definitions for better type safety and developer experience.
- **public**: Holds static assets that are served directly to the client without processing.
- **.data**: Stores local development database files and migrations.

## Configuration

### Main configuration files

The main configuration files in the root directory include:

- **.env**: *To be created by you from the `.env.example`*
- **.env.example**: Template file showing the required environment variables without sensitive values.
- **package.json**: Project metadata and dependency management, including scripts for development, building, and testing. Read by the package manager, in this case `pnpm`.

### Nuxt configuration files

- **nuxt.config.ts**: The primary configuration file for Nuxt.js, where you can customize build settings, modules, plugins, and other Nuxt-specific options.
- **app/app.config.ts**: Application-specific configuration that can be accessed throughout the app.

### Database configuration

- **drizzle.config.ts**: Configuration for Drizzle ORM, specifying database connections and migration settings.

### Linter and development config

- **eslint.config.js**: ESLint configuration for maintaining consistent code style and catching potential errors.
