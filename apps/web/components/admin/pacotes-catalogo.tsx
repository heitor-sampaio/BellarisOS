'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { formatBRL, parseDinheiro } from '@estetica-os/utils'
import { salvarPacote } from '@/actions/pacotes'
import { contemSemAcento } from '@/lib/texto'
import { SegSelect } from '@/components/shared/seg-select'
import { CampoDeValor, paraTexto } from '@/components/admin/comissao-do-membro'
import {
  COMISSAO_DO_PACOTE_PADRAO, rotuloDaComissaoDoPacote,
  type ComissaoDoPacote, type ExecucaoDoPacote, type TipoDeRegra,
} from '@/lib/comissoes/config'
import { documentosPuxadosDoPacote, type ModeloAtivo, type ProcedimentoComDocumentos } from '@/lib/pacotes/documentos'

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
  /** Os documentos puxados que a rede tirou deste pacote (DC1c). */
  documentosExcluidos: string[]
}

/** O que o pop-up precisa para mostrar os documentos do pacote (DC1c/PC9b) — nulo sem o recurso. */
export interface DocumentosDoCatalogo {
  /** O nome do contrato de pacote ativo da rede (nulo: nenhum). */
  contrato: string | null
  modelos: ModeloAtivo[]
  procedimentos: ProcedimentoComDocumentos[]
}

interface ItemDoRascunho { procedureId: string; quantidade: string }
type VendaDoRascunho = 'NENHUMA' | TipoDeRegra
interface ComissaoDoRascunho {
  venda: VendaDoRascunho; vendaValor: string; execucao: ExecucaoDoPacote; execucaoValor: string
  /** Com a execução "Valor do pacote" (com-04): % ou R$ fixo. */
  pacoteTipo: TipoDeRegra
}
interface Rascunho {
  id?: string; name: string; itens: ItemDoRascunho[]; preco: string; validade: string; ativo: boolean
  comissao: ComissaoDoRascunho
  /** Os documentos puxados que ficam fora do pacote. */
  excluidos: string[]
}

const rascunhoDaComissao = (c: ComissaoDoPacote): ComissaoDoRascunho => ({
  venda: c.venda?.tipo ?? 'NENHUMA', vendaValor: c.venda ? paraTexto(c.venda.valor) : '',
  execucao: c.execucao.tipo, execucaoValor: c.execucao.valor != null ? paraTexto(c.execucao.valor) : '',
  pacoteTipo: c.execucao.valorTipo ?? 'PERCENTAGE',
})

// Sem número de sessões escolhido por nós (2026-10-21: nascia com 5).
const vazio = (procedureId: string): Rascunho => ({
  name: '', itens: [{ procedureId, quantidade: '' }], preco: '', validade: '', ativo: true,
  comissao: rascunhoDaComissao(COMISSAO_DO_PACOTE_PADRAO), excluidos: [],
})
// O dinheiro como em todo campo (`parseDinheiro`: "1.400" é mil e quatrocentos — D3).
const numero = (t: string) => parseDinheiro(t)

export function PacotesCatalogo({ pacotes, procedimentos, podeEditar, podeComissao = false, buscaInicial = '', documentos = null }: {
  pacotes: PacoteDoCatalogo[]
  procedimentos: { id: string; name: string; price: number }[]
  podeEditar: boolean
  /** Os documentos do pacote (DC1c/PC9b); nulo sem o recurso de documentos. */
  documentos?: DocumentosDoCatalogo | null
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
        <Formulario inicial={editando} procedimentos={procedimentos} documentos={documentos} podeComissao={podeComissao} aoTerminar={() => setEditando(null)} />
      )}

      {pacotes.length === 0 && !editando && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum pacote cadastrado.</p>
      )}

      {pacotes.length > 0 && visiveis.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum pacote encontrado para “{busca.trim()}”.</p>
      )}

      {visiveis.map(p => editando?.id === p.id ? (
        <Formulario key={p.id} inicial={editando} procedimentos={procedimentos} documentos={documentos} podeComissao={podeComissao} aoTerminar={() => setEditando(null)} />
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
              comissao: rascunhoDaComissao(p.comissao), excluidos: p.documentosExcluidos,
            })}>
              <Pencil size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Formulario({ inicial, procedimentos, documentos, podeComissao, aoTerminar }: {
  inicial: Rascunho; procedimentos: { id: string; name: string; price: number }[]
  documentos: DocumentosDoCatalogo | null; podeComissao: boolean; aoTerminar: () => void
}) {
  const router = useRouter()
  const [r, setR] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()
  // PC1 (a revisão do Heitor de 2026-11-13): o pacote novo nasce com o preço
  // da soma e o acompanha até alguém mexer no preço; o que já existe guarda o seu.
  const [precoMexido, setPrecoMexido] = useState(!!inicial.id)
  const mudar = (parte: Partial<Rascunho>) => setR(atual => ({ ...atual, ...parte }))
  const mudarItem = (i: number, parte: Partial<ItemDoRascunho>) =>
    setR(atual => ({ ...atual, itens: atual.itens.map((it, j) => j === i ? { ...it, ...parte } : it) }))

  const precoDe = new Map(procedimentos.map(p => [p.id, p.price]))
  const sessoes = r.itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)
  // Referência para quem monta: quanto as sessões custariam avulsas.
  const avulso = r.itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (precoDe.get(i.procedureId) ?? 0), 0)
  const precoNaTela = precoMexido
    ? r.preco
    : (avulso > 0 ? avulso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')

  function salvar() {
    setErro(null)
    const preco = numero(precoNaTela)
    if (!Number.isFinite(preco) || preco < 0 || !precoNaTela.trim()) { setErro('Informe o preço do pacote.'); return }
    const comissao = podeComissao ? comissaoDoRascunho(r.comissao) : null
    if (comissao && 'erro' in comissao) { setErro(comissao.erro); return }
    iniciar(async () => {
      const res = await salvarPacote({
        id: r.id, name: r.name, price: preco,
        itens: r.itens.map(i => ({ procedure_id: i.procedureId, quantity: Number(i.quantidade) })),
        validity_days: r.validade.trim() ? Number(r.validade) : null, is_active: r.ativo,
        // Só quem pode manda a comissão: o campo ausente não mexe nela.
        ...(comissao ? { comissao: comissao.entrada } : {}),
        // Sem o recurso de documentos, o campo ausente não mexe nos excluídos.
        ...(documentos ? { documentos_excluidos: r.excluidos } : {}),
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
          <input className="field" inputMode="decimal" aria-label="Preço do pacote" value={precoNaTela} placeholder="0,00"
            onChange={e => { setPrecoMexido(true); mudar({ preco: e.target.value }) }} />
          {!precoMexido && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>A soma das sessões. Pode alterar.</span>}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Validade em dias (vazio = sem validade)</span>
          <input className="field" type="number" min={1} aria-label="Validade do pacote" value={r.validade} onChange={e => mudar({ validade: e.target.value })} />
        </label>
      </div>
      {documentos && (
        <DocumentosDoPacote documentos={documentos} procedimentosDoPacote={r.itens.map(i => i.procedureId)}
          excluidos={r.excluidos} mudar={excluidos => mudar({ excluidos })} />
      )}
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

/**
 * Os documentos do pacote (DC1c/PC9b, Bloco Documentos leva 2): o contrato
 * é o de pacote da rede; os demais vêm dos procedimentos do pacote — o termo
 * e os outros documentos, uma vez cada, sem o contrato do procedimento. Cada
 * um sai com "Excluir" e volta com "Incluir de novo". Nascem na venda.
 */
function DocumentosDoPacote({ documentos, procedimentosDoPacote, excluidos, mudar }: {
  documentos: DocumentosDoCatalogo
  procedimentosDoPacote: string[]
  excluidos: string[]
  mudar: (excluidos: string[]) => void
}) {
  const puxados = documentosPuxadosDoPacote(procedimentosDoPacote, documentos.procedimentos, documentos.modelos, excluidos)
  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 } as const
  const linha = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-field-token)', background: 'var(--surface)', border: '1px solid var(--border)' } as const
  return (
    <div role="group" aria-label="Documentos do pacote"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
      <p className="overline">Documentos</p>
      <p style={ajuda}>Nascem na venda do pacote, para a cliente assinar de uma vez.</p>
      <div data-contrato-do-pacote style={linha}>
        <FileText size={15} color="var(--brand)" aria-hidden style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', overflowWrap: 'anywhere' }}>
            {documentos.contrato ?? 'Nenhum contrato de pacote ativo'}
          </p>
          <p style={ajuda}>{documentos.contrato ? 'Contrato de pacote da rede' : 'Crie um em Documentos, com o tipo “Contrato de pacote”.'}</p>
        </div>
      </div>
      {puxados.length === 0 && <p style={ajuda}>Os procedimentos deste pacote não têm termo nem outros documentos.</p>}
      {puxados.map(d => (
        <div key={d.id} data-puxado={d.id} style={{ ...linha, opacity: d.excluido ? 0.6 : 1 }}>
          <FileText size={15} color="var(--text-muted)" aria-hidden style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', overflowWrap: 'anywhere', textDecoration: d.excluido ? 'line-through' : 'none' }}>
              {d.nome}
            </p>
            <p style={ajuda}>
              {d.excluido ? 'Fora do pacote' : `${d.tipo === 'TERMO' ? 'Termo' : 'Documento'} de ${d.de.join(', ')}`}
            </p>
          </div>
          {d.excluido ? (
            <button type="button" className="btn-ghost" onClick={() => mudar(excluidos.filter(x => x !== d.id))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <RotateCcw size={14} aria-hidden /> Incluir de novo
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => mudar([...excluidos, d.id])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, color: 'var(--text-muted)' }}>
              <Trash2 size={14} aria-hidden /> Excluir
            </button>
          )}
        </div>
      ))}
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
  { key: 'PACOTE',       label: 'Valor do pacote' },
]
const SOBRE_O_PACOTE = [
  { key: 'PERCENTAGE',   label: 'Percentual' },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo' },
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
  if (c.execucao === 'PACOTE') {
    const v = lerValor(c.pacoteTipo, c.execucaoValor, 'quem atende')
    if (typeof v === 'string') return { erro: v }
    return { entrada: { venda, execucao: { tipo: 'PACOTE', valorTipo: c.pacoteTipo, valor: v } } }
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
        {/* A5 da 12ª (princípio 3): a regra do pacote VENCE a comissão de venda da
            pessoa (Equipe) — e, sem ela, vale a da pessoa (comissoes.md). */}
        <p style={ajuda} data-ajuda-da-venda>
          {c.venda === 'NENHUMA'
            ? 'Sem regra no pacote, vale a comissão de venda de quem vendeu (Equipe → Comissão); sem ela, ninguém recebe pela venda.'
            : c.venda === 'PERCENTAGE'
              ? 'Sobre o valor vendido (com o desconto), liberada à medida que o pacote é pago; o estorno devolve. Vale no lugar da comissão de venda de cada pessoa (Equipe → Comissão).'
              : 'Liberada à medida que o pacote é pago; o estorno devolve. Vale no lugar da comissão de venda de cada pessoa (Equipe → Comissão).'}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={titulo}>De execução — para quem atende (por sessão ou sobre o pacote)</p>
        <div role="group" aria-label="Comissão de execução">
          <SegSelect ariaLabel="Comissão de execução" value={c.execucao} options={EXECUCOES}
            onSelect={k => mudar({ execucao: k as ExecucaoDoPacote })} />
        </div>
        {(c.execucao === 'PERCENTAGE' || c.execucao === 'FIXED_AMOUNT') && (
          <CampoDeValor tipo={c.execucao} valor={c.execucaoValor} onChange={v => mudar({ execucaoValor: v })} rotulo="Valor da comissão de execução" />
        )}
        {/* com-04: "a rede define como operar" — por sessão feita, ou de uma vez, sobre o valor do pacote. */}
        {c.execucao === 'PACOTE' && (
          <>
            <div role="group" aria-label="Comissão sobre o pacote">
              <SegSelect ariaLabel="Comissão sobre o pacote" value={c.pacoteTipo} options={SOBRE_O_PACOTE}
                onSelect={k => mudar({ pacoteTipo: k as TipoDeRegra })} />
            </div>
            <CampoDeValor tipo={c.pacoteTipo} valor={c.execucaoValor} onChange={v => mudar({ execucaoValor: v })} rotulo="Valor da comissão sobre o pacote" />
          </>
        )}
        <p style={ajuda}>
          {c.execucao === 'REGRA' ? 'Cada sessão paga a comissão de quem atende, pela regra dele (Equipe ou Procedimentos).'
            : c.execucao === 'PERCENTAGE' ? 'Sobre a parte da sessão no preço do pacote.'
            : c.execucao === 'FIXED_AMOUNT' ? 'O mesmo valor a cada sessão atendida.'
            : c.execucao === 'PACOTE' ? 'Uma comissão só, sobre o valor vendido do pacote, para a profissional responsável escolhida na venda — quando o pacote estiver pago por inteiro (no cartão em várias vezes, na hora). As sessões não geram comissão.'
            : 'As sessões deste pacote não geram comissão para quem atende.'}
        </p>
      </div>
    </div>
  )
}
