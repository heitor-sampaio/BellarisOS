import { z } from 'zod'

export const CreateAppointmentSchema = z.object({
  clientId: z.string().uuid(),
  procedureId: z.string().uuid(),
  professionalId: z.string().uuid(),
  roomId: z.string().uuid().optional().nullable(),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().positive(),
  price: z.number().positive(),
  notes: z.string().optional().nullable(),
  clientNotes: z.string().optional().nullable(),
  source: z.enum(['INTERNAL', 'ONLINE', 'CLIENT_APP']).default('INTERNAL'),
  packageSessionId: z.string().uuid().optional().nullable(),
})

export const UpdateAppointmentSchema = CreateAppointmentSchema.partial().omit({ source: true })

export const CancelAppointmentSchema = z.object({
  cancellationReason: z.string().min(1, 'Motivo de cancelamento obrigatório'),
})

export const CompleteAppointmentSchema = z.object({
  notes: z.string().optional().nullable(),
  productsUsed: z.record(z.string(), z.number()).optional(),
  intercurrences: z.string().optional().nullable(),
  paymentMethod: z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'INTERNAL_CREDIT']),
  packageSessionId: z.string().uuid().optional().nullable(),
})

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentSchema>
export type CompleteAppointmentInput = z.infer<typeof CompleteAppointmentSchema>
