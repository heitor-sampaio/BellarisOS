import Link from 'next/link'
import { idOu404 } from '@/lib/id-da-rota'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertPermission, assertRecurso, can } from '@/lib/auth'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { getCampaign } from '@/actions/notification-campaigns'
import { NotificationCampaignForm } from '@/components/admin/notification-campaign-form'
import { clientesDaCampanha } from '@/lib/notifications/clientes-da-campanha'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

export const dynamic = 'force-dynamic'

/**
 * Editar uma campanha — só rascunho ou pausada, a mesma regra do
 * `updateCampaign`. A action existia desde o começo e nenhuma tela a chamava.
 */
export default async function EditarCampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')
  // A campanha é configuração da rede toda: só a Admin da rede edita (o Heitor,
  // 18/11). Quem não é volta aos detalhes, que só mostram — a action recusaria.
  if (!mexeNaConfigDaRede(ctx)) redirect(`/admin/notificacoes/${id}`)

  let campaign
  try {
    campaign = (await getCampaign(id)).campaign
  } catch {
    notFound()
  }
  if (!['DRAFT', 'PAUSED'].includes(campaign.status)) redirect(`/admin/notificacoes/${id}`)

  // O público é da rede, sem filtro de unidade (MK2 do Bloco Tags).
  const [procedures, clientes] = await Promise.all([
    getCachedNetworkProcedures(ctx.tenantId!),
    // A37 da 15ª: os nomes das "Clientes específicas".
    clientesDaCampanha(ctx.tenantId!, campaign.audience_rules?.client_ids),
  ])

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <Link
          href={`/admin/notificacoes/${id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}
        >
          <ChevronLeft size={14} />
          Voltar
        </Link>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Editar campanha
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {campaign.name}
        </p>
      </div>

      <NotificationCampaignForm
        existing={campaign}
        procedures={(procedures ?? []) as { id: string; name: string; category: string | null }[]}
        podeVerAutomacoes={can(ctx, 'automations', 'VIEW')}
        clientesDaCampanha={clientes}
      />
    </div>
  )
}
