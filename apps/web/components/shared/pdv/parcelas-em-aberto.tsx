'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarRange, X } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { receberParcelaNoPdv } from '@/actions/pdv'
import { JanelaModal } from '@/components/shared/janela-modal'
import { FormasDePagamento, FORMAS_DA_BAIXA } from '@/components/shared/formas-de-pagamento'
import { CampoDaBandeira, useFaltaAMaquininha } from '@/components/shared/campo-da-bandeira'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import type { ParcelaEmAberto } from '@/lib/pdv/parcelas-da-cliente'

/** "Parcela 2 de 3 do crediário: R$ 1.000,00" — ou "A receber: R$ 300,00". */
function tituloDaParcela(p: ParcelaEmAberto): string {
  const valor = formatBRL(p.valor)
  return p.numero && p.total ? `Parcela ${p.numero} de ${p.total} do crediário: ${valor}` : `A receber: ${valor}`
}

/**
 * O que a cliente tem em aberto no caixa da unidade, na "Nova venda" do PDV
 * (CX1, o desenho aprovado pelo Heitor em 2026-11-13, tela 3): cada parcela
 * com o vencimento e o "Receber esta parcela" — que pede a forma (PDV8).
 */
export function ParcelasEmAberto({ parcelas, slug }: { parcelas: ParcelaEmAberto[]; slug: string }) {
  const [aberta, setAberta] = useState<ParcelaEmAberto | null>(null)
  if (!parcelas.length) return null
  return (
    <div data-em-aberto-da-cliente style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="field-label">Em aberto com a cliente</p>
      {parcelas.map(p => (
        <div key={p.id} data-parcela-em-aberto={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-field)',
          border: `1px solid ${p.vencida ? 'var(--warning-border)' : 'var(--border)'}`,
          background: p.vencida ? 'var(--warning-soft)' : 'var(--surface)',
        }}>
          {p.vencida
            ? <AlertCircle size={18} aria-hidden style={{ color: 'var(--warning)', flexShrink: 0 }} />
            : <CalendarRange size={18} aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            <b style={{ display: 'block', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{tituloDaParcela(p)}</b>
            {[p.vencimento, p.descricao].filter(Boolean).join(' · ')}
          </span>
          <button type="button" className="btn-secondary" onClick={() => setAberta(p)} style={{ flexShrink: 0 }}>
            Receber esta parcela
          </button>
        </div>
      ))}
      {aberta && <ReceberAParcela parcela={aberta} slug={slug} aoFechar={() => setAberta(null)} />}
    </div>
  )
}

function ReceberAParcela({ parcela, slug, aoFechar }: { parcela: ParcelaEmAberto; slug: string; aoFechar: () => void }) {
  const router = useRouter()
  const [forma, setForma] = useState('')
  const [bandeira, setBandeira] = useState('')
  const [vezes, setVezes] = useState(1)
  // C75: "Qual maquininha?" (só com mais de uma na rede).
  const [maquininha, setMaquininha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const opcoesDeVezes = useOpcoesDeVezes(maquininha)
  const faltaAMaquininha = useFaltaAMaquininha(forma, maquininha)
  const noCredito = forma === 'CREDIT_CARD'

  const receber = () => iniciar(async () => {
    setErro(null)
    const r = await receberParcelaNoPdv(parcela.id, slug, {
      forma, bandeira: bandeira || null, vezes: noCredito ? vezes : 1, maquininha: maquininha || null,
    })
    if ('error' in r) { setErro(r.error); return }
    aoFechar()
    router.refresh()
  })

  return (
    <JanelaModal onFechar={aoFechar} rotulo="Receber a parcela" largura={460} travado={pendente}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Receber a parcela</h2>
        <button type="button" onClick={aoFechar} className="btn-ghost" aria-label="Fechar" disabled={pendente} style={{ padding: '4px 6px' }}><X size={15} aria-hidden /></button>
      </div>
      <div style={{ padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <b style={{ display: 'block', color: 'var(--text)' }}>{tituloDaParcela(parcela)}</b>
          {[parcela.vencimento, parcela.descricao].filter(Boolean).join(' · ')}
        </p>
        <FormasDePagamento valor={forma} formas={FORMAS_DA_BAIXA} desligado={pendente}
          aoMudar={f => { setForma(f); setVezes(1); setBandeira(''); setMaquininha('') }} />
        <CampoDaBandeira metodo={forma} valor={bandeira} aoMudar={setBandeira} total={parcela.valor}
          maquininha={maquininha} aoMudarMaquininha={v => { setMaquininha(v); setVezes(1) }} />
        {noCredito && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="parcela-vezes" className="field-label">Vezes no cartão</label>
            <select id="parcela-vezes" className="field" value={String(vezes)} onChange={e => setVezes(Number(e.target.value))} disabled={pendente}>
              {opcoesDeVezes.map(n => <option key={n} value={String(n)}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
            </select>
            <DicaDasVezes total={parcela.valor} vezes={vezes} opcoes={opcoesDeVezes} />
            <AvisoDaTaxa vezes={vezes} bandeira={bandeira} maquininha={maquininha} />
          </div>
        )}
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={aoFechar} disabled={pendente}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={receber} disabled={pendente || !forma || !!faltaAMaquininha}
            title={faltaAMaquininha ?? undefined}>
            {pendente ? 'Recebendo…' : `Receber ${formatBRL(parcela.valor)}`}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
