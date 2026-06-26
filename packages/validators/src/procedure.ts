import { z } from 'zod'

export const CreateProcedureSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  category: z.string().min(1, 'Categoria obrigatória'),
  description: z.string().optional().nullable(),
  durationMin: z.number().int().positive('Duração inválida'),
  price: z.number().positive('Preço inválido'),
  visibleOnClientApp: z.boolean().default(true),
  branchId: z.string().uuid().optional().nullable(),
})

export const UpdateProcedureSchema = CreateProcedureSchema.partial()

export const ProcedureProductSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
})

export type CreateProcedureInput = z.infer<typeof CreateProcedureSchema>
export type UpdateProcedureInput = z.infer<typeof UpdateProcedureSchema>
