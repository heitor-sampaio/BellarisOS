'use client'

import {
  useState, useRef, useEffect, useTransition, useCallback,
} from 'react'
import {
  Search, MessageSquare, Phone, Mail, AtSign,
  Send, ChevronDown, CheckCheck, AlertCircle, Plus, X, Paperclip, FileText, Zap, UserCheck,
  Mic, Square,
  ArrowLeft,
  Megaphone,
  Reply, Pencil, Check,
} from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import {
  getMessages, sendMessage, sendMediaMessage, markConversationRead,
  setConversationStatus, createConversationForLead, getMessageMediaUrl, editMessage,
  type Conversation, type Message, type InboxChannel, type ConvStatus,
  type ReplyPreview, type AnuncioDaMensagem,
} from '@/actions/inbox'
import { InboxLeadPanel, type PanelBranch } from '@/components/admin/inbox-lead-panel'
import {
  InboxFiltros, ChipsDeFiltro, passaNosFiltros, contarFiltros,
  FILTROS_VAZIOS, type FiltrosInbox,
} from '@/components/admin/inbox-filtros'
import { TagBadge } from '@/components/shared/tag-badge'
import { estadoDaJanela } from '@/lib/channels/window'
import { InboxTemplatePicker } from '@/components/admin/inbox-template-picker'
import { InboxQuickReplies } from '@/components/admin/inbox-quick-replies'
import { useAnexos, PainelDeAnexo, BotoesDeAnexo } from '@/components/admin/inbox-anexos'
import {
  secondsSince, agingLevel, AGING_STYLE, AWAITING_THRESHOLDS,
  formatDurationShort, formatDurationLong,
} from '@estetica-os/utils'

// --- Channel meta ------------------------------------------------------------

const CH = {
  whatsapp:  { label: 'WhatsApp',  color: '#25D366', bg: '#f0fdf4', border: '#25D36633' },
  instagram: { label: 'Instagram', color: '#E1306C', bg: '#fff0f5', border: '#E1306C33' },
  messenger: { label: 'Messenger', color: '#0084FF', bg: '#eff6ff', border: '#0084FF33' },
  email:     { label: 'E-mail',    color: '#3B82F6', bg: '#eff6ff', border: '#3B82F633' },
  manual:    { label: 'Nota',      color: 'var(--text-faint)', bg: 'var(--bg-app)', border: 'var(--border)' },
} satisfies Record<InboxChannel, { label: string; color: string; bg: string; border: string }>

function ChannelBadge({ ch, size = 'sm' }: { ch: InboxChannel; size?: 'xs' | 'sm' }) {
  const m = CH[ch]
  return (
    <span style={{
      fontSize: size === 'xs' ? 10 : 11, fontWeight: 700,
      padding: size === 'xs' ? '2px 6px' : '3px 9px',
      borderRadius: 99, background: m.bg, color: m.color,
      border: `1px solid ${m.border}`,
      whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  )
}

function ChannelIcon({ ch }: { ch: InboxChannel }) {
  const p = { size: 13, color: CH[ch].color }
  if (ch === 'whatsapp')  return <Phone {...p} />
  if (ch === 'instagram') return <AtSign {...p} />
  if (ch === 'messenger') return <MessageSquare {...p} />
  if (ch === 'email')     return <Mail {...p} />
  return <MessageSquare size={13} color="var(--text-faint)" />
}

function dayLabel(iso: string) {
  const d = parseISO(iso)
  if (isToday(d))     return 'Hoje'
  if (isYesterday(d)) return 'Ontem'
  return format(d, "d 'de' MMMM", { locale: ptBR })
}

function relTime(iso: string | null) {
  if (!iso) return ''
  const d = parseISO(iso)
  if (isToday(d))     return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ontem'
  return format(d, 'dd/MM', { locale: ptBR })
}

/**
 * Mesma ordem que `getConversations` devolve: mais recente primeiro, quem nunca
 * falou por último. Precisa existir no cliente porque o realtime entrega o
 * evento solto, sem reordenar a lista.
 */
function ordenarPorUltimaMensagem(convs: Conversation[]): Conversation[] {
  return [...convs].sort((a, b) => {
    if (!a.last_message_at) return 1
    if (!b.last_message_at) return -1
    return b.last_message_at.localeCompare(a.last_message_at)
  })
}

// --- Status chip -------------------------------------------------------------

const STATUS_META: Record<ConvStatus, { label: string; color: string; bg: string; border: string }> = {
  open:    { label: 'Aberta',    color: '#3f9b6f', bg: '#f0fdf4', border: '#3f9b6f33' },
  pending: { label: 'Pendente',  color: '#b45309', bg: '#fffbeb', border: '#b4530933' },
  closed:  { label: 'Encerrada', color: 'var(--text-faint)', bg: 'var(--bg-app)', border: 'var(--border)' },
}

// --- Left: conversation list item --------------------------------------------

function ConvItem({ conv, selected, onClick, nowMs }: { conv: Conversation; selected: boolean; onClick: () => void; nowMs: number | null }) {
  // `nowMs` só existe depois de montar: 'há 4min' no servidor e 'há 5min' no
  // cliente é o bastante para o React descartar a árvore inteira na hidratação.
  const awaitingSecs = nowMs == null ? null : secondsSince(conv.awaiting_since, nowMs)
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '11px 14px',
        background: selected ? 'var(--brand-soft)' : 'transparent',
        border: 'none', borderBottom: '1px solid var(--hairline)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-app)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: selected ? 'var(--brand)' : 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800,
          color: selected ? '#fff' : 'var(--text-muted)',
        }}>
          {(conv.contact_name ?? '?')[0]!.toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + time */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{
              fontSize: 13, fontWeight: conv.unread_count > 0 ? 800 : 600,
              color: selected ? 'var(--brand)' : 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {conv.contact_name ?? 'Sem nome'}
            </span>
            {/* Já é cliente: o comercial atende diferente quem já comprou, e
                precisa saber disso antes de abrir a conversa. */}
            {conv.eh_cliente && (
              <UserCheck size={11} color="var(--success)" style={{ flexShrink: 0 }} />
            )}
            {/* Veio de anúncio: muda a fila. Lead de campanha paga esfria em
                minutos, e quem escolhe a próxima conversa precisa ver isso
                antes de abrir. */}
            {conv.veio_de_anuncio && (
              <Megaphone size={11} color="var(--brand)" style={{ flexShrink: 0 }} aria-label="Veio de anúncio" />
            )}
            <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
              {relTime(conv.last_message_at)}
            </span>
          </div>

          {/* Channel + preview + unread */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <ChannelIcon ch={conv.channel} />
            <span style={{
              fontSize: 11.5, color: 'var(--text-muted)', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {conv.last_message ?? 'Nenhuma mensagem'}
            </span>
            {conv.unread_count > 0 && (
              <span style={{
                background: 'var(--brand)', color: '#fff',
                borderRadius: 99, fontSize: 10, fontWeight: 800,
                padding: '1px 6px', flexShrink: 0,
              }}>
                {conv.unread_count}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {conv.awaiting_since && awaitingSecs != null && (
              <TagBadge
                size="xs"
                label={`Aguardando ${formatDurationShort(awaitingSecs)}`}
                style={AGING_STYLE[agingLevel(awaitingSecs, AWAITING_THRESHOLDS)]}
              />
            )}
            {conv.branch_name && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {conv.branch_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// --- Right: message bubble ---------------------------------------------------

/** Rótulo curto da mídia, para a citação não mostrar "[image]" cru. */
const ROTULO_MIDIA: Record<string, string> = {
  image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento',
}

function resumoDaCitada(preview: ReplyPreview): string {
  const texto = preview.content.trim()
  const rotulo = preview.media_type ? ROTULO_MIDIA[preview.media_type] : null
  if (rotulo && (!texto || texto.startsWith('['))) return rotulo
  return texto || 'Mensagem'
}

/**
 * Selo de "veio de anúncio" dentro da bolha.
 *
 * O que sempre existe: o título e o texto do criativo, que chegam no próprio
 * aviso do WhatsApp. Campanha e conjunto só aparecem com a integração Meta Ads
 * conectada — o aviso não os traz. Sem eles o selo continua valendo: saber que
 * a pessoa veio de um anúncio já muda a resposta, mesmo sem o nome da campanha.
 */
function SeloDeAnuncio({ anuncio }: { anuncio: AnuncioDaMensagem }) {
  const linhas: { rotulo: string; valor: string }[] = []
  if (anuncio.campaignName) linhas.push({ rotulo: 'Campanha', valor: anuncio.campaignName })
  if (anuncio.adName)       linhas.push({ rotulo: 'Anúncio',  valor: anuncio.adName })
  // Sem o nome do anúncio, o título do criativo faz o papel: é o que a pessoa
  // leu antes de clicar, e é o que a recepção reconhece.
  else if (anuncio.headline) linhas.push({ rotulo: 'Anúncio', valor: anuncio.headline })

  const rodape = [anuncio.plataforma, anuncio.adsetName].filter(Boolean).join(' · ')

  return (
    <div style={{
      background: 'var(--brand-soft)',
      border: '1px solid var(--brand-soft-border)',
      borderRadius: 8, padding: '6px 9px', marginBottom: 6,
      fontSize: 11.5, lineHeight: 1.4, color: 'var(--text)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 2,
      }}>
        <Megaphone size={11} /> Veio de anúncio
      </div>
      {linhas.map(l => (
        <div key={l.rotulo} style={{ display: 'flex', gap: 5, minWidth: 0 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{l.rotulo}:</span>
          <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.valor}
          </span>
        </div>
      ))}
      {rodape && (
        <div style={{ color: 'var(--text-muted)', fontSize: 10.5, marginTop: 1 }}>{rodape}</div>
      )}
      {/* Sem campanha nem título não sobra texto nenhum: o id é o único fio
          que resta para achar o anúncio no gerenciador. */}
      {linhas.length === 0 && anuncio.adId && (
        <div style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>id {anuncio.adId}</div>
      )}
    </div>
  )
}

/** A edição só vale nos primeiros 15 minutos — o WhatsApp recusa depois disso. */
const JANELA_DE_EDICAO_MS = 15 * 60 * 1000

function Bubble({
  msg, nomeDoContato, onResponder, onEditar, podeAgir, canalEdita, agora,
}: {
  msg: Message
  nomeDoContato: string
  onResponder: (m: Message) => void
  onEditar:    (m: Message) => void
  podeAgir:    boolean
  /** O canal aceita editar? Só o WhatsApp não oficial aceita. */
  canalEdita:  boolean
  /** Null antes de montar: relógio no servidor difere do cliente e hidrata errado. */
  agora:       number | null
}) {
  const out    = msg.direction === 'outbound'
  // Mensagem que o provedor recusou. Sem marcar, ela fica idêntica a uma
  // entregue e a pessoa segue a conversa achando que o cliente recebeu.
  const falhou = msg.status === 'failed'
  // Anexo sem legenda chega com o conteúdo '[image]' — só um rótulo do parser.
  // Com o arquivo na tela, repetir isso embaixo dele é ruído.
  const soRotulo = !!msg.media_url
    && (msg.content === `[${msg.media_type}]` || msg.content === '[sticker]')

  // Figurinha não é foto. No tamanho de foto ela domina a conversa, e o
  // WhatsApp a exibe pequena justamente por isso. A origem diz qual é
  // (`[sticker]`); o `.webp` cobre o que foi recebido antes de o rótulo existir,
  // e é seguro porque o WhatsApp entrega foto em jpeg.
  const arquivo = msg.media_path ?? ''
  const ehFigurinha = msg.media_type === 'image'
    && (msg.content === '[sticker]' || arquivo.toLowerCase().endsWith('.webp'))

  // Editar só faz sentido no que saiu daqui, é texto, chegou ao provedor e
  // ainda está dentro dos 15 minutos. `agora` é null até montar no cliente.
  const idade = agora === null ? Infinity : agora - parseISO(msg.created_at).getTime()
  const podeEditar = podeAgir && canalEdita && out && !falhou
    && msg.status !== 'sending' && !msg.media_type && idade <= JANELA_DE_EDICAO_MS
  return (
    <div
      className="bolha-linha"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        justifyContent: out ? 'flex-end' : 'flex-start', padding: '2px 18px',
      }}
    >
      {/* Ações à esquerda quando a bolha é nossa, à direita quando é do
          contato: sempre do lado de fora, para não cobrir o texto. */}
      {podeAgir && out && (
        <AcoesDaBolha msg={msg} podeEditar={podeEditar} onResponder={onResponder} onEditar={onEditar} />
      )}

      <div style={{
        maxWidth: '70%',
        background: falhou ? '#fef2f2' : out ? 'var(--brand)' : 'var(--surface)',
        color:      falhou ? '#991b1b' : out ? '#fff' : 'var(--text)',
        border:     falhou ? '1px solid #dc262633' : out ? 'none' : '1px solid var(--border)',
        borderRadius: out ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding:   '8px 12px',
        fontSize:   13.5, lineHeight: 1.45,
        boxShadow:  out && !falhou ? '0 2px 8px -3px rgba(195,77,107,.3)' : 'none',
        opacity: msg.status === 'sending' ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}>
        {/* Mensagem citada. Sem ela a resposta perde o sentido, que é
            justamente o de apontar para uma mensagem específica. */}
        {msg.reply_to_external_id && (
          <div style={{
            borderLeft: `3px solid ${out ? 'rgba(255,255,255,0.65)' : 'var(--brand)'}`,
            background: out ? 'rgba(255,255,255,0.14)' : 'var(--bg)',
            borderRadius: 6, padding: '5px 8px', marginBottom: 6,
            fontSize: 12, lineHeight: 1.35,
          }}>
            <div style={{
              fontWeight: 700, fontSize: 10.5, marginBottom: 1,
              color: out ? 'rgba(255,255,255,0.85)' : 'var(--brand)',
            }}>
              {msg.reply_preview
                ? (msg.reply_preview.direction === 'outbound' ? 'Você' : nomeDoContato)
                : 'Mensagem'}
            </div>
            <div style={{
              opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {msg.reply_preview
                ? resumoDaCitada(msg.reply_preview)
                : 'Mensagem não disponível'}
            </div>
          </div>
        )}

        {/* Veio de anúncio. Fica DENTRO da bolha, colado na mensagem que
            trouxe: é a primeira frase do cliente que vem da campanha, e é ela
            que a recepção precisa reconhecer para responder de acordo. */}
        {msg.anuncio && <SeloDeAnuncio anuncio={msg.anuncio} />}

        {/* Mídia recebida. O arquivo vive no bucket privado e chega aqui como
            link assinado — a URL do provedor expiraria em horas. */}
        {msg.media_url && msg.media_type === 'image' && (
          <a href={msg.media_url} target="_blank" rel="noreferrer">
            <img
              src={msg.media_url}
              alt={msg.content}
              style={ehFigurinha
                ? { width: 128, maxWidth: '100%', marginBottom: 6, display: 'block' }
                : { maxWidth: '100%', minWidth: 120, borderRadius: 10, marginBottom: 6, display: 'block' }}
            />
          </a>
        )}
        {msg.media_url && msg.media_type === 'audio' && (
          <audio controls src={msg.media_url} style={{ width: 220, marginBottom: 6 }} />
        )}
        {msg.media_url && msg.media_type === 'video' && (
          <video controls src={msg.media_url} style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 6 }} />
        )}
        {msg.media_url && msg.media_type === 'document' && (
          <a
            href={msg.media_url} target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6,
              fontSize: 12.5, fontWeight: 700,
              color: out ? '#fff' : 'var(--brand)', textDecoration: 'underline',
            }}
          >
            <Paperclip size={13} /> Abrir arquivo
          </a>
        )}
        {/* Mídia que não desceu: o texto vira "[imagem]" e o link não existe. */}
        {msg.media_type && !msg.media_url && (
          <p style={{
            margin: '0 0 4px', fontSize: 11.5,
            color: out ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)',
          }}>
            Anexo indisponível
          </p>
        )}

        {!soRotulo && (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 4,
        }}>
          {out && msg.sent_by_name && (
            <span style={{ fontSize: 10, color: falhou ? '#99181899' : out ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)' }}>
              {msg.sent_by_name}
            </span>
          )}
          {falhou && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626' }}>
              Não enviada
            </span>
          )}
          {msg.edited_at && (
            <span style={{
              fontSize: 10, fontStyle: 'italic',
              color: out ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)',
            }}>
              editada
            </span>
          )}
          <span style={{ fontSize: 10, color: falhou ? '#99181899' : out ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)' }}>
            {msg.status === 'sending' ? '…' : format(parseISO(msg.created_at), 'HH:mm')}
          </span>
          {out && !falhou && msg.status !== 'sending' && (
            <CheckCheck size={11} color={msg.status === 'read' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'} />
          )}
        </div>
      </div>

      {podeAgir && !out && (
        <AcoesDaBolha msg={msg} podeEditar={false} onResponder={onResponder} onEditar={onEditar} />
      )}
    </div>
  )
}

/**
 * Responder e editar, escondidos até o mouse passar pela linha.
 *
 * Sempre presentes no DOM (só invisíveis) porque aparecer no hover mudando o
 * layout faria as mensagens pularem sob o cursor.
 */
function AcoesDaBolha({
  msg, podeEditar, onResponder, onEditar,
}: {
  msg: Message
  podeEditar: boolean
  onResponder: (m: Message) => void
  onEditar:    (m: Message) => void
}) {
  const estilo: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, borderRadius: 999,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-muted)', cursor: 'pointer', padding: 0,
  }
  return (
    <div className="bolha-acoes" style={{ display: 'flex', gap: 4 }}>
      <button type="button" style={estilo} title="Responder"
        onClick={() => onResponder(msg)}>
        <Reply size={13} />
      </button>
      {podeEditar && (
        <button type="button" style={estilo} title="Editar"
          onClick={() => onEditar(msg)}>
          <Pencil size={13} />
        </button>
      )}
    </div>
  )
}

// --- New conversation modal --------------------------------------------------

interface Lead { id: string; name: string; phone?: string | null; branch_name?: string | null }

function NewConvModal({
  leads,
  onCreated,
  onClose,
}: {
  leads: Lead[]
  onCreated: (convId: string) => void
  onClose: () => void
}) {
  const [leadId,  setLeadId]  = useState(leads[0]?.id ?? '')
  const [channel, setChannel] = useState<InboxChannel>('manual')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!leadId) return
    setLoading(true)
    setError(null)
    const res = await createConversationForLead(leadId, channel)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    onCreated(res.conversationId!)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        className="card"
        style={{ width: 380, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Nova conversa</h3>
          <button type="button" onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-app)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
          }}>
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>LEAD</label>
            <select className="field" value={leadId} onChange={e => setLeadId(e.target.value)} required>
              {leads.length === 0 && <option value="">Nenhum lead disponível</option>}
              {leads.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.branch_name ? ` · ${l.branch_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>CANAL</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(CH) as InboxChannel[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 99, cursor: 'pointer',
                    border: channel === c ? `1.5px solid ${CH[c].color}` : '1.5px solid var(--border)',
                    background: channel === c ? CH[c].bg : 'var(--bg-app)',
                    color: channel === c ? CH[c].color : 'var(--text-muted)',
                    transition: 'all 100ms',
                  }}
                >
                  {CH[c].label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={loading || !leadId}>
              <MessageSquare size={14} />
              {loading ? 'Criando…' : 'Iniciar conversa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * As ações do compositor num botão só — para o celular.
 *
 * Quatro ícones de 36px consomem metade da largura de um telefone, e o que
 * sobra é o campo de escrever, que é o motivo de a tela existir. No desktop a
 * barra continua com tudo à mostra (`hide-mobile` nos botões originais): lá o
 * espaço existe, e um clique vale mais que dois.
 *
 * Gravar áudio fica FORA do menu enquanto grava: parar é urgente, e urgência
 * não pode estar a dois toques de distância.
 */
function MenuDeAcoes({
  podeTemplate, podeAtalhos, bloqueado, anexos, onTemplate, onAtalhos,
}: {
  podeTemplate: boolean
  podeAtalhos:  boolean
  bloqueado:    boolean
  anexos:       ReturnType<typeof useAnexos>
  onTemplate:   () => void
  onAtalhos:    () => void
}) {
  const [aberto, setAberto] = useState(false)

  const botao: React.CSSProperties = {
    flexShrink: 0, alignSelf: 'flex-end',
    height: 36, width: 36, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    border: '1.5px solid var(--border)', background: 'var(--bg-app)',
    color: 'var(--text-muted)', cursor: 'pointer',
  }

  if (anexos.gravando) {
    return (
      <button
        type="button"
        className="show-mobile"
        onClick={anexos.alternarGravacao}
        title="Parar gravação"
        style={{ ...botao, borderColor: '#dc2626', background: '#fef2f2', color: '#dc2626' }}
      >
        <Square size={14} />
      </button>
    )
  }

  const itens: { rotulo: string; icone: React.ReactNode; acao: () => void }[] = [
    { rotulo: 'Anexar arquivo', icone: <Paperclip size={14} />, acao: anexos.abrirSeletor },
    { rotulo: 'Gravar áudio',   icone: <Mic size={14} />,       acao: anexos.alternarGravacao },
  ]
  if (podeAtalhos)  itens.push({ rotulo: 'Resposta rápida', icone: <Zap size={14} />,      acao: onAtalhos })
  if (podeTemplate) itens.push({ rotulo: 'Template',        icone: <FileText size={14} />, acao: onTemplate })

  return (
    <div className="show-mobile" style={{ position: 'relative', alignSelf: 'flex-end' }}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        disabled={bloqueado}
        title="Mais ações"
        style={{ ...botao, display: 'flex', opacity: bloqueado ? 0.5 : 1 }}
      >
        <Plus size={17} />
      </button>

      {aberto && !bloqueado && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setAberto(false)} />
          <div style={{
            position: 'absolute', bottom: 44, left: 0, zIndex: 41, width: 186,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-field-token)', padding: 6,
            boxShadow: '0 8px 28px -10px rgba(34,22,25,.25)',
          }}>
            {itens.map(i => (
              <button
                key={i.rotulo}
                type="button"
                onClick={() => { setAberto(false); i.acao() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '9px 8px', borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  fontSize: 13, color: 'var(--text)', textAlign: 'left',
                }}
              >
                <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{i.icone}</span>
                {i.rotulo}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// --- Main export -------------------------------------------------------------

interface CRMInboxProps {
  initialConversations: Conversation[]
  leads:                { id: string; name: string; phone?: string | null; branch_name?: string | null }[]
  canEdit:              boolean
  branches:             PanelBranch[]
  /** Unidade em que a caixa está aberta — vazio no portal da rede. */
  slug?:                string
  /** Canais que a rede realmente conectou — decide o aviso de integração. */
  canaisConectados?:    InboxChannel[]
  /** Provedor de WhatsApp ativo agora — decide se a janela de 24h vale. */
  provedorWhatsApp?:    string | null
  /** conversa pré-selecionada (deep-link ?c= vindo do card do funil) */
  initialSelectedId?:   string | null
  /**
   * Ocupa toda a área útil, sem cartão.
   *
   * A caixa de entrada não é um bloco de uma página: é a tela inteira, como
   * qualquer cliente de mensagem. Fora do inbox (se um dia for embutida em
   * outro lugar) o formato de cartão continua valendo.
   */
  telaCheia?:           boolean
}

/** Id da bolha que existe só na tela, enquanto o envio não voltou do servidor. */
const PREFIXO_OTIMISTA = 'opt-'

/** Acha a citada entre as mensagens já carregadas. Null = não está aqui. */
function previaDaCitada(lista: Message[], externalId: string): ReplyPreview | null {
  const citada = lista.find(m => m.external_id === externalId)
  if (!citada) return null
  return {
    id:         citada.id,
    content:    citada.content,
    direction:  citada.direction,
    media_type: citada.media_type,
  }
}

/**
 * Põe uma mensagem na lista sem duplicar.
 *
 * Três caminhos entregam mensagem à tela — a bolha otimista, o retorno da action
 * e o INSERT do realtime — e os três podem carregar a MESMA mensagem. Enquanto o
 * realtime não funcionava dava para somar sem pensar; assim que ele passou a
 * funcionar, toda mensagem enviada aparecia duas vezes: o evento chega antes da
 * resposta da action, e o id otimista (`opt-…`) não casa com o id real, então o
 * guarda por id não reconhecia nada.
 *
 * A ordem das checagens é a regra. O id real vem primeiro; a otimista só é
 * consumida se ainda estiver pendente, senão mandar "oi" duas vezes seguidas —
 * coisa comum no atendimento — faria a segunda engolir a primeira.
 */
function mesclarMensagem(lista: Message[], entrada: Message): Message[] {
  // A linha do realtime traz o id da citada, nunca a prévia dela — ela é
  // montada na leitura, no servidor. Aqui a citada quase sempre já está na
  // conversa aberta, então a citação se resolve sem mais uma ida ao servidor.
  const nova = entrada.reply_to_external_id && !entrada.reply_preview
    ? { ...entrada, reply_preview: previaDaCitada(lista, entrada.reply_to_external_id) }
    : entrada

  if (lista.some(m => m.id === nova.id)) {
    return lista.map(m => (m.id === nova.id ? nova : m))
  }

  if (nova.direction === 'outbound') {
    const i = lista.findIndex(m =>
      m.id.startsWith(PREFIXO_OTIMISTA)
      && m.status === 'sending'
      && m.content === nova.content
      && m.media_type === nova.media_type,
    )
    if (i >= 0) {
      const copia = [...lista]
      copia[i] = nova
      return copia
    }
  }

  return [...lista, nova]
}

export function CRMInbox({
  initialConversations, leads, canEdit, branches,
  slug = '', initialSelectedId = null, canaisConectados = [],
  provedorWhatsApp = null, telaCheia = false,
}: CRMInboxProps) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId,    setSelectedId]    = useState<string | null>(initialSelectedId)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [search,        setSearch]        = useState('')
  const [filtros,       setFiltros]       = useState<FiltrosInbox>(FILTROS_VAZIOS)
  const [draft,         setDraft]         = useState('')
  const [isPending,     startTransition]  = useTransition()
  const [showNewConv,   setShowNewConv]   = useState(false)
  // Nulo no servidor de propósito — ver ConvItem.
  const [nowMs,         setNowMs]         = useState<number | null>(null)
  const [sendError,     setSendError]     = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAtalhos,   setShowAtalhos]   = useState(false)
  const [buscaAtalho,   setBuscaAtalho]   = useState('')
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)
  /** Mensagem sendo respondida (citação presa ao compositor). */
  const [respondendoA, setRespondendoA] = useState<Message | null>(null)
  /** Mensagem sendo editada. Enquanto existe, o compositor troca de função. */
  const [editando,     setEditando]     = useState<Message | null>(null)
  /** Só no celular: o card do contato vira folha sobre a conversa. */
  const [painelAberto, setPainelAberto] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** Mídias já pedidas ao servidor, para não assinar a mesma duas vezes. */
  const midiaPedida = useRef<Set<string>>(new Set())

  /**
   * Busca o link assinado de uma mensagem que chegou pelo realtime.
   *
   * O evento traz `media_path` e nunca `media_url` — esta última não é coluna,
   * nasce da assinatura em `getMessages`. Vale tanto no INSERT quanto no UPDATE:
   * o UPDATE de `is_read` chega logo depois da mensagem e é a única notícia que
   * a tela tem daquela linha em vários casos.
   */
  // Tipo explícito porque a função se rechama no retry, e sem a anotação o TS
  // não consegue inferir algo que se referencia dentro do próprio inicializador.
  const assinarMidiaSeFaltar: (linha: Message, tentativa?: number) => void
  = useCallback((linha: Message, tentativa = 0) => {
    const path = linha.media_path
    if (!path || linha.media_url) return
    if (tentativa === 0 && midiaPedida.current.has(linha.id)) return

    midiaPedida.current.add(linha.id)
    getMessageMediaUrl(linha.id)
      .then(url => {
        if (!url) { midiaPedida.current.delete(linha.id); return }
        setMessages(prev => prev.map(m =>
          m.id === linha.id ? { ...m, media_url: url } : m,
        ))
      })
      .catch(err => {
        // Engolir esta falha em silêncio custou caro: a bolha ficava em "Anexo
        // indisponível" para sempre, idêntica a um download que nunca aconteceu,
        // e não havia como saber que bastava recarregar. Acontece de verdade
        // quando a aba atravessa um deploy — o id da Server Action muda a cada
        // build, e o servidor novo responde 404 para o bundle antigo.
        console.error('[inbox] falha ao assinar a mídia', linha.id, err)
        midiaPedida.current.delete(linha.id)
        if (tentativa === 0) setTimeout(() => assinarMidiaSeFaltar(linha, 1), 2_000)
      })
  }, [])

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  // Editar mensagem enviada existe no WhatsApp, mas não na API oficial: lá a
  // mensagem é imutável depois de entregue. Nota interna nunca saiu daqui, então
  // sempre pode ser corrigida. Sem este corte o botão apareceria em todo canal e
  // só daria erro ao salvar.
  const canalEdita = selectedConv?.channel === 'manual'
    || (selectedConv?.channel === 'whatsapp' && provedorWhatsApp === 'uazapi')

  // Regra da Meta: só dá para responder livremente até 24h da última mensagem
  // do contato. Vale para Instagram, Messenger e WhatsApp pela API oficial —
  // não para a uazapi, que não passa pela API oficial.
  const janela = selectedConv
    ? estadoDaJanela(
        selectedConv.channel,
        selectedConv.last_inbound_at,
        // O provedor ATIVO manda: se a rede migrou da uazapi para a API oficial,
        // a janela passa a valer mesmo nas conversas antigas.
        provedorWhatsApp ?? selectedConv.provider,
      )
    : { aberta: true, fechaEm: null, motivo: null }

  // Load messages + subscribe to realtime when conversation changes
  useEffect(() => {
    setSendError(null)   // erro é da conversa anterior
    setPainelAberto(false)   // no celular, o card da conversa anterior sai junto
    if (!selectedId) { setMessages([]); return }
    setLoadingMsgs(true)
    getMessages(selectedId).then(msgs => {
      setMessages(msgs)
      setLoadingMsgs(false)
    })
    markConversationRead(selectedId)

    const supabase = createClient()
    const channel = supabase
      .channel(`inbox-msgs-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        const newMsg = payload.new as Message
        setMessages(prev => mesclarMensagem(prev, newMsg))
        assinarMidiaSeFaltar(newMsg)

        // Quem está com a conversa ABERTA já leu. Sem isto o trigger incrementa
        // `unread_count` e a conversa fica com badge de não lida na cara de
        // quem acabou de ler a mensagem.
        if (newMsg.direction === 'inbound') {
          markConversationRead(selectedId)
          setConversations(prev => prev.map(c =>
            c.id === selectedId ? { ...c, unread_count: 0 } : c,
          ))
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        const updated = payload.new as Message
        // ⚠️ Mesclar, nunca substituir.
        //
        // A linha do realtime não tem `media_url` (não é coluna) nem
        // `sent_by_name` com o join, então trocar o objeto inteiro APAGA o que a
        // tela já sabia. E o UPDATE mais comum é justo o `is_read: true` que o
        // próprio inbox dispara ao receber mensagem com a conversa aberta: a
        // mídia aparecia e sumia meio segundo depois, voltando para "[audio]".
        setMessages(prev => prev.map(m => m.id === updated.id
          ? { ...m, ...updated, media_url: m.media_url ?? updated.media_url ?? null }
          : m))
        assinarMidiaSeFaltar(updated)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedId, assinarMidiaSeFaltar])

  // Subscribe to conversation list changes (new convs from inbound, unread updates)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('inbox-conversations')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
      }, (payload) => {
        const newConv = payload.new as Conversation
        // Tags, dono, etapa e funil vêm de outra tabela e não estão na linha do
        // realtime. Entram vazios para a conversa aparecer NA HORA, e a leitura
        // seguinte traz o que falta — conversa nova é evento raro, então a
        // consulta extra não pesa, e sem ela a conversa recém-criada ficaria
        // fora de qualquer filtro por card.
        setConversations(prev =>
          prev.some(c => c.id === newConv.id)
            ? prev
            : [{ ...newConv, lead_tags: newConv.lead_tags ?? [] }, ...prev],
        )
        getConversations_client()
          .then(convs => setConversations(convs))
          .catch(err => console.error('[inbox] recarregar conversas', err))
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, (payload) => {
        const updated = payload.new as Conversation
        // Reordenar aqui, e não só no servidor: a lista vem ordenada por
        // `last_message_at`, e sem refazer a ordem a conversa que acabou de
        // receber mensagem continuava no mesmo lugar do meio da lista.
        setConversations(prev => ordenarPorUltimaMensagem(
          prev.map(c => c.id === updated.id ? { ...c, ...updated } : c),
        ))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Reactive "now" for aging metrics — refresh every minute
  useEffect(() => {
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const handleSelect = useCallback((conv: Conversation) => {
    setSelectedId(conv.id)
    if (conv.unread_count > 0) {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    }
  }, [])

  function iniciarResposta(m: Message) {
    setEditando(null)
    setRespondendoA(m)
    textareaRef.current?.focus()
  }

  function iniciarEdicao(m: Message) {
    setRespondendoA(null)
    setEditando(m)
    setDraft(m.content)
    textareaRef.current?.focus()
  }

  function cancelarEdicao() {
    setEditando(null)
    setDraft('')
  }

  function salvarEdicao() {
    const texto = draft.trim()
    const alvo  = editando
    if (!alvo || !texto) return
    if (texto === alvo.content) { cancelarEdicao(); return }

    setSendError(null)
    startTransition(async () => {
      const res = await editMessage(alvo.id, texto)
      if (!res.ok || !res.message) {
        setSendError(res.error ?? 'Não foi possível editar a mensagem.')
        return
      }
      setMessages(prev => mesclarMensagem(prev, res.message!))
      cancelarEdicao()
    })
  }

  function handleSend() {
    if (editando) { salvarEdicao(); return }

    const text = draft.trim()
    if (!text || !selectedId || !selectedConv) return

    // Só dá para citar no provedor o que tem id lá. Mensagem que falhou ou
    // ainda está saindo não tem — aí a resposta vai como mensagem comum.
    const citada = respondendoA?.external_id ? respondendoA : null

    const optimistic: Message = {
      id:              `${PREFIXO_OTIMISTA}${Date.now()}`,
      conversation_id: selectedId,
      direction:       'outbound',
      content:         text,
      channel:         selectedConv.channel,
      status:          'sending',
      sent_by_name:    null,
      is_read:         true,
      created_at:      new Date().toISOString(),
      // Envio pela tela é só texto; anexo ainda não sai daqui.
      media_type:      null,
      media_url:       null,
      reply_to_external_id: citada?.external_id ?? null,
      // A prévia vai montada: a bolha já mostra a citação antes de o servidor
      // responder, como o resto do envio otimista.
      reply_preview: citada
        ? {
            id:         citada.id,
            content:    citada.content,
            direction:  citada.direction,
            media_type: citada.media_type,
          }
        : null,
    }
    setMessages(prev => [...prev, optimistic])
    setDraft('')
    setRespondendoA(null)
    setConversations(prev => prev.map(c =>
      c.id === selectedId
        ? { ...c, last_message: text, last_message_at: optimistic.created_at }
        : c
    ))

    setSendError(null)
    startTransition(async () => {
      const res = await sendMessage(selectedId, text, citada?.external_id ?? null)
      if (res.ok && res.message) {
        // Mesclar, não substituir por id: o realtime pode ter chegado primeiro e
        // já consumido a bolha otimista.
        setMessages(prev => mesclarMensagem(prev, res.message!))
        return
      }
      // Sem isto a bolha ficava eternamente em 'sending' e parecia enviada —
      // o mesmo engano que a rodada veio corrigir, só que na tela.
      setSendError(res.error ?? 'Falha ao enviar a mensagem.')
      setMessages(prev => prev.map(m =>
        m.id === optimistic.id ? { ...m, status: 'failed' } : m,
      ))
    })
  }

  function handleEnviarAnexo(file: File, caption: string) {
    if (!selectedId) return
    setSendError(null)
    setEnviandoAnexo(true)
    startTransition(async () => {
      const form = new FormData()
      form.append('conversationId', selectedId)
      form.append('file', file)
      form.append('caption', caption)

      const res = await sendMediaMessage(form)
      setEnviandoAnexo(false)

      // A mensagem vem tanto no sucesso quanto na falha: o arquivo já está
      // guardado, e escondê-lo da conversa faria a pessoa achar que nem chegou
      // a ser anexado.
      if (res.message) {
        setMessages(prev => mesclarMensagem(prev, res.message!))
        setConversations(prev => prev.map(c =>
          c.id === selectedId
            ? { ...c, last_message: res.message!.content, last_message_at: res.message!.created_at }
            : c,
        ))
      }
      if (!res.ok) setSendError(res.error ?? 'Não foi possível enviar o arquivo.')
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    // Esc sai da edição sem salvar — e sem mandar o texto pela conversa, que é
    // o que aconteceria se a pessoa apagasse o rascunho e desse Enter.
    if (e.key === 'Escape') {
      if (editando)          cancelarEdicao()
      else if (respondendoA) setRespondendoA(null)
    }
  }

  /**
   * Barra no começo do campo abre as respostas rápidas, filtrando pelo que vier
   * depois. É como a recepção espera que funcione, e evita tirar a mão do
   * teclado no meio do atendimento.
   */
  function handleDraftChange(valor: string) {
    setDraft(valor)
    if (valor.startsWith('/')) {
      setBuscaAtalho(valor.slice(1))
      setShowAtalhos(true)
    }
  }

  const anexos = useAnexos(handleEnviarAnexo)

  function handleConvCreated(convId: string) {
    setShowNewConv(false)
    // Refresh conversations list
    getConversations_client().then(convs => setConversations(convs))
    setSelectedId(convId)
  }

  const filtered = conversations.filter(c => {
    if (!passaNosFiltros(c, filtros)) return false

    // A busca é independente dos filtros e continua como era: nome do contato e
    // texto da última mensagem. Agora também telefone e tag, porque quem procura
    // "botox" ou o número que acabou de ligar espera achar por aí.
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (c.contact_name ?? '').toLowerCase().includes(q)
      || (c.last_message ?? '').toLowerCase().includes(q)
      || (c.contact_phone ?? '').toLowerCase().includes(q)
      || (c.lead_tags ?? []).some(t => t.toLowerCase().includes(q))
  })

  // `contarFiltros` já inclui a origem desde que ela virou uma seção do painel.
  const filtrosAtivos = contarFiltros(filtros) > 0

  // Group messages by calendar day
  const dayGroups: { date: string; msgs: Message[] }[] = []
  for (const m of messages) {
    const day = m.created_at.slice(0, 10)
    if (dayGroups.at(-1)?.date === day) dayGroups.at(-1)!.msgs.push(m)
    else dayGroups.push({ date: day, msgs: [m] })
  }

  // Só avisa quando o canal DA CONVERSA não está conectado. Antes o aviso
  // aparecia em toda conversa que não fosse nota, mesmo com o canal ativo.
  const integrationRequired = !!selectedConv
    && selectedConv.channel !== 'manual'
    && !canaisConectados.includes(selectedConv.channel)

  // Escrever sem poder enviar só gera a frustração de ver o erro depois.
  const bloqueado = integrationRequired || !janela.aberta

  // Template só existe no WhatsApp pela API oficial.
  const podeTemplate = canEdit
    && selectedConv?.channel === 'whatsapp'
    && provedorWhatsApp === 'official'

  // Awaiting-response counter (aging over the visible/filtered conversations)
  const awaitingConvs = filtered.filter(c => c.awaiting_since != null)
  const awaitingCount = awaitingConvs.length
  const hasAwaitingAlert = awaitingConvs.some(
    c => nowMs != null && agingLevel(secondsSince(c.awaiting_since, nowMs), AWAITING_THRESHOLDS) === 'alert'
  )

  return (
    <>
      {showNewConv && canEdit && (
        <NewConvModal
          leads={leads}
          onCreated={handleConvCreated}
          onClose={() => setShowNewConv(false)}
        />
      )}

      {showAtalhos && (
        <InboxQuickReplies
          canEdit={canEdit}
          busca={buscaAtalho}
          onEscolher={texto => {
            // Substitui a barra digitada; sem isso o '/limpeza' ficaria na
            // frente do texto escolhido.
            setDraft(d => (d.startsWith('/') ? '' : d) + texto)
            textareaRef.current?.focus()
          }}
          onClose={() => setShowAtalhos(false)}
        />
      )}

      {showTemplates && selectedConv && (
        <InboxTemplatePicker
          conversationId={selectedConv.id}
          janelaFechada={!janela.aberta}
          onClose={() => setShowTemplates(false)}
          onSent={msg => {
            setMessages(prev => mesclarMensagem(prev, msg))
            setSendError(null)
            // A conversa some do topo da lista se a prévia não acompanhar.
            setConversations(prev => prev.map(c =>
              c.id === msg.conversation_id
                ? { ...c, last_message: msg.content, last_message_at: msg.created_at }
                : c,
            ))
          }}
        />
      )}

      <div
        className={telaCheia ? 'inbox-root' : 'card inbox-root'}
        /* No celular o CSS decide qual painel ocupa a tela; estes dois estados
           são a única coisa que ele precisa saber do React. */
        data-aberta={selectedId ? '1' : '0'}
        data-painel={painelAberto ? '1' : '0'}
        style={{
        display: 'flex', overflow: 'hidden', padding: 0,
        background: 'var(--surface)',
        ...(telaCheia
          // `flex: 1` + `minHeight: 0` é o que faz as três colunas rolarem por
          // dentro em vez de esticar a página: sem o minHeight, um item flex
          // nunca encolhe abaixo do conteúdo e a rolagem vaza para o body.
          ? { flex: 1, minHeight: 0, borderTop: '1px solid var(--border)' }
          : { height: 'calc(100vh - var(--topbar-h) - 200px)', minHeight: 520 }),
      }}>
        {/* -- Left panel: conversation list -- */}
        <div className="inbox-lista" style={{
          width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
        }}>
          {/* Search + new */}
          <div style={{ padding: '12px 12px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                <input
                  type="text" placeholder="Pesquisar…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="field" style={{ paddingLeft: 28, fontSize: 12.5 }}
                />
              </div>
              <InboxFiltros
                conversas={conversations}
                filtros={filtros}
                onChange={setFiltros}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowNewConv(true)}
                  title="Nova conversa"
                  style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    border: '1px solid var(--border)', background: 'var(--bg-app)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Plus size={15} />
                </button>
              )}
            </div>

            {/* A origem mudou para dentro do painel, junto dos outros cortes.
                O que sobra aqui é o resumo do que está filtrando — e ele só
                ocupa espaço quando há filtro, incluindo a linha de separação. */}
            <div style={filtrosAtivos
              ? { paddingBottom: 10, borderBottom: '1px solid var(--hairline)' }
              : undefined}
            >
              <ChipsDeFiltro
                conversas={conversations}
                filtros={filtros}
                onChange={setFiltros}
              />
            </div>
          </div>

          {/* Awaiting-response counter */}
          {awaitingCount > 0 && (
            <div style={{
              flexShrink: 0, padding: '7px 14px',
              borderBottom: '1px solid var(--hairline)',
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11.5, fontWeight: 700,
              color: hasAwaitingAlert ? AGING_STYLE.alert.color : AGING_STYLE.warn.color,
              background: hasAwaitingAlert ? AGING_STYLE.alert.bg : AGING_STYLE.warn.bg,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: 'currentColor',
              }} />
              {awaitingCount} aguardando resposta
            </div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <MessageSquare size={26} color="var(--border)" />
                <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 10 }}>
                  {search || filtrosAtivos ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
                </p>
                {/* Lista vazia por causa de filtro tem saída à mão: sem isto a
                    pessoa fica olhando um vazio que ela mesma causou. */}
                {filtrosAtivos && (
                  <button
                    type="button"
                    onClick={() => setFiltros(FILTROS_VAZIOS)}
                    className="btn-ghost"
                    style={{ fontSize: 12, marginTop: 8 }}
                  >
                    Limpar filtros
                  </button>
                )}
                {canEdit && !search && !filtrosAtivos && (
                  <button
                    type="button"
                    onClick={() => setShowNewConv(true)}
                    className="btn-secondary"
                    style={{ fontSize: 12, marginTop: 12 }}
                  >
                    <Plus size={13} /> Iniciar primeira conversa
                  </button>
                )}
              </div>
            ) : (
              filtered.map(c => (
                <ConvItem key={c.id} conv={c} selected={c.id === selectedId} onClick={() => handleSelect(c)} nowMs={nowMs} />
              ))
            )}
          </div>
        </div>

        {/* -- Right panel: thread -- */}
        <div className="inbox-thread" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {!selectedConv ? (
            /* Empty state */
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
              color: 'var(--text-faint)',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--bg-app)', border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageSquare size={28} color="var(--border)" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Selecione uma conversa
                </p>
                <p style={{ fontSize: 12.5, maxWidth: 220 }}>
                  Escolha um contato na lista para ver o histórico e enviar mensagens
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              {/* `flexWrap`: sem ele, o seletor de status e os botões não
                  encolhem e espremem a identidade — no celular o telefone da
                  cliente saía cortado no meio do número. */}
              <div style={{
                padding: '13px 20px', borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
              }}>
                {/* Voltar para a lista. Só no celular, onde a conversa ocupou a
                    tela inteira e a lista saiu de cena. */}
                <button
                  type="button"
                  className="show-mobile"
                  onClick={() => setSelectedId(null)}
                  title="Voltar para as conversas"
                  style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    border: 'none', background: 'none', cursor: 'pointer',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                    marginLeft: -6,
                  }}
                >
                  <ArrowLeft size={18} />
                </button>

                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--brand-soft)', border: '2px solid var(--brand-soft-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 800, color: 'var(--brand)',
                }}>
                  {(selectedConv.contact_name ?? '?')[0]!.toUpperCase()}
                </div>

                <div style={{ flex: '1 1 170px', minWidth: 0 }}>
                  <p style={{
                    fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {selectedConv.contact_name ?? 'Sem nome'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    <ChannelBadge ch={selectedConv.channel} />
                    {selectedConv.contact_phone && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        {selectedConv.contact_phone}
                      </span>
                    )}
                    {selectedConv.branch_name && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        · {selectedConv.branch_name}
                      </span>
                    )}
                  </div>

                  {/* Service metrics */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {nowMs != null && <>Última interação há {formatDurationShort(secondsSince(selectedConv.last_message_at, nowMs))}</>}
                      {selectedConv.first_response_seconds != null && (
                        <>{nowMs != null && ' · '}1ª resposta em {formatDurationLong(selectedConv.first_response_seconds)}</>
                      )}
                    </span>
                    {selectedConv.awaiting_since && nowMs != null && (() => {
                      const s = secondsSince(selectedConv.awaiting_since, nowMs)
                      const st = AGING_STYLE[agingLevel(s, AWAITING_THRESHOLDS)]
                      return (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          padding: '1px 8px', borderRadius: 99,
                          background: st.bg, color: st.color, whiteSpace: 'nowrap',
                        }}>
                          Aguardando resposta há {formatDurationShort(s)}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Card do contato. No desktop ele é a terceira coluna, sempre
                    visível; no celular vira folha por cima, aberta por aqui. */}
                <button
                  type="button"
                  className="show-mobile"
                  onClick={() => setPainelAberto(true)}
                  title="Contato e oportunidades"
                  style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    border: '1px solid var(--border)', background: 'var(--bg-app)',
                    cursor: 'pointer', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <UserCheck size={15} />
                </button>

                {/* Status dropdown */}
                <StatusDropdown
                  status={selectedConv.status}
                  disabled={!canEdit}
                  onChange={async (s) => {
                    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, status: s } : c))
                    await setConversationStatus(selectedConv.id, s)
                  }}
                />
              </div>

              {/* Messages area */}
              <div className="inbox-mensagens" style={{
                flex: 1, minHeight: 0, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 2,
                padding: '16px 0',
                background: 'var(--bg-app)',
              }}>
                {loadingMsgs ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Carregando mensagens…</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <MessageSquare size={22} color="var(--border)" />
                    <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma mensagem ainda. Inicie a conversa!</p>
                  </div>
                ) : (
                  dayGroups.map(g => (
                    <div key={g.date}>
                      {/* Day separator */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                        <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 700 }}>
                          {dayLabel(g.msgs[0]!.created_at)}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                      </div>
                      {g.msgs.map(m => (
                        <Bubble
                          key={m.id}
                          msg={m}
                          nomeDoContato={selectedConv?.contact_name ?? 'Contato'}
                          onResponder={iniciarResposta}
                          onEditar={iniciarEdicao}
                          podeAgir={canEdit && selectedConv?.status !== 'closed'}
                          canalEdita={canalEdita}
                          agora={nowMs}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Integration warning */}
              {integrationRequired && (
                <div style={{
                  margin: '0 16px 8px',
                  padding: '8px 12px', borderRadius: 8,
                  background: '#fffbeb', border: '1px solid #fde68a',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 12, color: '#92400e',
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Canal {CH[selectedConv.channel].label} não está conectado — não é possível responder por aqui.{' '}
                    <a href="/admin/settings?tab=integrations" style={{ color: '#92400e', fontWeight: 700, textDecoration: 'underline' }}>
                      Configurar integração →
                    </a>
                  </span>
                </div>
              )}

              {/* Janela de 24h da Meta. Sem isto a pessoa escreve, vê "enviado"
                  e a mensagem nunca chega — a API recusa fora da janela. */}
              {!janela.aberta && (
                <div style={{
                  margin: '0 16px 8px',
                  padding: '8px 12px', borderRadius: 8,
                  background: '#fffbeb', border: '1px solid #fde68a',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 12, color: '#92400e',
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <span>{janela.motivo}</span>
                    {/* Template é a única saída daqui: a Meta recusa texto livre
                        fora da janela, mas entrega template aprovado sempre. */}
                    {selectedConv.channel === 'whatsapp' && provedorWhatsApp === 'official' && (
                      <button
                        type="button"
                        onClick={() => setShowTemplates(true)}
                        style={{
                          display: 'block', marginTop: 6, padding: 0, border: 'none',
                          background: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 800, color: '#92400e',
                          textDecoration: 'underline',
                        }}
                      >
                        Enviar um template →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {sendError && (
                <div style={{
                  margin: '0 16px 8px',
                  padding: '8px 12px', borderRadius: 8,
                  background: '#fef2f2', border: '1px solid #dc262633',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 12, color: '#dc2626', fontWeight: 600,
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{sendError}</span>
                </div>
              )}

              {selectedConv.status !== 'closed' && (
                <PainelDeAnexo a={anexos} enviando={enviandoAnexo} />
              )}

              {/* Contexto preso ao compositor: respondendo a quem, ou editando o
                  quê. Sem isto, depois de rolar a conversa a pessoa perde de
                  vista a qual mensagem o que ela está digitando se refere. */}
              {(respondendoA || editando) && (
                <div style={{
                  margin: '0 16px 8px', padding: '7px 10px',
                  borderRadius: 8, borderLeft: '3px solid var(--brand)',
                  background: 'var(--brand-soft)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {editando ? <Pencil size={13} color="var(--brand)" /> : <Reply size={13} color="var(--brand)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--brand)' }}>
                      {editando
                        ? 'Editando mensagem'
                        : `Respondendo ${respondendoA!.direction === 'outbound' ? 'você mesmo' : selectedConv.contact_name ?? 'o contato'}`}
                    </div>
                    <div style={{
                      fontSize: 12, color: 'var(--text-muted)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {(editando ?? respondendoA)!.content}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (editando ? cancelarEdicao() : setRespondendoA(null))}
                    title={editando ? 'Cancelar edição' : 'Cancelar resposta'}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: 2, display: 'flex',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Input */}
              {selectedConv.status !== 'closed' ? (
                <div className="inbox-composer" style={{
                  padding: '10px 14px', borderTop: '1px solid var(--hairline)',
                  display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
                  background: 'var(--surface)',
                }}>
                  {/* No celular, tudo isto vira um botão só: quatro ícones de
                      36px comem metade da largura, e o que resta é o campo de
                      escrever — que é o que importa ali. No desktop cada ação
                      continua a um clique de distância. */}
                  <MenuDeAcoes
                    podeTemplate={podeTemplate}
                    podeAtalhos={canEdit}
                    bloqueado={bloqueado}
                    anexos={anexos}
                    onTemplate={() => setShowTemplates(true)}
                    onAtalhos={() => { setBuscaAtalho(''); setShowAtalhos(true) }}
                  />

                  {/* Template a qualquer momento, não só quando a janela fecha:
                      lembrete e retorno são mensagem padronizada que a recepção
                      manda o dia inteiro, dentro do prazo ou fora dele. */}
                  {podeTemplate && (
                    <button className="hide-mobile"
                      type="button"
                      onClick={() => setShowTemplates(true)}
                      title="Enviar um template aprovado"
                      style={{
                        flexShrink: 0, alignSelf: 'flex-end',
                        height: 36, width: 36, borderRadius: 9,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid var(--border)', background: 'var(--bg-app)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      <FileText size={15} />
                    </button>
                  )}
                  <span className="hide-mobile" style={{ display: "contents" }}><BotoesDeAnexo a={anexos} disabled={bloqueado} /></span>
                  {canEdit && (
                    <button className="hide-mobile"
                      type="button"
                      onClick={() => { setBuscaAtalho(''); setShowAtalhos(true) }}
                      title="Respostas rápidas (ou digite / no campo)"
                      style={{
                        flexShrink: 0, alignSelf: 'flex-end',
                        height: 36, width: 36, borderRadius: 9,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid var(--border)', background: 'var(--bg-app)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      <Zap size={15} />
                    </button>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={e => handleDraftChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder={bloqueado
                      ? 'Não é possível responder agora'
                      : editando
                        ? 'Edite a mensagem… (Enter para salvar, Esc para cancelar)'
                        : 'Digite uma mensagem… (Enter para enviar)'}
                    disabled={bloqueado}
                    className="field"
                    style={{ flex: 1, resize: 'none', fontSize: 13.5, lineHeight: 1.5, maxHeight: 100, overflowY: 'auto' }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || isPending || (bloqueado && !editando)}
                    className="btn-primary"
                    style={{ flexShrink: 0, alignSelf: 'flex-end', height: 36, padding: '0 14px' }}
                    title={editando ? 'Salvar edição' : 'Enviar'}
                  >
                    {editando ? <Check size={14} /> : <Send size={14} />}
                  </button>
                </div>
              ) : (
                <div className="inbox-encerrada" style={{
                  padding: '12px 16px', borderTop: '1px solid var(--hairline)',
                  textAlign: 'center', fontSize: 12, color: 'var(--text-faint)',
                  background: 'var(--bg-app)',
                }}>
                  Conversa encerrada · Altere o status para reabrir
                </div>
              )}
            </>
          )}
        </div>

        {/* -- 3rd panel: lead card -- */}
        {selectedConv && (
          <div className="inbox-painel" style={{
            width: 320, flexShrink: 0, overflowY: 'auto',
            borderLeft: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            {/* Fechar existe só no celular: no desktop o painel é coluna fixa e
                não há o que fechar. */}
            <div
              className="show-mobile"
              style={{
                position: 'sticky', top: 0, zIndex: 1,
                padding: '10px 14px', background: 'var(--surface)',
                borderBottom: '1px solid var(--hairline)',
                alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>Contato</strong>
              <button
                type="button"
                onClick={() => setPainelAberto(false)}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-app)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'var(--text-muted)',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <InboxLeadPanel
              conversation={selectedConv}
              canEdit={canEdit}
              branches={branches}
              slug={slug}
              onLeadChanged={() => { getConversations_client().then(setConversations) }}
            />
          </div>
        )}
      </div>
    </>
  )
}

// --- Status dropdown ---------------------------------------------------------

function StatusDropdown({
  status, disabled, onChange,
}: {
  status: ConvStatus
  disabled: boolean
  onChange: (s: ConvStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const m = STATUS_META[status]

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: disabled ? 'default' : 'pointer',
          background: m.bg, color: m.color,
          border: `1px solid ${m.border}`,
        }}
      >
        {m.label}
        {!disabled && <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px -6px rgba(34,22,25,.14)',
            zIndex: 10, overflow: 'hidden', minWidth: 140,
          }}>
            {(Object.entries(STATUS_META) as [ConvStatus, typeof STATUS_META[ConvStatus]][]).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => { onChange(key); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px',
                  fontSize: 12.5, fontWeight: key === status ? 800 : 500,
                  color: key === status ? meta.color : 'var(--text)',
                  background: key === status ? meta.bg : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--hairline)', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (key !== status) e.currentTarget.style.background = 'var(--bg-app)' }}
                onMouseLeave={e => { if (key !== status) e.currentTarget.style.background = 'transparent' }}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Client-side helper to refresh conversations without full page reload
async function getConversations_client(): Promise<Conversation[]> {
  const { getConversations } = await import('@/actions/inbox')
  return getConversations()
}
