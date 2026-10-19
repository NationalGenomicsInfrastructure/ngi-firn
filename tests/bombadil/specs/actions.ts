import type { Tree } from '@antithesishq/bombadil'
import type { ActionTemplate } from '@antithesishq/bombadil/browser'

export function filterActions(tree: Tree<ActionTemplate>, allowed: (action: ActionTemplate) => boolean): Tree<ActionTemplate> {
  if ('value' in tree) return allowed(tree.value) ? tree : { branches: [] }
  return { branches: tree.branches.map(([weight, child]) => [weight, filterActions(child, allowed)]) }
}

export function safeClick(action: ActionTemplate, forbidden: string[]) {
  if (typeof action === 'string' || !('Click' in action)) return true
  return !forbidden.includes(JSON.stringify(action.Click.fingerprint))
}
