'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { BadgeCheck, Check, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { DocumentoRenderizado } from '@/components/shared/documento-renderizado'
import { VisualizadorDePdf } from '@/components/shared/visualizador-de-pdf'
import { SignaturePad } from '@/components/shared/signature-pad'
import { lerConteudo } from '@/lib/documentos/arvore'
import { textoDoAceite, listaDeTitulos } from '@/lib/documentos/aceite'
import type { DocumentoNaTela } from '@/components/shared/tela-de-assinatura'

/**
 * Uma assinatura para todos (DC3, Bloco Documentos leva 2) — a tela da
 * CLIENTE, igual nos três canais: o aparelho entregue na clínica, o portal e
 * o link.
 *
 * A lista dos documentos; ela abre cada um ("Ler"), marca o aceite — que diz
 * os títulos — e assina UMA vez. Cada documento vai com o hash DELE,
 * calculado aqui dos bytes que chegaram (a forma canônica do editor, ou o
 * PDF): assina-se o que se viu. O botão diz o que falta (J-62).
 */

export interface ItemAssinadoNaTela { id: string; hashExibido: string }
export interface CodigoAssinado { id: string; codigo: string | null }

async function hashDe(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function Documento({ doc, aberto, assinatura, assinante, aoAlternar, aoCalcular }: {
  doc: DocumentoNaTela
  aberto: boolean
  assinatura: string | null
  assinante: string
  aoAlternar: () => void
  aoCalcular: (id: string, hash: string | null, pdf: ArrayBuffer | null) => void
}) {
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null)
  const arvore = useMemo(() => (doc.conteudo ? lerConteudo(doc.conteudo) : null), [doc.conteudo])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (doc.conteudo) {
        const h = await hashDe(new TextEncoder().encode(doc.conteudo).buffer as ArrayBuffer)
        if (vivo) aoCalcular(doc.id, h, null)
      } else if (doc.pdfUrl) {
        const bytes = await (await fetch(doc.pdfUrl)).arrayBuffer()
        if (!vivo) return
        setPdf(bytes)
        aoCalcular(doc.id, await hashDe(bytes), bytes)
      }
    })().catch(() => vivo && aoCalcular(doc.id, null, null))
    return () => { vivo = false }
  }, [doc.id, doc.conteudo, doc.pdfUrl, aoCalcular])

  return (
    <div className="card" data-documento-junto={doc.id} style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={17} color="var(--brand)" />
        </div>
        <p style={{ flex: 1, minWidth: 0, fontWeight: 'var(--weight-bold)', color: 'var(--text)', fontSize: 'var(--text-base-sz)', overflowWrap: 'anywhere' }}>{doc.titulo}</p>
        <button type="button" className={aberto ? 'btn-ghost' : 'btn-secondary'} aria-label={`${aberto ? 'Fechar' : 'Ler'} ${doc.titulo}`}
          aria-expanded={aberto} onClick={aoAlternar}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {aberto ? <><ChevronUp size={14} /> Fechar</> : <><ChevronDown size={14} /> Ler</>}
        </button>
      </div>
      {aberto && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {arvore && <DocumentoRenderizado documento={arvore} imagens={doc.imagens} assinatura={assinatura} nomeDoAssinante={assinante} />}
          {!arvore && pdf && <VisualizadorDePdf bytes={pdf} />}
          {!arvore && !pdf && <p style={{ padding: 16, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>Carregando o documento…</p>}
        </div>
      )}
    </div>
  )
}

export function AssinarJuntos({ documentos, assinante, cabecalho, assinar, final, rodape }: {
  documentos: DocumentoNaTela[]
  /** Quem assina (a menor com responsável: ele). */
  assinante:  string
  /** A frase do topo ("Ana, leia os documentos e assine uma vez no fim."). */
  cabecalho:  string
  assinar:    (d: { assinatura: string; itens: ItemAssinadoNaTela[] }) => Promise<{ error?: string; documentos?: CodigoAssinado[] }>
  /** A frase da tela de pronto ("Devolva o aparelho à equipe."). */
  final:      string
  /** O que vai embaixo da tela de pronto (o "Continuar", o "Voltar"). */
  rodape?:    React.ReactNode
}) {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [lidos, setLidos] = useState<Set<string>>(() => new Set())
  const [hashes, setHashes] = useState<Record<string, string | null>>({})
  const [aceite, setAceite] = useState(false)
  const [assinatura, setAssinatura] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feitos, setFeitos] = useState<CodigoAssinado[] | null>(null)
  const [enviando, iniciar] = useTransition()

  const aoCalcular = useCallback((id: string, hash: string | null) => {
    setHashes(h => ({ ...h, [id]: hash }))
    if (!hash) setErro('Não consegui carregar um dos documentos. Recarregue a página.')
  }, [])

  function alternar(id: string) {
    setAbertos(a => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })
    setLidos(l => new Set(l).add(id))
  }

  const titulos = documentos.map(d => d.titulo)
  const textoDoAceiteNaTela = textoDoAceite(assinante, titulos)
  const naoLidos = documentos.filter(d => !lidos.has(d.id)).map(d => d.titulo)
  const prontos = documentos.every(d => !!hashes[d.id])
  const faltaParaAssinar = [
    ...(naoLidos.length ? [`abrir ${naoLidos.length === 1 ? 'o documento' : 'os documentos'} ${listaDeTitulos(naoLidos)}`] : []),
    ...(aceite ? [] : ['marcar que leu e concorda']),
    ...(assinatura ? [] : ['assinar no quadro']),
  ]
  const rotulo = documentos.length === 1 ? 'Assinar documento' : `Assinar os ${documentos.length} documentos`

  function enviar() {
    if (!assinatura || !prontos) return
    setErro(null)
    iniciar(async () => {
      const r = await assinar({ assinatura, itens: documentos.map(d => ({ id: d.id, hashExibido: hashes[d.id]! })) })
      if (r.error) { setErro(r.error); return }
      setFeitos(r.documentos ?? [])
    })
  }

  if (feitos) {
    const titulo = new Map(documentos.map(d => [d.id, d.titulo]))
    return (
      <div className="card" style={{ padding: '32px 22px', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BadgeCheck size={26} color="var(--success)" />
        </div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          {feitos.length === 1 ? 'Documento assinado' : 'Documentos assinados'}
        </h2>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left' }}>
          {feitos.map(f => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <Check size={14} color="var(--success)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{titulo.get(f.id) ?? 'Documento'}</span>
              {f.codigo && <Link href={`/verificar/${f.codigo}`} style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xs-sz)' }}>{f.codigo}</Link>}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{final}</p>
        {rodape}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div className="card-brand" style={{ padding: '14px 18px', borderRadius: 'var(--radius-card-token)' }}>
        <p style={{ fontWeight: 'var(--weight-extrabold)' }}>{cabecalho}</p>
        {documentos.length > 1 && (
          <p style={{ fontSize: 'var(--text-sm-sz)', marginTop: 2 }}>
            São {documentos.length} documentos. Abra cada um para ler; uma assinatura vale para todos.
          </p>
        )}
      </div>

      <section aria-label="Documentos para assinar" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {documentos.map(d => (
          <Documento key={d.id} doc={d} aberto={abertos.has(d.id)} assinatura={assinatura} assinante={assinante}
            aoAlternar={() => alternar(d.id)} aoCalcular={aoCalcular} />
        ))}
      </section>

      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)}
            style={{ accentColor: 'var(--brand)', width: 18, height: 18, marginTop: 2 }} />
          <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)' }}>{textoDoAceiteNaTela}</span>
        </label>
        <SignaturePad onChange={setAssinatura} />
        {erro && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
        {faltaParaAssinar.length > 0 && (
          <p data-falta-para-assinar style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Para assinar, falta {listaDeTitulos(faltaParaAssinar)}.
          </p>
        )}
        <button type="button" className="btn-primary" disabled={faltaParaAssinar.length > 0 || !prontos || enviando} onClick={enviar}>
          {enviando ? 'Registrando…' : rotulo}
        </button>
      </div>
    </div>
  )
}
