import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Linha = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null)

/**
 * D13 da 30ª simulação (plataforma:AD-25): a unidade do registro clínico que
 * não guarda unidade — a anotação, a evolução, a aplicação de injetável, o
 * mapa e o termo —, para a gravação de uma linha só, que não tem outra linha
 * que a dê (a anotação da Rosane no atendimento concluído saía "Da rede").
 *
 * É a unidade do atendimento do registro; sem atendimento, a do mapa (a
 * aplicação) ou a do plano de tratamento (o termo). Lida agora, pela rede da
 * sessão (cada registro pela rede da cliente; o atendimento, o mapa e o plano
 * pela unidade — CLAUDE.md §14, nenhuma consulta sem a rede), e só os ids — nunca o conteúdo clínico. O prontuário em si é da cliente, sem
 * unidade: segue "Da rede".
 *
 * Entra em `nomesDaAuditoria` (lib/auditoria/leitura.ts).
 */
export async function unidadesDosRegistrosClinicos(
  ctx: TenantContext, registros: readonly RegistroDaAuditoria[],
): Promise<Partial<NomesDaAuditoria>> {
  const tenant = ctx.tenantId
  if (!tenant) return {}
  const ids = (tabela: string) => [...new Set(registros
    .filter(r => r.tabela === tabela && !r.branch_id && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const anotacoes = ids('prontuario_anotacoes')
  const evolucoes = ids('medical_record_entries')
  const aplicacoes = ids('injectable_applications')
  const mapas = ids('injectable_maps')
  const termos = ids('consent_terms')
  if (!anotacoes.length && !evolucoes.length && !aplicacoes.length && !mapas.length && !termos.length) return {}

  const admin = createAdminClient()
  const nada = Promise.resolve([] as Linha[])
  const [an, ev, ap, tm] = await Promise.all([
    anotacoes.length ? ler(admin.from('prontuario_anotacoes').select('id, appointment_id').eq('tenant_id', tenant).in('id', anotacoes),
      'ler o atendimento das anotações da auditoria') : nada,
    evolucoes.length ? ler(admin.from('medical_record_entries').select('id, appointment_id, medical_records!inner(clients!inner(tenant_id))')
      .eq('medical_records.clients.tenant_id', tenant).in('id', evolucoes),
      'ler o atendimento das evoluções da auditoria') : nada,
    aplicacoes.length ? ler(admin.from('injectable_applications').select('id, appointment_id, map_id, clients!inner(tenant_id)')
      .eq('clients.tenant_id', tenant).in('id', aplicacoes),
      'ler o atendimento das aplicações da auditoria') : nada,
    termos.length ? ler(admin.from('consent_terms').select('id, treatment_plan_id, medical_records!inner(clients!inner(tenant_id))')
      .eq('medical_records.clients.tenant_id', tenant).in('id', termos),
      'ler o plano dos termos da auditoria') : nada,
  ]) as Linha[][]

  const agendamentos = [...new Set([...(an ?? []), ...(ev ?? []), ...(ap ?? [])].map(x => str(x.appointment_id)).filter((v): v is string => !!v))]
  const mapasDasAplicacoes = [...new Set([...mapas, ...(ap ?? []).filter(x => !str(x.appointment_id)).map(x => str(x.map_id)).filter((v): v is string => !!v)])]
  const planos = [...new Set((tm ?? []).map(x => str(x.treatment_plan_id)).filter((v): v is string => !!v))]
  const [ag, mp, pl] = await Promise.all([
    agendamentos.length ? ler(admin.from('appointments').select('id, branch_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenant).in('id', agendamentos), 'ler a unidade dos atendimentos da auditoria') : nada,
    mapasDasAplicacoes.length ? ler(admin.from('injectable_maps').select('id, branch_id').eq('tenant_id', tenant).in('id', mapasDasAplicacoes),
      'ler a unidade dos mapas da auditoria') : nada,
    planos.length ? ler(admin.from('treatment_plans').select('id, branch_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenant).in('id', planos), 'ler a unidade dos planos da auditoria') : nada,
  ]) as Linha[][]
  const unidadeDe = (xs: Linha[] | null | undefined) => new Map((xs ?? []).flatMap(x => {
    const b = str(x.branch_id)
    return b ? [[x.id as string, b] as const] : []
  }))
  const doAgendamento = unidadeDe(ag)
  const doMapa = unidadeDe(mp)
  const doPlano = unidadeDe(pl)

  const unidades: Record<string, string> = {}
  for (const x of [...(an ?? []), ...(ev ?? [])]) {
    const b = doAgendamento.get(str(x.appointment_id) ?? '')
    if (b) unidades[x.id as string] = b
  }
  for (const x of ap ?? []) {
    const b = doAgendamento.get(str(x.appointment_id) ?? '') ?? doMapa.get(str(x.map_id) ?? '')
    if (b) unidades[x.id as string] = b
  }
  for (const m of mapas) { const b = doMapa.get(m); if (b) unidades[m] = b }
  for (const x of tm ?? []) {
    const b = doPlano.get(str(x.treatment_plan_id) ?? '')
    if (b) unidades[x.id as string] = b
  }
  return { unidadesDosClinicos: unidades }
}
