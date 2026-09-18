import { z } from 'zod'

// PostgreSQL time columns include seconds; the editor works in minutes.
const availabilityTimeSchema = z.string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/, 'Informe um horário válido no formato HH:mm')
  .transform(value => value.slice(0, 5))

export const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: availabilityTimeSchema,
  endTime: availabilityTimeSchema
}).refine(rule => rule.endTime > rule.startTime, {
  message: 'O horário final deve ser posterior ao horário inicial',
  path: ['endTime']
})
