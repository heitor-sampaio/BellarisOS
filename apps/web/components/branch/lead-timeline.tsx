'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight, Sparkles, UserCheck, UserCog, Clock, Building2, Pencil, CalendarPlus,
} from 'lucide-react'
import { formatDurationLong, secondsSince } from '@estetica-os/utils'
import { getLeadEvents, getContactEvents, getClientEvents } from '@/actions/lead-events'
import type { LeadEvent } from '@/lib/lead-events'

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

function Icone({ type }: { type: LeadEvent['type'] }) {
  const props = { size: 12 }
  if (type === 'CONVERTED')           return <UserCheck {...props} />
  if (type === 'STAGE_CHANGED')       return <ArrowRight {...props} />
  if (type === 'UNIT_CHANGED')        return <Building2 {...props} />
  if (type === 'UPDATED')             return <Pencil {...props} />
  if (type === 'APPOINTMENT_CREATED') return <CalendarPlus {...props} />
  if (type === 'OWNER_CHANGED')       return <UserCog {...props} />
  return <Sparkles {...props} />
}

/** "Telefone: (11) 9... → (11) 8..." — uma linha por campo alterado. */
function Alteracoes({ changes }: { changes: NonNullable<LeadEvent['changes']> }) {
  return (
    <>
      {changes.map((c, i) => (
        <span key={i} style={{ display: 'block' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.campo}</span>
          {': '}
          {/* Campo que estava vazio não vira "— → valor": só mostra o novo. */}
          {c.de && <><span style={{ textDecoration: 'line-through' }}>{c.de}</span>{' → '}</>}
          {c.para ?? <em>vazio</em>}
        </span>
      ))}
    </>
  )
}

/** "Comercial · Em contato" — o funil só aparece quando ajuda a distinguir. */
function local(etapa: string | null, funil: string | null, mostrarFunil: boolean) {
  if (!etapa) return null
  return mostrarFunil && funil ? `${funil} · ${etapa}` : etapa
}

function Descricao({ e }: { e: LeadEvent }) {
  const forte = { fontWeight: 700, color: 'var(--text)' }

  if (e.type === 'STAGE_CHANGED') {
    // Mudou de funil? Então o nome do funil deixa de ser detalhe e vira a
    // informação principal — senão a linha lê "Novo → Novo".
    const trocouFunil = e.from_funnel_name !== e.to_funnel_name
    return (
      <span>
        <span style={forte}>{local(e.from_stage_name, e.from_funnel_name, trocouFunil) ?? 'sem etapa'}</span>
        {' → '}
        <span style={forte}>{local(e.to_stage_name, e.to_funnel_name, trocouFunil) ?? 'sem etapa'}</span>
      </span>
    )
  }

  // O tipo continua `CONVERTED` no banco (renomear exigiria migrar dados), mas
  // o que ele registra é o cadastro da ficha — que agora não conclui negócio
  // nenhum. Chamar de "convertido" aqui faria parecer venda ganha.
  if (e.type === 'CONVERTED')     return <span style={forte}>Cadastrado como cliente</span>
  if (e.type === 'OWNER_CHANGED') return <span style={forte}>Responsável alterado</span>

  // A unidade é tag e pode ser mais de uma, então lê melhor como qualquer
  // outra alteração: "Unidade: Centro → Centro, Jardins".
  if (e.type === 'UNIT_CHANGED' && e.changes && e.changes.length > 0) {
    return <Alteracoes changes={e.changes} />
  }

  if (e.type === 'APPOINTMENT_CREATED') {
    return (
      <span>
        <span style={forte}>Agendamento criado</span>
        {e.changes?.[0]?.para && (
          <span style={{ color: 'var(--text-muted)' }}> — {e.changes[0].para}</span>
        )}
      </span>
    )
  }

  if (e.type === 'UPDATED' && e.changes && e.changes.length > 0) {
    return <Alteracoes changes={e.changes} />
  }

  const entrada = local(e.to_stage_name, e.to_funnel_name, true)
  return (
    <span>
      <span style={forte}>Oportunidade criada</span>
      {entrada && <span style={{ color: 'var(--text-muted)' }}> em {entrada}</span>}
    </span>
  )
}

/**
 * @param refreshKey muda quando o chamador acabou de alterar o lead. A lista é
 *   carregada uma vez por montagem; sem isso, mover a etapa pela tela ao lado
 *   deixava o histórico exibindo o estado anterior até recarregar a página.
 */
export function LeadTimeline({
  leadId, conversationId, clientId, refreshKey = 0,
}: {
  /** Histórico de UMA oportunidade. Ignorado quando outro escopo vem. */
  leadId?: string
  /** Histórico comercial de um cliente: as oportunidades ligadas a ele. */
  clientId?: string
  /**
   * Histórico do CONTATO: junta as oportunidades dele.
   *
   * No inbox é isto que se quer ver — a pessoa pode ter dois negócios, e o que
   * aconteceu em qualquer um deles faz parte da mesma história de atendimento.
   */
  conversationId?: string
  refreshKey?: number
}) {
  const [eventos, setEventos] = useState<LeadEvent[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // "Agora" fixado quando a lista chega, e não lido durante o render: Date.now()
  // no corpo do componente diverge entre servidor e cliente.
  const [nowMs, setNowMs] = useState(0)

  useEffect(() => {
    let ativo = true
    setEventos(null); setErro(null)
    const busca = conversationId ? getContactEvents(conversationId)
      : clientId ? getClientEvents(clientId)
      : leadId   ? getLeadEvents(leadId)
      : Promise.resolve([])
    busca
      .then(r => { if (!ativo) return; setEventos(r); setNowMs(Date.now()) })
      .catch(() => { if (ativo) setErro('Não foi possível carregar o histórico.') })
    return () => { ativo = false }
  }, [leadId, conversationId, clientId, refreshKey])

  // O evento mais recente é o começo do tempo parado — é o número que diz se o
  // card está esquecido, e é a pergunta que a lista inteira responde.
  const paradoDesde = eventos?.[0]?.created_at ?? null

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10, marginBottom: 10,
      }}>
        <p className="overline" style={{ margin: 0 }}>HISTÓRICO</p>
        {paradoDesde && (
          <span style={{
            fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Clock size={11} />
            sem movimento há {formatDurationLong(secondsSince(paradoDesde, nowMs))}
          </span>
        )}
      </div>

      {erro && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 700 }}>{erro}</p>
      )}

      {!erro && eventos === null && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando…</p>
      )}

      {!erro && eventos?.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
          Nada registrado ainda.
        </p>
      )}

      {!erro && eventos && eventos.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {eventos.map((e, i) => {
            const ultimo = i === eventos.length - 1
            return (
              <li key={e.id} style={{ display: 'flex', gap: 10 }}>
                {/* Trilho */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  flexShrink: 0, width: 22,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand-soft-border)',
                    color: 'var(--brand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icone type={e.type} />
                  </span>
                  {!ultimo && (
                    <span style={{ flex: 1, width: 1, background: 'var(--hairline)', minHeight: 12 }} />
                  )}
                </div>

                <div style={{ paddingBottom: ultimo ? 0 : 14, minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', lineHeight: 1.35, color: 'var(--text-muted)' }}>
                    <Descricao e={e} />
                  </p>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>
                    <span title={DATA_HORA.format(new Date(e.created_at))}>
                      {DATA_HORA.format(new Date(e.created_at))}
                    </span>
                    {' · '}
                    {/* Card que nasceu de uma mensagem recebida não tem autor. */}
                    {e.actor_name ?? 'entrada automática'}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
