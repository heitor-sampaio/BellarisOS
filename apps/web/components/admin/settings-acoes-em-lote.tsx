'use client'

import { useEffect, useState, useTransition } from 'react'
import { History, Loader2, RotateCcw } from 'lucide-react'
import { listarAcoesEmLote, repetirAcaoEmLote } from '@/actions/acoes-em-lote'
import type { AcaoEmLote, EstadoDaAcao } from '@/lib/lotes/acoes'

/**
 * Configurações → Ações em lote (2026-10-13): o que roda em segundo plano e
 * demora — hoje, o histórico do WhatsApp Web ao conectar um número. A tela
 * relê sozinha enquanto alguma está aguardando ou em andamento.
 */

const SELO: Record<EstadoDaAcao, { rotulo: string; bg: string; cor: string; borda: string }> = {
  aguardando:   { rotulo: 'Aguardando',   bg: 'var(--bg-app)',      cor: 'var(--text-muted)', borda: 'var(--border)' },
  em_andamento: { rotulo: 'Em andamento', bg: 'var(--brand-soft)',  cor: 'var(--brand)',      borda: 'var(--brand-soft-border)' },
  concluida:    { rotulo: 'Concluída',    bg: 'var(--success-soft)', cor: 'var(--success)',   borda: 'var(--success-border)' },
  falhou:       { rotulo: 'Falhou',       bg: 'var(--danger-soft)', cor: 'var(--danger)',     borda: 'var(--danger)' },
  interrompida: { rotulo: 'Interrompida', bg: 'var(--warning-soft)', cor: 'var(--warning)',   borda: 'var(--warning)' },
}

const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  : null

const abertas = (lista: AcaoEmLote[]) => lista.some(a => a.estado === 'aguardando' || a.estado === 'em_andamento')

export function SettingsAcoesEmLote({ iniciais }: { iniciais: AcaoEmLote[] }) {
  const [acoes, setAcoes] = useState(iniciais)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [emCurso, setEmCurso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const relendo = abertas(acoes)

  // Enquanto algo roda, relê a cada 4 s; parado, não gasta nada.
  useEffect(() => {
    if (!relendo) return
    const t = setInterval(() => { listarAcoesEmLote().then(setAcoes).catch(() => {}) }, 4000)
    return () => clearInterval(t)
  }, [relendo])

  function repetir(id: string) {
    setErros(e => ({ ...e, [id]: '' }))
    setEmCurso(id)
    startTransition(async () => {
      const r = await repetirAcaoEmLote(id)
      if (!r.ok) setErros(e => ({ ...e, [id]: r.error ?? 'Não foi possível tentar de novo.' }))
      setAcoes(await listarAcoesEmLote())
      setEmCurso(null)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        O que o sistema faz em segundo plano e demora — como trazer o histórico de conversas
        ao conectar um número do WhatsApp Web. Pode sair desta tela: a ação continua.
      </p>

      {acoes.length === 0 && (
        <div className="card" style={{ padding: 20, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', lineHeight: 1.55 }}>
          Nenhuma ação em lote ainda. Quando algo demorado rodar, o andamento aparece aqui.
        </div>
      )}

      {acoes.map(a => {
        const selo = SELO[a.estado]
        const pct = a.total ? Math.min(100, Math.round(((a.feito ?? 0) / a.total) * 100)) : null
        return (
          <div key={a.id} data-acao-em-lote className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <History size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{a.titulo}</span>
                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  · {a.alvo}
                </span>
              </div>
              <span style={{
                fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                background: selo.bg, color: selo.cor, border: `1px solid ${selo.borda}`,
              }}>
                {selo.rotulo}
              </span>
            </div>

            {a.etapa && (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {a.estado === 'em_andamento' && <Loader2 size={13} className="animate-spin" />}
                {a.etapa}
              </p>
            )}

            {a.estado === 'em_andamento' && pct !== null && (
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                aria-label={`${a.titulo}: ${pct}%`}
                style={{ height: 6, borderRadius: 99, background: 'var(--bg-app)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', transition: 'width 300ms' }} />
              </div>
            )}

            {a.resumo && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', margin: 0 }}>{a.resumo}</p>}
            {a.erro && (a.estado === 'falhou' || a.estado === 'interrompida') && (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: a.estado === 'falhou' ? 'var(--danger)' : 'var(--warning)', margin: 0 }}>{a.erro}</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                {a.concluidaEm ? `Terminou em ${quando(a.concluidaEm)}` : `Começou em ${quando(a.iniciadaEm ?? a.criadaEm)}`}
              </span>
              {a.podeRepetir && (
                <button type="button" onClick={() => repetir(a.id)} disabled={isPending} className="btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {emCurso === a.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  {a.estado === 'concluida' ? 'Trazer de novo' : 'Tentar de novo'}
                </button>
              )}
            </div>
            {erros[a.id] && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 700, margin: 0 }}>{erros[a.id]}</p>}
          </div>
        )
      })}
    </div>
  )
}
