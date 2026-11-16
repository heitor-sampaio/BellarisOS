'use client'

import { Plus, X } from 'lucide-react'
import { formatBRL, parseDinheiro, formatDinheiroCampo } from '@estetica-os/utils'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { CampoDaBandeira, CampoDaMaquininha } from '@/components/shared/campo-da-bandeira'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { SaldoDoCredito } from '@/components/shared/saldo-do-credito'
import { MAXIMO_DE_OUTRAS, parteVazia, recusaDasOutras, valorDaParte, valorDaPrincipal, type EstadoDaParte } from '@/lib/checkout/varias-formas'

/**
 * O "+ Outra forma" do à vista (D1 da 18ª; o Heitor, 2026-11-16: "Ok"): a
 * cliente paga parte numa forma e parte em outra. A primeira forma — o bloco
 * escolhido em cima — fica com o que falta, e a tela diz quanto; cada outra
 * forma pede o valor dela (e, no cartão, a maquininha, as vezes e a bandeira,
 * como a primeira). A conta é de `lib/checkout/varias-formas.ts`, a mesma que
 * a recusa usa.
 */
export function OutrasFormas({ metodoPrincipal, total, outras, aoMudar, metodos, clienteId, semMaquininha = false }: {
  metodoPrincipal: string
  total: number
  outras: EstadoDaParte[]
  aoMudar: (outras: EstadoDaParte[]) => void
  metodos: readonly string[]
  clienteId?: string
  semMaquininha?: boolean
}) {
  const recusa = recusaDasOutras(outras, total)
  const principal = valorDaPrincipal(total, outras)
  const mudar = (i: number, parte: Partial<EstadoDaParte>) => aoMudar(outras.map((p, j) => (j === i ? { ...p, ...parte } : p)))
  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div data-outras-formas style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {outras.length > 0 && (
        <p data-valor-da-primeira-forma style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
          {metodoPrincipal ? rotuloDaForma(metodoPrincipal) : 'A forma de cima'}: <b style={{ color: 'var(--text)' }}>{formatBRL(Math.max(0, principal))}</b> (o que falta das outras)
        </p>
      )}
      {outras.map((p, i) => (
        <OutraForma key={i} parte={p} numero={i + 2} metodos={metodos} clienteId={clienteId} semMaquininha={semMaquininha} rotulo={rotulo}
          aoMudar={parte => mudar(i, parte)} aoTirar={() => aoMudar(outras.filter((_, j) => j !== i))} />
      ))}
      {recusa && (
        <span role="alert" data-recusa-das-formas style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{recusa}</span>
      )}
      {outras.length < MAXIMO_DE_OUTRAS && (
        <button type="button" className="btn-ghost" data-outra-forma onClick={() => aoMudar([...outras, parteVazia()])}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} aria-hidden /> Outra forma
        </button>
      )}
    </div>
  )
}

function OutraForma({ parte, numero, metodos, clienteId, semMaquininha, rotulo, aoMudar, aoTirar }: {
  parte: EstadoDaParte; numero: number; metodos: readonly string[]; clienteId?: string; semMaquininha: boolean
  rotulo: React.CSSProperties
  aoMudar: (p: Partial<EstadoDaParte>) => void; aoTirar: () => void
}) {
  const opcoesDeVezes = useOpcoesDeVezes(parte.maquininha)
  const valor = valorDaParte(parte) ?? undefined
  return (
    <div data-parte-do-pagamento={numero} style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-field)', background: 'var(--surface)',
    }}>
      <div className="form-2col" style={{ alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>{numero}ª forma *</span>
          <select className="field" value={parte.metodo} aria-label={`${numero}ª forma`}
            onChange={e => aoMudar({ metodo: e.target.value, vezes: 1, bandeira: '', maquininha: '' })}>
            <option value="">Selecione…</option>
            {metodos.map(m => <option key={m} value={m}>{rotuloDaForma(m)}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Valor nesta forma *</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="field" inputMode="decimal" placeholder="0,00" value={parte.valor} aria-label={`Valor da ${numero}ª forma`}
              onChange={e => aoMudar({ valor: e.target.value })}
              onBlur={e => { const n = parseDinheiro(e.target.value); if (e.target.value.trim() && Number.isFinite(n)) aoMudar({ valor: formatDinheiroCampo(n) }) }} />
            <button type="button" className="btn-ghost" onClick={aoTirar} aria-label={`Tirar a ${numero}ª forma`} title="Tirar esta forma">
              <X size={13} aria-hidden />
            </button>
          </div>
        </label>
      </div>
      {parte.metodo && (
        <div className="form-2col">
          {parte.metodo === 'INTERNAL_CREDIT' && clienteId && valor !== undefined && <SaldoDoCredito clienteId={clienteId} valor={valor} />}
          {!semMaquininha && (
            <CampoDaMaquininha metodo={parte.metodo} valor={parte.maquininha} aoMudar={v => aoMudar({ maquininha: v, vezes: 1 })} rotuloComoLabel="" estiloDoRotulo={rotulo} />
          )}
          {parte.metodo === 'CREDIT_CARD' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Vezes no cartão</span>
              <select className="field" value={parte.vezes} onChange={e => aoMudar({ vezes: Number(e.target.value) })} aria-label={`Vezes no cartão da ${numero}ª forma`}>
                {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
              </select>
            </label>
          )}
          <CampoDaBandeira metodo={parte.metodo} valor={parte.bandeira} aoMudar={v => aoMudar({ bandeira: v })} maquininha={parte.maquininha} total={valor} />
        </div>
      )}
    </div>
  )
}
