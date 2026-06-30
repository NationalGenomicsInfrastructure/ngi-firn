/*
 * Inventory Router - Aggregation Index
 * ************************************
 *
 * Merges all inventory sub-routers into a single inventoryRouter.
 * Registered in the main firnRouter as `inventory: inventoryRouter`.
 *
 * Cross-cutting queries:
 * getCounts - Return document counts per inventory type (rooms, equipment, containers, items)
 */

import { createTRPCRouter, authedProcedure } from '../../init'
import { roomsRouter } from './rooms'
// import { containersRouter } from './containers'
// import { itemsRouter } from './items'
// import { tasksRouter } from './tasks'
// import { templatesRouter } from './templates'
import { couchDB } from '../../../database/couchdb'
import { ensureViews } from '../../../crud/views'

export const inventoryRouter = createTRPCRouter({
  rooms: roomsRouter,
  // containers: containersRouter,
  // items: itemsRouter,
  // tasks: tasksRouter,
  // templates: templatesRouter,

  getCounts: authedProcedure
    .query(async () => {
      await ensureViews()

      const result = await couchDB.queryView<string, number>(
        'firn-inventory',
        'by_type',
        { group: true, reduce: true }
      )

      const counts: Record<string, number> = {}
      for (const row of result.rows) {
        counts[row.key] = row.value
      }

      return {
        rooms: counts.room ?? 0,
        equipment: counts.storageEquipment ?? 0,
        containers: counts.container ?? 0,
        items: counts.inventoryItem ?? 0
      }
    })
})
