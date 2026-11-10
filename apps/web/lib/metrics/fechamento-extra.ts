import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { getFechamentoDoDia } from '@/lib/metrics/queries'

/**
 * O que o Fechamento do dia mostra AO LADO do resumo por forma (8ª simulação,
 * 2026-11-06). Os totais saem daqui, em centavos — a tela não soma.
 */

export interface EstornoDoDia {
  id:        string
  descricao: string
  forma:     string | null
  vezes:     number | null
  valor:     number
  motivo:    string | null
}

/**
 * A42: os estornos FEITOS no dia na unidade — o contra-lançamento
 * (`category = 'Estorno'`, pago no dia). Pela regra única, a venda estornada e
 * o estorno saem das entradas e das saídas, e o resumo do dia não mostrava que
 * o dinheiro voltou à cliente ("Saídas R$ 0"). A lista e o total são do banco
 * (`metrics_estornos_do_dia`).
 */
export async function getEstornosDoDia(args: { tenantId: string; branchId: string; from: Date; to: Date }): Promise<{ itens: EstornoDoDia[]; total: number }> {
  const linhas = await lerTodas((de, ate) => createAdminClient().rpc('metrics_estornos_do_dia', {
    p_tenant: args.tenantId, p_branch: args.branchId, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  }).range(de, ate), 'carregar os estornos do dia') as { id: string; descricao: string | null; forma: string | null; vezes: number | null; valor: number | string; motivo: string | null; total: number | string }[]
  const itens = (linhas ?? []).map(t => ({
    id: t.id, descricao: String(t.descricao ?? 'Estorno'), forma: t.forma ?? null, vezes: t.vezes ?? null,
    valor: Number(t.valor ?? 0), motivo: t.motivo ?? null,
  }))
  return { itens, total: Number(linhas?.[0]?.total ?? 0) }
}

/** O que não traz receita nas execuções, por nome (A47 e A43 da 8ª). */
export interface SemReceita { semPagamento: { n: number; valor: number }; comCredito: { n: number; valor: number } }

/**
 * A47 + A43 da 8ª: por procedimento e por profissional, as execuções do
 * período sem receita — o avulso concluído sem pagamento e o pago com crédito
 * na clínica (`metrics_atendimentos_sem_receita`). A regra F18 fica: a receita
 * dos atendimentos é a PAGA; a tela só passa a dizer o que ficou de fora.
 */
export async function getAtendimentosSemReceita(args: {
  tenantId: string; branchIds: string[] | null; from: Date; to: Date; professionalId?: string | null
}): Promise<{ porProcedimento: Record<string, SemReceita>; porProfissional: Record<string, SemReceita> }> {
  const linhas = await lerTodas((de, ate) => createAdminClient().rpc('metrics_atendimentos_sem_receita', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
    p_professional_id: args.professionalId ?? null,
  }).range(de, ate), 'contar os atendimentos sem receita') as {
    eixo: string; nome: string; sem_pagamento_n: number; sem_pagamento_valor: number | string; com_credito_n: number; com_credito_valor: number | string
  }[]
  const porProcedimento: Record<string, SemReceita> = {}
  const porProfissional: Record<string, SemReceita> = {}
  for (const l of linhas ?? []) {
    const v = {
      semPagamento: { n: Number(l.sem_pagamento_n), valor: Number(l.sem_pagamento_valor) },
      comCredito:   { n: Number(l.com_credito_n), valor: Number(l.com_credito_valor) },
    }
    ;(l.eixo === 'PROCEDIMENTO' ? porProcedimento : porProfissional)[l.nome] = v
  }
  return { porProcedimento, porProfissional }
}

/** A43 da 8ª: o que a cliente pagou com crédito na clínica (não é receita). */
export async function getPagoComCreditoDoCliente(tenantId: string, clientId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc('metrics_pago_com_credito_do_cliente', { p_tenant: tenantId, p_client: clientId })
  if (error) throw new Error(`Não consegui somar o pago com crédito: ${error.message}`)
  return Number(data ?? 0)
}

export interface MovimentoDaUnidade { id: string; nome: string; entradas: number; saidas: number; lancamentos: number }

/**
 * A45: o dia de CADA unidade e o da clínica (a mesma conta do Fechamento,
 * `getFechamentoDoDia`, por unidade), para o Fechamento da rede abrir na que
 * teve movimento e mostrar o todo. O total é em centavos.
 */
export async function getMovimentoDasUnidades(args: {
  tenantId: string; unidades: { id: string; name: string }[]; from: Date; to: Date
}): Promise<{ unidades: MovimentoDaUnidade[]; total: { entradas: number; saidas: number; lancamentos: number } }> {
  const resumos = await Promise.all(args.unidades.map(u =>
    getFechamentoDoDia({ tenantId: args.tenantId, branchId: u.id, from: args.from, to: args.to })))
  const unidades = args.unidades.map((u, i) => ({
    id: u.id, nome: u.name,
    entradas: resumos[i]!.total.entradas, saidas: resumos[i]!.total.saidas, lancamentos: resumos[i]!.total.lancamentos,
  }))
  const soma = (k: 'entradas' | 'saidas') => unidades.reduce((s, u) => s + Math.round(u[k] * 100), 0) / 100
  return {
    unidades,
    total: { entradas: soma('entradas'), saidas: soma('saidas'), lancamentos: unidades.reduce((s, u) => s + u.lancamentos, 0) },
  }
}

/** A40 da 11ª: o que UMA pessoa recebeu no dia, por forma (do banco). */
export interface RecebidoPorPessoa {
  /** Nulo: o recebimento sem quem registrado (os de antes de 10/11/2026 com baixa depois). */
  pessoa:  string | null
  nome:    string | null
  formas:  { forma: string; entradas: number; lancamentos: number }[]
  total:   { entradas: number; lancamentos: number }
}

/**
 * A40 da 11ª simulação (a Elaine e a Fabiana no caixa da Azaleia): o Fechamento
 * do dia por QUEM RECEBEU — as entradas de cada pessoa (a regra única de
 * receita, as mesmas do resumo por forma), por forma e o total dela, contadas
 * no banco (`metrics_fechamento_por_quem_recebeu`). A tela não soma.
 */
export async function getFechamentoPorQuemRecebeu(args: { tenantId: string; branchId: string; from: Date; to: Date }): Promise<RecebidoPorPessoa[]> {
  const linhas = await lerTodas((de, ate) => createAdminClient().rpc('metrics_fechamento_por_quem_recebeu', {
    p_tenant: args.tenantId, p_branch: args.branchId, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  }).order('pessoa', { nullsFirst: false }).order('forma').range(de, ate), 'separar o dia por quem recebeu') as {
    pessoa: string | null; nome: string | null; forma: string; entradas: number | string; lancamentos: number
  }[]
  const porPessoa = new Map<string, RecebidoPorPessoa>()
  for (const l of linhas ?? []) {
    const chave = l.pessoa ?? ''
    const p = porPessoa.get(chave) ?? { pessoa: l.pessoa, nome: l.nome, formas: [], total: { entradas: 0, lancamentos: 0 } }
    if (l.forma === 'TOTAL') p.total = { entradas: Number(l.entradas), lancamentos: Number(l.lancamentos) }
    else p.formas.push({ forma: l.forma, entradas: Number(l.entradas), lancamentos: Number(l.lancamentos) })
    porPessoa.set(chave, p)
  }
  // Quem recebeu mais primeiro; o "não registrado" por último.
  return [...porPessoa.values()].sort((a, b) =>
    (a.pessoa ? 0 : 1) - (b.pessoa ? 0 : 1) || b.total.entradas - a.total.entradas || (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
}
