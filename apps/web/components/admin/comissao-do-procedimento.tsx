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
 * Dois lugares, o MESMO editor (`EditorDeComissao`): o chip da tabela, que
 * abre uma janela só dela, e o modal de criar/editar procedimento, que grava
 * junto com o procedimento. Só aparece para quem tem `financial: MANAGE` e é
 * da rede (as actions conferem de novo).
 */

type Modo = 'GERAL' | 'POR_PROFISSIONAL'
type TipoDaLinha = TipoDeRegra | 'PADRAO'

export interface ProfissionalDaComissao { id: string; nome: string; padrao: RegraDeComissao | null }
export interface ValorPorProfissional { professional_id: string; tipo: TipoDeRegra; valor: number }

/** O que a tela precisa para editar a comissão de um procedimento. */
export interface DadosDaComissao {
  geral:           Pick<RegraDeComissao, 'tipo' | 'valor'> | null
  porProfissional: ValorPorProfissional[]
  profissionais:   ProfissionalDaComissao[]
}

export interface EstadoDaComissao {
  modo:   Modo
  tipo:   TipoDeRegra
  valor:  string
  linhas: Record<string, { tipo: TipoDaLinha; valor: string }>
}

export type EntradaDaComissao =
  | { modo: 'GERAL'; geral: { tipo: TipoDeRegra; valor: number } }
  | { modo: 'POR_PROFISSIONAL'; profissionais: ValorPorProfissional[] }

const MODOS = [
  { key: 'GERAL',            label: 'A mesma para todos' },
  { key: 'POR_PROFISSIONAL', label: 'Por profissional' },
]
const TIPOS = [
  { key: 'PERCENTAGE',   label: 'Percentual' },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo' },
]
const TIPOS_DA_LINHA = [{ key: 'PADRAO', label: 'Padrão' }, ...TIPOS]

export function estadoInicialDaComissao({ geral, porProfissional, profissionais }: DadosDaComissao): EstadoDaComissao {
  return {
    modo:  geral ? 'GERAL' : 'POR_PROFISSIONAL',
    tipo:  geral?.tipo ?? 'PERCENTAGE',
    valor: geral ? paraTexto(geral.valor) : '',
    linhas: Object.fromEntries(profissionais.map(p => {
      const r = porProfissional.find(x => x.professional_id === p.id)
      return [p.id, r ? { tipo: r.tipo, valor: paraTexto(r.valor) } : { tipo: 'PADRAO' as const, valor: '' }]
    })),
  }
}

/** O estado da tela → a entrada da action, ou o que falta preencher. */
export function entradaDaComissao(
  estado: EstadoDaComissao, profissionais: ProfissionalDaComissao[],
): { entrada: EntradaDaComissao } | { erro: string } {
  const lerValor = (t: TipoDeRegra, texto: string, onde: string): number | string => {
    const n = paraNumero(texto)
    if (!texto.trim() || !Number.isFinite(n) || n < 0) return `Informe o valor ${onde}.`
    if (t === 'PERCENTAGE' && n > 100) return `Percentual acima de 100% ${onde}.`
    return n
  }
  if (estado.modo === 'GERAL') {
    const v = lerValor(estado.tipo, estado.valor, 'da comissão geral')
    return typeof v === 'string' ? { erro: v } : { entrada: { modo: 'GERAL', geral: { tipo: estado.tipo, valor: v } } }
  }
  const lista: ValorPorProfissional[] = []
  for (const p of profissionais) {
    const l = estado.linhas[p.id]
    if (!l || l.tipo === 'PADRAO') continue
    const v = lerValor(l.tipo, l.valor, `de ${p.nome}`)
    if (typeof v === 'string') return { erro: v }
    lista.push({ professional_id: p.id, tipo: l.tipo, valor: v })
  }
  return { entrada: { modo: 'POR_PROFISSIONAL', profissionais: lista } }
}

const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 } as const

/** O editor: o modo, a geral e a linha de cada profissional. Controlado. */
export function EditorDeComissao({ estado, onChange, profissionais, inicialComValor }: {
  estado:          EstadoDaComissao
  onChange:        (e: EstadoDaComissao) => void
  profissionais:   ProfissionalDaComissao[]
  /** Quantos tinham valor próprio ao abrir: a geral os apaga, e a tela avisa. */
  inicialComValor: number
}) {
  const mudar = (parte: Partial<EstadoDaComissao>) => onChange({ ...estado, ...parte })
  const mudarLinha = (id: string, parte: Partial<{ tipo: TipoDaLinha; valor: string }>) =>
    mudar({ linhas: { ...estado.linhas, [id]: { ...estado.linhas[id]!, ...parte } } })

  return (
    <div role="group" aria-label="Comissão do procedimento" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SegSelect ariaLabel="Como a comissão deste procedimento é definida" value={estado.modo}
          onSelect={k => mudar({ modo: k as Modo })} options={MODOS} />
        <p style={ajuda}>
          {estado.modo === 'GERAL'
            ? 'Todo profissional recebe o mesmo por este procedimento — vale no lugar do padrão e das exceções de cada um.'
            : 'Um valor para quem precisa; quem fica no "Padrão" recebe a comissão padrão dele (Equipe).'}
        </p>
      </div>

      {estado.modo === 'GERAL' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SegSelect ariaLabel="Tipo da comissão geral" value={estado.tipo} onSelect={k => mudar({ tipo: k as TipoDeRegra })} options={TIPOS} />
          <CampoDeValor tipo={estado.tipo} valor={estado.valor} onChange={v => mudar({ valor: v })} rotulo="Valor da comissão geral" />
          {inicialComValor > 0 && (
            <p style={{ ...ajuda, color: 'var(--warning)' }}>
              Salvar tira o valor próprio de {inicialComValor} {inicialComValor === 1 ? 'profissional' : 'profissionais'} neste procedimento.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profissionais.length === 0 && <p style={ajuda}>Ninguém atende clientes na rede ainda.</p>}
          {profissionais.map(p => {
            const l = estado.linhas[p.id] ?? { tipo: 'PADRAO' as const, valor: '' }
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
    </div>
  )
}

/** O chip da tabela de Procedimentos, que abre a janela só da comissão. */
export function ComissaoDoProcedimento({ procedimento, dados }: {
  procedimento: { id: string; nome: string }
  dados:        DadosDaComissao
}) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} data-comissao-procedimento={procedimento.id}
        className={dados.geral || dados.porProfissional.length ? 'chip chip-brand' : 'chip chip-muted'} style={{ cursor: 'pointer' }}
        title={`Comissão de ${procedimento.nome}`}>
        {rotuloDaComissaoDoProcedimento(dados.geral, dados.porProfissional.length)}
      </button>
      {aberta && <Janela procedimento={procedimento} dados={dados} onFechar={() => setAberta(false)} />}
    </>
  )
}

function Janela({ procedimento, dados, onFechar }: {
  procedimento: { id: string; nome: string }
  dados:        DadosDaComissao
  onFechar:     () => void
}) {
  const router = useRouter()
  const [estado, setEstado] = useState(() => estadoInicialDaComissao(dados))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  function salvar() {
    setErro(null)
    const r = entradaDaComissao(estado, dados.profissionais)
    if ('erro' in r) { setErro(r.erro); return }
    iniciar(async () => {
      const res = await salvarComissaoDoProcedimento(procedimento.id, r.entrada)
      if (res.error) { setErro(res.error); return }
      onFechar()
      router.refresh()
    })
  }

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

        <EditorDeComissao estado={estado} onChange={setEstado} profissionais={dados.profissionais}
          inicialComValor={dados.porProfissional.length} />

        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </JanelaModal>
  )
}
