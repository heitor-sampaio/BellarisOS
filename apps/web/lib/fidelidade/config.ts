import { z } from 'zod'

/**
 * A configuração do programa de fidelidade de uma rede (`loyalty_configs`).
 *
 * O programa é da REDE e nasce desligado (decisão do Heitor, 2026-09-28): cada
 * rede liga ou não, e escolhe como o cliente ganha. Nada aqui calcula ponto — a
 * regra de ganho mora no banco (`fidelidade_pontos_do_pagamento`), porque o
 * ponto nasce no gatilho do pagamento.
 */

export const MODOS_DE_GANHO = ['POR_REAL', 'POR_PROCEDIMENTO'] as const
export type ModoDeGanho = typeof MODOS_DE_GANHO[number]

export const BASES_DA_COMISSAO = ['PRECO', 'VALOR_PAGO'] as const
export type BaseDaComissao = typeof BASES_DA_COMISSAO[number]

export interface ConfigFidelidade {
  enabled:             boolean
  earn_mode:           ModoDeGanho
  /** Pontos por R$ 1 pago (modo POR_REAL). */
  points_per_real:     number
  /** Quanto vale um ponto no resgate, em R$. */
  redeem_points_value: number
  redeem_min_points:   number
  redeem_max_pct:      number
  /** Nulo = os pontos não vencem. */
  expiry_months:       number | null
  scope_per_branch:    boolean
  commission_base:     BaseDaComissao
  // Opcionais da rede (2026-09-29), todos desligados de fábrica.
  /** Pontos no aniversário. 0 = desligado. */
  birthday_bonus:      number
  /** Pontos no primeiro acesso ao portal/app. 0 = desligado. */
  first_access_bonus:  number
  /** O cliente também troca pontos por recompensa pelo portal. */
  client_redeem:       boolean
  /** Avisa por push N dias antes de vencer. Nulo = não avisa (e sem validade, nunca). */
  expiry_notice_days:  number | null
}

/** A config de quem nunca configurou: tudo desligado, com valores sensatos para quando ligar. */
export const CONFIG_PADRAO: ConfigFidelidade = {
  enabled:             false,
  earn_mode:           'POR_REAL',
  points_per_real:     1,
  redeem_points_value: 0.01,
  redeem_min_points:   0,
  redeem_max_pct:      100,
  expiry_months:       null,
  scope_per_branch:    false,
  commission_base:     'PRECO',
  birthday_bonus:      0,
  first_access_bonus:  0,
  client_redeem:       false,
  expiry_notice_days:  null,
}

/** O que a tela manda para salvar. Os números chegam do formulário; a validação é aqui. */
export const EntradaDaConfig = z.object({
  enabled:         z.boolean(),
  earn_mode:       z.enum(MODOS_DE_GANHO),
  points_per_real: z.coerce.number()
    .min(0.01, 'Informe quantos pontos o cliente ganha por R$ 1.')
    .max(1000, 'No máximo 1.000 pontos por R$ 1.'),
  commission_base: z.enum(BASES_DA_COMISSAO),
  // Resgate como desconto no pagamento (fase 2).
  redeem_points_value: z.coerce.number()
    .min(0.0001, 'Informe quanto vale um ponto, em R$.')
    .max(1000, 'Um ponto vale no máximo R$ 1.000.'),
  redeem_min_points: z.coerce.number().int('O mínimo é um número inteiro de pontos.')
    .min(0, 'O mínimo não pode ser negativo.').max(1_000_000, 'Mínimo alto demais.'),
  redeem_max_pct: z.coerce.number()
    .min(1, 'Os pontos precisam pagar ao menos 1% do valor.')
    .max(100, 'Os pontos pagam no máximo 100% do valor.'),
  // Validade e abrangência (fase 4). Nulo = os pontos não vencem.
  expiry_months: z.union([
    z.null(),
    z.coerce.number().int('A validade é um número inteiro de meses.')
      .min(1, 'A validade é de pelo menos 1 mês.').max(120, 'A validade é de no máximo 120 meses.'),
  ]),
  scope_per_branch: z.boolean(),
  // Opcionais. Bônus 0 = desligado; aviso nulo = não avisa.
  birthday_bonus: z.coerce.number().int('O bônus é um número inteiro de pontos.')
    .min(0, 'O bônus não pode ser negativo.').max(1_000_000, 'Bônus alto demais.'),
  first_access_bonus: z.coerce.number().int('O bônus é um número inteiro de pontos.')
    .min(0, 'O bônus não pode ser negativo.').max(1_000_000, 'Bônus alto demais.'),
  client_redeem: z.boolean(),
  expiry_notice_days: z.union([
    z.null(),
    z.coerce.number().int('O aviso é um número inteiro de dias.')
      .min(1, 'O aviso sai com pelo menos 1 dia de antecedência.').max(90, 'O aviso sai com no máximo 90 dias de antecedência.'),
  ]),
})
export type EntradaDaConfig = z.infer<typeof EntradaDaConfig>

/** Uma linha de `loyalty_configs` (numeric chega como string) → a config tipada. */
export function configDaLinha(linha: Record<string, unknown> | null | undefined): ConfigFidelidade {
  if (!linha) return { ...CONFIG_PADRAO }
  const num = (v: unknown, padrao: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : padrao
  }
  return {
    enabled:             linha.enabled === true,
    earn_mode:           linha.earn_mode === 'POR_PROCEDIMENTO' ? 'POR_PROCEDIMENTO' : 'POR_REAL',
    points_per_real:     num(linha.points_per_real, CONFIG_PADRAO.points_per_real),
    redeem_points_value: num(linha.redeem_points_value, CONFIG_PADRAO.redeem_points_value),
    redeem_min_points:   num(linha.redeem_min_points, 0),
    redeem_max_pct:      num(linha.redeem_max_pct, 100),
    expiry_months:       linha.expiry_months == null ? null : num(linha.expiry_months, 0) || null,
    scope_per_branch:    linha.scope_per_branch === true,
    commission_base:     linha.commission_base === 'VALOR_PAGO' ? 'VALOR_PAGO' : 'PRECO',
    birthday_bonus:      num(linha.birthday_bonus, 0),
    first_access_bonus:  num(linha.first_access_bonus, 0),
    client_redeem:       linha.client_redeem === true,
    expiry_notice_days:  linha.expiry_notice_days == null ? null : num(linha.expiry_notice_days, 0) || null,
  }
}
