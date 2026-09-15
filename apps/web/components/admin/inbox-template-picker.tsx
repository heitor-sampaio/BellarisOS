'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Send, AlertCircle } from 'lucide-react'
import {
  getTemplatesParaConversa, sendTemplateMessage,
  type TemplateDaConversa, type Message,
} from '@/actions/inbox'
import { interpolar } from '@/lib/templates/core'

/**
 * Escolher e disparar um template numa conversa.
 *
 * Fora da janela de 24h é a única forma de a Meta entregar a mensagem; dentro
 * dela é atalho para o que a recepção já manda o dia inteiro (lembrete, retorno).
 * Por isso o botão vive no compositor, e não só no aviso de janela fechada.
 *
 * Mostra o texto JÁ preenchido antes de enviar: template errado vai para o
 * cliente do mesmo jeito, e não dá para apagar depois.
 */
export function InboxTemplatePicker({
  conversationId, janelaFechada, onClose, onSent,
}: {
  conversationId: string
  /** Muda o texto: fora da janela o template é a única saída; dentro, é atalho. */
  janelaFechada: boolean
  onClose: () => void
  onSent:  (msg: Message) => void
}) {
  const [templates, setTemplates] = useState<TemplateDaConversa[] | null>(null)
  const [selId,     setSelId]     = useState<string | null>(null)
  const [valores,   setValores]   = useState<Record<string, string>>({})
  const [erro,      setErro]      = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let vivo = true
    getTemplatesParaConversa(conversationId).then(t => {
      if (!vivo) return
      setTemplates(t)
      if (t.length === 1) escolher(t[0]!)
    })
    return () => { vivo = false }
  }, [conversationId])

  const sel = templates?.find(t => t.id === selId) ?? null

  function escolher(t: TemplateDaConversa) {
    setSelId(t.id)
    // O que dá para saber do card já vem preenchido; o resto fica em branco.
    setValores({ ...t.sugestoes })
    setErro(null)
  }

  function enviar() {
    if (!sel) return
    setErro(null)
    startTransition(async () => {
      const res = await sendTemplateMessage(conversationId, sel.id, valores)
      if (res.ok && res.message) { onSent(res.message); onClose(); return }
      setErro(res.error ?? 'Não foi possível enviar.')
    })
  }

  const faltando = sel?.variaveis.filter(v => !valores[v]?.trim()) ?? []

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(17,17,17,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: 520, maxWidth: '100%', maxHeight: '86vh', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Enviar template
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
              {janelaFechada
                ? 'A janela de 24 horas fechou; só um template aprovado chega agora.'
                : 'Mensagem pronta, aprovada pela Meta.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ height: 30, padding: '0 8px' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {templates === null ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Carregando…</p>
          ) : templates.length === 0 ? (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: '#fffbeb', border: '1px solid #fde68a',
              fontSize: 12.5, color: '#92400e', lineHeight: 1.5,
            }}>
              Nenhum template aprovado ainda. Crie um em <strong>Templates</strong> e envie
              para a aprovação da Meta — a análise costuma sair em até 24 horas.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="overline" style={{ color: 'var(--text-muted)' }}>Template</label>
                <select
                  value={selId ?? ''}
                  onChange={e => {
                    const t = templates.find(x => x.id === e.target.value)
                    if (t) escolher(t)
                  }}
                  className="field"
                  style={{ fontSize: 13 }}
                >
                  <option value="" disabled>Escolha um template</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {sel && (
                <>
                  {sel.variaveis.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label className="overline" style={{ color: 'var(--text-muted)' }}>
                        Preencha
                      </label>
                      {sel.variaveis.map(v => (
                        <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <code style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--brand)',
                            background: 'var(--brand-soft)', padding: '4px 8px',
                            borderRadius: 6, whiteSpace: 'nowrap', minWidth: 70,
                          }}>
                            {v}
                          </code>
                          <input
                            value={valores[v] ?? ''}
                            onChange={e => setValores(s => ({ ...s, [v]: e.target.value }))}
                            className="field"
                            style={{ fontSize: 13, flex: 1 }}
                            autoFocus={v === sel.variaveis[0]}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Prévia: é o que o cliente vai ler, e não dá para desfazer. */}
                  <div style={{ background: '#ece5dd', borderRadius: 10, padding: 12 }}>
                    <div style={{
                      background: '#d9fdd3', borderRadius: '10px 10px 2px 10px',
                      padding: '8px 10px', fontSize: 13, lineHeight: 1.45, color: '#111b21',
                    }}>
                      {sel.header_text && (
                        <p style={{ margin: '0 0 4px', fontWeight: 800 }}>
                          {interpolar(sel.header_text, valores)}
                        </p>
                      )}
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {interpolar(sel.body_text, valores)}
                      </p>
                      {sel.footer_text && (
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#667781' }}>
                          {sel.footer_text}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {erro && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '9px 12px', borderRadius: 8,
              background: '#fef2f2', border: '1px solid #dc262633',
              fontSize: 12.5, color: '#dc2626', fontWeight: 600,
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{erro}</span>
            </div>
          )}
        </div>

        {templates && templates.length > 0 && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid var(--hairline)',
            display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center',
          }}>
            {faltando.length > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginRight: 'auto' }}>
                Falta preencher {faltando.join(', ')}
              </span>
            )}
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button
              type="button"
              onClick={enviar}
              disabled={!sel || faltando.length > 0 || isPending}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={14} /> {isPending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
