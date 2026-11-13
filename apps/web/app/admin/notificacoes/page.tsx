import Link from 'next/link'
import { getTenantContext, assertPermission, assertRecurso, can, temRecurso } from '@/lib/auth'
import { listCampaigns } from '@/actions/notification-campaigns'
import { NotificationCampaignsList } from '@/components/admin/notification-campaigns-list'
import { CanalDaCampanha } from '@/components/admin/canal-da-campanha'

export const dynamic = 'force-dynamic'

export default async function AdminNotificacoesPage() {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'VIEW')

  const { campaigns, totalSent, activeCount } = await listCampaigns()
  const veAutomacoes = temRecurso(ctx, 'automacoes') && can(ctx, 'automations', 'VIEW')

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Notificações
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Campanhas de aviso no celular para as clientes
        </p>
        {/* A9 da 14ª: as campanhas automáticas (lembrete, pós-visita) pareciam
            repetir as Automações, e nada dizia a diferença. */}
        <p data-campanha-ou-automacao style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 8, lineHeight: 1.5 }}>
          Campanha é um aviso a um público de uma vez (todas as clientes, uma tag, as aniversariantes do dia);
          para reagir a um fato de cada cliente (agendou, faltou, pagou), use as{' '}
          {veAutomacoes
            ? <Link href="/admin/automacoes" style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>Automações</Link>
            : 'Automações'}.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}><CanalDaCampanha /></div>

      <NotificationCampaignsList
        campaigns={campaigns}
        totalSent={totalSent}
        activeCount={activeCount}
      />
    </div>
  )
}
