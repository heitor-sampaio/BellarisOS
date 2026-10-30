'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { formatBRL, parseDinheiro } from '@estetica-os/utils'
import { salvarPacote } from '@/actions/pacotes'
import { contemSemAcento } from '@/lib/texto'
import { SegSelect } from '@/components/shared/seg-select'
import { CampoDeValor, paraTexto } from '@/components/admin/comissao-do-membro'
import {
  COMISSAO_DO_PACOTE_PADRAO, rotuloDaComissaoDoPacote,
  type ComissaoDoPacote, type ExecucaoDoPacote, type TipoDeRegra,
} from '@/lib/comissoes/config'

/**
 * O catálogo de pacotes da rede (Vendas → Pacotes). Um pacote é um conjunto de
 * procedimentos, iguais ou não — "5 limpezas + 3 drenagens" —, com um preço
 * só. Vender é na ficha do cliente; o que já foi vendido guarda o retrato da
 * venda — mudar aqui vale para as próximas.
 */

export interface PacoteDoCatalogo {
  id: string; name: string; price: number; totalSessions: number; validityDays: number | null
  isActive: boolean; composicao: string
  itens: { procedureId: string; procedureName: string; quantidade: number; precoTabela: number }[]
  /** A comissão de venda e de execução (2026-10-30). */
  comissao: ComissaoDoPacote
}

interface ItemDoRascunho { procedureId: string; quantidade: string }
type VendaDoRascunho = 'NENHUMA' | TipoDeRegra
interface ComissaoDoRascunho { venda: VendaDoRascunho; vendaValor: string; execucao: ExecucaoDoPacote; execucaoValor: string }
interface Rascunho {
  id?: string; name: string; itens: ItemDoRascunho[]; preco: string; validade: string; ativo: boolean
  comissao: ComissaoDoRascunho
}

const rascunhoDaComissao = (c: ComissaoDoPacote): ComissaoDoRascunho => ({
  venda: c.venda?.tipo ?? 'NENHUMA', vendaValor: c.venda ? paraTexto(c.venda.valor) : '',
  execucao: c.execucao.tipo, execucaoValor: c.execucao.valor != null ? paraTexto(c.execucao.valor) : '',
})

// Sem número de sessões escolhido por nós (2026-10-21: nascia com 5).
const vazio = (procedureId: string): Rascunho => ({
  name: '', itens: [{ procedureId, quantidade: '' }], preco: '', validade: '', ativo: true,
  comissao: rascunhoDaComissao(COMISSAO_DO_PACOTE_PADRAO),
})
// O dinheiro como em todo campo (`parseDinheiro`: "1.400" é mil e quatrocentos — D3).
const numero = (t: string) => parseDinheiro(t)

export function PacotesCatalogo({ pacotes, procedimentos, podeEditar, podeComissao = false, buscaInicial = '' }: {
  pacotes: PacoteDoCatalogo[]
  procedimentos: { id: string; name: string; price: number }[]
  podeEditar: boolean
  /** Quem é do financeiro (`financial: MANAGE`, da rede) vê e muda a comissão do pacote. */
  podeComissao?: boolean
  /** O `?q=` da URL — a busca universal abre a tela já filtrada. */
  buscaInicial?: string
}) {
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [busca,    setBusca]    = useState(buscaInicial)
  // A busca universal pode trocar o `?q=` com a tela aberta.
  const [buscaVista, setBuscaVista] = useState(buscaInicial)
  if (buscaInicial !== buscaVista) {
    setBuscaVista(buscaInicial)
    setBusca(buscaInicial)
  }
  // O que está sendo editado fica na tela mesmo que deixe de casar com a busca.
  const visiveis = pacotes.filter(p => editando?.id === p.id || contemSemAcento([p.name, p.composicao], busca))

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Pacotes">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {pacotes.length === 1 ? '1 pacote' : `${pacotes.length} pacotes`}
        </p>
        {pacotes.length > 0 && (
          <div className="filtro-largo" style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 360 }}>
            <Search
              size={14}
              aria-hidden
              style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-faint)', pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar pacote ou procedimento…"
              aria-label="Buscar pacote"
              className="field campo-busca"
              style={{ paddingLeft: 32 }}
            />
          </div>
        )}
        {podeEditar && !editando && procedimentos.length > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setEditando(vazio(procedimentos[0]!.id))}>
            <Plus size={15} aria-hidden /> Novo pacote
          </button>
        )}
      </div>

      {editando && !editando.id && (
        <Formulario inicial={editando} procedimentos={procedimentos} podeComissao={podeComissao} aoTerminar={() => setEditando(null)} />
      )}

      {pacotes.length === 0 && !editando && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum pacote cadastrado.</p>
      )}

      {pacotes.length > 0 && visiveis.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum pacote encontrado para “{busca.trim()}”.</p>
      )}

      {visiveis.map(p => editando?.id === p.id ? (
        <Formulario key={p.id} inicial={editando} procedimentos={procedimentos} podeComissao={podeComissao} aoTerminar={() => setEditando(null)} />
      ) : (
        <div key={p.id} data-pacote={p.id}
          style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{p.name}</p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {p.composicao} · {p.totalSessions} sessões{p.validityDays ? ` · válido por ${p.validityDays} dias` : ' · sem validade'}
            </p>
            {podeComissao && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }} data-comissao-do-pacote>
                {rotuloDaComissaoDoPacote(p.comissao)}
              </p>
            )}
          </div>
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{formatBRL(p.price)}</strong>
          <span className={p.isActive ? 'chip chip-success' : 'chip chip-muted'}>{p.isActive ? 'Ativo' : 'Inativo'}</span>
          {podeEditar && (
            <button type="button" className="btn-ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditando({
              id: p.id, name: p.name,
              itens: p.itens.map(i => ({ procedureId: i.procedureId, quantidade: String(i.quantidade) })),
              preco: String(p.price).replace('.', ','), validade: p.validityDays ? String(p.validityDays) : '', ativo: p.isActive,
              comissao: rascunhoDaComissao(p.comissao),
            })}>
              <Pencil size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Formulario({ inicial, procedimentos, podeComissao, aoTerminar }: {
  inicial: Rascunho; procedimentos: { id: string; name: string; price: number }[]; podeComissao: boolean; aoTerminar: () => void
}) {
  const router = useRouter()
  const [r, setR] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()
  const mudar = (parte: Partial<Rascunho>) => setR(atual => ({ ...atual, ...parte }))
  const mudarItem = (i: number, parte: Partial<ItemDoRascunho>) =>
    setR(atual => ({ ...atual, itens: atual.itens.map((it, j) => j === i ? { ...it, ...parte } : it) }))

  const precoDe = new Map(procedimentos.map(p => [p.id, p.price]))
  const sessoes = r.itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)
  // Referência para quem monta: quanto as sessões custariam avulsas.
  const avulso = r.itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (precoDe.get(i.procedureId) ?? 0), 0)

  function salvar() {
    setErro(null)
    const preco = numero(r.preco)
    if (!Number.isFinite(preco) || preco < 0 || !r.preco.trim()) { setErro('Informe o preço do pacote.'); return }
    const comissao = podeComissao ? comissaoDoRascunho(r.comissao) : null
    if (comissao && 'erro' in comissao) { setErro(comissao.erro); return }
    iniciar(async () => {
      const res = await salvarPacote({
        id: r.id, name: r.name, price: preco,
        itens: r.itens.map(i => ({ procedure_id: i.procedureId, quantity: Number(i.quantidade) })),
        validity_days: r.validade.trim() ? Number(r.validade) : null, is_active: r.ativo,
        // Só quem pode manda a comissão: o campo ausente não mexe nela.
        ...(comissao ? { comissao: comissao.entrada } : {}),
      })
      if (res.error) { setErro(res.error); return }
      aoTerminar()
      router.refresh()
    })
  }

  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div role="group" aria-label={r.id ? 'Editar pacote' : 'Novo pacote'}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={rotulo}>Nome</span>
        <input className="field" aria-label="Nome do pacote" value={r.name} onChange={e => mudar({ name: e.target.value })} placeholder="Ex.: Protocolo facial" />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Procedimentos do pacote">
        <span style={rotulo}>Procedimentos</span>
        {r.itens.map((it, i) => (
          <div key={i} data-item-do-pacote={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px auto', gap: 8, alignItems: 'center' }}>
            <select className="field" aria-label={`Procedimento ${i + 1}`} value={it.procedureId} onChange={e => mudarItem(i, { procedureId: e.target.value })}>
              {procedimentos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="field" type="number" min={1} max={100} placeholder="Ex.: 5" aria-label={`Sessões do procedimento ${i + 1}`}
              value={it.quantidade} onChange={e => mudarItem(i, { quantidade: e.target.value })} />
            <button type="button" className="btn-ghost" style={{ padding: 6, color: 'var(--text-muted)' }} disabled={r.itens.length === 1}
              aria-label={`Tirar o procedimento ${i + 1}`} onClick={() => mudar({ itens: r.itens.filter((_, j) => j !== i) })}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            // O próximo da lista que ainda não está no pacote (repetido vira uma linha só ao salvar).
            const livre = procedimentos.find(p => !r.itens.some(i => i.procedureId === p.id)) ?? procedimentos[0]!
            mudar({ itens: [...r.itens, { procedureId: livre.id, quantidade: '1' }] })
          }}>
          <Plus size={15} aria-hidden /> Adicionar procedimento
        </button>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {sessoes} sess{sessoes === 1 ? 'ão' : 'ões'} no pacote{avulso > 0 ? ` · avulsas sairiam por ${formatBRL(avulso)}` : ''}.
        </p>
      </div>

      <div className="form-2col">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Preço do pacote (R$)</span>
          <input className="field" inputMode="decimal" aria-label="Preço do pacote" value={r.preco} onChange={e => mudar({ preco: e.target.value })} placeholder="0,00" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Validade em dias (vazio = sem validade)</span>
          <input className="field" type="number" min={1} aria-label="Validade do pacote" value={r.validade} onChange={e => mudar({ validade: e.target.value })} />
        </label>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={r.ativo} onChange={e => mudar({ ativo: e.target.checked })} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>À venda</span>
      </label>
      {podeComissao && <CamposDaComissao c={r.comissao} mudar={parte => mudar({ comissao: { ...r.comissao, ...parte } })} />}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={aoTerminar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar pacote'}</button>
      </div>
    </div>
  )
}

const VENDAS = [
  { key: 'NENHUMA',      label: 'Nenhuma' },
  { key: 'PERCENTAGE',   label: 'Percentual' },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo' },
]
const EXECUCOES = [
  { key: 'REGRA',        label: 'Regra do profissional' },
  { key: 'PERCENTAGE',   label: 'Percentual' },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo' },
  { key: 'NENHUMA',      label: 'Nenhuma' },
]

/** O rascunho da tela → a entrada da action, ou o que falta preencher. */
function comissaoDoRascunho(c: ComissaoDoRascunho): { entrada: ComissaoDoPacote } | { erro: string } {
  const lerValor = (tipo: TipoDeRegra, texto: string, qual: string): number | string => {
    const v = numero(texto)
    if (!texto.trim() || !Number.isFinite(v) || v < 0) return `Informe o valor da comissão de ${qual}.`
    if (tipo === 'PERCENTAGE' && v > 100) return `A comissão de ${qual} é de no máximo 100%.`
    return v
  }
  let venda: ComissaoDoPacote['venda'] = null
  if (c.venda !== 'NENHUMA') {
    const v = lerValor(c.venda, c.vendaValor, 'venda')
    if (typeof v === 'string') return { erro: v }
    venda = { tipo: c.venda, valor: v }
  }
  if (c.execucao === 'PERCENTAGE' || c.execucao === 'FIXED_AMOUNT') {
    const v = lerValor(c.execucao, c.execucaoValor, 'execução')
    if (typeof v === 'string') return { erro: v }
    return { entrada: { venda, execucao: { tipo: c.execucao, valor: v } } }
  }
  return { entrada: { venda, execucao: { tipo: c.execucao, valor: null } } }
}

/**
 * A comissão do pacote (decisão do Heitor, 2026-10-30): a de VENDA, para quem
 * vendeu, e a de EXECUÇÃO, para quem atende cada sessão. Mudar aqui vale para
 * as próximas vendas — o pacote vendido guarda o retrato.
 */
function CamposDaComissao({ c, mudar }: { c: ComissaoDoRascunho; mudar: (parte: Partial<ComissaoDoRascunho>) => void }) {
  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 } as const
  const titulo = { fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', margin: 0 } as const
  return (
    <div role="group" aria-label="Comissão do pacote"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
      <p className="overline">Comissão</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={titulo}>De venda — para quem vendeu</p>
        <div role="group" aria-label="Comissão de venda">
          <SegSelect ariaLabel="Comissão de venda" value={c.venda} options={VENDAS}
            onSelect={k => mudar({ venda: k as VendaDoRascunho })} />
        </div>
        {c.venda !== 'NENHUMA' && (
          <CampoDeValor tipo={c.venda} valor={c.vendaValor} onChange={v => mudar({ vendaValor: v })} rotulo="Valor da comissão de venda" />
        )}
        <p style={ajuda}>
          {c.venda === 'NENHUMA'
            ? 'Quem vende o pacote não recebe comissão pela venda.'
            : c.venda === 'PERCENTAGE'
              ? 'Sobre o valor vendido (com o desconto), liberada à medida que o pacote é pago; o estorno devolve.'
              : 'Liberada à medida que o pacote é pago; o estorno devolve.'}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={titulo}>De execução — para quem atende cada sessão</p>
        <div role="group" aria-label="Comissão de execução">
          <SegSelect ariaLabel="Comissão de execução" value={c.execucao} options={EXECUCOES}
            onSelect={k => mudar({ execucao: k as ExecucaoDoPacote })} />
        </div>
        {(c.execucao === 'PERCENTAGE' || c.execucao === 'FIXED_AMOUNT') && (
          <CampoDeValor tipo={c.execucao} valor={c.execucaoValor} onChange={v => mudar({ execucaoValor: v })} rotulo="Valor da comissão de execução" />
        )}
        <p style={ajuda}>
          {c.execucao === 'REGRA' ? 'Cada sessão paga a comissão de quem atende, pela regra dele (Equipe ou Procedimentos).'
            : c.execucao === 'PERCENTAGE' ? 'Sobre a parte da sessão no preço do pacote.'
            : c.execucao === 'FIXED_AMOUNT' ? 'O mesmo valor a cada sessão atendida.'
            : 'As sessões deste pacote não geram comissão para quem atende.'}
        </p>
      </div>
    </div>
  )
}
