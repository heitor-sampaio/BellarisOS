import { getTenantContext, assertPermission, ownerFilter, can, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { filiaisAtivas } from '@/lib/branches'
import { seedDefaultFunnel, listAllStages } from '@/lib/crm/funis'
import { funnelStats } from '@/lib/crm'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { atividadeDasPessoas } from '@/lib/crm/atividade-da-pessoa'
import type { ComponentProps } from 'react'
import { CRMBoard } from '@/components/branch/crm-board'
import { CRMLeadModal } from '@/components/branch/crm-lead-modal'
import { CRMStageSettings } from '@/components/branch/crm-stage-settings'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { UserPlus } from 'lucide-react'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Nome da unidade marcada no lead, se houver. */
function unidadeDoLead(tags: unknown): string | null {
  const t = (Array.isArray(tags) ? tags : []).find(
    (x): x is string => typeof x === 'string' && isUnitTag(x),
  )
  return t ? unitTagName(t) : null
}

/** O que a tela lê do lead; o resto do select passa adiante como veio. */
type LeadLido = Record<string, unknown> & {
  contato_id: string
  tags:       string[] | null
  users:      { name: string } | null
}

export default async function AdminOportunidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string; lead?: string }>
}) {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'oportunidades')
  assertPermission(ctx, 'crm', 'VIEW')

  const { funil: rawFunil, lead: rawLead } = await searchParams
  // `?lead=` abre o card (a busca universal entra por aqui). Só serve se for um
  // id; o alcance é o da lista abaixo — lead que ela não carrega não abre.
  const leadAberto = rawLead && UUID.test(rawLead) ? rawLead : null

  // Filiais da rede
  const admin    = createAdminClient()
  const branches = await filiaisAtivas(ctx.tenantId!)

  const canEdit = can(ctx, 'crm', 'MANAGE')

  // -- Funis e etapas --
  const funnels     = await seedDefaultFunnel(ctx.tenantId!)
  const ativos      = funnels.filter(f => f.archived_at === null)
  const selecionado = ativos.find(f => f.id === rawFunil)
    ?? ativos.find(f => f.is_default)
    ?? ativos[0]
    ?? funnels[0]

  const allStages = await listAllStages(ctx.tenantId!)
  const stages    = allStages.filter(s => s.funnel_id === selecionado?.id)
  const stageIds  = stages.map(s => s.id)

  const allProcs = await getCachedNetworkProcedures(ctx.tenantId!)

  const procedures = allProcs.map(p => ({ id: p.id as string, name: p.name as string }))

  // O lead é da REDE (`branch_id` nulo). Filtra pelas etapas do funil aberto —
  // funil sem etapa não tem o que buscar, e `.in()` com lista vazia vira
  // condição inválida no PostgREST.
  const leadOwner = ownerFilter(ctx, 'crm')
  let leadsRaw: LeadLido[] = []
  if (stageIds.length > 0) {
    let leadsQuery = admin
      .from('leads')
      .select(`
        id, name, phone, email, social_media, source,
        crm_stage_id, notes, client_id, created_at, tags,
        owner_id, users(name), contato_id,
        lead_procedures(procedure_id, procedures(name, price))
      `)
      .eq('tenant_id', ctx.tenantId!)
      .in('crm_stage_id', stageIds)
    // Lead sem dono fica no bolo comum: aparece para todos até alguém assumir.
    if (leadOwner) leadsQuery = leadsQuery.or(`owner_id.is.null,owner_id.eq.${leadOwner}`)
    const { data, error } = await leadsQuery.order('created_at', { ascending: false })
    if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`)
    leadsRaw = (data ?? []) as unknown as LeadLido[]
  }

  // A atividade da PESSOA dona de cada lead — de todas as threads dela, não só
  // da que a oportunidade nasceu (ver `atividadeDasPessoas`).
  const atividade = await atividadeDasPessoas(
    ctx.tenantId!, leadsRaw.map(l => l.contato_id),
  )
  const leads = leadsRaw.map(l => {
    const { users: dono, contato_id: pessoa, ...rest } = l
    const ativ = atividade.get(pessoa)
    return {
      ...rest,
      tags:                l.tags ?? [],
      owner_name:          dono?.name ?? null,
      last_interaction_at: ativ?.last_interaction_at ?? null,
      awaiting_since:      ativ?.awaiting_since ?? null,
      // O badge da unidade sai da TAG, não de branch_id: o lead é da rede e a
      // coluna é sempre nula, então o badge nunca aparecia.
      branch_name:         unidadeDoLead(l.tags),
      branch_slug:         null,
    }
  })

  const stats = funnelStats(
    leads as unknown as { crm_stage_id: string | null; client_id: string | null }[],
    stages,
  )

  return (
    <div className="crm-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* O SINAL do quadro, não os dados: leads, etapas e funis marcam
          `crm_quadro_sinais` por gatilho, e a página recarrega pelo servidor,
          com o alcance de sempre (migration 20260928000006). */}
      <RealtimeRefresher tables={['crm_quadro_sinais']} filter={`tenant_id=eq.${ctx.tenantId}`} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Oportunidades
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {stats.total} leads · {stats.ganhos} ganhos
            {stats.porResultado && ` · ${stats.perdidos} perdidos`}
            {' · '}{stats.conversao}% de conversão
            {stats.porResultado && ` · ${stats.clientes} viraram clientes`}
            {' · '}{branches.length} filial{branches.length !== 1 ? 'is' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && branches.length > 0 && (
            <>
              <CRMStageSettings
                slug=""
                funnels={funnels}
                stages={allStages}
                activeFunnelId={selecionado?.id ?? ''}
              />
              <CRMLeadModal
                branches={branches}
                unidades={branches}
                stages={allStages}
                funnels={ativos}
                funnelId={selecionado?.id ?? ''}
                initialStageId={stages[0]?.id}
                procedures={procedures}
                trigger={
                  <button type="button" className="btn-primary">
                    <UserPlus size={15} />
                    Novo lead
                  </button>
                }
              />
            </>
          )}
        </div>
      </div>

      {branches.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhuma filial ativa cadastrada.
          </p>
        </div>
      ) : (
        <>
          <CRMBoard
            initialLeads={leads as unknown as ComponentProps<typeof CRMBoard>['initialLeads']}
            stages={stages}
            allStages={allStages}
            funnels={ativos}
            funnelId={selecionado?.id ?? ''}
            unidades={branches}
            procedures={procedures}
            branchId=""
            slug=""
            networkMode
            branches={branches}
            leadAberto={leadAberto}
          />
        </>
      )}
    </div>
  )
}
