# Typescript quick start for Python developers

In this codebase, you may encounter some code patterns that feel counterintuitive or unfamiliar if you're coming from Python. TypeScript's type system, JavaScript's asynchronous patterns, and Vue's reactivity system can seem strange at first. For example, you'll see `const` used for variables that can be mutated (unlike Python's immutable constants), function declarations that look like variable assignments, and a type system that's structural rather than nominal. The following sections highlight some examples of differences you will likely perceive as odd initially:

## Variable declarations and mutability

### `const` doesn't mean constant

In TypeScript/JavaScript, `const` only prevents reassignment of the variable reference, not mutation of the object it points to.

### Destructuring assignments

In JavaScript/TypeScript, when you use destructuring assignment with object properties, the names matter, not the order. Take for example

```ts
const { loggedIn, user, session, fetch, clear, openInPopup } = useUserSession()
```

The variables will be assigned based on the property names from the object returned by `useUserSession()`, not their position in the destructuring pattern:

```ts
// If useUserSession() returns:
{
  loggedIn: true,
  user: { id: 1, name: "Lina" },
  session: { token: "abc123" },
  fetch: () => {},
  clear: () => {},
  openInPopup: () => {}
}

// Then this destructuring:
const { loggedIn, user, session, fetch, clear, openInPopup } = useUserSession()

// Is equivalent to:
const loggedIn = useUserSession().loggedIn
const user = useUserSession().user
const session = useUserSession().session
const fetch = useUserSession().fetch
const clear = useUserSession().clear
const openInPopup = useUserSession().openInPopup
```

Order doesn't matter - you could write:

```ts
const { clear, session, user, openInPopup, fetch, loggedIn } = useUserSession()
```

And `clear` would still get the `clear` property, `session` would still get the `session` property, etc.

This is different from tuple unpacking in Python:

```python
def get_user_info():
    return ("Lina", 30, "lina@scilifelab.se")

# Order matters in tuple unpacking
name, age, email = get_user_info()
# name = "Lina", age = 30, email = "lina@scilifelab.se"

# If you swap the order, you get different assignments
age, name, email = get_user_info()
# age = "Lina", name = 30, email = "lina@scilifelab.se"  # Wrong!
```

#### Key points

- Destructuring matches by property name, not position
- You can reorder the variables in the destructuring pattern without changing the assignments
- You can also use aliasing: `const { user: currentUser } = useUserSession()` to assign the `user` property to a variable named `currentUser`

### The spread operator (`...`)

The spread operator (`...`) is used to expand elements from one object or array into another. This is commonly used for creating copies of objects with modifications, similar to Python's `dict.update()`.

#### Object spreading

```ts
// Basic object spreading to copy properties to a new variable
const user = { name: "Lina", age: 30, email: "lina@scilifelab.se" }
const userCopy = { ...user }
// userCopy = { name: "Lina", age: 30, email: "lina@scilifelab.se" }

// Spreading with updates
const updates = { age: 31, lastSeenAt: "2024-01-15T10:30:00Z" }
const updatedUser = { ...user, ...updates }
// updatedUser = { name: "Lina", age: 31, email: "lina@scilifelab.se", lastSeenAt: "2024-01-15T10:30:00Z" }
```

The `{ ...user, ...updates }` syntax works like this:

1. `...user` spreads all properties from the `user` object
2. `...updates` spreads all properties from the `updates` object
3. If there are conflicting properties, the **later** object wins (updates override user properties)

#### Real example from the codebase

In `server/crud/users.ts`, you'll see this pattern:

```ts
await couchDB.updateDocument(user._id, { ...user, ...updates }, user._rev!)
```

This creates a new object that:

- Contains all properties from the original `user` object
- Overwrites any properties that exist in `updates`
- Preserves the original `user` object (doesn't mutate it)

Even though `...user` spreads all properties, we explicitly name `user._id` and `user._rev!` because:

- `_id` is required by CouchDB for document identification
- `_rev!` uses the non-null assertion operator (`!`) to tell TypeScript that `_rev` is definitely not null/undefined, even though the type system thinks it might be


#### Comparison with Python

**Python equivalent:**

```python
# Python dict.update() modifies the original dict
user = {"name": "Lina", "age": 30, "email": "Lina@scilifelab.se"}
updates = {"age": 31, "last_seen_at": "2024-01-15T10:30:00Z"}

# Method 1: Create a copy and update
updated_user = user.copy()
updated_user.update(updates)

# Method 2: Use dict unpacking
updated_user = {**user, **updates}
```

Key differences from Python:

- Immutability: Spread operator creates a new object, doesn't modify the original
- Shallow copy: Only creates a shallow copy (nested objects are still referenced)
- Universal: Works with arrays too: `[...array1, ...array2]`

This pattern is very common in Vue applications for state updates, as it ensures immutability while making targeted changes.
