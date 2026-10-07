import { ADICIONAIS, adicionalCabeNoPlano, type ChaveDeAdicional, type RecursosDoPlano } from './recursos'

/**
 * O que a rede CONTRATOU além do plano (2026-10-07): conexões de WhatsApp
 * extras e o Copilot avulso. A OFERTA (o preço por plano) e o catálogo moram
 * em `recursos.ts`; aqui, o contratado — `tenant_subscriptions.adicionais`,
 * `{ chave: { quantidade, valor_centavos } }`, com o preço RETRATADO quando foi
 * contratado (o catálogo mudar não reajusta ninguém).
 *
 * Quem grava é a função `assinatura_adicional_definir` (banco), para a clínica e
 * para o sistema; o banco repete estas contas em `rede_tem_recurso`,
 * `limite_do_plano` e na coluna gerada `valor_total_centavos`.
 */
export { ADICIONAIS, type ChaveDeAdicional } from './recursos'

/**
 * `especial`: o preço foi dado pelo SISTEMA e difere da oferta (cortesia,
 * desconto). A clínica cancela, mas não aumenta a quantidade dele — a
 * condição especial não se estende ao que ela compra sozinha.
 */
export type AdicionaisContratados = Partial<Record<ChaveDeAdicional, { quantidade: number; valor_centavos: number; especial?: true }>>

/** O preço que o plano da rede pede pelo adicional, ou null (não oferece; sem plano). */
export function precoOferecido(recursos: RecursosDoPlano | null, chave: ChaveDeAdicional): number | null {
  if (!recursos || !adicionalCabeNoPlano(recursos, chave)) return null
  return recursos.adicionais[chave]?.valor_centavos ?? null
}

/** O contratado como gravado no banco: tolerante — fora da faixa, zero ou desconhecido some. */
export function lerAdicionais(gravado: unknown): AdicionaisContratados {
  if (!gravado || typeof gravado !== 'object' || Array.isArray(gravado)) return {}
  const g = gravado as Record<string, { quantidade?: unknown; valor_centavos?: unknown } | null>
  const saida: AdicionaisContratados = {}
  for (const a of ADICIONAIS) {
    const q = g[a.chave]?.quantidade
    const v = g[a.chave]?.valor_centavos
    if (typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= a.maximo
      && typeof v === 'number' && Number.isInteger(v) && v >= 0) {
      saida[a.chave] = (g[a.chave] as { especial?: unknown }).especial === true
        ? { quantidade: q, valor_centavos: v, especial: true } : { quantidade: q, valor_centavos: v }
    }
  }
  return saida
}

/** Quanto os adicionais somam à mensalidade, em centavos. */
export function totalDosAdicionais(c: AdicionaisContratados): number {
  return ADICIONAIS.reduce((soma, a) => soma + (c[a.chave] ? c[a.chave]!.quantidade * c[a.chave]!.valor_centavos : 0), 0)
}

/**
 * O que a rede usa DE FATO: o retrato do plano mais o contratado. O WhatsApp
 * extra soma ao limite (e pode passar do teto do slider); o Copilot avulso
 * entra nas funcionalidades. Sem retrato, tudo liberado (null).
 */
export function recursosEfetivos(retrato: RecursosDoPlano | null, c: AdicionaisContratados): RecursosDoPlano | null {
  if (!retrato) return null
  const extra = c.whatsapp?.quantidade ?? 0
  const comCopilot = !!c.copilot && !retrato.funcionalidades.includes('copilot')
  if (!extra && !comCopilot) return retrato
  return {
    ...retrato,
    funcionalidades: comCopilot ? [...retrato.funcionalidades, 'copilot'] : retrato.funcionalidades,
    limites: { ...retrato.limites, whatsapp: retrato.limites.whatsapp === null ? null : retrato.limites.whatsapp + extra },
  }
}

/**
 * A rede trocou de plano: o adicional que o plano novo já inclui (Copilot no
 * plano, WhatsApp ilimitado) sai — seria cobrar duas vezes; o resto fica, com o
 * preço contratado. Sem plano (tudo liberado), saem todos.
 */
export function adicionaisAposTrocarDePlano(c: AdicionaisContratados, novo: RecursosDoPlano | null): AdicionaisContratados {
  if (!novo) return {}
  const saida: AdicionaisContratados = {}
  for (const a of ADICIONAIS) if (c[a.chave] && adicionalCabeNoPlano(novo, a.chave)) saida[a.chave] = c[a.chave]
  return saida
}

/**
 * As assinaturas ligadas cujo total não chegou ao Asaas (`valor_no_asaas_centavos`
 * diferente do total): o que a reserva do cron do sistema leva.
 */
export function pendentesNoAsaas(linhas: { tenant_id: string; valor_total_centavos: number; valor_no_asaas_centavos: number | null }[]): string[] {
  return linhas.filter(l => l.valor_no_asaas_centavos !== l.valor_total_centavos).map(l => l.tenant_id)
}
