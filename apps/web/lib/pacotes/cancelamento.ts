/**
 * A conta do CANCELAMENTO DE PACOTE (F2b da 5ª simulação; decisão do Heitor,
 * 2026-11-01: "concordo"). Quem faz a conta é o banco (`pacote_cancelar`,
 * com `p_simular` para a tela mostrá-la antes; sem ele, a mesma função
 * grava): aqui só o formato que a janela lê.
 */

export type DestinoDaDevolucao = 'ESTORNO' | 'CREDITO'
export type EscolhaDosAgendamentos = 'CANCELAR' | 'SOLTAR'
/**
 * Como estornar o pagamento que volta EM PARTE (r2-ven-05): o estorno parcial
 * (o pagamento fica com o usado) ou o pagamento inteiro estornado e o usado
 * lançado de novo. No cartão, só o inteiro (r2-fin-03).
 */
export type ComoEstornar = 'PARCIAL' | 'INTEIRO'

/** O pagamento que o estorno pega em parte (o mais novo que passa do que volta). */
export interface PagamentoEmParte {
  id:        string
  descricao: string
  metodo:    string | null
  vezes:     number | null
  valor:     number
  /** O que volta dele. */
  volta:     number
  /** O que fica (o usado): o valor do pagamento novo, no estorno inteiro. */
  fica:      number
  /** Crédito ou débito: o estorno parcial não existe. */
  cartao:    boolean
}

export interface ParcelaQueCai {
  id:         string
  descricao:  string
  vencimento: string | null
  valor:      number
  /** Quanto dela cai: inteira (cai = valor) ou em parte (fica o resto). */
  cai:        number
  fica:       number
}

export interface SessaoAgendadaDoPacote {
  id:           string
  quando:       string
  preco:        number
  procedimento: string | null
  profissional: string | null
}

export interface PreviaDoCancelamento {
  pacote:        string
  /** O preço vendido (com o desconto). */
  preco:         number
  sessoes:       number
  restantes:     number
  /** O valor das sessões restantes — o rateio do pacote, com o desconto. */
  valorRestante: number
  usado:         number
  pago:          number
  aReceber:      number
  parcelas:      ParcelaQueCai[]
  /** O a receber que cai antes de devolver qualquer coisa. */
  cai:           number
  /** O pago além do usado: volta como estorno ou crédito. */
  devolver:      number
  fidelidade:    boolean
  agendamentos:  SessaoAgendadaDoPacote[]
  /** O pagamento que volta em parte, se houver: pede a escolha de como estornar. */
  parcial:       PagamentoEmParte | null
}

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

/** O jsonb de `pacote_cancelar` no formato da tela. */
export function lerPreviaDoCancelamento(j: Record<string, unknown>): PreviaDoCancelamento {
  const lista = <T>(v: unknown) => (Array.isArray(v) ? v : []) as T[]
  return {
    pacote:        String(j.pacote ?? 'Pacote'),
    preco:         num(j.preco),
    sessoes:       Number(j.sessoes ?? 0),
    restantes:     Number(j.restantes ?? 0),
    valorRestante: num(j.valor_restante),
    usado:         num(j.usado),
    pago:          num(j.pago),
    aReceber:      num(j.a_receber),
    parcelas:      lerParcelasQueCaem(j.parcelas),
    cai:           num(j.cai),
    devolver:      num(j.devolver),
    fidelidade:    j.fidelidade === true,
    agendamentos:  lista<Record<string, unknown>>(j.agendamentos).map(a => ({
      id: String(a.id), quando: String(a.quando), preco: num(a.preco),
      procedimento: (a.procedimento as string | null) ?? null, profissional: (a.profissional as string | null) ?? null,
    })),
    parcial:       lerParcial(j.parcial),
  }
}

/** As parcelas a receber que caem, do jsonb do banco (pacote e pré-pago). */
export function lerParcelasQueCaem(v: unknown): ParcelaQueCai[] {
  return (Array.isArray(v) ? v : [] as Record<string, unknown>[]).map((p: Record<string, unknown>) => ({
    id: String(p.id), descricao: String(p.descricao ?? ''), vencimento: (p.vencimento as string | null) ?? null,
    valor: num(p.valor), cai: num(p.cai), fica: num(p.fica),
  }))
}

/** O pagamento que volta em parte, do jsonb do banco (pacote e pré-pago). */
export function lerParcial(v: unknown): PagamentoEmParte | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  return {
    id: String(p.id), descricao: String(p.descricao ?? ''), metodo: (p.metodo as string | null) ?? null,
    vezes: p.vezes == null ? null : Number(p.vezes), valor: num(p.valor), volta: num(p.volta), fica: num(p.fica),
    cartao: p.cartao === true,
  }
}

/** Os ids que o banco cancelou (para o evento e o aviso de cada um). */
export function agendamentosCancelados(j: Record<string, unknown>): string[] {
  return (Array.isArray(j.cancelados) ? j.cancelados : []).map(String)
}

/**
 * O "Pacote cancelado" do histórico da ficha (os dois portais), a partir do
 * retrato gravado em `client_packages.cancelamento`.
 */
export function historicoDoCancelamento(
  pkg: { cancelado_em?: string | null; cancelamento_motivo?: string | null; cancelamento?: unknown },
  nome: string,
  brl: (v: number) => string,
): { date: string; title: string; subtitle: string; amount: number | null } | null {
  if (!pkg.cancelado_em) return null
  const c = (pkg.cancelamento ?? {}) as Record<string, unknown>
  const restantes = Number(c.restantes ?? 0)
  const devolver = num(c.devolver)
  const comoVoltou = devolver > 0
    ? c.destino === 'CREDITO' ? `${brl(devolver)} em crédito na clínica`
      : c.estorno === 'INTEIRO' ? `${brl(devolver)} estornados (o pagamento inteiro estornado e o usado lançado de novo)`
      : `${brl(devolver)} estornados`
    : 'nada a devolver'
  const partes = [
    restantes ? `${restantes} ${restantes === 1 ? 'sessão cancelada' : 'sessões canceladas'}` : null,
    comoVoltou,
    pkg.cancelamento_motivo ? `Motivo: ${pkg.cancelamento_motivo}` : null,
  ].filter(Boolean)
  return { date: pkg.cancelado_em, title: `Pacote cancelado: ${nome}`, subtitle: partes.join(' · '), amount: devolver > 0 ? devolver : null }
}
