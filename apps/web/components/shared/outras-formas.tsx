'use client'

import { Plus, X } from 'lucide-react'
import { formatBRL, parseDinheiro, formatDinheiroCampo } from '@estetica-os/utils'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { CampoDaBandeira, CampoDaMaquininha } from '@/components/shared/campo-da-bandeira'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { SaldoDoCredito } from '@/components/shared/saldo-do-credito'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { parteVazia, recusaDasOutras, valorDaParte, valorDaPrincipal, type EstadoDaParte } from '@/lib/checkout/varias-formas'

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
  // O valor da 1ª forma não se digita: a mesma altura de um campo, sem cara de campo.
  // A8 da 30ª: o valor em reais não quebra; a nota ao lado é que desce de linha.
  const valorFixo = {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', minHeight: 'var(--altura-controle)', fontSize: 'var(--text-sm-sz)',
    fontWeight: 'var(--weight-semibold)',
  } as const
  return (
    <div data-outras-formas style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* A17 da 24ª (princípio 3): a 1ª forma tem a caixa dela, como as outras — o valor no
          lugar do campo, com o porquê (era uma frase solta, e a 1ª forma parecia sem valor). */}
      {outras.length > 0 && (
        <div data-parte-do-pagamento={1} style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-field)', background: 'var(--surface)',
        }}>
          <div className="form-2col" style={{ alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>1ª forma</span>
              <span style={{ ...valorFixo, color: metodoPrincipal ? 'var(--text)' : 'var(--text-muted)' }}>
                {metodoPrincipal ? rotuloDaForma(metodoPrincipal) : 'A escolhida acima'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Valor nesta forma</span>
              <span data-valor-da-primeira-forma style={valorFixo}>
                <b style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatBRL(Math.max(0, principal))}</b>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)' }}>&nbsp;· o que falta das outras</span>
              </span>
            </div>
          </div>
        </div>
      )}
      {outras.map((p, i) => (
        <OutraForma key={i} parte={p} numero={i + 2} metodos={metodos} clienteId={clienteId} semMaquininha={semMaquininha} rotulo={rotulo}
          aoMudar={parte => mudar(i, parte)} aoTirar={() => aoMudar(outras.filter((_, j) => j !== i))} />
      ))}
      {recusa && (
        <span role="alert" data-recusa-das-formas style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{recusa}</span>
      )}
      {/* Sem teto (o Heitor, 25/11: "o usuario vai precisar clicar em um botão, então ele fez de proposito"). */}
      <button type="button" className="btn-ghost" data-outra-forma onClick={() => aoMudar([...outras, parteVazia()])}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Plus size={13} aria-hidden /> Outra forma
      </button>
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
              {/* A8 da 30ª (MQ-17): o limite e o valor de cada parcela, junto de todo campo de vezes. */}
              {valor !== undefined && <DicaDasVezes total={valor} vezes={parte.vezes} opcoes={opcoesDeVezes} />}
            </label>
          )}
          <CampoDaBandeira metodo={parte.metodo} valor={parte.bandeira} aoMudar={v => aoMudar({ bandeira: v })} maquininha={parte.maquininha} total={valor} />
        </div>
      )}
    </div>
  )
}
