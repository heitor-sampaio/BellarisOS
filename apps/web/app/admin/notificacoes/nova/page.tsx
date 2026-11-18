import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertPermission, assertRecurso, can } from '@/lib/auth'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { NotificationCampaignForm } from '@/components/admin/notification-campaign-form'
import { Dica } from '@/components/shared/dica'
import { redirect } from 'next/navigation'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

export const dynamic = 'force-dynamic'

export default async function NovaCampanhaPage() {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')
  // A campanha é configuração da rede toda: só a Admin da rede cria (o Heitor,
  // 18/11). Quem não é volta à lista, que diz por quê — a action recusaria.
  if (!mexeNaConfigDaRede(ctx)) redirect('/admin/notificacoes')

  // O público é da rede, sem filtro de unidade (MK2 do Bloco Tags).
  const procedures = await getCachedNetworkProcedures(ctx.tenantId!)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <Link
          href="/admin/notificacoes"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}
        >
          <ChevronLeft size={14} />
          Voltar
        </Link>
        {/* A apresentação mora na dica (2026-11-16). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Nova campanha
          </h1>
          <Dica rotulo="Sobre a nova campanha">Configure o tipo, conteúdo e o público da sua campanha.</Dica>
        </div>
      </div>

      <NotificationCampaignForm
        procedures={(procedures ?? []) as { id: string; name: string; category: string | null }[]}
        podeVerAutomacoes={can(ctx, 'automations', 'VIEW')}
      />
    </div>
  )
}
