import { z } from 'zod'
import { TIPOS_DE_RECOMPENSA } from './voucher'

/**
 * O que a tela do catálogo manda para salvar uma recompensa. Cada tipo exige o
 * que precisa e descarta o resto — o banco tem a mesma regra
 * (`loyalty_rewards_por_tipo`), aqui ela vira mensagem legível.
 */
export const EntradaDaRecompensa = z.object({
  id:             z.string().uuid().optional().nullable(),
  name:           z.string().trim().min(2, 'Dê um nome à recompensa.').max(120),
  description:    z.string().trim().max(500).optional().nullable(),
  type:           z.enum(TIPOS_DE_RECOMPENSA),
  points_cost:    z.coerce.number().int('O custo é um número inteiro de pontos.').min(1, 'Informe quantos pontos a recompensa custa.').max(10_000_000),
  procedure_id:   z.string().uuid().optional().nullable(),
  product_id:     z.string().uuid().optional().nullable(),
  discount_value: z.coerce.number().optional().nullable(),
  validity_days:  z.coerce.number().int().min(1, 'Validade de pelo menos 1 dia.').max(365, 'Validade de no máximo 365 dias.'),
  is_active:      z.boolean().default(true),
}).superRefine((r, ctx) => {
  const falta = (campo: string, mensagem: string) => ctx.addIssue({ code: 'custom', path: [campo], message: mensagem })
  if (r.type === 'PROCEDIMENTO' && !r.procedure_id) falta('procedure_id', 'Escolha o procedimento.')
  if (r.type === 'PRODUTO' && !r.product_id)        falta('product_id', 'Escolha o produto.')
  if (r.type === 'DESCONTO_VALOR' && !(Number(r.discount_value) > 0)) falta('discount_value', 'Informe o valor do desconto.')
  if (r.type === 'DESCONTO_PERCENTUAL' && !(Number(r.discount_value) > 0 && Number(r.discount_value) <= 100)) {
    falta('discount_value', 'O desconto em % vai de 0,01 a 100.')
  }
}).transform(r => ({
  ...r,
  // Só o campo do tipo vai para o banco.
  procedure_id:   r.type === 'PROCEDIMENTO' ? r.procedure_id ?? null : null,
  product_id:     r.type === 'PRODUTO' ? r.product_id ?? null : null,
  discount_value: r.type === 'DESCONTO_VALOR' || r.type === 'DESCONTO_PERCENTUAL' ? Number(r.discount_value) : null,
  description:    r.description?.trim() || null,
}))
export type EntradaDaRecompensa = z.infer<typeof EntradaDaRecompensa>
