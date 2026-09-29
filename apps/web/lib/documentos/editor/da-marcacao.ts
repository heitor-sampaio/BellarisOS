/**
 * A marcação leve de antes (`# título`, `**negrito**`, `- item`,
 * `{{variável}}`, `[[assinatura]]`) virada JSON do editor.
 *
 * É o único caminho da marcação: um modelo antigo abre no editor novo por
 * aqui, e a versão antiga se monta por aqui também (`renderizar.ts` → este →
 * o conversor). Assim há UMA porta para a árvore que se assina. O título
 * principal sai centralizado, como a marcação o desenhava.
 */

import { analisarMarcacao, type Trecho } from '../marcacao'
import type { DocumentoDoEditor, NoPM } from './converter'

function inline(ts: Trecho[]): NoPM[] {
  return ts.map((t): NoPM => {
    const marks = t.negrito ? [{ type: 'bold' }] : undefined
    return 'variavel' in t
      ? { type: 'variavel', attrs: { nome: t.variavel }, ...(marks ? { marks } : {}) }
      : { type: 'text', text: t.texto, ...(marks ? { marks } : {}) }
  })
}

export function marcacaoParaEditor(marcacao: string): DocumentoDoEditor {
  const content: NoPM[] = analisarMarcacao(marcacao).map((b): NoPM => {
    switch (b.tipo) {
      case 'titulo':
        return { type: 'heading', attrs: { level: b.nivel, textAlign: b.nivel === 1 ? 'center' : null }, content: inline(b.trechos) }
      case 'paragrafo':
        return { type: 'paragraph', content: b.linhas.flatMap((l, i) => (i ? [{ type: 'hardBreak' }, ...inline(l)] : inline(l))) }
      case 'lista':
        return {
          type: b.ordenada ? 'orderedList' : 'bulletList',
          content: b.itens.map(it => ({ type: 'listItem', content: [{ type: 'paragraph', content: inline(it) }] })),
        }
      case 'divisoria':  return { type: 'horizontalRule' }
      case 'assinatura': return { type: 'assinatura' }
    }
  })
  return { corpo: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] } }
}
