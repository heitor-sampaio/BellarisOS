import { formatBRL } from '@estetica-os/utils'

/**
 * O que fica numa unidade quando ela sai do ar (H6 em `plataforma.md`, o
 * Heitor: "mostra o que fica e oferece resolver, sem impedir"; C67 da F70 e
 * D2/A32 da 14ª simulação, F72). Puro: a leitura do banco é
 * `oQueFicaNaUnidade` (`lib/unidades/desativar.ts`).
 *
 * - `fixos`: quem da equipe tem a abrangência só nela (sem ela, não entra);
 * - `agendamentos`: os futuros ainda marcados (o primeiro, para o link da agenda);
 * - `estoque`: os produtos com saldo e o valor (`metrics_valor_em_estoque`);
 * - `aReceber`: o a receber em aberto (`metrics_a_receber_em_aberto`) e os
 *   atendimentos concluídos sem pagamento, à parte, como no Financeiro;
 * - `comissaoAPagar`: a comissão liberada que ainda não foi fechada.
 */
export interface OQueFicaNaUnidade {
  fixos:        { id: string; nome: string }[]
  agendamentos: number
  /** O primeiro agendamento futuro (ISO) — o "Ver os agendamentos" abre no dia dele. */
  primeiroAgendamento: string | null
  /** O dia dele (AAAA-MM-DD) no relógio da unidade — o `&date=` do link da agenda. */
  diaDoPrimeiro: string | null
  estoque:      { itens: number; valor: number }
  aReceber:     number
  atendimentosSemPagamento: { n: number; valor: number }
  comissaoAPagar: number
}

export const NADA_FICA: OQueFicaNaUnidade = {
  fixos: [], agendamentos: 0, primeiroAgendamento: null, diaDoPrimeiro: null, estoque: { itens: 0, valor: 0 }, aReceber: 0,
  atendimentosSemPagamento: { n: 0, valor: 0 }, comissaoAPagar: 0,
}

/**
 * A unidade (desativada) ainda tem movimento a resolver: agenda, saldo,
 * dinheiro a receber ou a pagar. A equipe fixa não entra aqui: ela se resolve
 * na Equipe, e não é número de tela nenhuma.
 */
export function temOQueFicou(o: OQueFicaNaUnidade): boolean {
  return o.agendamentos > 0 || o.estoque.itens > 0 || o.estoque.valor > 0 || o.aReceber > 0
    || o.atendimentosSemPagamento.n > 0 || o.comissaoAPagar > 0
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`)

/** "A unidade X tem 2 pessoas da equipe só nela, 3 agendamentos marcados, R$ 894,80 em estoque (4 itens)… e R$ 39,00 de comissão a pagar." (null = nada fica). */
export function resumoDoQueFica(nome: string, o: OQueFicaNaUnidade): string | null {
  const partes: string[] = []
  if (o.fixos.length) partes.push(plural(o.fixos.length, 'pessoa da equipe só nela', 'pessoas da equipe só nela'))
  if (o.agendamentos) partes.push(plural(o.agendamentos, 'agendamento marcado', 'agendamentos marcados'))
  if (o.estoque.itens || o.estoque.valor) partes.push(`${formatBRL(o.estoque.valor)} em estoque (${plural(o.estoque.itens, 'item', 'itens')})`)
  if (o.aReceber) partes.push(`${formatBRL(o.aReceber)} a receber`)
  if (o.atendimentosSemPagamento.n) {
    partes.push(`${plural(o.atendimentosSemPagamento.n, 'atendimento concluído sem pagamento', 'atendimentos concluídos sem pagamento')} (${formatBRL(o.atendimentosSemPagamento.valor)})`)
  }
  if (o.comissaoAPagar) partes.push(`${formatBRL(o.comissaoAPagar)} de comissão a pagar`)
  if (!partes.length) return null
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
  return `A unidade ${nome} tem ${lista}.`
}

/** O selo da unidade desativada, onde ela aparece (seletor, linha, cabeçalho). */
export const SELO_DESATIVADA = 'Unidade desativada'

/** O nome da unidade na tela: a desativada diz que é ("Pampulha (unidade desativada)"). */
export function nomeNaTela(u: { name: string; ativa: boolean }): string {
  return u.ativa ? u.name : `${u.name} (unidade desativada)`
}

/** As unidades de LEITURA: as ativas e as desativadas que ainda têm o que ficou ou movimento no período. */
export function escolherUnidadesDeLeitura<T extends { id: string; ativa: boolean }>(todas: T[], comAlgo: Set<string>): T[] {
  return todas.filter(u => u.ativa || comAlgo.has(u.id))
}

/**
 * Os caminhos para resolver o que ficou (F72; D2/A32 da 14ª): cada um leva à
 * tela que JÁ existe, no recorte da unidade — a agenda no dia do primeiro
 * agendamento, o estoque dela (a transferência abre com ela de origem), o a
 * receber dela e as comissões dela. Nenhum repasse em lote novo (regra 3).
 */
export function caminhosDoQueFica(branchId: string, o: OQueFicaNaUnidade): { chave: string; texto: string; rotulo: string; href: string }[] {
  const c: { chave: string; texto: string; rotulo: string; href: string }[] = []
  if (o.agendamentos > 0) c.push({
    chave: 'agenda',
    texto: `${o.agendamentos === 1 ? 'O agendamento continua marcado' : `Os ${o.agendamentos} agendamentos continuam marcados`}: remarque para outra unidade ou cancele na agenda.`,
    rotulo: 'Ver os agendamentos',
    href: `/admin/agenda?unidade=${branchId}${o.diaDoPrimeiro ? `&date=${o.diaDoPrimeiro}` : ''}`,
  })
  if (o.estoque.itens > 0 || o.estoque.valor > 0) c.push({
    chave: 'estoque',
    texto: `${formatBRL(o.estoque.valor)} em estoque (${plural(o.estoque.itens, 'item', 'itens')}) continua contado no total: transfira para outra unidade, ou registre a perda.`,
    rotulo: 'Transferir o estoque',
    href: `/admin/estoque?unidade=${branchId}`,
  })
  if (o.aReceber > 0 || o.atendimentosSemPagamento.n > 0) c.push({
    chave: 'a-receber',
    texto: 'O a receber continua no Financeiro, para dar baixa quando o dinheiro entrar.',
    rotulo: 'Ver o a receber',
    href: `/admin/financeiro?aba=a-receber&unidade=${branchId}`,
  })
  if (o.comissaoAPagar > 0) c.push({
    chave: 'comissoes',
    texto: `${formatBRL(o.comissaoAPagar)} de comissão a pagar: feche e pague nas Comissões.`,
    rotulo: 'Fechar as comissões',
    href: `/admin/financeiro/comissoes?unidade=${branchId}`,
  })
  return c
}
