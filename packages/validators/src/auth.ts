import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

export type RegisterInput = z.infer<typeof RegisterSchema>

export const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

export const ClientLoginSchema = z.object({
  document: z
    .string()
    .min(11, 'CPF inválido')
    .max(14, 'CPF inválido')
    .transform((v) => v.replace(/\D/g, '')),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

export const ClientMagicLinkSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

export const ResetPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type ClientLoginInput = z.infer<typeof ClientLoginSchema>
