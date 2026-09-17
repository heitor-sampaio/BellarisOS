'use client'

import { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import {
  UserCheck, ExternalLink, CalendarPlus, X, Check, Compass, Plus, ChevronDown, Package,
} from 'lucide-react'
import { LEAD_SOURCES, sourceStyle } from '@estetica-os/utils'
import { TagBadge } from '@/components/shared/tag-badge'
import { TagPicker } from '@/components/shared/tag-picker'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { StageOptions } from '@/components/branch/stage-options'
import { LeadTimeline } from '@/components/branch/lead-timeline'
import {
  getConversationCard, criarOportunidade, atualizarContato, definirSituacaoOportunidade,
  type Conversation,
  type ConversationCard,
  type Oportunidade,
  type InboxStage,
} from '@/actions/inbox'
import { updateLead, updateLeadStage } from '@/actions/leads'
import { ClientForm } from '@/components/branch/client-form'
import {
  getCrmSchedulingData,
  getCrmSlots,
  createCrmAppointment,
  type CrmSchedulingData,
} from '@/actions/crm-scheduling'

export interface PanelBranch { id: string; name: string; slug: string }

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)',
  letterSpacing: '0.05em', textTransform: 'uppercase',
}

function todayInSP(): string {
  // 'en-CA' devolve YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Moeda no formato do resto do sistema (CLAUDE.md §13). */
function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Painel lateral do inbox: contato, oportunidades e cliente.
 *
 * Antes era um bloco só, "Card do lead", porque `leads` era a pessoa, o negócio
 * e o vínculo com o cliente ao mesmo tempo. Agora são coisas distintas na tela
 * porque são distintas no modelo: a pessoa é a conversa, o negócio é a
 * oportunidade (podem ser várias, uma por funil) e a ficha de cliente é um
 * estado da pessoa — não um estágio do negócio.
 */
export function InboxLeadPanel({
  conversation,
  canEdit,
  branches,
  slug,
  onLeadChanged,
}: {
  conversation:   Conversation
  canEdit:        boolean
  branches:       PanelBranch[]
  /** Portal em que o painel está — revalidação e link de volta seguem daqui. */
  slug:           string
  onLeadChanged?: () => void
}) {
  const [card,    setCard]    = useState<ConversationCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  startSave]  = useTransition()
  const [scheduling,  setScheduling]  = useState<string | null>(null)   // leadId ou '' para contato
  const [convertOpen, setConvertOpen] = useState(false)
  const [chainToSchedule, setChainToSchedule] = useState(false)
  const [historicoKey, setHistoricoKey] = useState(0)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ funnelId: string; leadId: string } | null>(null)

  // Contato (editável, com salvamento automático)
  const [nome,     setNome]     = useState('')
  const [telefone, setTelefone] = useState('')
  const [tags,     setTags]     = useState<string[]>([])

  const salvoRef    = useRef('')
  const pendenteRef = useRef<{ nome: string; telefone: string; tags: string[] } | null>(null)
  const [salvando,   setSalvando]   = useState(false)
  const [salvoEm,    setSalvoEm]    = useState<number | null>(null)

  const recarregar = useCallback(async () => {
    const res = await getConversationCard(conversation.id)
    setCard(res)
    if (res) {
      setNome(res.contato.nome ?? '')
      setTelefone(res.contato.telefone ?? '')
      setTags(res.contato.tags)
      salvoRef.current = JSON.stringify({
        nome: res.contato.nome ?? '', telefone: res.contato.telefone ?? '', tags: res.contato.tags,
      })
    }
    return res
  }, [conversation.id])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setErro(null)
    setAviso(null)
    recarregar().then(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [recarregar])

  // -- Salvamento automático do contato --------------------------------------
  const estadoAtual = JSON.stringify({ nome, telefone, tags })

  useEffect(() => {
    if (loading || !card || !canEdit) return
    if (estadoAtual === salvoRef.current) return

    setSalvoEm(null)
    pendenteRef.current = { nome, telefone, tags }

    const t = setTimeout(async () => {
      setSalvando(true)
      const res = await atualizarContato(conversation.id, { nome, telefone, tags })
      pendenteRef.current = null
      setSalvando(false)
      if (!res.ok) { setErro(res.error ?? 'Não foi possível salvar o contato.'); return }
      salvoRef.current = estadoAtual
      setSalvoEm(Date.now())
      setHistoricoKey(k => k + 1)
      onLeadChanged?.()
    }, 500)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoAtual, loading, card, canEdit])

  // Trocar de conversa no meio do intervalo não pode engolir a alteração.
  useEffect(() => {
    const id = conversation.id
    return () => {
      const p = pendenteRef.current
      if (!p) return
      pendenteRef.current = null
      void atualizarContato(id, p)
    }
  }, [conversation.id])

  async function comAcao(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErro(null)
    const res = await fn()
    if (!res.ok) { setErro(res.error ?? 'Não foi possível concluir.'); return false }
    await recarregar()
    setHistoricoKey(k => k + 1)
    onLeadChanged?.()
    return true
  }

  function novaOportunidade(funnelId: string, confirmar = false) {
    setAviso(null)
    startSave(async () => {
      const res = await criarOportunidade(conversation.id, funnelId, confirmar)
      if (res.jaExisteAberta) { setAviso({ funnelId, leadId: res.jaExisteAberta }); return }
      if (!res.ok) { setErro(res.error ?? 'Não foi possível criar a oportunidade.'); return }
      await recarregar()
      setExpandida(res.leadId ?? null)
      // O histórico é do contato e não recarrega sozinho: sem isto a
      // oportunidade recém-criada só apareceria nele ao trocar de conversa.
      setHistoricoKey(k => k + 1)
      onLeadChanged?.()
    })
  }

  function handleConverted() {
    setConvertOpen(false)
    recarregar().then(() => {
      setHistoricoKey(k => k + 1)
      onLeadChanged?.()
      // Emenda no agendamento: o cliente acabou de ser criado.
      if (chainToSchedule) { setChainToSchedule(false); setScheduling('') }
    })
  }

  if (loading) {
    return <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Carregando…</div>
  }
  if (!card) {
    return <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Contato não encontrado.</div>
  }

  const disabled = !canEdit
  const cliente  = card.cliente

  return (
    <div style={{ padding: '18px 18px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ---------------- Contato ----------------
          Compacto de propósito: é o cabeçalho da pessoa, não o assunto do
          painel. O que se olha aqui é quem é e como falar com ela — o trabalho
          em si acontece nas oportunidades, logo abaixo. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={labelStyle}>Contato</span>
          {/* Estado do salvamento vive aqui, na mesma linha do rótulo: ocupava
              uma linha inteira para dizer, quase sempre, que está tudo salvo. */}
          {!disabled && (
            salvando ? (
              <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>salvando…</span>
            ) : salvoEm ? (
              <span style={{ fontSize: 10.5, color: 'var(--success)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Check size={11} /> salvo
              </span>
            ) : null
          )}
        </div>

        <input className="field" value={nome} disabled={disabled} placeholder="Nome"
          onChange={e => setNome(e.target.value)}
          style={{ fontSize: 13.5, fontWeight: 700, padding: '7px 10px' }} />
        <input className="field" value={telefone} disabled={disabled} placeholder="Telefone"
          onChange={e => setTelefone(e.target.value)}
          style={{ fontSize: 12.5, padding: '6px 10px' }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {tags.map(t => (
            <TagBadge key={t} label={t} size="xs"
              onRemove={disabled ? undefined : () => setTags(prev => prev.filter(x => x !== t))} />
          ))}
          <TagPicker
            selecionadas={tags}
            disponiveis={card.tagsDaRede}
            disabled={disabled}
            onChange={setTags}
          />
        </div>

        {/* Ações da PESSOA, discretas e lado a lado. Ficha de cliente é
            independente de ganhar negócio: fechar venda de quem não quer dar CPF
            é rotina, e a ficha exige CPF e e-mail (cria login). */}
        {!disabled && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {cliente ? (
              // Direto na ficha, não na lista: quem clica aqui quer ESTE
              // cliente, e cair na lista obriga a procurá-lo de novo.
              <a
                href={slug === '__admin__' ? `/admin/clients/${cliente.id}` : `/${slug}/clients/${cliente.id}`}
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 7px', textDecoration: 'none' }}
                title={`Abrir a ficha de ${cliente.name}`}
              >
                <UserCheck size={12} color="var(--success)" /> Ver cliente
              </a>
            ) : (
              <button type="button" className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 7px' }}
                onClick={() => { setChainToSchedule(false); setConvertOpen(true) }}>
                <UserCheck size={12} /> Cadastrar cliente
              </button>
            )}
            <button type="button" className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 7px' }}
              onClick={() => {
                if (cliente) setScheduling('')
                else { setChainToSchedule(true); setConvertOpen(true) }
              }}>
              <CalendarPlus size={12} /> Agendar
            </button>
          </div>
        )}
      </section>

      {erro && (
        <p style={{
          fontSize: 11.5, fontWeight: 700, color: '#dc2626', lineHeight: 1.45,
          background: '#fef2f2', border: '1px solid #dc262633', borderRadius: 8, padding: '7px 10px',
        }}>
          {erro}
        </p>
      )}

      {/* ---------------- Oportunidades ---------------- */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ ...labelStyle, fontSize: 11.5, color: 'var(--text)' }}>
            Oportunidades{card.abertas.length > 0 ? ` (${card.abertas.length})` : ''}
          </span>
          <a
            href={slug === '__admin__' ? '/admin/oportunidades' : `/${slug}/oportunidades`}
            title="Ver no quadro"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}
          >
            Quadro <ExternalLink size={12} />
          </a>
        </div>

        {card.abertas.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5, margin: 0 }}>
            Nenhuma oportunidade aberta. Nem toda conversa é um negócio — crie uma
            quando houver interesse de verdade.
          </p>
        )}

        {card.abertas.map(o => (
          <OportunidadeItem
            key={o.id}
            oportunidade={o}
            stages={card.stages}
            funnels={card.funnels}
            corDaEtapa={card.stages.find(s => s.id === o.crm_stage_id)?.color ?? null}
            procedimentos={card.procedimentos}
            slug={slug}
            disabled={disabled}
            aberta={expandida === o.id}
            onToggle={() => setExpandida(e => (e === o.id ? null : o.id))}
            onConcluir={d => comAcao(() => definirSituacaoOportunidade(o.id, d))}
            onMudou={() => { void recarregar(); setHistoricoKey(k => k + 1); onLeadChanged?.() }}
            onAgendar={() => setScheduling(o.id)}
          />
        ))}

        {!disabled && (
          <NovaOportunidade
            funnels={card.funnels}
            pendente={saving}
            /* Sem nenhuma aberta, criar é a ação principal do painel e ganha
               preenchimento; com negócio em andamento, o destaque é dele. */
            destaque={card.abertas.length === 0}
            onCriar={novaOportunidade}
          />
        )}

        {aviso && (
          <div style={{
            fontSize: 11.5, lineHeight: 1.5, color: '#92400e',
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px',
          }}>
            Já existe uma oportunidade aberta neste funil.{' '}
            <button type="button" onClick={() => { setExpandida(aviso.leadId); setAviso(null) }}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 800, color: '#92400e', textDecoration: 'underline' }}>
              Ver a que existe
            </button>
            {' · '}
            <button type="button" onClick={() => novaOportunidade(aviso.funnelId, true)}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 800, color: '#92400e', textDecoration: 'underline' }}>
              Criar mesmo assim
            </button>
          </div>
        )}

        {card.concluidas.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setMostrarConcluidas(v => !v)}
              style={{
                border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              }}
            >
              <ChevronDown
                size={12}
                style={{ transform: mostrarConcluidas ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}
              />
              Concluídas ({card.concluidas.length})
            </button>

            {mostrarConcluidas && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
                {card.concluidas.map(o => (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    fontSize: 11.5, color: 'var(--text-muted)',
                    padding: '6px 8px', borderRadius: 8, background: 'var(--bg-app)',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {o.funnel_name ?? 'Sem funil'} · {o.stage_name ?? '—'}
                    </span>
                    <span style={{
                      flexShrink: 0, fontWeight: 800,
                      color: o.outcome === 'WON' ? 'var(--success)' : 'var(--text-faint)',
                    }}>
                      {o.outcome === 'WON' ? 'Ganha' : 'Perdida'}
                    </span>
                    {/* Desfazer sem sair do inbox: fechar por engano é comum, e
                        a alternativa seria abrir o quadro e arrastar o card. */}
                    {!disabled && (
                      <button
                        type="button"
                        title="Voltar para em aberto"
                        onClick={() => comAcao(() => definirSituacaoOportunidade(o.id, 'OPEN'))}
                        style={{
                          flexShrink: 0, border: 'none', background: 'none', padding: 0,
                          cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--brand)',
                        }}
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Histórico ----------------
          Do CONTATO, não de uma oportunidade: a pessoa pode ter dois negócios, e
          o que aconteceu em qualquer um deles faz parte da mesma história de
          atendimento. Enquanto era por oportunidade, criar a segunda parecia não
          ter acontecido — o evento existia, na linha do tempo que não estava à
          vista. */}
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <LeadTimeline conversationId={conversation.id} refreshKey={historicoKey} />
      </div>

      {scheduling !== null && cliente && (
        <ScheduleModal
          leadId={scheduling || (card.abertas[0]?.id ?? '')}
          branches={branches}
          onClose={() => setScheduling(null)}
          onScheduled={() => { setScheduling(null); void recarregar(); onLeadChanged?.() }}
        />
      )}

      {convertOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => { setConvertOpen(false); setChainToSchedule(false) }}
        >
          <div className="card" style={{ width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                {chainToSchedule ? 'Cadastrar cliente para agendar' : 'Cadastrar como cliente'}
              </h3>
              <button type="button" onClick={() => { setConvertOpen(false); setChainToSchedule(false) }} style={{
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-app)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
              }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <ClientForm
                /* A unidade de cadastro vira a tag `Unidade: X`, e é POR ELA que
                   a lista de clientes de cada filial filtra. Com `branchId` vazio
                   o seletor abria na primeira unidade em ordem alfabética: quem
                   cadastrava pelo portal de uma unidade gravava o cliente em
                   outra sem perceber, e ele sumia da própria lista. No portal da
                   filial a unidade atual é o padrão; no admin (`__admin__`) não
                   há unidade corrente e o seletor segue como está. */
                branchId={branches.find(b => b.slug === slug)?.id ?? ''}
                slug={slug}
                branches={branches}
                conversationId={conversation.id}
                leadId={card.abertas[0]?.id}
                prefill={{ name: nome, phone: telefone || undefined }}
                onSuccess={handleConverted}
                showCancelButton
                onCancel={() => { setConvertOpen(false); setChainToSchedule(false) }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Uma oportunidade aberta: resumo sempre visível, detalhes ao expandir. */
function OportunidadeItem({
  oportunidade: o, stages, funnels, corDaEtapa, procedimentos, slug, disabled, aberta,
  onToggle, onConcluir, onMudou, onAgendar,
}: {
  oportunidade: Oportunidade
  stages:   InboxStage[]
  funnels:  { id: string; name: string }[]
  /** Cor da etapa, que o quadro já usa e aqui era desperdiçada. */
  procedimentos: { id: string; name: string; price: number }[]
  corDaEtapa: string | null
  slug:     string
  disabled: boolean
  aberta:   boolean
  onToggle:   () => void
  onConcluir: (situacao: 'OPEN' | 'WON' | 'LOST') => void
  onMudou:    () => void
  onAgendar:  () => void
}) {
  const [stageId, setStageId] = useState(o.crm_stage_id ?? '')
  const [notes,   setNotes]   = useState(o.notes ?? '')
  const [source,  setSource]  = useState(o.source ?? '')
  const [valor,   setValor]   = useState(o.value === null ? '' : String(o.value).replace('.', ','))
  const [procs,   setProcs]   = useState<string[]>(o.procedure_ids)
  const [salvando, startSave] = useTransition()

  const somaDosProcedimentos = procs.reduce(
    (t, id) => t + (procedimentos.find(p => p.id === id)?.price ?? 0), 0,
  )

  function mudarEtapa(next: string) {
    setStageId(next)
    startSave(async () => {
      await updateLeadStage(o.id, next, slug)
      onMudou()
    })
  }

  function salvarDetalhes() {
    const fd = new FormData()
    fd.set('_leadId', o.id)
    fd.set('_slug', slug)
    fd.set('name', o.name)
    fd.set('phone', o.phone ?? '')
    fd.set('email', o.email ?? '')
    fd.set('social_media', o.social_media ?? '')
    fd.set('source', source)
    fd.set('notes', notes)
    fd.set('crm_stage_id', stageId)
    fd.set('tags', JSON.stringify(o.tags))
    fd.set('procedure_ids', JSON.stringify(procs))
    fd.set('value', valor)
    startSave(async () => {
      await updateLead(undefined, fd)
      onMudou()
    })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '10px 11px', border: 'none', background: 'var(--surface)',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Faixa na cor da etapa: é como o quadro identifica em que ponto o
            negócio está, e repetir o código de cor aqui poupa a leitura. */}
        <span style={{
          width: 3, alignSelf: 'stretch', borderRadius: 99, flexShrink: 0,
          background: corDaEtapa ?? 'var(--border)',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.funnel_name ?? 'Sem funil'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
              color: corDaEtapa ?? 'var(--text-muted)',
              background: corDaEtapa ? `${corDaEtapa}1a` : 'var(--bg-app)',
            }}>
              {o.stage_name ?? 'Sem etapa'}
            </span>
            {o.value !== null && (
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)' }}>
                {fmtBRL(o.value)}
              </span>
            )}
            {o.owner_name && (
              <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{o.owner_name}</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={13}
          style={{ flexShrink: 0, color: 'var(--text-faint)', transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}
        />
      </button>

      {aberta && (
        <div style={{ padding: '10px', borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select className="field" value={stageId} disabled={disabled}
            onChange={e => mudarEtapa(e.target.value)} style={{ fontSize: 12.5 }}>
            <option value="">—</option>
            <StageOptions funnels={funnels} stages={stages} />
          </select>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {source
              ? <TagBadge
                  label={LEAD_SOURCES.find(s => s.key === source)?.label ?? source}
                  style={sourceStyle(source)} size="xs"
                  onRemove={disabled ? undefined : () => { setSource(''); }}
                />
              : <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Origem não informada</span>}
          </div>
          <PickerCompacto
            icone={<Compass size={12} />}
            rotuloBotao={source ? 'Alterar origem' : 'Definir origem'}
            opcoes={LEAD_SOURCES.map(s => ({ valor: s.key, rotulo: s.label }))}
            selecionadas={source ? [source] : []}
            disabled={disabled}
            textoListaVazia="Nenhuma origem cadastrada."
            onEscolher={setSource}
          />

          {/* Produto e valor: o que está sendo negociado, e por quanto. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {procs.map(id => {
              const p = procedimentos.find(x => x.id === id)
              return (
                <TagBadge
                  key={id}
                  label={p?.name ?? 'Procedimento'}
                  size="xs"
                  onRemove={disabled ? undefined : () => setProcs(prev => prev.filter(x => x !== id))}
                />
              )
            })}
            <PickerCompacto
              icone={<Package size={12} />}
              rotuloBotao={procs.length > 0 ? 'Editar produtos' : 'Adicionar produto'}
              opcoes={procedimentos.map(p => ({
                valor: p.id,
                rotulo: p.price > 0 ? `${p.name} · ${fmtBRL(p.price)}` : p.name,
              }))}
              selecionadas={procs}
              multiplo
              disabled={disabled}
              larguraPainel={252}
              textoListaVazia="Nenhum procedimento ativo na rede."
              onEscolher={id => setProcs(prev =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>R$</span>
            <input
              className="field"
              value={valor}
              disabled={disabled}
              inputMode="decimal"
              placeholder="Valor negociado"
              onChange={e => setValor(e.target.value)}
              style={{ fontSize: 12.5, padding: '6px 9px' }}
            />
            {/* Sugestão, não preenchimento automático: o preço de tabela é
                ponto de partida, e desconto é a regra, não a exceção. */}
            {somaDosProcedimentos > 0 && !valor && !disabled && (
              <button type="button" className="btn-ghost"
                onClick={() => setValor(String(somaDosProcedimentos).replace('.', ','))}
                style={{ fontSize: 10.5, padding: '4px 6px', flexShrink: 0 }}
                title="Usar a soma dos procedimentos">
                {fmtBRL(somaDosProcedimentos)}
              </button>
            )}
          </div>

          <textarea className="field" value={notes} disabled={disabled} rows={2}
            placeholder="Anotações sobre esta oportunidade…"
            onChange={e => setNotes(e.target.value)}
            style={{ fontSize: 12.5, resize: 'vertical' }} />

          {!disabled && (
            <>
              <button type="button" className="btn-ghost" onClick={salvarDetalhes}
                disabled={salvando} style={{ alignSelf: 'flex-start', fontSize: 11.5 }}>
                {salvando ? 'Salvando…' : 'Salvar detalhes'}
              </button>

              {/* Situação: três estados, não dois botões de saída.
                  Ganhar é a conclusão do NEGÓCIO e não cria cliente — são gestos
                  separados, e amarrá-los faria o funil mentir sobre vendas de
                  quem não quis deixar CPF. Reabrir existe porque marcar errado
                  acontece, e sem ele a única saída seria arrastar o card no
                  quadro. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Situação
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {([
                    { key: 'OPEN', label: 'Em aberto' },
                    { key: 'WON',  label: 'Ganha' },
                    { key: 'LOST', label: 'Perdida' },
                  ] as const).map(s => {
                    const ativa = o.outcome === s.key
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => { if (!ativa) onConcluir(s.key) }}
                        style={{
                          fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          cursor: ativa ? 'default' : 'pointer', transition: 'all 100ms',
                          border:     ativa ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                          background: ativa ? 'var(--brand-soft)' : 'var(--bg-app)',
                          color:      ativa ? 'var(--brand)' : 'var(--text-muted)',
                        }}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Agenda, não desfecho: marca um atendimento e o registra na
                  linha do tempo desta oportunidade. */}
              <button type="button" className="btn-ghost" onClick={onAgendar}
                style={{ alignSelf: 'flex-start', fontSize: 11.5 }}>
                <CalendarPlus size={12} /> Agendar atendimento
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Botão que vira seletor de funil. Fechado por padrão, como o resto do painel. */
function NovaOportunidade({
  funnels, pendente, destaque, onCriar,
}: {
  funnels:  { id: string; name: string }[]
  pendente: boolean
  destaque: boolean
  onCriar:  (funnelId: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const classe = destaque ? 'btn-secondary' : 'btn-ghost'

  if (funnels.length === 0) {
    return (
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>
        Crie um funil em Oportunidades para poder abrir negócios.
      </p>
    )
  }

  // Um funil só não é escolha: cria direto.
  if (funnels.length === 1) {
    return (
      <button type="button" className={classe} disabled={pendente}
        onClick={() => onCriar(funnels[0]!.id)}
        style={{ alignSelf: 'flex-start', fontSize: 11.5 }}>
        <Plus size={12} /> {pendente ? 'Criando…' : 'Nova oportunidade'}
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className={classe} disabled={pendente}
        onClick={() => setAberto(a => !a)}
        style={{ fontSize: 11.5 }}>
        <Plus size={12} /> {pendente ? 'Criando…' : 'Nova oportunidade'}
      </button>

      {aberto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setAberto(false)} />
          <div style={{
            position: 'absolute', top: 30, left: 0, zIndex: 31, width: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 6,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', padding: '2px 6px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Em qual funil?
            </div>
            {funnels.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setAberto(false); onCriar(f.id) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px', borderRadius: 6, border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 12, color: 'var(--text)',
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// --- Modal de agendamento ----------------------------------------------------

function ScheduleModal({
  leadId, branches, onClose, onScheduled,
}: {
  leadId:      string
  branches:    PanelBranch[]
  onClose:     () => void
  onScheduled: () => void
}) {
  const [branchId,   setBranchId]   = useState(branches[0]?.id ?? '')
  const [data,       setData]       = useState<CrmSchedulingData | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [isEvaluation, setIsEvaluation] = useState(false)
  const [procedureId, setProcedureId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [roomId,     setRoomId]     = useState('')
  const [date,       setDate]       = useState(todayInSP())
  const [slots,      setSlots]      = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slot,       setSlot]       = useState('')
  const [saving,     startSave]     = useTransition()
  const [error,      setError]      = useState<string | null>(null)

  const durationMin = isEvaluation
    ? 60
    : (data?.procedures.find(p => p.id === procedureId)?.duration_min ?? 60)

  // Carrega profissionais/procedimentos/salas da filial
  useEffect(() => {
    if (!branchId) { setData(null); return }
    let active = true
    setLoadingData(true)
    setData(null); setProcedureId(''); setProfessionalId(''); setRoomId(''); setSlots([]); setSlot('')
    getCrmSchedulingData(branchId).then(d => { if (active) { setData(d); setLoadingData(false) } })
    return () => { active = false }
  }, [branchId])

  // Carrega horários livres
  useEffect(() => {
    const ready = branchId && professionalId && date && (isEvaluation || procedureId)
    if (!ready) { setSlots([]); return }
    let active = true
    setLoadingSlots(true); setSlot('')
    getCrmSlots(branchId, professionalId, date, durationMin).then(s => { if (active) { setSlots(s); setLoadingSlots(false) } })
    return () => { active = false }
  }, [branchId, professionalId, date, procedureId, isEvaluation, durationMin])

  function handleSubmit() {
    setError(null)
    if (!branchId)                        { setError('Selecione a unidade.'); return }
    if (!professionalId)                  { setError('Selecione o profissional.'); return }
    if (!isEvaluation && !procedureId)    { setError('Selecione o procedimento.'); return }
    if (!slot)                            { setError('Selecione um horário.'); return }

    const scheduledAt = new Date(`${date}T${slot}:00-03:00`).toISOString()
    startSave(async () => {
      const res = await createCrmAppointment({
        leadId,
        branchId,
        professionalId,
        procedureId: isEvaluation ? null : procedureId,
        scheduledAt,
        roomId: roomId || null,
        isEvaluation,
      })
      if (res.error) { setError(res.error); return }
      onScheduled()
    })
  }

  const selectStyle: React.CSSProperties = { fontSize: 13, width: '100%' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 400, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Novo agendamento</h3>
          <button type="button" onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-app)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
          }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Unidade */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Unidade</span>
            <select className="field" value={branchId} onChange={e => setBranchId(e.target.value)} style={selectStyle}>
              {branches.length === 0 && <option value="">Nenhuma filial</option>}
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          {/* Avaliação */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isEvaluation} onChange={e => setIsEvaluation(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Consulta de avaliação</span>
          </label>

          {/* Procedimento */}
          {!isEvaluation && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>Procedimento</span>
              <select className="field" value={procedureId} disabled={loadingData} onChange={e => setProcedureId(e.target.value)} style={selectStyle}>
                <option value="">{loadingData ? 'Carregando…' : 'Selecione…'}</option>
                {data?.procedures.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          {/* Profissional */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Profissional</span>
            <select className="field" value={professionalId} disabled={loadingData} onChange={e => setProfessionalId(e.target.value)} style={selectStyle}>
              <option value="">{loadingData ? 'Carregando…' : 'Selecione…'}</option>
              {data?.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {/* Sala (opcional) */}
          {data && data.rooms.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>Sala (opcional)</span>
              <select className="field" value={roomId} onChange={e => setRoomId(e.target.value)} style={selectStyle}>
                <option value="">Nenhuma</option>
                {data.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}

          {/* Data */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Dia</span>
            <input type="date" className="field" value={date} onChange={e => setDate(e.target.value)} style={selectStyle} />
          </label>

          {/* Horários */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Horário</span>
            {loadingSlots ? (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Carregando horários…</span>
            ) : slots.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {professionalId && (isEvaluation || procedureId) ? 'Sem horários livres neste dia.' : 'Escolha profissional e procedimento.'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {slots.map(h => (
                  <button key={h} type="button" onClick={() => setSlot(h)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
                      border: slot === h ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                      background: slot === h ? 'var(--brand-soft)' : 'var(--bg-app)',
                      color: slot === h ? 'var(--brand)' : 'var(--text-muted)',
                    }}>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={handleSubmit} disabled={saving || !slot}>
              <Check size={14} /> {saving ? 'Agendando…' : 'Agendar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
