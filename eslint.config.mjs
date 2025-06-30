// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Custom indentation rules similar to Python
  {
    rules: {
      indent: ['error', 2]
    }
  }
)
