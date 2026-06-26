import { z } from 'zod'

export const CreateClientSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  document: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\D/g, '') ?? null),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')).transform((v) => v || null),
  phone: z
    .string()
    .min(10, 'Telefone inválido')
    .transform((v) => v.replace(/\D/g, '')),
  birthDate: z.coerce.date().optional().nullable(),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  zipCode: z.string().optional().nullable(),
  referredBy: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
})

export const UpdateClientSchema = CreateClientSchema.partial()

export type CreateClientInput = z.infer<typeof CreateClientSchema>
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>
