'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BadgeCheck, FileSignature, Printer, RotateCcw, ShieldCheck, Tablet, Upload } from 'lucide-react'
import { DocumentoRenderizado } from '@/components/shared/documento-renderizado'
import { VisualizadorDePdf } from '@/components/shared/visualizador-de-pdf'
import { SignaturePad } from '@/components/shared/signature-pad'
import type { ArvoreResolvida } from '@/lib/documentos/marcacao'
import { assinarNaClinica, marcarAssinadoEmPapel, montarDocumentoDeNovo } from '@/actions/documentos'
import { assinarNoPortal } from '@/actions/documentos-portal'

/**
 * Colher a assinatura na clínica.
 *
 * Três momentos na mesma tela: a EQUIPE confere o documento e a identidade do
 * cliente; entrega o aparelho e a tela vira do CLIENTE (só o documento, o
 * aceite e o quadro de assinar); depois, a confirmação com o código. Ou o
 * caminho do papel: imprimir e registrar que foi assinado.
 *
 * O hash é calculado AQUI, dos bytes que chegaram ao navegador — a forma
 * canônica do documento do editor, ou o próprio PDF. O servidor só aceita a
 * assinatura se ele bater com o que está gravado: assina-se o que se viu.
 */

export interface DocumentoNaTela {
  id:          string
  titulo:      string
  tipo:        'TERMO' | 'CONTRATO' | 'CONTRATO_PLANO'
  status:      string
  faltando:    string[]
  codigo:      string | null
  cliente:     { nome: string }
  conteudo:    string | null
  pdfUrl:      string | null
  assinatura:  { png: string | null; nome: string; em: string; canal: string; conduzidoPor: string | null } | null
  motivo:      string | null
}

type Modo = 'equipe' | 'cliente' | 'papel' | 'feito'

const CANAL: Record<string, string> = {
  CLINICA: 'na tela, na clínica', PAPEL: 'no papel', PORTAL: 'pelo portal do cliente', LINK: 'por link',
}

async function hashDe(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function TelaDeAssinatura({ doc, podeColher, voltar, rotaDoCliente, aoTerminar, canal = 'CLINICA' }: {
  doc:            DocumentoNaTela
  podeColher:     boolean
  /** Página inteira: para onde "Voltar" leva, e o link do cliente. */
  voltar?:        string
  rotaDoCliente?: string
  /**
   * Embutida em outra tela (o checkout do plano): "Voltar" e "Continuar"
   * devolvem o controle a ela, sem navegar — o wizard perderia o que foi
   * escolhido no passo do pagamento.
   */
  aoTerminar?:    () => void
  /**
   * PORTAL: é o próprio cliente, na sessão dele — abre direto no modo do
   * cliente (sem a etapa da equipe) e assina pela action do portal.
   */
  canal?:         'CLINICA' | 'PORTAL'
}) {
  const noPortal = canal === 'PORTAL'
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(noPortal && doc.status === 'PENDENTE' ? 'cliente' : 'equipe')
  const [conferido, setConferido] = useState(false)
  const [aceite, setAceite] = useState(false)
  const [assinatura, setAssinatura] = useState<string | null>(null)
  // Trocar a key remonta o quadro vazio — só no "Assinar de novo".
  const [quadro, setQuadro] = useState(0)
  const [digitalizacao, setDigitalizacao] = useState<File | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const arvore = useMemo<ArvoreResolvida | null>(() => {
    if (!doc.conteudo) return null
    try { return JSON.parse(doc.conteudo) as ArvoreResolvida } catch { return null }
  }, [doc.conteudo])

  // O hash do que está na tela: dos bytes que chegaram, nunca reserializados.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (doc.conteudo) {
        const h = await hashDe(new TextEncoder().encode(doc.conteudo).buffer as ArrayBuffer)
        if (vivo) setHash(h)
      } else if (doc.pdfUrl) {
        const r = await fetch(doc.pdfUrl)
        const bytes = await r.arrayBuffer()
        if (!vivo) return
        setPdf(bytes)
        setHash(await hashDe(bytes))
      }
    })().catch(() => vivo && setErro('Não consegui carregar o documento. Recarregue a página.'))
    return () => { vivo = false }
  }, [doc.conteudo, doc.pdfUrl])

  const aberto = doc.status === 'PENDENTE'
  const textoDoAceite = `Eu, ${doc.cliente.nome}, li e concordo com este documento.`

  function assinar() {
    if (!hash || !assinatura) return
    setErro(null)
    iniciar(async () => {
      const r = noPortal
        ? await assinarNoPortal({ id: doc.id, assinatura, hashExibido: hash, aceite: textoDoAceite })
        : await assinarNaClinica({ id: doc.id, assinatura, hashExibido: hash, identidadeConferida: conferido, aceite: textoDoAceite })
      if (r.error) { setErro(r.error); return }
      setCodigo(r.codigo ?? null)
      setModo('feito')
    })
  }

  function confirmarPapel() {
    if (!hash) return
    setErro(null)
    iniciar(async () => {
      const fd = new FormData()
      fd.set('id', doc.id)
      fd.set('hashExibido', hash)
      if (digitalizacao) fd.set('digitalizacao', digitalizacao)
      const r = await marcarAssinadoEmPapel(fd)
      if (r.error) { setErro(r.error); return }
      setCodigo(r.codigo ?? null)
      setModo('feito')
    })
  }

  function gerarDeNovo() {
    setErro(null)
    iniciar(async () => {
      const r = await montarDocumentoDeNovo(doc.id)
      if (r.error) setErro(r.error)
      router.refresh()
    })
  }

  function imprimir() {
    if (doc.pdfUrl) window.open(doc.pdfUrl, '_blank', 'noopener')
    else window.print()
  }

  const documento = (
    <div className="card area-impressao" style={{ padding: '28px 26px' }}>
      {arvore && (
        <DocumentoRenderizado
          arvore={arvore}
          assinatura={doc.assinatura?.png ?? (modo === 'cliente' ? assinatura : null)}
          nomeDoAssinante={doc.cliente.nome}
        />
      )}
      {!arvore && pdf && <VisualizadorDePdf bytes={pdf} />}
      {!arvore && !pdf && !erro && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>Carregando o documento…</p>}
      {doc.codigo && (
        <p style={{ marginTop: 18, fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textAlign: 'center' }}>
          Código de verificação {doc.codigo}
        </p>
      )}
    </div>
  )

  // ── Modo do cliente: só o documento, o aceite e a assinatura ───────────────
  if (modo === 'cliente') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto' }}>
        <div className="card-brand" style={{ padding: '14px 18px', borderRadius: 'var(--radius-card-token)' }}>
          <p style={{ fontWeight: 'var(--weight-extrabold)' }}>{noPortal ? `${doc.cliente.nome.split(' ')[0]}, leia` : `${doc.cliente.nome}, leia`} o documento e assine no fim.</p>
        </div>
        {documento}
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)}
              style={{ accentColor: 'var(--brand)', width: 18, height: 18, marginTop: 2 }} />
            <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)' }}>{textoDoAceite}</span>
          </label>
          <SignaturePad key={quadro} onConfirm={setAssinatura} confirmedAt={null} />
          {assinatura && (
            <button type="button" className="btn-ghost" onClick={() => { setAssinatura(null); setQuadro(q => q + 1) }} style={{ alignSelf: 'flex-start', display: 'flex', gap: 6, alignItems: 'center' }}>
              <RotateCcw size={13} /> Assinar de novo
            </button>
          )}
          {erro && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
          <button type="button" className="btn-primary" disabled={!aceite || !assinatura || !hash || enviando} onClick={assinar}>
            {enviando ? 'Registrando…' : 'Assinar documento'}
          </button>
        </div>
      </div>
    )
  }

  // ── Feito ──────────────────────────────────────────────────────────────────
  if (modo === 'feito') {
    return (
      <div className="card" style={{ padding: '36px 24px', maxWidth: 560, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BadgeCheck size={26} color="var(--success)" />
        </div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Documento assinado</h2>
        {codigo && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Código de verificação <strong style={{ color: 'var(--text)' }}>{codigo}</strong></p>}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {noPortal ? 'Obrigado! A clínica já recebeu o documento assinado.' : 'Devolva o aparelho à equipe.'}
        </p>
        {aoTerminar
          ? <button type="button" className="btn-primary" style={{ marginTop: 8 }} onClick={aoTerminar}>Continuar</button>
          : <Link href={voltar ?? '/'} className="btn-primary" style={{ marginTop: 8 }}>Voltar</Link>}
      </div>
    )
  }

  // ── Equipe (e papel) ───────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="esconde-impressao" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {aoTerminar
          ? <button type="button" onClick={aoTerminar} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={14} /> Voltar</button>
          : <Link href={voltar ?? '/'} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={14} /> Voltar</Link>}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>{doc.titulo}</h1>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            {rotaDoCliente
              ? <Link href={rotaDoCliente} style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>{doc.cliente.nome}</Link>
              : doc.cliente.nome}
          </p>
        </div>
      </div>

      <div className="assinatura-layout">
        {documento}

        <div className="esconde-impressao" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {doc.status === 'ASSINADO' && doc.assinatura && (
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="chip chip-success" style={{ alignSelf: 'flex-start' }}>Assinado</span>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                {new Date(doc.assinatura.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, {CANAL[doc.assinatura.canal] ?? doc.assinatura.canal}
              </p>
              {doc.assinatura.conduzidoPor && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Conduzido por {doc.assinatura.conduzidoPor}</p>}
              {doc.codigo && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Código {doc.codigo}</p>}
              <a href={`/api/documentos/${doc.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary" style={{ alignSelf: 'flex-start', marginTop: 6 }}>Baixar o PDF assinado</a>
            </div>
          )}

          {(doc.status === 'DISPENSADO' || doc.status === 'CANCELADO') && (
            <div className="card" style={{ padding: 18 }}>
              <span className="chip chip-muted">{doc.status === 'DISPENSADO' ? 'Dispensado' : 'Cancelado'}</span>
              {doc.motivo && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 8 }}>{doc.motivo}</p>}
            </div>
          )}

          {doc.status === 'INCOMPLETO' && (
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="chip chip-warning" style={{ alignSelf: 'flex-start' }}>Faltam dados</span>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                {noPortal ? 'A clínica ainda está completando os seus dados para este documento. Você será avisado quando ele estiver pronto para assinar.' : 'Complete o cadastro do cliente para gerar o documento:'}
              </p>
              {!noPortal && <ul style={{ paddingLeft: 18, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', listStyle: 'disc' }}>
                {doc.faltando.map(f => <li key={f}>{f}</li>)}
              </ul>}
              {podeColher && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {rotaDoCliente && <Link href={`${rotaDoCliente}?aba=dados`} className="btn-secondary">Completar o cadastro</Link>}
                  <button type="button" className="btn-ghost" onClick={gerarDeNovo} disabled={enviando}>Gerar de novo</button>
                </div>
              )}
            </div>
          )}

          {aberto && podeColher && modo === 'equipe' && (
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="overline">Assinar na clínica</p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={conferido} onChange={e => setConferido(e.target.checked)}
                  style={{ accentColor: 'var(--brand)', width: 16, height: 16, marginTop: 2 }} />
                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                  Conferi o documento de identidade de <strong>{doc.cliente.nome}</strong>.
                </span>
              </label>
              <button type="button" className="btn-primary" disabled={!conferido || !hash}
                onClick={() => { setModo('cliente'); window.scrollTo({ top: 0 }) }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Tablet size={15} /> Entregar ao cliente
              </button>
              <button type="button" className="btn-ghost" onClick={() => setModo('papel')}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <FileSignature size={15} /> Assinar no papel
              </button>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', display: 'flex', gap: 6 }}>
                <ShieldCheck size={13} style={{ flexShrink: 0 }} />
                A assinatura é eletrônica e fica registrada com data, hora, aparelho e o código de verificação.
              </p>
            </div>
          )}

          {aberto && podeColher && modo === 'papel' && (
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="overline">Assinar no papel</p>
              <button type="button" className="btn-secondary" onClick={imprimir} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Printer size={15} /> Imprimir o documento
              </button>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
                <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>Digitalização do papel assinado (opcional)</span>
                <span className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                  <Upload size={14} /> {digitalizacao ? digitalizacao.name : 'Escolher PDF ou foto'}
                </span>
                <input type="file" hidden accept="application/pdf,image/jpeg,image/png" aria-label="Digitalização do papel assinado"
                  onChange={e => setDigitalizacao(e.target.files?.[0] ?? null)} />
              </label>
              {erro && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
              <button type="button" className="btn-primary" disabled={!hash || enviando} onClick={confirmarPapel}>
                {enviando ? 'Registrando…' : 'Confirmar: o cliente assinou o papel'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setModo('equipe')}>Voltar</button>
            </div>
          )}

          {erro && modo === 'equipe' && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
        </div>
      </div>
    </div>
  )
}
