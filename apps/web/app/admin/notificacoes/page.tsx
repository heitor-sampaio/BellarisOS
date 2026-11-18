import Link from 'next/link'
import { getTenantContext, assertPermission, assertRecurso, can, temRecurso } from '@/lib/auth'
import { listCampaigns } from '@/actions/notification-campaigns'
import { NotificationCampaignsList } from '@/components/admin/notification-campaigns-list'
import { CanalDaCampanha } from '@/components/admin/canal-da-campanha'
import { Dica } from '@/components/shared/dica'
import { CONFIG_DA_REDE, mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

export const dynamic = 'force-dynamic'

export default async function AdminNotificacoesPage() {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'VIEW')

  const { campaigns, totalSent, activeCount } = await listCampaigns()
  const veAutomacoes = temRecurso(ctx, 'automacoes') && can(ctx, 'automations', 'VIEW')
  // A campanha é configuração da rede toda: só a Admin da rede cria, ativa e
  // arquiva (o Heitor, 18/11: "Configuração da rede toda só pela conta admin").
  const gerencia = can(ctx, 'marketing', 'MANAGE')
  const podeEditar = gerencia && mexeNaConfigDaRede(ctx)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        {/* A apresentação mora na dica (2026-11-16). O parágrafo abaixo fica à
            vista: leva o link para as Automações (o caminho para agir). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Notificações
          </h1>
          <Dica rotulo="Sobre as notificações">Campanhas de aviso no celular para as clientes</Dica>
        </div>
        {/* A9 da 14ª: a campanha parecia repetir as Automações, e nada dizia a
            diferença. Desde o MK1 (2026-11-14) o gatilho de cada cliente
            (aniversário, lembrete, pós-visita…) é um modelo nas Automações. */}
        <p data-campanha-ou-automacao style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 8, lineHeight: 1.5 }}>
          Campanha é um aviso a um público de uma vez — agora, numa data, ou todo ano numa data (todas as clientes, uma tag);
          para reagir a um fato de cada cliente (aniversário, agendou, faltou, pagou), use as{' '}
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
        podeEditar={podeEditar}
        avisoDaRede={gerencia && !mexeNaConfigDaRede(ctx) ? CONFIG_DA_REDE : null}
      />
    </div>
  )
}
