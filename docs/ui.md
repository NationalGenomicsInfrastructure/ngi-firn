# User interface

## Fundamentals

### Document Object Model (DOM)

The Document Object Model (DOM) is a widely used programming interface for web documents. It represents the page so that programs can change the document structure, style, and content. The DOM represents the document as nodes and objects; this way, programming languages like JavaScript can interact with the page. DOM updates are handled by Vue's reactivity system.

### Key user interface concepts in Vue

1. **Reactivity**: Vue's reactivity system automatically updates the DOM when the underlying data changes, eliminating the need for manual DOM manipulation.

2. **Props and Events**: Components communicate through props (parent-to-child data flow) and events (child-to-parent communication), creating a clear data flow throughout the application.

3. **Slots**: Vue's slot system allows components to receive and render content from their parent components, enabling flexible component composition.

4. **Directives**: Special attributes with the `v-` prefix (like `v-if`, `v-for`, `v-model`) that apply special reactive behavior to rendered DOM elements.

5. **Transitions and Animations**: Vue provides built-in transition components that make it easy to apply animations when elements are inserted, updated, or removed from the DOM.

## Components

Components are the building blocks of the user interface and Vue application.

### Structure of a component

 A Vue component encapsulates a template, its logic and the style:

- A **Template**: The HTML structure that defines what the component looks like, enclosed in `<template></template>` tags.
- Its **Logic**: JavaScript code that controls the component's behavior between `<script setup lang="ts"></script>`.
- The **Style**: CSS that defines the component's appearance. Typically omitted in favor of global styling, but can be added between `<style lang="postcss"></style>`.

Components can be nested within each other, creating a tree-like structure that represents your application's UI. This modular approach promotes reusability, maintainability, and separation of concerns.

### Slots

Slots are a Vue feature that allows you to create reusable components with customizable content areas. They act as placeholders where parent components can inject their own content, enabling flexible component composition.

#### Basic slots

A basic slot creates a "hole" in your component where parent content can be inserted:

```vue [ChildComponent.vue]
<template>
  <div class="container">
    <h1>Fixed Header</h1>
    <slot></slot> <!-- Parent content goes here -->
    <footer>Fixed Footer</footer>
  </div>
</template>
```

```vue [ParentComponent.vue]
<template>
  <ChildComponent>
    <p>This content goes into the slot!</p>
  </ChildComponent>
</template>
```

#### Named slots

Named slots allow you to create multiple content areas within a single component. This is particularly useful for complex layouts like navigation components.

**Defining named slots in a component:**

```vue [NavigationSidebarMain.vue]
<template>
  <NSidebar>
    <NSidebarHeader>
      <slot name="header">
        <!-- Default header content -->
        <h2>Default Header</h2>
      </slot>
    </NSidebarHeader>
    
    <NSidebarContent>
      <slot name="content">
        <!-- Default content -->
        <p>Default content area</p>
      </slot>
    </NSidebarContent>
    
    <NSidebarFooter>
      <slot name="footer">
        <!-- Default footer -->
        <p>Default footer</p>
      </slot>
    </NSidebarFooter>
  </NSidebar>
</template>
```

Using named slots from a parent component:

```vue [PageComponent.vue]
<template>
  <NavigationSidebarMain>
    <template #header>
      <CustomHeader />
    </template>
    <template #content>
      <CustomContent />
    </template>
    <template #footer>
      <CustomFooter />
    </template>
  </NavigationSidebarMain>
</template>
```

The `#header` syntax is shorthand for `v-slot:header`.

##### Multiple named slots

You can have multiple named slots in one component:

```vue
<!-- Enhanced NavigationSidebarMain.vue -->
<template>
  <NSidebar>
    <NSidebarHeader>
      <slot name="header">
        <!-- Default header -->
      </slot>
    </NSidebarHeader>
    
    <NSidebarContent>
      <slot name="content">
        <!-- Default content -->
      </slot>
    </NSidebarContent>
    
    <NSidebarFooter>
      <slot name="footer">
        <!-- Default footer -->
      </slot>
    </NSidebarFooter>
  </NSidebar>
</template>
```

Usage:

```vue
<NavigationSidebarMain>
  <template #header>
    <CustomHeader />
  </template>
  <template #content>
    <CustomContent />
  </template>
  <template #footer>
    <CustomFooter />
  </template>
</NavigationSidebarMain>
```

#### Conditional slot content

You can also make slot content conditional:

```vue
<template>
  <NavigationSidebarMain>
    <template #secondary-sidebar-header>
      <component :is="currentSidebarHeader" />
    </template>
  </NavigationSidebarMain>
</template>

<script setup>
const route = useRoute()

// Dynamically choose component based on route
const currentSidebarHeader = computed(() => {
  switch (route.name) {
    case 'profile':
      return defineAsyncComponent(() => import('~/components/profile/ProfileSidebarHeader.vue'))
    case 'settings':
      return defineAsyncComponent(() => import('~/components/settings/SettingsSidebarHeader.vue'))
    default:
      return null // Use default slot content
  }
})
</script>
```

### Available components

In the [directory tree](./architecture.md#directory-tree), components are found in `app/components`.
Nuxt automatically imports any components in this directory alongside with components that are registered by modules - like those of our UI library.

### Referencing own components

Suppose we have the following nested directory structure inside the `components` folder:

```bash [Directory Structure]
app
├── components
│   └── frontpage
│       ├── Footer.vue
│       └── Header.vue
```

In our app, we reference the components in _PascalCase_ based on their path directory and filename:

```html [app.vue]
<template>
  <div>
    <FrontpageHeader />
    <NuxtPage />
    <FrontpageFooter />
  </div>
</template>
```

If you incorrectly reference a component, you will get a corresponding [warning](./debugging.md#a-component-is-missing) in the console.

You can optionally prefix a component name with `Lazy`, e.g. `<LazyFrontpageFooter hydrate-on-visible />`,  which [improves performance by deferring hydration of components until they're needed](https://nuxt.com/docs/guide/directory-structure/components#delayed-or-lazy-hydration).

#### Naming convention

Because duplicate segments are removed, both of these components would resolve to `<SubdirMenuButton />`:

```bash [Directory Structure]
app
├── components
│   └── subdir
│       └── menu
│           ├── Button.vue
│           └── SubdirMenuButton.vue
```

When launching the application, you would thus see a warning:

> :warning: WARN  Two component files resolving to the same name SubdirMenuButton

For clarity, the Nuxt developers recommend that the component's filename matches its full name. So, in the example above, `SubdirMenuButton.vue` would be the appropriate name.

## Component Library

In our Nuxt application, we leverage these Vue concepts along with additional UI libraries like [UnaUI and Reka UI](./libraries.md#components) to create a cohesive and responsive user interface.

### Grimoire of common patterns and magic spells

The following list highlights a few features of our UI libraries that you may use quite frequently.

#### Properties for interactive

```html
 <NSidebarMenuButton
                :tooltip="h('div', { hidden: false }, item.title)"
                :is-active=" // some condition that evaluates to Boolean"
                @click="() => { // a function triggered when clicking on the button}"
                >
```

#### Named Slots

Named slots allow you to create multiple content areas within a single component. This is particularly useful for complex layouts like navigation components.

**Defining named slots in a component:**

```vue [NavigationSidebarMain.vue]
<template>
  <NSidebar>
    <NSidebarHeader>
      <slot name="header">
        <!-- Default header content -->
        <h2>Default Header</h2>
      </slot>
    </NSidebarHeader>
    
    <NSidebarContent>
      <slot name="content">
        <!-- Default content -->
        <p>Default content area</p>
      </slot>
    </NSidebarContent>
    
    <NSidebarFooter>
      <slot name="footer">
        <!-- Default footer -->
        <p>Default footer</p>
      </slot>
    </NSidebarFooter>
  </NSidebar>
</template>
```

**Using named slots from a parent component:**

```vue [PageComponent.vue]
<template>
  <NavigationSidebarMain>
    <template #header>
      <CustomHeader />
    </template>
    <template #content>
      <CustomContent />
    </template>
    <template #footer>
      <CustomFooter />
    </template>
  </NavigationSidebarMain>
</template>
```

The `#header` syntax is shorthand for `v-slot:header`.

#### Best Practices for Page-Specific Components

##### 1. Create Dedicated Components

For different pages, create specific components for slot content:

```vue [components/profile/ProfileSidebarHeader.vue]
<template>
  <div class="flex items-center gap-2">
    <NIcon name="i-lucide-user" />
    <h2>Profile Settings</h2>
    <NButton size="sm">Edit</NButton>
  </div>
</template>
```

```vue [components/settings/SettingsSidebarHeader.vue]
<template>
  <div class="flex items-center gap-2">
    <NIcon name="i-lucide-settings" />
    <h2>System Settings</h2>
    <NButton size="sm" variant="outline">Reset</NButton>
  </div>
</template>
