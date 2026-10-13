'use client'

import { useEffect, useState, useTransition } from 'react'
import { History, Loader2 } from 'lucide-react'
import { historicoDaCaixaUazapi, trazerHistoricoUazapi } from '@/actions/uazapi-connection'

type Estado = Awaited<ReturnType<typeof historicoDaCaixaUazapi>>

const emAberto = (e: Estado) => e?.status === 'pendente' || e?.status === 'importando'

/**
 * O histórico da caixa do WhatsApp Web (2026-10-13): as conversas que o
 * WhatsApp mandou ao parear, trazidas para o inbox como importadas. Vem
 * sozinho ao conectar; aqui se acompanha e se pede de novo.
 */
export function HistoricoDaCaixa({ numeroId }: { numeroId: string }) {
  const [estado, setEstado] = useState<Estado | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const aberto = emAberto(estado ?? null)

  // Lê ao abrir e, enquanto estiver trazendo, a cada 5 s.
  useEffect(() => {
    let vivo = true
    const ler = () => historicoDaCaixaUazapi(numeroId).then(r => { if (vivo) setEstado(r) }).catch(() => {})
    void ler()
    const t = aberto ? setInterval(ler, 5000) : null
    return () => { vivo = false; if (t) clearInterval(t) }
  }, [numeroId, aberto])

  function trazer() {
    setErro(null)
    startTransition(async () => {
      const r = await trazerHistoricoUazapi(numeroId)
      if (!r.ok) { setErro(r.error ?? 'Não foi possível trazer o histórico.'); return }
      setEstado(await historicoDaCaixaUazapi(numeroId))
    })
  }

  if (estado === undefined) return null

  const contagem = (e: NonNullable<Estado>, novas = false) =>
    `${e.conversas} conversa${e.conversas === 1 ? '' : 's'}, ${e.mensagens} ${e.mensagens === 1 ? 'mensagem' : 'mensagens'}`
    + (novas ? (e.mensagens === 1 ? ' nova' : ' novas') : '')

  return (
    <div data-historico-da-caixa style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)', background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <History size={14} color="var(--text-muted)" />
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>Histórico de conversas</span>
      </div>

      <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        {!estado && 'Ainda não trazido para o inbox.'}
        {estado?.status === 'pendente' && 'Esperando o WhatsApp terminar de mandar o histórico ao aparelho conectado…'}
        {estado?.status === 'importando' && `Trazendo o histórico… ${contagem(estado)} até agora.`}
        {estado?.status === 'concluida' && `Histórico trazido: ${contagem(estado, true)}.`}
        {estado?.status === 'falhou' && `Não deu para trazer o histórico: ${estado.erro ?? 'erro desconhecido'}`}
      </p>
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
        Ao conectar, o WhatsApp manda um recorte recente das conversas (ele decide quanto).
        O que é mais antigo fica só no celular. Grupos não entram.
      </p>
      {erro && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 700, margin: 0 }}>{erro}</p>}

      {!aberto && (
        <button type="button" onClick={trazer} disabled={isPending} className="btn-ghost"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
          {estado ? 'Trazer de novo' : 'Trazer histórico'}
        </button>
      )}
    </div>
  )
}
