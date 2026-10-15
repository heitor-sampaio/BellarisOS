'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarComissaoDoProcedimento } from '@/actions/comissoes'
import { CampoDeValor, paraNumero, paraTexto } from '@/components/admin/comissao-do-membro'
import {
  rotuloDaComissaoDoProcedimento, rotuloDaRegra, type RegraDeComissao, type TipoDeRegra,
} from '@/lib/comissoes/config'

/**
 * A comissão de um procedimento (pedido do Heitor, 2026-10-15): a GERAL, a
 * mesma para todo mundo, ou um valor para CADA profissional. O "por
 * profissional" são as exceções da Equipe vistas pelo procedimento — quem fica
 * no "Padrão" segue a comissão padrão dele. A geral vence tudo, e salvá-la
 * tira os valores por profissional.
 *
 * O botão é o próprio chip com a situação — a tabela mostra de relance qual
 * procedimento tem regra própria. Só aparece para quem tem `financial: MANAGE`
 * e é da rede (a action confere de novo).
 */

type Modo = 'GERAL' | 'POR_PROFISSIONAL'
type TipoDaLinha = TipoDeRegra | 'PADRAO'

export interface ProfissionalDaComissao { id: string; nome: string; padrao: RegraDeComissao | null }

const MODOS = [
  { key: 'GERAL',            label: 'A mesma para todos' },
  { key: 'POR_PROFISSIONAL', label: 'Por profissional' },
]
const TIPOS = [
  { key: 'PERCENTAGE',   label: 'Percentual' },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo' },
]
const TIPOS_DA_LINHA = [{ key: 'PADRAO', label: 'Padrão' }, ...TIPOS]

export function ComissaoDoProcedimento({ procedimento, geral, porProfissional, profissionais }: {
  procedimento:    { id: string; nome: string }
  geral:           Pick<RegraDeComissao, 'tipo' | 'valor'> | null
  porProfissional: { professional_id: string; tipo: TipoDeRegra; valor: number }[]
  profissionais:   ProfissionalDaComissao[]
}) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} data-comissao-procedimento={procedimento.id}
        className={geral || porProfissional.length ? 'chip chip-brand' : 'chip chip-muted'} style={{ cursor: 'pointer' }}
        title={`Comissão de ${procedimento.nome}`}>
        {rotuloDaComissaoDoProcedimento(geral, porProfissional.length)}
      </button>
      {aberta && (
        <Janela procedimento={procedimento} geral={geral} porProfissional={porProfissional}
          profissionais={profissionais} onFechar={() => setAberta(false)} />
      )}
    </>
  )
}

function Janela({ procedimento, geral, porProfissional, profissionais, onFechar }: {
  procedimento:    { id: string; nome: string }
  geral:           Pick<RegraDeComissao, 'tipo' | 'valor'> | null
  porProfissional: { professional_id: string; tipo: TipoDeRegra; valor: number }[]
  profissionais:   ProfissionalDaComissao[]
  onFechar:        () => void
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(geral ? 'GERAL' : 'POR_PROFISSIONAL')
  const [tipo, setTipo] = useState<TipoDeRegra>(geral?.tipo ?? 'PERCENTAGE')
  const [valor, setValor] = useState(geral ? paraTexto(geral.valor) : '')
  const [linhas, setLinhas] = useState<Record<string, { tipo: TipoDaLinha; valor: string }>>(() => Object.fromEntries(
    profissionais.map(p => {
      const r = porProfissional.find(x => x.professional_id === p.id)
      return [p.id, r ? { tipo: r.tipo, valor: paraTexto(r.valor) } : { tipo: 'PADRAO' as const, valor: '' }]
    }),
  ))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const mudarLinha = (id: string, parte: Partial<{ tipo: TipoDaLinha; valor: string }>) =>
    setLinhas(ls => ({ ...ls, [id]: { ...ls[id]!, ...parte } }))
  const comValor = Object.values(linhas).filter(l => l.tipo !== 'PADRAO').length

  function salvar() {
    setErro(null)
    const lerValor = (t: TipoDeRegra, texto: string, onde: string): number | null => {
      const n = paraNumero(texto)
      if (!texto.trim() || !Number.isFinite(n) || n < 0) { setErro(`Informe o valor ${onde}.`); return null }
      if (t === 'PERCENTAGE' && n > 100) { setErro(`Percentual acima de 100% ${onde}.`); return null }
      return n
    }
    let entrada: unknown
    if (modo === 'GERAL') {
      const v = lerValor(tipo, valor, 'da comissão geral')
      if (v === null) return
      entrada = { modo, geral: { tipo, valor: v } }
    } else {
      const lista: { professional_id: string; tipo: TipoDeRegra; valor: number }[] = []
      for (const p of profissionais) {
        const l = linhas[p.id]!
        if (l.tipo === 'PADRAO') continue
        const v = lerValor(l.tipo, l.valor, `de ${p.nome}`)
        if (v === null) return
        lista.push({ professional_id: p.id, tipo: l.tipo, valor: v })
      }
      entrada = { modo, profissionais: lista }
    }
    iniciar(async () => {
      const r = await salvarComissaoDoProcedimento(procedimento.id, entrada)
      if (r.error) { setErro(r.error); return }
      onFechar()
      router.refresh()
    })
  }

  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 } as const

  return (
    <JanelaModal onFechar={onFechar} rotulo={`Comissão de ${procedimento.nome}`} largura={560} travado={salvando}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', margin: 0 }}>Comissão</h2>
            <p style={{ ...ajuda, marginTop: 2, overflowWrap: 'anywhere' }}>{procedimento.nome}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onFechar} style={{ padding: 6 }} aria-label="Fechar"><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SegSelect ariaLabel="Como a comissão deste procedimento é definida" value={modo}
            onSelect={k => setModo(k as Modo)} options={MODOS} />
          <p style={ajuda}>
            {modo === 'GERAL'
              ? 'Todo profissional recebe o mesmo por este procedimento — vale no lugar do padrão e das exceções de cada um.'
              : 'Um valor para quem precisa; quem fica no "Padrão" recebe a comissão padrão dele (Equipe).'}
          </p>
        </div>

        {modo === 'GERAL' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
            <p className="overline">Comissão geral</p>
            <SegSelect ariaLabel="Tipo da comissão geral" value={tipo} onSelect={k => setTipo(k as TipoDeRegra)} options={TIPOS} />
            <CampoDeValor tipo={tipo} valor={valor} onChange={setValor} rotulo="Valor da comissão geral" />
            {comValor > 0 && (
              <p style={{ ...ajuda, color: 'var(--warning)' }}>
                Salvar tira o valor próprio de {comValor} {comValor === 1 ? 'profissional' : 'profissionais'} neste procedimento.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
            <p className="overline">Por profissional</p>
            {profissionais.length === 0 && <p style={ajuda}>Ninguém atende clientes na rede ainda.</p>}
            {profissionais.map(p => {
              const l = linhas[p.id]!
              return (
                <div key={p.id} data-profissional={p.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', margin: 0, overflowWrap: 'anywhere' }}>{p.nome}</p>
                    <span style={ajuda}>{p.padrao ? `padrão: ${rotuloDaRegra(p.padrao)}` : 'sem padrão'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <SegSelect ariaLabel={`Comissão de ${p.nome}`} value={l.tipo}
                      onSelect={k => mudarLinha(p.id, { tipo: k as TipoDaLinha })} options={TIPOS_DA_LINHA} />
                    {l.tipo !== 'PADRAO' && (
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <CampoDeValor tipo={l.tipo} valor={l.valor} onChange={v => mudarLinha(p.id, { valor: v })} rotulo={`Valor de ${p.nome}`} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </JanelaModal>
  )
}
