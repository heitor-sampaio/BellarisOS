'use client'

import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import { ENTRELINHAS_BASE, FATOR_DE_LINHA } from '@/lib/documentos/arvore'

/**
 * As extensões do editor de termos e contratos (Tiptap).
 *
 * Cada nó aqui tem o seu par no conversor (`lib/documentos/editor/converter.ts`)
 * — é ele que decide o que vai para o documento. Nó novo no editor sem par no
 * conversor é recusado ao salvar, de propósito.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documento: {
      inserirVariavel: (nome: string) => ReturnType
      inserirAssinatura: () => ReturnType
      inserirQuebraDePagina: () => ReturnType
      inserirImagem: (attrs: { caminho: string; sha256: string; largura: number; altura: number }) => ReturnType
      definirEntrelinhas: (valor: number | null) => ReturnType
    }
  }
}

// ─── Variável: um chip no meio do texto ──────────────────────────────────────

const Variavel = Node.create<{ rotulo: (nome: string) => string }>({
  name: 'variavel',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ rotulo: (nome: string) => nome }),
  addAttributes: () => ({ nome: { default: null, parseHTML: el => el.getAttribute('data-variavel'), renderHTML: () => ({}) } }),
  parseHTML: () => [{ tag: 'span[data-variavel]' }],
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-variavel': node.attrs.nome, class: 'doc-variavel', contenteditable: 'false' }),
      this.options.rotulo(node.attrs.nome as string)]
  },
  renderText: ({ node }) => `{{${node.attrs.nome}}}`,
  addCommands: () => ({
    // O chip leva o estilo de onde o cursor está (negrito ligado, a fonte do
    // trecho): é assim que um texto digitado ali sairia.
    inserirVariavel: nome => ({ state, commands }) => {
      const marcas = (state.storedMarks ?? state.selection.$from.marks()).map(m => m.toJSON())
      return commands.insertContent({ type: 'variavel', attrs: { nome }, ...(marcas.length ? { marks: marcas } : {}) })
    },
  }),
})

// ─── Lugar da assinatura e quebra de página: blocos marcadores ───────────────

const Assinatura = Node.create({
  name: 'assinatura',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-assinatura]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-assinatura': '', class: 'doc-marcador doc-marcador-assinatura' }), 'Lugar da assinatura do cliente'],
  addCommands: () => ({
    // Seguido de um parágrafo: o cursor sai do bloco inserido, e o próximo
    // clique na barra não o substitui.
    inserirAssinatura: () => ({ commands }) => commands.insertContent([{ type: 'assinatura' }, { type: 'paragraph' }]),
  }),
})

const QuebraDePagina = Node.create({
  name: 'quebraDePagina',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-quebra]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-quebra': '', class: 'doc-marcador doc-marcador-quebra' }), 'Quebra de página'],
  addCommands: () => ({
    inserirQuebraDePagina: () => ({ commands }) => commands.insertContent([{ type: 'quebraDePagina' }, { type: 'paragraph' }]),
  }),
})

// ─── Imagem: guarda caminho + sha256; a URL vem de fora (é temporária) ───────

function VistaDaImagem({ node, selected, extension }: ReactNodeViewProps) {
  const { caminho, largura, altura, alinhar } = node.attrs as { caminho: string; largura: number; altura: number; alinhar: string | null }
  const url = (extension.options as { urls: () => Record<string, string> }).urls()[caminho]
  return (
    <NodeViewWrapper className="doc-imagem" data-alinhar={alinhar ?? 'esquerda'}>
      <div style={{ width: `calc(var(--pt) * ${largura})`, maxWidth: '100%', aspectRatio: `${largura} / ${altura}`, outline: selected ? '2px solid var(--brand)' : 'none', outlineOffset: 2 }}>
        {url
          // eslint-disable-next-line @next/next/no-img-element -- URL temporária do storage
          ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', border: '1px dashed var(--border)' }} />}
      </div>
    </NodeViewWrapper>
  )
}

const ImagemDoDocumento = Node.create<{ urls: () => Record<string, string> }>({
  name: 'imagemDoDocumento',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions: () => ({ urls: () => ({}) }),
  addAttributes: () => ({
    caminho: { default: null },
    sha256:  { default: null },
    largura: { default: 120 },
    altura:  { default: 60 },
    alinhar: { default: null },
  }),
  // Só a imagem que o próprio editor inseriu: imagem colada da web não entra.
  parseHTML: () => [{ tag: 'div[data-imagem-documento]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-imagem-documento': '' })],
  addNodeView() { return ReactNodeViewRenderer(VistaDaImagem) },
  addCommands: () => ({
    inserirImagem: attrs => ({ commands }) => commands.insertContent([{ type: 'imagemDoDocumento', attrs }, { type: 'paragraph' }]),
  }),
})

// ─── Entrelinhas no parágrafo e no título ────────────────────────────────────

const Entrelinhas = Extension.create({
  name: 'entrelinhas',
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading'],
    attributes: {
      entrelinhas: {
        default: null,
        parseHTML: el => (el.getAttribute('data-entrelinhas') ? Number(el.getAttribute('data-entrelinhas')) : null),
        renderHTML: attrs => (attrs.entrelinhas
          ? { 'data-entrelinhas': attrs.entrelinhas, style: `line-height: ${FATOR_DE_LINHA * Number(attrs.entrelinhas)}` }
          : {}),
      },
    },
  }],
  addCommands: () => ({
    definirEntrelinhas: valor => ({ commands }) => {
      const v = valor === ENTRELINHAS_BASE ? null : valor
      return commands.updateAttributes('paragraph', { entrelinhas: v }) || commands.updateAttributes('heading', { entrelinhas: v })
    },
  }),
})

export function extensoesDoDocumento(opcoes: { rotuloDaVariavel: (nome: string) => string; urlsDasImagens: () => Record<string, string> }) {
  return [
    StarterKit.configure({
      blockquote: false, code: false, codeBlock: false, link: false,
      heading: { levels: [1, 2, 3] },
    }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Highlight.configure({ multicolor: true }),
    TableKit.configure({ table: { resizable: true } }),
    Variavel.configure({ rotulo: opcoes.rotuloDaVariavel }),
    Assinatura,
    QuebraDePagina,
    ImagemDoDocumento.configure({ urls: opcoes.urlsDasImagens }),
    Entrelinhas,
  ]
}
