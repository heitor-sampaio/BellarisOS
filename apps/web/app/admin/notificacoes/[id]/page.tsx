import Link from 'next/link'
import { idOu404 } from '@/lib/id-da-rota'
import { notFound } from 'next/navigation'
import { ChevronLeft, Zap, Clock, RefreshCw, Users, Send, BookOpen, Pencil } from 'lucide-react'
import { getTenantContext, assertPermission, assertRecurso, can } from '@/lib/auth'
import { AudiencePreview } from '@/components/admin/audience-preview'
import { getCampaign, activateCampaign, pauseCampaign, archiveCampaign, deleteCampaign } from '@/actions/notification-campaigns'
import type { CampaignStatus, CampaignType, TriggerType } from '@/actions/notification-campaigns'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { DeleteCampaignButton } from '@/components/admin/delete-campaign-button'
import { CanalDaCampanha } from '@/components/admin/canal-da-campanha'
import { quandoDispara } from '@/lib/notifications/quando-dispara'
import { quemReceberiaHoje } from '@/lib/notifications/gatilho-de-hoje'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { FUSO_PADRAO, nomeDoFuso } from '@/lib/unidades/fuso'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'

export const dynamic = 'force-dynamic'

const STATUS_CFG: Record<CampaignStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Rascunho',  color: 'var(--text-muted)' },
  ACTIVE:    { label: 'Ativa',     color: 'var(--success)' },
  PAUSED:    { label: 'Pausada',   color: 'var(--warning)' },
  COMPLETED: { label: 'Concluída', color: 'var(--info)' },
  ARCHIVED:  { label: 'Arquivada', color: 'var(--text-faint)' },
}

const TYPE_ICON: Record<CampaignType, React.ElementType> = {
  IMMEDIATE: Zap,
  SCHEDULED: Clock,
  AUTOMATED: RefreshCw,
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  BIRTHDAY:           'Aniversário do cliente',
  ANNUAL_DATE:        'Data comemorativa anual',
  DAYS_AFTER_VISIT:   'Dias após última visita',
  DAYS_BEFORE_EXPIRY: 'Dias antes do vencimento de pacote',
  BEFORE_APPOINTMENT: 'Lembrete de agendamento',
}

export default async function CampanhaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'VIEW')

  let campaign, dispatches
  try {
    const res = await getCampaign(id)
    campaign   = res.campaign
    dispatches = res.dispatches
  } catch {
    notFound()
  }

  // A campanha é da rede: as horas no relógio comum das unidades (F64, D4).
  const fuso = await fusoDaRede(ctx.tenantId)
  const statusCfg = STATUS_CFG[campaign.status] ?? STATUS_CFG.DRAFT
  // D10 da 12ª: na automática, "Quem receberia hoje" é o GATILHO de hoje (a
  // escolha do cron) — o público inteiro fica numa linha à parte.
  const mostraQuemReceberia = can(ctx, 'marketing', 'MANAGE') && !['ARCHIVED', 'COMPLETED'].includes(campaign.status)
  const deHoje = mostraQuemReceberia && campaign.type === 'AUTOMATED' ? await quemReceberiaHoje(campaign) : null
  const TypeIcon  = TYPE_ICON[campaign.type] ?? Zap
  const readRate  = campaign.total_sent > 0
    ? Math.round(campaign.total_read / campaign.total_sent * 100)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <RealtimeRefresher tables={['notification_campaigns']} filter={`id=eq.${id}`} />

      {/* Back */}
      <Link
        href="/admin/notificacoes"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', fontWeight: 600, textDecoration: 'none' }}
      >
        <ChevronLeft size={14} />
        Notificações
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h1 style={{
              fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
              letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
            }}>
              {campaign.name}
            </h1>
            <span style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 'var(--text-sm-sz)', fontWeight: 700,
              color: statusCfg.color, background: `${statusCfg.color}18`,
            }}>
              {statusCfg.label}
            </span>
          </div>
          {campaign.description && (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>{campaign.description}</p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Os mesmos estados em que o servidor aceita a edição. */}
          {['DRAFT', 'PAUSED'].includes(campaign.status) && (
            <Link href={`/admin/notificacoes/${id}/editar`} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pencil size={14} /> Editar
            </Link>
          )}
          {['DRAFT', 'PAUSED'].includes(campaign.status) && (
            <form action={async () => { 'use server'; await activateCampaign(id) }}>
              <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} />
                {campaign.type === 'IMMEDIATE' ? 'Enviar agora' : 'Ativar'}
              </button>
            </form>
          )}
          {campaign.status === 'ACTIVE' && campaign.type === 'AUTOMATED' && (
            <form action={async () => { 'use server'; await pauseCampaign(id) }}>
              <button type="submit" className="btn-secondary">Pausar</button>
            </form>
          )}
          {!['ARCHIVED', 'COMPLETED'].includes(campaign.status) && (
            <form action={async () => { 'use server'; await archiveCampaign(id) }}>
              <button type="submit" className="btn-ghost" style={{ color: 'var(--text-muted)' }}>Arquivar</button>
            </form>
          )}
          {['DRAFT', 'ARCHIVED'].includes(campaign.status) && (
            <DeleteCampaignButton action={deleteCampaign.bind(null, id)} />
          )}
        </div>
      </div>

      {/* O canal, junto do "Enviar agora" (D-3). */}
      <CanalDaCampanha />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard icon={<Send size={16} />} label="Enviadas" value={campaign.total_sent.toLocaleString('pt-BR')} />
        <StatCard icon={<BookOpen size={16} />} label="Taxa de leitura" value={campaign.total_sent > 0 ? `${readRate}%` : '—'} />
        <StatCard icon={<Users size={16} />} label="Último disparo"
          value={campaign.last_run_at ? new Date(campaign.last_run_at).toLocaleDateString('pt-BR', { timeZone: fuso }) : '—'} />
      </div>

      {/* Campaign info */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* Content */}
        <div className="card" style={{ flex: '1 1 300px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TypeIcon size={16} color="var(--brand)" />
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Conteúdo</h2>
          </div>
          <InfoRow label="Tipo"  value={{ IMMEDIATE: 'Imediata', SCHEDULED: 'Agendada', AUTOMATED: 'Automática' }[campaign.type]} />
          {campaign.type === 'SCHEDULED' && campaign.scheduled_at && (
            <InfoRow label="Agendada para" value={`${formatarNoFuso(campaign.scheduled_at, "dd/MM/yyyy 'às' HH:mm", fuso)}${fuso === FUSO_PADRAO ? '' : ` (${nomeDoFuso(fuso)})`}`} />
          )}
          {campaign.trigger_type && (
            <InfoRow label="Gatilho" value={TRIGGER_LABELS[campaign.trigger_type] ?? campaign.trigger_type} />
          )}
          {/* D8 da 11ª: quando ela sai, com a hora — a mesma regra do cron. */}
          {campaign.type === 'AUTOMATED' && campaign.trigger_type && (
            <div data-quando-dispara>
              <InfoRow label="Dispara" value={quandoDispara(campaign.trigger_type, campaign.trigger_config as { days?: number; hours?: number; month?: number; day?: number } | null, fuso)} />
            </div>
          )}
          {campaign.trigger_config && campaign.trigger_type === 'BEFORE_APPOINTMENT' && (
            <InfoRow label="Antecedência" value={`${(campaign.trigger_config as { hours?: number }).hours ?? 24}h antes`} />
          )}
          {campaign.trigger_config && campaign.trigger_type !== 'BIRTHDAY' && campaign.trigger_type !== 'ANNUAL_DATE' && campaign.trigger_type !== 'BEFORE_APPOINTMENT' && (
            <InfoRow label="Configuração" value={`${(campaign.trigger_config as { days?: number }).days ?? '?'} dias`} />
          )}
          {campaign.trigger_config && campaign.trigger_type === 'ANNUAL_DATE' && (
            <InfoRow
              label="Data"
              value={`${(campaign.trigger_config as { day?: number }).day}/${(campaign.trigger_config as { month?: number }).month}`}
            />
          )}
          <InfoRow label="Título"   value={campaign.title} />
          <InfoRow label="Mensagem" value={campaign.body} />
          <InfoRow label="Canal"    value="In-app" />
        </div>

        {/* Audience */}
        <div className="card" style={{ flex: '1 1 260px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Público</h2>
          <AudienceRow rules={campaign.audience_rules} />
          {/* A21 da 11ª: quem receberia HOJE, também fora do assistente (o
              rascunho não dizia) — a mesma conta do disparo. */}
          {mostraQuemReceberia && (
            <div data-quem-receberia-hoje style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p className="overline">Quem receberia hoje</p>
              {deHoje && (
                <p data-receberiam-hoje style={{
                  fontSize: 'var(--text-base-sz)', fontWeight: 'var(--weight-bold)',
                  color: deHoje.hoje > 0 ? 'var(--brand)' : 'var(--text-muted)',
                }}>
                  {deHoje.texto}
                </p>
              )}
              {deHoje && <p className="overline" style={{ marginTop: 6 }}>Público da campanha</p>}
              <AudiencePreview rules={campaign.audience_rules} />
            </div>
          )}
        </div>
      </div>

      {/* Dispatch history */}
      {dispatches.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Últimos envios
            </h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised, var(--bg-app))' }}>
                {['Cliente', 'Data/hora', 'Status'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dispatches.map((d, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
                  <td style={{ padding: '11px 16px', fontSize: 'var(--text-base-sz)', fontWeight: 500, color: 'var(--text)' }}>{d.client_name}</td>
                  <td style={{ padding: '11px 16px', fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
                    {formatarNoFuso(d.sent_at, "dd/MM/yyyy, HH:mm", fuso)}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    {(() => {
                      const cfg =
                        d.status === 'READ'   ? { label: 'Lida',    color: 'var(--info)' } :
                        d.status === 'SENT'   ? { label: 'Enviada', color: 'var(--success)' } :
                                                { label: 'Falhou',  color: 'var(--danger)' }
                      return (
                        <span style={{
                          padding: '2px 8px', borderRadius: 99, fontSize: 'var(--text-xs-sz)', fontWeight: 700,
                          color: cfg.color, background: `${cfg.color}18`,
                        }}>
                          {cfg.label}
                        </span>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// -- Sub-components -----------------------------------------------------

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card" style={{ flex: '1 1 140px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ color: 'var(--brand)' }}>{icon}</div>
      <div>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{value}</p>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text)' }}>{value}</p>
    </div>
  )
}

function AudienceRow({ rules }: { rules: Record<string, unknown> }) {
  const items: { label: string; value: string }[] = []

  // Sem "Unidades" (MK2 do Bloco Tags): o público é da rede, e uma regra
  // de unidade gravada antes não vale mais no disparo — a tela não a mostra.
  const r = rules as {
    genders?: string[]
    procedure_ids?: string[]
    tags?: string[]
    has_app_account?: boolean
    max_days_since_visit?: number
  }

  if (!r.genders?.length
      && !r.procedure_ids?.length && !r.tags?.length && !r.has_app_account && !r.max_days_since_visit) {
    return <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>Todos os clientes ativos da rede</p>
  }

  if (r.genders?.length)          items.push({ label: 'Gênero',     value: r.genders.join(', ') })
  if (r.procedure_ids?.length)    items.push({ label: 'Procedimentos', value: `${r.procedure_ids.length} selecionado(s)` })
  if (r.tags?.length)             items.push({ label: 'Tags',       value: r.tags.join(', ') })
  if (r.has_app_account)          items.push({ label: 'App',        value: 'Apenas com app' })
  if (r.max_days_since_visit)     items.push({ label: 'Sem visita', value: `há mais de ${r.max_days_since_visit} dias` })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(it => <InfoRow key={it.label} label={it.label} value={it.value} />)}
    </div>
  )
}
