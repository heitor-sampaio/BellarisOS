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

/**
 * O prêmio por indicação (decisão do Heitor, 2026-11-10): nasce DESLIGADO;
 * ligado, N pontos ou uma recompensa do catálogo para QUEM INDICOU, quando a
 * indicada paga o primeiro atendimento ou a primeira venda. Quem dá é o banco
 * (`private.indicacao_premiar`, no gatilho do pagamento).
 */
export const PREMIOS_DE_INDICACAO = ['DESLIGADO', 'PONTOS', 'RECOMPENSA'] as const
export type PremioDeIndicacao = typeof PREMIOS_DE_INDICACAO[number]
export type ModoDeGanho = typeof MODOS_DE_GANHO[number]


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
  // Opcionais da rede (2026-09-29), todos desligados de fábrica.
  /** Pontos no aniversário. 0 = desligado. */
  birthday_bonus:      number
  /** Pontos no primeiro acesso ao portal/app. 0 = desligado. */
  first_access_bonus:  number
  /** O cliente também troca pontos por recompensa pelo portal. */
  client_redeem:       boolean
  /** Avisa por push N dias antes de vencer. Nulo = não avisa (e sem validade, nunca). */
  expiry_notice_days:  number | null
  /** A venda de PRODUTO dá pontos (D4, 2026-10-30) — por real pago, em qualquer modo. Nasce desligado. */
  pontua_venda_de_produto: boolean
  /** O prêmio por indicação (nasce desligado). */
  indicacao_premio:        PremioDeIndicacao
  /** Os pontos de quem indicou (com o prêmio em PONTOS). */
  indicacao_pontos:        number
  /** A recompensa de quem indicou (com o prêmio em RECOMPENSA). */
  indicacao_recompensa_id: string | null
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
  birthday_bonus:      0,
  first_access_bonus:  0,
  client_redeem:       false,
  expiry_notice_days:  null,
  pontua_venda_de_produto: false,
  indicacao_premio:        'DESLIGADO',
  indicacao_pontos:        0,
  indicacao_recompensa_id: null,
}

/** O que a tela manda para salvar. Os números chegam do formulário; a validação é aqui. */
export const EntradaDaConfig = z.object({
  enabled:         z.boolean(),
  earn_mode:       z.enum(MODOS_DE_GANHO),
  points_per_real: z.coerce.number()
    .min(0.01, 'Informe quantos pontos o cliente ganha por R$ 1.')
    .max(1000, 'No máximo 1.000 pontos por R$ 1.'),
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
  // A venda de produto pontua? Sem o campo (chamador antigo), não.
  pontua_venda_de_produto: z.boolean().optional().default(false),
  // O prêmio por indicação. Sem o campo (chamador antigo), desligado.
  indicacao_premio: z.enum(PREMIOS_DE_INDICACAO).optional().default('DESLIGADO'),
  indicacao_pontos: z.coerce.number().int('Os pontos da indicação são um número inteiro.')
    .min(0, 'Os pontos não podem ser negativos.').max(1_000_000, 'Pontos demais.').optional().default(0),
  indicacao_recompensa_id: z.string().uuid().nullable().optional().default(null),
}).superRefine((c, ctx) => {
  if (c.indicacao_premio === 'PONTOS' && !(c.indicacao_pontos > 0)) {
    ctx.addIssue({ code: 'custom', path: ['indicacao_pontos'], message: 'Diga quantos pontos ganha quem indicou.' })
  }
  if (c.indicacao_premio === 'RECOMPENSA' && !c.indicacao_recompensa_id) {
    ctx.addIssue({ code: 'custom', path: ['indicacao_recompensa_id'], message: 'Escolha a recompensa de quem indicou.' })
  }
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
    birthday_bonus:      num(linha.birthday_bonus, 0),
    first_access_bonus:  num(linha.first_access_bonus, 0),
    client_redeem:       linha.client_redeem === true,
    expiry_notice_days:  linha.expiry_notice_days == null ? null : num(linha.expiry_notice_days, 0) || null,
    pontua_venda_de_produto: linha.pontua_venda_de_produto === true,
    indicacao_premio:        linha.indicacao_premio === 'PONTOS' || linha.indicacao_premio === 'RECOMPENSA' ? linha.indicacao_premio : 'DESLIGADO',
    indicacao_pontos:        num(linha.indicacao_pontos, 0),
    indicacao_recompensa_id: typeof linha.indicacao_recompensa_id === 'string' ? linha.indicacao_recompensa_id : null,
  }
}
