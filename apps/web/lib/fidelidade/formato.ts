/**
 * Como os pontos aparecem na tela. Puro — usado na ficha do cliente, no portal e
 * na exportação de LGPD.
 */

export type TipoDeLancamento =
  | 'GANHO' | 'ESTORNO_GANHO' | 'AJUSTE' | 'RESGATE' | 'ESTORNO_RESGATE'
  | 'VOUCHER' | 'VOUCHER_CANCELADO' | 'EXPIRACAO' | 'BONUS'

const ROTULOS: Record<TipoDeLancamento, string> = {
  GANHO:             'Ganho no pagamento',
  ESTORNO_GANHO:     'Estorno do pagamento',
  AJUSTE:            'Ajuste da equipe',
  RESGATE:           'Usado no pagamento',
  ESTORNO_RESGATE:   'Devolvido (estorno)',
  VOUCHER:           'Trocado por recompensa',
  VOUCHER_CANCELADO: 'Devolvido (voucher cancelado)',
  EXPIRACAO:         'Pontos vencidos',
  BONUS:             'Bônus',
}

/** O bônus diz QUAL (aniversário, primeiro acesso) pela descrição que o banco gravou. */
export function rotuloDoLancamento(tipo: string, descricao?: string | null): string {
  if (tipo === 'BONUS' && descricao) return descricao
  // O prêmio por indicação que saiu com o estorno do pagamento da indicada (F52): diz de quem.
  if (tipo === 'ESTORNO_GANHO' && descricao?.startsWith('Estorno da indicação')) return descricao
  return ROTULOS[tipo as TipoDeLancamento] ?? 'Lançamento'
}

/**
 * A linha de baixo do extrato: a descrição que o banco gravou, só quando ela diz
 * algo além do título (A41 da 12ª simulação: "Indicação de Carla Duarte" saía
 * duas vezes — o bônus e o estorno da indicação usam a descrição como título).
 */
export function descricaoDoLancamento(tipo: string, descricao?: string | null): string | null {
  const d = (descricao ?? '').trim()
  if (!d || d === rotuloDoLancamento(tipo, descricao).trim()) return null
  return d
}

/**
 * A linha de baixo no extrato do APP (A26 da 25ª simulação; princípio 3): a
 * troca diz a recompensa ("Recompensa: Limpeza de pele") e o uso no pagamento
 * diz o desconto — textos que o banco escreve. Os outros ficam de fora: o
 * ajuste, o voucher cancelado e o estorno levam o motivo ou a descrição que a
 * equipe escreveu, que não é para a cliente.
 */
export function descricaoParaACliente(tipo: string, descricao?: string | null): string | null {
  return tipo === 'VOUCHER' || tipo === 'RESGATE' ? descricaoDoLancamento(tipo, descricao) : null
}

/**
 * Sem a troca pelo app, a recompensa que o saldo já alcança diz isso (A53 da
 * 12ª simulação: com 780 pontos, a de 500 dizia só "a troca é feita na
 * recepção").
 */
export function jaPodeTrocar(saldo: number, custo: number): string | null {
  return saldo >= custo ? 'Você já pode trocar: peça à equipe.' : null
}

/** Quanto os pontos valem em R$, pelo valor do ponto da rede. Nunca negativo. */
export function pontosEmReais(pontos: number, valorDoPonto: number): number {
  if (!Number.isFinite(pontos) || !Number.isFinite(valorDoPonto) || pontos <= 0 || valorDoPonto <= 0) return 0
  return Math.round(pontos * valorDoPonto * 100) / 100
}

/** "1.240 pontos", "1 ponto", "−30 pontos". */
export function formatarPontos(pontos: number): string {
  const abs = Math.abs(pontos).toLocaleString('pt-BR')
  const sinal = pontos < 0 ? '−' : ''
  return `${sinal}${abs} ${Math.abs(pontos) === 1 ? 'ponto' : 'pontos'}`
}

/**
 * "Faltam 120 pontos" para a recompensa que o saldo não alcança — ou nulo,
 * quando alcança (J-52, 2026-10-30: o "Trocar" desabilitado não explicava, no
 * app nem na ficha). Saldo negativo conta a partir do que se deve.
 */
export function faltamPontos(saldo: number, custo: number): string | null {
  const falta = Math.ceil(custo - saldo)
  if (!(falta > 0)) return null
  return `${falta === 1 ? 'Falta' : 'Faltam'} ${formatarPontos(falta)}`
}

/**
 * A explicação do catálogo de recompensas (Configurações → Fidelidade), pela
 * troca pelo app da rede (`client_redeem`). Dizia "feita pela equipe" mesmo
 * com a troca pelo app ligada (J-12).
 */
export function explicacaoDoCatalogo(trocaPeloPortal: boolean): string {
  const base = 'O que o cliente pode ganhar trocando pontos. A troca vira um voucher com validade'
  return trocaPeloPortal
    ? base + ': a própria cliente troca pelo app, e a equipe também troca na ficha do cliente.'
    : base + ', feita pela equipe na ficha do cliente.'
}

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O desconto da recompensa acima do que os pontos dela valem (A18 da 21ª
 * simulação; princípio 2: avisa, não recusa): o voucher de R$ 30 por 200
 * pontos, com o ponto a R$ 0,01, dizia só "200 pontos valem R$ 2,00". Nulo
 * quando não passa, ou sem o valor do ponto.
 */
export function avisoDaRecompensaAcimaDosPontos(desconto: number, pontos: number, valorDoPonto: number | null): string | null {
  if (valorDoPonto == null || !(desconto > 0)) return null
  const valem = pontosEmReais(pontos, valorDoPonto)
  if (!(valem > 0) || desconto <= valem) return null
  const vezes = Math.round((desconto / valem) * 10) / 10
  const quanto = vezes >= 2 ? `${vezes.toLocaleString('pt-BR')} vezes o que` : 'mais do que'
  const osPontos = pontos === 1 ? `o ${formatarPontos(pontos)} vale` : `os ${formatarPontos(pontos)} valem`
  return `O desconto (${reais(desconto)}) vale ${quanto} ${osPontos} (${reais(valem)}). Confira o custo em pontos ou o valor do ponto.`
}
