'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { remarcarVencimento } from '@/actions/financial'

/** Uma remarcação do vencimento, como o lançamento guarda (A37 da 9ª). */
export interface RemarcacaoDoVencimento { de: string | null; para: string; por_nome?: string | null; em: string; motivo?: string | null }

const curto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

/**
 * "Vencimento remarcado: era 05/11 (Lúcia, em 07/11 — combinado com a
 * cliente)" — a última remarcação, embaixo da descrição do lançamento.
 */
export function VencimentoRemarcado({ historico }: { historico?: RemarcacaoDoVencimento[] | null }) {
  const ultima = historico && historico.length ? historico[historico.length - 1]! : null
  if (!ultima) return null
  const quem = [ultima.por_nome, `em ${curto(ultima.em)}`].filter(Boolean).join(', ')
  return (
    <span data-vencimento-remarcado style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)', marginTop: 1 }}>
      Vencimento remarcado{ultima.de ? `: era ${curto(ultima.de)}` : ''} ({quem}{ultima.motivo ? ` — ${ultima.motivo}` : ''})
      {historico!.length > 1 ? ` · ${historico!.length} remarcações` : ''}
    </span>
  )
}

/** O botão "Remarcar vencimento" e a janela (quem tem o Financeiro em Gerenciar). */
export function RemarcarVencimento({ lancamento }: { lancamento: { id: string; descricao: string; valor: number; vencimento: string | null } }) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [dia, setDia] = useState(() => lancamento.vencimento
    ? new Date(lancamento.vencimento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()

  function remarcar() {
    setErro(null)
    iniciar(async () => {
      const r = await remarcarVencimento(lancamento.id, dia, motivo)
      if (r.error) { setErro(r.error); return }
      toast.success(`Vencimento remarcado para ${new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`)
      setAberta(false)
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={() => setAberta(true)} title="Remarcar vencimento" aria-label="Remarcar vencimento" style={{
        width: 30, height: 30, borderRadius: 7,
        border: '1px solid var(--border)', background: 'var(--surface)',
        color: 'var(--text-faint)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CalendarClock size={12} aria-hidden />
      </button>
      {aberta && (
        <JanelaModal rotulo="Remarcar vencimento" largura={400} travado={gravando} onFechar={() => setAberta(false)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Remarcar vencimento</h2>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{lancamento.descricao}</strong> · {formatBRL(lancamento.valor)}
              {lancamento.vencimento ? ` · vencia ${new Date(lancamento.vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="field-label">Novo vencimento</span>
              <input className="field" type="date" value={dia} onChange={e => setDia(e.target.value)} disabled={gravando} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="field-label">Motivo (opcional)</span>
              <input className="field" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={gravando}
                placeholder="Ex.: combinado com a cliente" />
            </label>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              O vencimento de antes fica no histórico do lançamento.
            </p>
            {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={gravando} onClick={() => setAberta(false)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={gravando || !dia} onClick={remarcar}>
                {gravando ? 'Remarcando…' : 'Remarcar'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
