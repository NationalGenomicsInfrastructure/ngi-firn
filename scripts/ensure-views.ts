#!/usr/bin/env node

import { ensureViews } from '../server/crud/views'

async function main() {
  try {
    console.log('🛋 Ensuring updated database views...')
    await ensureViews()
  }
  catch (error) {
    console.error('❌ Updating database views failed:', error)
    process.exit(1)
  }
}

main()
