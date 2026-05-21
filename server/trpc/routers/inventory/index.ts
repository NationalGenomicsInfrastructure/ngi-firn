/*
 * Inventory Router - Aggregation Index
 * ************************************
 *
 * Merges all inventory sub-routers into a single inventoryRouter.
 * Registered in the main firnRouter as `inventory: inventoryRouter`.
 */

import { createTRPCRouter } from '../../init'
import { locationsRouter } from './locations'
import { containersRouter } from './containers'
import { itemsRouter } from './items'
import { tasksRouter } from './tasks'
import { templatesRouter } from './templates'

export const inventoryRouter = createTRPCRouter({
  locations: locationsRouter,
  containers: containersRouter,
  items: itemsRouter,
  tasks: tasksRouter,
  templates: templatesRouter
})
