#!/usr/bin/env node

import { pullProjectsViews } from '../server/crud/views'

async function main() {
  try {
    console.log('🛋 Pulling projects database views into local cache...')
    await pullProjectsViews()
  }
  catch (error) {
    console.error('❌ Pulling projects database views failed:', error)
    process.exit(1)
  }
}

main()
