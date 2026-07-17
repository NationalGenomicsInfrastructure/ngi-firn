import { z } from 'zod'

// Container type classifications
export const itemTypeSchema = z.enum([
  'ampoule',
  'blottingMembrane',
  'bottle',
  'capillary',
  'cassette',
  'conicalTube',
  'cryovial',
  'cuvette',
  'jar',
  'microcentrifugeTube',
  'microscopySlide',
  'pcrStrip',
  'petriDish',
  'plate',
  'spinColumn',
  'vial',
  'other'
])

export type ItemType = z.infer<typeof itemTypeSchema>
