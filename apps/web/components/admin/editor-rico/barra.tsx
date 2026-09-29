'use client'

import { useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Baseline, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Table, ImagePlus,
  Minus, SeparatorHorizontal, PenLine, type LucideIcon,
} from 'lucide-react'
import { FONTES_DE_DOCUMENTO, IDS_DE_FONTE, TAMANHOS_DE_FONTE, FONTE_BASE, TAMANHO_BASE, nomeCss, fonteDoCss } from '@/lib/documentos/fontes'
import { ENTRELINHAS, ENTRELINHAS_BASE, LARGURA_UTIL } from '@/lib/documentos/arvore'
import { tamanhoEmPontos } from '@/lib/documentos/editor/converter'
import { enviarImagemDoModelo } from '@/actions/modelos-de-documento'

/**
 * A barra do editor de documentos. Cada botão é um comando do Tiptap; o
 * estado (negrito ligado, fonte atual…) vem de `useEditorState`, que só
 * redesenha a barra quando o que ela mostra muda.
 *
 * As cores da paleta são CONTEÚDO do documento (o que a clínica escolhe
 * pintar no contrato), não cor de interface — por isso não são tokens.
 */

export type Parte = 'corpo' | 'cabecalho' | 'rodape'

const CORES = ['#1f1f1f', '#595959', '#8c8c8c', '#c34d6b', '#b42318', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#6d28d9']
const REALCES = ['#fff3a3', '#ffd8a8', '#c3f0c8', '#cfe8ff', '#f5d0e0']
const LARGURAS = [{ pt: 80, rotulo: 'Pequena' }, { pt: 160, rotulo: 'Média' }, { pt: 300, rotulo: 'Grande' }, { pt: LARGURA_UTIL, rotulo: 'Largura total' }]
const ENTRE_ROTULO: Record<number, string> = { 1: 'Entrelinhas 1,0', 1.15: 'Entrelinhas 1,15', 1.5: 'Entrelinhas 1,5', 2: 'Entrelinhas 2,0' }

export function BarraDoEditor({ editor, parte, grupos, aoEnviarImagem }: {
  editor:          Editor
  parte:           Parte
  grupos:          [string, { nome: string; rotulo: string }[]][]
  /** A imagem subiu: a URL temporária entra no mapa do editor. */
  aoEnviarImagem:  (caminho: string, url: string | null) => void
}) {
  const [menu, setMenu] = useState<'cor' | 'realce' | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const estilo = e.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string }
      const bloco = e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p'
      const attrsDoBloco = e.getAttributes(bloco === 'p' ? 'paragraph' : 'heading') as { textAlign?: string; entrelinhas?: number | null }
      const imagem = e.isActive('imagemDoDocumento') ? e.getAttributes('imagemDoDocumento') as { largura: number; altura: number; alinhar: string | null } : null
      return {
        bloco,
        fonte: fonteDoCss(estilo.fontFamily) ?? FONTE_BASE,
        tamanho: tamanhoEmPontos(estilo.fontSize) ?? null,
        negrito: e.isActive('bold'), italico: e.isActive('italic'), sublinhado: e.isActive('underline'), tachado: e.isActive('strike'),
        alinhar: imagem ? (imagem.alinhar === 'centro' ? 'center' : imagem.alinhar === 'direita' ? 'right' : 'left') : (attrsDoBloco.textAlign ?? 'left'),
        entrelinhas: attrsDoBloco.entrelinhas ?? ENTRELINHAS_BASE,
        lista: e.isActive('bulletList') ? 'ul' : e.isActive('orderedList') ? 'ol' : null,
        naTabela: e.isActive('table'),
        imagem,
        podeDesfazer: e.can().undo(), podeRefazer: e.can().redo(),
      }
    },
  })

  // O foco volta ao texto NA HORA: o `focus()` do Tiptap espera o próximo
  // quadro, e o que se digita logo depois de escolher numa lista (fonte,
  // variável) ia para a própria lista — que "escolhe digitando" outra opção.
  const c = () => {
    if (!editor.view.hasFocus()) editor.view.focus()
    return editor.chain().focus()
  }

  function trocarBloco(v: string) {
    if (v === 'p') c().setParagraph().run()
    else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run()
  }

  function alinhar(a: 'left' | 'center' | 'right' | 'justify') {
    if (s.imagem) {
      c().updateAttributes('imagemDoDocumento', { alinhar: a === 'center' ? 'centro' : a === 'right' ? 'direita' : null }).run()
      return
    }
    c().setTextAlign(a).run()
  }

  async function enviarImagem(file: File) {
    setErro(null); setEnviando(true)
    const fd = new FormData()
    fd.set('imagem', file)
    const r = await enviarImagemDoModelo(fd)
    setEnviando(false)
    if (r.error || !r.imagem) { setErro(r.error ?? 'Não consegui enviar a imagem.'); return }
    const { caminho, sha256, larguraPx, alturaPx, url } = r.imagem
    aoEnviarImagem(caminho, url)
    // Nasce com até 160pt de largura, na proporção do arquivo.
    const largura = Math.min(160, larguraPx * 0.75, LARGURA_UTIL)
    const altura = Math.round((largura * alturaPx / larguraPx) * 100) / 100
    c().inserirImagem({ caminho, sha256, largura: Math.round(largura * 100) / 100, altura }).run()
  }

  return (
    <div className="barra-editor" role="toolbar" aria-label="Formatação do documento">
      <Grupo>
        <Botao icone={Undo2} rotulo="Desfazer" onClick={() => c().undo().run()} disabled={!s.podeDesfazer} />
        <Botao icone={Redo2} rotulo="Refazer" onClick={() => c().redo().run()} disabled={!s.podeRefazer} />
      </Grupo>
      <Grupo>
        <select className="filtro-select" aria-label="Estilo do parágrafo" value={s.bloco} onChange={e => trocarBloco(e.target.value)}>
          <option value="p">Normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>
        <select className="filtro-select" aria-label="Fonte" value={s.fonte}
          onChange={e => (e.target.value === FONTE_BASE ? c().unsetFontFamily().run() : c().setFontFamily(nomeCss(e.target.value as typeof FONTE_BASE)).run())}>
          {IDS_DE_FONTE.map(f => <option key={f} value={f}>{FONTES_DE_DOCUMENTO[f].rotulo}</option>)}
        </select>
        <select className="filtro-select" aria-label="Tamanho da fonte" value={s.tamanho ?? ''}
          onChange={e => (Number(e.target.value) === TAMANHO_BASE ? c().unsetFontSize().run() : c().setFontSize(`${e.target.value}pt`).run())}>
          {s.tamanho === null && <option value="">Tamanho</option>}
          {TAMANHOS_DE_FONTE.map(t => <option key={t} value={t}>{String(t).replace('.', ',')}</option>)}
        </select>
      </Grupo>
      <Grupo>
        <Botao icone={Bold} rotulo="Negrito" ativo={s.negrito} onClick={() => c().toggleBold().run()} />
        <Botao icone={Italic} rotulo="Itálico" ativo={s.italico} onClick={() => c().toggleItalic().run()} />
        <Botao icone={Underline} rotulo="Sublinhado" ativo={s.sublinhado} onClick={() => c().toggleUnderline().run()} />
        <Botao icone={Strikethrough} rotulo="Tachado" ativo={s.tachado} onClick={() => c().toggleStrike().run()} />
        <div style={{ position: 'relative' }}>
          <Botao icone={Baseline} rotulo="Cor do texto" ativo={menu === 'cor'} onClick={() => setMenu(menu === 'cor' ? null : 'cor')} />
          {menu === 'cor' && (
            <Paleta cores={CORES} rotulo="Cor do texto" aoEscolher={cor => { if (cor) c().setColor(cor).run(); else c().unsetColor().run(); setMenu(null) }} />
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <Botao icone={Highlighter} rotulo="Realce" ativo={menu === 'realce'} onClick={() => setMenu(menu === 'realce' ? null : 'realce')} />
          {menu === 'realce' && (
            <Paleta cores={REALCES} rotulo="Cor do realce" aoEscolher={cor => { if (cor) c().setHighlight({ color: cor }).run(); else c().unsetHighlight().run(); setMenu(null) }} />
          )}
        </div>
      </Grupo>
      <Grupo>
        <Botao icone={AlignLeft} rotulo="Alinhar à esquerda" ativo={s.alinhar === 'left'} onClick={() => alinhar('left')} />
        <Botao icone={AlignCenter} rotulo="Centralizar" ativo={s.alinhar === 'center'} onClick={() => alinhar('center')} />
        <Botao icone={AlignRight} rotulo="Alinhar à direita" ativo={s.alinhar === 'right'} onClick={() => alinhar('right')} />
        {!s.imagem && <Botao icone={AlignJustify} rotulo="Justificar" ativo={s.alinhar === 'justify'} onClick={() => alinhar('justify')} />}
        {!s.imagem && (
          <select className="filtro-select" aria-label="Entrelinhas" value={s.entrelinhas}
            onChange={e => c().definirEntrelinhas(Number(e.target.value)).run()}>
            {ENTRELINHAS.map(v => <option key={v} value={v}>{ENTRE_ROTULO[v]}</option>)}
          </select>
        )}
        {s.imagem && (
          <select className="filtro-select" aria-label="Tamanho da imagem" value={LARGURAS.find(l => Math.abs(l.pt - s.imagem!.largura) < 1)?.pt ?? ''}
            onChange={e => {
              const nova = Number(e.target.value)
              c().updateAttributes('imagemDoDocumento', { largura: nova, altura: Math.round((s.imagem!.altura * nova / s.imagem!.largura) * 100) / 100 }).run()
            }}>
            {!LARGURAS.some(l => Math.abs(l.pt - s.imagem!.largura) < 1) && <option value="">Tamanho</option>}
            {LARGURAS.map(l => <option key={l.pt} value={l.pt}>{l.rotulo}</option>)}
          </select>
        )}
      </Grupo>
      <Grupo>
        <Botao icone={List} rotulo="Lista com marcadores" ativo={s.lista === 'ul'} onClick={() => c().toggleBulletList().run()} />
        <Botao icone={ListOrdered} rotulo="Lista numerada" ativo={s.lista === 'ol'} onClick={() => c().toggleOrderedList().run()} />
      </Grupo>
      <Grupo>
        <Botao icone={Table} rotulo="Inserir tabela" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={s.naTabela} />
        <Botao icone={ImagePlus} rotulo={enviando ? 'Enviando a imagem…' : 'Inserir imagem'} onClick={() => arquivoRef.current?.click()} disabled={enviando} />
        <input ref={arquivoRef} type="file" hidden accept="image/png,image/jpeg" aria-label="Imagem do documento"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void enviarImagem(f) }} />
        <Botao icone={Minus} rotulo="Linha divisória" onClick={() => c().setHorizontalRule().run()} />
        {parte === 'corpo' && <Botao icone={SeparatorHorizontal} rotulo="Quebra de página" onClick={() => c().inserirQuebraDePagina().run()} />}
        {parte === 'corpo' && <Botao icone={PenLine} rotulo="Lugar da assinatura" onClick={() => c().inserirAssinatura().run()} />}
      </Grupo>
      <Grupo>
        <select className="filtro-select" value="" aria-label="Inserir variável"
          onChange={e => { if (e.target.value) c().inserirVariavel(e.target.value).run() }}>
          <option value="">Inserir variável…</option>
          {grupos.map(([grupo, vs]) => (
            <optgroup key={grupo} label={grupo}>
              {vs.map(v => <option key={v.nome} value={v.nome}>{v.rotulo}</option>)}
            </optgroup>
          ))}
        </select>
      </Grupo>
      {s.naTabela && (
        <div className="barra-editor-tabela" role="group" aria-label="Tabela">
          <span className="overline">Tabela</span>
          <button type="button" className="btn-ghost" onClick={() => c().addRowAfter().run()}>+ Linha</button>
          <button type="button" className="btn-ghost" onClick={() => c().deleteRow().run()}>− Linha</button>
          <button type="button" className="btn-ghost" onClick={() => c().addColumnAfter().run()}>+ Coluna</button>
          <button type="button" className="btn-ghost" onClick={() => c().deleteColumn().run()}>− Coluna</button>
          <button type="button" className="btn-ghost" onClick={() => c().toggleHeaderRow().run()}>Cabeçalho da tabela</button>
          <button type="button" className="btn-ghost" onClick={() => c().deleteTable().run()}>Excluir tabela</button>
        </div>
      )}
      {erro && <p role="alert" style={{ width: '100%', fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
    </div>
  )
}

function Grupo({ children }: { children: React.ReactNode }) {
  return <div className="barra-editor-grupo">{children}</div>
}

function Botao({ icone: Icone, rotulo, ativo, disabled, onClick }: {
  icone: LucideIcon; rotulo: string; ativo?: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button type="button" className="barra-editor-botao" aria-label={rotulo} title={rotulo}
      aria-pressed={ativo === undefined ? undefined : ativo} disabled={disabled}
      // mousedown sem foco: o clique não tira a seleção do texto.
      onMouseDown={e => e.preventDefault()} onClick={onClick}>
      <Icone size={15} />
    </button>
  )
}

function Paleta({ cores, rotulo, aoEscolher }: { cores: string[]; rotulo: string; aoEscolher: (cor: string | null) => void }) {
  return (
    <div className="barra-editor-paleta" role="menu" aria-label={rotulo}>
      {cores.map(cor => (
        <button key={cor} type="button" role="menuitem" aria-label={cor} title={cor}
          onMouseDown={e => e.preventDefault()} onClick={() => aoEscolher(cor)}
          style={{ background: cor }} className="barra-editor-cor" />
      ))}
      <button type="button" role="menuitem" className="btn-ghost" onMouseDown={e => e.preventDefault()} onClick={() => aoEscolher(null)}
        style={{ gridColumn: '1 / -1', fontSize: 'var(--text-xs-sz)' }}>
        Sem cor
      </button>
    </div>
  )
}
