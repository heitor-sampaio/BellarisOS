import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { descricaoComOProcedimento } from './descricao-do-lancamento'

/**
 * A26 da 24ª: o nome do procedimento dos lançamentos de atendimento, lido dos
 * agendamentos da REDE (só leitura dos registros que a tela já leu — o
 * alcance foi conferido por quem os leu). Em lotes: a lista de ids vai na URL.
 */
async function procedimentosDosAgendamentos(tenantId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const saida = new Map<string, string>()
  const lista = [...new Set(ids.filter(Boolean))]
  if (!lista.length) return saida
  const admin = createAdminClient()
  for (let i = 0; i < lista.length; i += 150) {
    const lote = await ler(admin.from('appointments')
      .select('id, procedures(name), branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId).in('id', lista.slice(i, i + 150)), 'ler os procedimentos dos lançamentos') as
      { id: string; procedures: { name: string | null } | { name: string | null }[] | null }[] | null
    for (const a of lote ?? []) {
      const p = Array.isArray(a.procedures) ? a.procedures[0] : a.procedures
      if (p?.name) saida.set(a.id, p.name)
    }
  }
  return saida
}

/** Os lançamentos com a descrição do atendimento trocada pelo procedimento. */
export async function comOProcedimento<T extends { description?: unknown; appointment_id?: unknown }>(
  tenantId: string, linhas: readonly T[],
): Promise<T[]> {
  const doAtendimento = linhas.filter(l => typeof l.appointment_id === 'string' && typeof l.description === 'string'
    && (l.description as string).startsWith('Atendimento concluído'))
  if (!doAtendimento.length) return [...linhas]
  const nomes = await procedimentosDosAgendamentos(tenantId, doAtendimento.map(l => l.appointment_id as string))
  return linhas.map(l => {
    const nome = typeof l.appointment_id === 'string' ? nomes.get(l.appointment_id) ?? null : null
    return nome ? { ...l, description: descricaoComOProcedimento(l.description as string, nome) } : l
  })
}

/**
 * As parcelas da operadora (só o id do lançamento): o procedimento pelo
 * agendamento do lançamento.
 */
export async function parcelasComOProcedimento<T extends { transactionId: string; descricao: string }>(
  tenantId: string, parcelas: readonly T[],
): Promise<T[]> {
  const genericas = parcelas.filter(p => p.descricao.startsWith('Atendimento concluído'))
  if (!genericas.length) return [...parcelas]
  const admin = createAdminClient()
  const ids = [...new Set(genericas.map(p => p.transactionId))]
  const doLancamento = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 150) {
    const lote = await ler(admin.from('financial_transactions')
      .select('id, appointment_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId).in('id', ids.slice(i, i + 150)), 'ler os agendamentos das parcelas') as
      { id: string; appointment_id: string | null }[] | null
    for (const t of lote ?? []) if (t.appointment_id) doLancamento.set(t.id, t.appointment_id)
  }
  const nomes = await procedimentosDosAgendamentos(tenantId, [...doLancamento.values()])
  return parcelas.map(p => {
    const ag = doLancamento.get(p.transactionId)
    const nome = ag ? nomes.get(ag) ?? null : null
    return nome ? { ...p, descricao: descricaoComOProcedimento(p.descricao, nome) ?? p.descricao } : p
  })
}
