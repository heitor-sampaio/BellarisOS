'use client'

import Link from 'next/link'
import { blocosDoTexto, type Trecho } from '@/lib/copilot/texto'

/**
 * O texto do Copilot desenhado com elementos — nunca como HTML. O que o modelo
 * escreve passa por `blocosDoTexto` (lib/copilot/texto.ts): parágrafo, lista,
 * negrito e link INTERNO; o resto é texto puro.
 */

function Trechos({ trechos, aoNavegar }: { trechos: Trecho[]; aoNavegar?: () => void }) {
  return (
    <>
      {trechos.map((t, i) => {
        if (t.tipo === 'negrito') return <strong key={i}>{t.texto}</strong>
        if (t.tipo === 'link') return <Link key={i} href={t.href} onClick={aoNavegar}>{t.texto}</Link>
        return <span key={i}>{t.texto}</span>
      })}
    </>
  )
}

export function TextoDoCopilot({ texto, aoNavegar }: { texto: string; aoNavegar?: () => void }) {
  const blocos = blocosDoTexto(texto)
  return (
    <>
      {blocos.map((b, i) => b.tipo === 'paragrafo'
        ? <p key={i}><Trechos trechos={b.trechos} aoNavegar={aoNavegar} /></p>
        : b.numerada
          ? <ol key={i}>{b.itens.map((item, j) => <li key={j}><Trechos trechos={item} aoNavegar={aoNavegar} /></li>)}</ol>
          : <ul key={i}>{b.itens.map((item, j) => <li key={j}><Trechos trechos={item} aoNavegar={aoNavegar} /></li>)}</ul>)}
    </>
  )
}
