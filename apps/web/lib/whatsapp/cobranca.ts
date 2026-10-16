/**
 * O que a Meta cobra pelas mensagens do WhatsApp oficial (2026-10-15).
 *
 * O BellarisOS é Tech Provider: a conta do WhatsApp (a WABA) é da CLÍNICA, e é
 * ela quem paga a Meta, com a forma de pagamento cadastrada lá. Nada passa por
 * nós — por isso o sistema não cobra, só INFORMA: quanto um template custa antes
 * de sair, quanto do mês já foi cobrado e quando a Meta recusou por falta de
 * pagamento.
 *
 * A tabela é a do Brasil (os destinatários das clínicas são daqui), em reais,
 * vigente desde 01/10/2026. Ela muda de tempos em tempos e é a ÚNICA cópia no
 * sistema: atualizar aqui atualiza o seletor de template, a tela de templates e
 * a estimativa do mês. O que foi cobrado DE FATO não sai daqui, sai do webhook
 * (`pricing.billable` de cada mensagem); a tabela só converte em reais.
 *
 * Puro de propósito: o seletor de template (navegador) e o servidor o usam.
 */

export type CategoriaDeCobranca = 'marketing' | 'utility' | 'authentication' | 'service'

export const TABELA_DA_META = {
  vigencia: '2026-10-01',
  /** Reais por mensagem ENTREGUE. Utilidade e autenticação caem com o volume; aqui, a faixa inicial. */
  precos: { marketing: 0.3217, utility: 0.035, authentication: 0.035, service: 0.035 } as Record<CategoriaDeCobranca, number>,
  /** Respostas digitadas (dentro da janela) grátis por número, por mês. */
  respostasGratisPorMes: 1000,
} as const

export const ROTULO_DA_CATEGORIA: Record<CategoriaDeCobranca, string> = {
  marketing:      'marketing',
  utility:        'utilidade',
  authentication: 'autenticação',
  service:        'respostas',
}

/** Conta sem forma de pagamento válida: a Meta recusa todo template. */
export const CODIGO_SEM_PAGAMENTO = 131042

export const MENSAGEM_SEM_PAGAMENTO =
  'A Meta recusou: a conta do WhatsApp deste número está sem forma de pagamento válida. '
  + 'Cadastre um cartão no Gerenciador do WhatsApp da Meta (Faturamento) e envie de novo.'

/** O aviso de quem conecta um número oficial: a conta (e a fatura) é da clínica. */
export const AVISO_DE_COBRANCA =
  'A Meta cobra direto na conta do WhatsApp da clínica: cada template entregue (de marketing, '
  + `cerca de ${formatarPreco(TABELA_DA_META.precos.marketing)}; de utilidade, ${formatarPreco(TABELA_DA_META.precos.utility)}) `
  + `e as respostas além de ${TABELA_DA_META.respostasGratisPorMes.toLocaleString('pt-BR')} por mês no número. `
  + 'Depois de conectar, cadastre uma forma de pagamento no Gerenciador do WhatsApp da Meta — sem ela, os templates são recusados.'

export function categoriaDoTemplate(category: string): CategoriaDeCobranca {
  const c = category.toUpperCase()
  if (c === 'MARKETING') return 'marketing'
  if (c === 'AUTHENTICATION') return 'authentication'
  return 'utility'
}

export function precoDaCategoria(categoria: CategoriaDeCobranca): number {
  return TABELA_DA_META.precos[categoria]
}

/** Preço de centavos: "R$ 0,035" não pode virar "R$ 0,04" (seria 14% a mais). */
export function formatarPreco(valor: number): string {
  const casas = valor > 0 && valor < 0.1 ? 3 : 2
  return valor.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: casas,
  }).replace(/ /g, ' ')
}

/**
 * O que o seletor de template diz antes de enviar. Com a janela aberta, o
 * template de marketing é o jeito MAIS CARO de dizer algo que uma resposta
 * digitada diria — e é o único caso em que o aviso vira alerta.
 */
export function avisoDoTemplate(category: string, janelaAberta: boolean): { tom: 'info' | 'alerta'; texto: string } {
  const categoria = categoriaDoTemplate(category)
  const base = `Template de ${ROTULO_DA_CATEGORIA[categoria]}: a Meta cobra cerca de `
    + `${formatarPreco(precoDaCategoria(categoria))} por mensagem entregue, na conta do WhatsApp da clínica.`
  if (janelaAberta && categoria === 'marketing') {
    return {
      tom: 'alerta',
      texto: `${base} A janela está aberta: uma resposta digitada sai mais barata — e as `
        + `${TABELA_DA_META.respostasGratisPorMes.toLocaleString('pt-BR')} primeiras do mês no número são grátis.`,
    }
  }
  return { tom: 'info', texto: base }
}

/** Reais estimados do que a Meta marcou como cobrado. */
export function estimarCusto(linhas: { categoria: CategoriaDeCobranca; cobradas: number }[]): number {
  return linhas.reduce((soma, l) => soma + l.cobradas * precoDaCategoria(l.categoria), 0)
}

export function ehCategoriaDeCobranca(v: unknown): v is CategoriaDeCobranca {
  return v === 'marketing' || v === 'utility' || v === 'authentication' || v === 'service'
}

/** O mês de um número na Meta, como Configurações o mostra (`lib/metrics/whatsapp`). */
export interface CobrancaDoNumero {
  /** Entregues e cobradas por categoria, no mês corrente (fuso de SP). */
  porCategoria: Record<CategoriaDeCobranca, { entregues: number; cobradas: number }>
  /** Reais estimados pela tabela, só do que a Meta marcou como cobrado. */
  estimativa: number
  /** Quando a Meta recusou por falta de pagamento, sem template entregue depois. */
  pagamentoRecusadoEm: string | null
}
