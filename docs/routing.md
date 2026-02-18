# Routing in Nuxt

Nuxt uses **file-based routing**: the directory structure under `app/pages` defines the application’s routes. No manual router configuration is required.

## Directory structure in `app/pages`

- **Each `.vue` file** in `app/pages` becomes a route.
- **Folder names** are URL path segments.
- **`index.vue`** is the route for that folder’s path (it does not add an extra segment).

So the filesystem maps to URLs like this:

| File path | URL |
| --------- | --- |
| `app/pages/index.vue` | `/` |
| `app/pages/administration/index.vue` | `/administration` |
| `app/pages/administration/users/index.vue` | `/administration/users` |
| `app/pages/administration/users/add.vue` | `/administration/users/add` |

The settings section is another example of nested routes:

- **`app/pages/settings/index.vue`** → `/settings` (main settings: themes, etc.)
- **`app/pages/settings/profile.vue`** → `/settings/profile` (user profile and linked accounts)
- **`app/pages/settings/tokens.vue`** → `/settings/tokens` (token management)

So the `settings` folder defines the `/settings` segment, and the three Vue files define the three child routes under it. Each of these pages uses `definePageMeta({ layout: 'private' })` to share the same layout.

## Dynamic routes with slugs

Routes that depend on a changing part of the URL (e.g. an id or a slug) use **dynamic segments** by naming files or folders with **brackets**.

### Single dynamic segment: `[param]`

A file or folder named `[param]` (e.g. `[id].vue` or `[slug].vue`) creates one dynamic segment. The segment is required.

| File path | URL example | Param |
| --------- | ----------- | ----- |
| `app/pages/projects/[id].vue` | `/projects/abc-123` | `id` = `"abc-123"` |
| `app/pages/users/[username].vue` | `/users/jane` | `username` = `"jane"` |

### Catch-all (multiple segments): `[...slug]`

A name with three dots, e.g. `[...slug].vue`, is a **catch-all**: it matches one or more path segments. The param is an array of those segments.

| File path | URL example | Param |
| --------- | ----------- | ----- |
| `app/pages/docs/[...slug].vue` | `/docs/a` | `slug` = `["a"]` |
| `app/pages/docs/[...slug].vue` | `/docs/a/b/c` | `slug` = `["a", "b", "c"]` |

### Optional dynamic segment: `[[param]]`

Double brackets make the segment optional. So `[[id]].vue` matches both the path with and without that segment (e.g. `/item` and `/item/42`).

### Using the param in a page

Use `useRoute()` to read the current route and its params:

```vue
<script setup lang="ts">
const route = useRoute()

// Single param, e.g. from app/pages/projects/[id].vue
const projectId = computed(() => route.params.id as string)

// Catch-all, e.g. from app/pages/docs/[...slug].vue
const pathSegments = computed(() => (route.params.slug as string[]) ?? [])
</script>

<template>
  <div>
    <p>Project ID: {{ projectId }}</p>
  </div>
</template>
```

For dynamic pages you often want to **validate or fetch** the resource (e.g. load a project by `id`) and show a 404 when it doesn’t exist. You can do that in the same page with `useAsyncData` or in a route middleware.

## Page requirements: single root node

Pages **must have a single root element** in the `<template>` to allow [route transitions](https://nuxt.com/docs/4.x/directory-structure/app/pages) between pages. HTML comments are considered elements as well.

This means that when the route is server-rendered, or statically generated, you will be able to see its contents correctly, but when you navigate towards that route during client-side navigation the transition between routes will fail and you'll see that the route will not be rendered.

Examples:

**Valid — one root element:**

```vue [app/pages/working.vue]
<template>
  <div>
    <!-- This page correctly has only one single root element -->
    Page content
  </div>
</template>
```

**Invalid — comment as extra “root”:**

```vue [app/pages/bad-1.vue]
<template>
  <!-- This page will not render when route changes during client side navigation, because of this comment -->
  <div>Page content</div>
</template>
```

**Invalid — multiple root elements:**

```vue [app/pages/bad-2.vue]
<template>
  <div>This page</div>
  <div>Has more than one root element</div>
  <div>And will not render when route changes during client side navigation</div>
</template>
```
