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
import { anterioresEmAbertoEmTexto, valorDaParcelaEmTexto } from '@/lib/pdv/situacoes'
import { OutrasFormas } from '@/components/shared/outras-formas'
import { recusaDasOutras, valorDaPrincipal, type EstadoDaParte } from '@/lib/checkout/varias-formas'
import { partesDaBaixa } from '@/lib/financeiro/baixa-em-formas'

/** "Parcela 2 de 3 do crediário: R$ 1.000,00" — ou "A receber: R$ 300,00". */
function tituloDaParcela(p: ParcelaEmAberto): string {
  // A14 da 23ª: com parte paga, o que falta, do total.
  const valor = p.pago > 0 ? `falta ${formatBRL(p.valor)} de ${formatBRL(Math.round((p.valor + p.pago) * 100) / 100)}` : formatBRL(p.valor)
  return p.numero && p.total ? `Parcela ${p.numero} de ${p.total} do crediário: ${valor}` : `A receber: ${valor}`
}

/**
 * O que a cliente tem em aberto no caixa da unidade, na "Nova venda" do PDV
 * (CX1, o desenho aprovado pelo Heitor em 2026-11-13, tela 3): cada parcela
 * com o vencimento e o "Receber esta parcela" — que pede a forma (PDV8).
 */
export function ParcelasEmAberto({ parcelas, slug, titulo = 'Em aberto com a cliente', compacta = false }: {
  parcelas: ParcelaEmAberto[]; slug: string
  /** A1 da 16ª: na comanda do crediário, "Parcelas desta venda". */
  titulo?: string
  /**
   * A4 da 17ª (princípio 7): na coluna estreita da comanda, uma linha por
   * parcela — "2/5 · R$ 200,00 · Vence 15/01/2027" — com o "Receber" ao lado.
   */
  compacta?: boolean
}) {
  const [aberta, setAberta] = useState<ParcelaEmAberto | null>(null)
  if (!parcelas.length) return null
  if (compacta) return (
    <div data-em-aberto-da-cliente style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="field-label">{titulo}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-field)', background: 'var(--surface)' }}>
        {parcelas.map((p, i) => (
          <li key={p.id} data-parcela-em-aberto={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', minWidth: 0,
            borderTop: i ? '1px solid var(--hairline)' : undefined,
          }}>
            {p.vencida && <AlertCircle size={14} aria-label="Vencida" style={{ color: 'var(--warning)', flexShrink: 0 }} />}
            <span title={[tituloDaParcela(p), p.vencimento].filter(Boolean).join(' · ')} style={{
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
            }}>
              <b style={{ color: 'var(--text)', fontWeight: 'var(--weight-bold)' }}>
                {valorDaParcelaEmTexto(p)}
              </b>
              {p.vencimento && <span style={{ color: p.vencida ? 'var(--warning)' : undefined }}> · {p.vencimento}</span>}
            </span>
            <button type="button" className="btn-ghost" aria-label="Receber esta parcela" onClick={() => setAberta(p)}
              style={{ flexShrink: 0, fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--brand)', padding: '4px 8px' }}>
              Receber
            </button>
          </li>
        ))}
      </ul>
      {aberta && <ReceberAParcela parcela={aberta} todas={parcelas} slug={slug} aoFechar={() => setAberta(null)} />}
    </div>
  )
  return (
    <div data-em-aberto-da-cliente style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="field-label">{titulo}</p>
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
      {aberta && <ReceberAParcela parcela={aberta} todas={parcelas} slug={slug} aoFechar={() => setAberta(null)} />}
    </div>
  )
}

function ReceberAParcela({ parcela, todas, slug, aoFechar }: { parcela: ParcelaEmAberto; todas: ParcelaEmAberto[]; slug: string; aoFechar: () => void }) {
  // A5 da 20ª: a parcela adiantada diz as de antes que seguem em aberto (só avisa).
  const adiantada = anterioresEmAbertoEmTexto(parcela, todas)
  const router = useRouter()
  const [forma, setForma] = useState('')
  const [bandeira, setBandeira] = useState('')
  const [vezes, setVezes] = useState(1)
  // C75: "Qual maquininha?" (só com mais de uma na rede).
  const [maquininha, setMaquininha] = useState('')
  // A1 da 21ª ("+ Outra forma", a decisão de 16/11): a parcela recebida em mais de uma forma.
  const [outras, setOutras] = useState<EstadoDaParte[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const opcoesDeVezes = useOpcoesDeVezes(maquininha)
  const faltaAMaquininha = useFaltaAMaquininha(forma, maquininha)
  const noCredito = forma === 'CREDIT_CARD'
  const recusaDasFormas = recusaDasOutras(outras, parcela.valor)
  // A primeira forma fica com o que falta das outras: é o valor dela que a taxa e as vezes mostram.
  const valorDaPrimeira = outras.length ? Math.max(0, valorDaPrincipal(parcela.valor, outras)) : parcela.valor

  const receber = () => iniciar(async () => {
    setErro(null)
    const r = await receberParcelaNoPdv(parcela.id, slug, {
      forma, bandeira: bandeira || null, vezes: noCredito ? vezes : 1, maquininha: maquininha || null,
      partes: outras.length ? partesDaBaixa({ forma, bandeira: bandeira || null, vezes: noCredito ? vezes : 1, maquininha: maquininha || null }, parcela.valor, outras) : null,
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
        {adiantada && (
          <p data-parcela-adiantada role="note" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{adiantada}</p>
        )}
        <FormasDePagamento valor={forma} formas={FORMAS_DA_BAIXA} desligado={pendente}
          aoMudar={f => { setForma(f); setVezes(1); setBandeira(''); setMaquininha('') }} />
        <CampoDaBandeira metodo={forma} valor={bandeira} aoMudar={setBandeira} total={valorDaPrimeira}
          maquininha={maquininha} aoMudarMaquininha={v => { setMaquininha(v); setVezes(1) }} />
        {noCredito && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="parcela-vezes" className="field-label">Vezes no cartão</label>
            <select id="parcela-vezes" className="field" value={String(vezes)} onChange={e => setVezes(Number(e.target.value))} disabled={pendente}>
              {opcoesDeVezes.map(n => <option key={n} value={String(n)}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
            </select>
            <DicaDasVezes total={valorDaPrimeira} vezes={vezes} opcoes={opcoesDeVezes} />
            <AvisoDaTaxa vezes={vezes} bandeira={bandeira} maquininha={maquininha} />
          </div>
        )}
        {/* A7 da 22ª (princípio 7): o "+ Outra forma" aparece com a janela, sem esperar a primeira forma. */}
        <OutrasFormas metodoPrincipal={forma} total={parcela.valor} outras={outras} aoMudar={setOutras} metodos={FORMAS_DA_BAIXA} />
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={aoFechar} disabled={pendente}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={receber} disabled={pendente || !forma || !!faltaAMaquininha || !!recusaDasFormas}
            title={faltaAMaquininha ?? undefined}>
            {pendente ? 'Recebendo…' : `Receber ${formatBRL(parcela.valor)}`}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
