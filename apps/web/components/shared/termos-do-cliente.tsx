'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Copy, FileSignature, FileText, Link2, MessageCircle, ScrollText } from 'lucide-react'
import { formatDate, formatTime } from '@estetica-os/utils'
import { rotaNoPortal } from '@/lib/rotas'
import { DefinirPagamento } from '@/components/shared/definir-pagamento'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import {
  dispensarDocumento, montarDocumentoDeNovo, pedirAssinaturaNoPortal, gerarLinkDeAssinatura, revogarLinkDeAssinatura,
  enviarLinkPelaConversa,
  type LinkDeAssinatura,
} from '@/actions/documentos'

/**
 * Os termos e contratos do cliente — na aba Documentos da ficha, acima dos
 * arquivos anexados. Os abertos vêm primeiro: é o que a recepção precisa
 * resolver antes do atendimento.
 *
 * Usado na ficha e no painel da sessão de atendimento (`compacto`).
 */

export interface ItemDeTermo {
  id:            string
  titulo:        string
  tipo:          'TERMO' | 'CONTRATO' | 'CONTRATO_PLANO'
  status:        'A_GERAR' | 'INCOMPLETO' | 'PENDENTE' | 'ASSINADO' | 'DISPENSADO' | 'CANCELADO' | 'SUBSTITUIDO'
  exigencia:     'BLOQUEIA' | 'AVISA'
  faltando:      string[]
  agendamentoEm: string | null
  procedimento:  string | null
  criadoEm:      string
  assinadoEm:    string | null
  canal:         'CLINICA' | 'PORTAL' | 'LINK' | 'PAPEL' | null
  codigo:        string | null
  motivo:        string | null
  linkAte?:      string | null
  /** Contrato do procedimento que cita o pagamento — a recepção o define antes da assinatura. */
  pedePagamento?: boolean
  pagamento?:    { rotulo: string; valor: PagamentoDoPlano | null; desconto?: number } | null
  valorDoAtendimento?: number | null
}

const ICONE = { TERMO: FileSignature, CONTRATO: FileText, CONTRATO_PLANO: ScrollText } as const
const CANAL = { CLINICA: 'na clínica', PORTAL: 'pelo portal', LINK: 'por link', PAPEL: 'no papel' } as const

function Situacao({ item }: { item: ItemDeTermo }) {
  switch (item.status) {
    case 'ASSINADO':
      return <span className="chip chip-success">Assinado{item.assinadoEm ? ` em ${formatDate(item.assinadoEm)}` : ''}{item.canal ? ` · ${CANAL[item.canal]}` : ''}</span>
    case 'INCOMPLETO':
      return <span className="chip chip-warning">Faltam dados</span>
    case 'DISPENSADO':
      return <span className="chip chip-muted">Dispensado</span>
    case 'CANCELADO':
      return <span className="chip chip-muted">Cancelado</span>
    default:
      return <span className={item.exigencia === 'BLOQUEIA' ? 'chip chip-brand' : 'chip chip-warning'}>
        {item.exigencia === 'BLOQUEIA' ? 'Para assinar · bloqueia' : 'Para assinar'}
      </span>
  }
}

export function TermosDoCliente({ itens, slug, podeColher, compacto = false, pelaConversa = false }: {
  itens:      ItemDeTermo[]
  /** Unidade do cliente (a rota vem de `lib/rotas`, pelo portal atual). */
  slug:       string
  podeColher: boolean
  compacto?:  boolean
  /** A rede liga o envio do link pela conversa do inbox (Configurações → Documentos). */
  pelaConversa?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [dispensando, setDispensando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  // O link acabado de gerar: o token não fica no banco, então só se mostra agora.
  const [link, setLink] = useState<{ id: string; dados: LinkDeAssinatura } | null>(null)
  const [copiado, setCopiado] = useState(false)
  // O contrato cujo pagamento está sendo definido (formulário aberto).
  const [pagando, setPagando] = useState<string | null>(null)

  const voltar = encodeURIComponent(`${pathname}${compacto ? '' : '?aba=documentos'}`)
  const rotaDoDocumento = (id: string) => rotaNoPortal(pathname, slug, `/documentos/${id}/assinar?voltar=${voltar}`)

  function dispensar(id: string) {
    setErro(null)
    iniciar(async () => {
      const r = await dispensarDocumento(id, motivo)
      if (r.error) { setErro(r.error); return }
      setDispensando(null); setMotivo('')
      router.refresh()
    })
  }

  function pedirNoPortal(id: string) {
    setErro(null); setAviso(null)
    iniciar(async () => {
      const r = await pedirAssinaturaNoPortal(id)
      if (r.error) setErro(r.error)
      else setAviso('Pedido enviado: o documento está no portal do cliente, e ele foi avisado.')
    })
  }

  function enviarLink(id: string) {
    setErro(null); setAviso(null); setCopiado(false)
    iniciar(async () => {
      const r = await gerarLinkDeAssinatura(id)
      if (r.error || !r.link) { setErro(r.error ?? 'Não consegui gerar o link.'); return }
      setLink({ id, dados: r.link })
      router.refresh()
    })
  }

  function enviarPelaConversa(id: string) {
    setErro(null); setAviso(null); setCopiado(false); setLink(null)
    iniciar(async () => {
      const r = await enviarLinkPelaConversa(id)
      // Falhou depois de gerar (janela fechada): o link volta, para copiar.
      if (r.link && !r.enviado) setLink({ id, dados: r.link })
      if (r.error) { setErro(r.error); router.refresh(); return }
      setAviso('Link enviado pela conversa do WhatsApp da clínica.')
      router.refresh()
    })
  }

  function revogarLink(id: string) {
    setErro(null); setAviso(null)
    iniciar(async () => {
      const r = await revogarLinkDeAssinatura(id)
      if (r.error) { setErro(r.error); return }
      if (link?.id === id) setLink(null)
      setAviso('Link revogado: ele não abre mais o documento.')
      router.refresh()
    })
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true) }
    catch { setErro('Não consegui copiar. Selecione o link e copie à mão.') }
  }

  function gerarDeNovo(id: string) {
    setErro(null)
    iniciar(async () => {
      const r = await montarDocumentoDeNovo(id)
      if (r.error) setErro(r.error)
      router.refresh()
    })
  }

  if (!itens.length) {
    return compacto ? null : (
      <div className="card" style={{ padding: '16px 18px' }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Nenhum termo ou contrato para este cliente. Eles nascem do procedimento agendado, conforme o modelo ligado a ele.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Termos e contratos">
      {erro && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {aviso && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>{aviso}</p>}
      {itens.map(item => {
        const Icone = ICONE[item.tipo]
        const aberto = item.status === 'PENDENTE' || item.status === 'A_GERAR' || item.status === 'INCOMPLETO'
        return (
          <div key={item.id} className="card" data-documento={item.id} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icone size={16} color="var(--brand)" />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)', fontSize: 'var(--text-sm-sz)', overflowWrap: 'anywhere' }}>{item.titulo}</p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  {[
                    item.procedimento,
                    item.agendamentoEm ? `atendimento de ${formatDate(item.agendamentoEm)} às ${formatTime(item.agendamentoEm)}` : null,
                    item.status === 'ASSINADO' && item.codigo ? `código ${item.codigo}` : null,
                  ].filter(Boolean).join(' · ') || `emitido em ${formatDate(item.criadoEm)}`}
                </p>
              </div>
              <Situacao item={item} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {aberto && podeColher && item.status !== 'INCOMPLETO' && (
                  <Link href={rotaDoDocumento(item.id)} className="btn-primary" style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>
                    Colher assinatura
                  </Link>
                )}
                {item.status === 'INCOMPLETO' && podeColher && (
                  <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => gerarDeNovo(item.id)}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>
                    Gerar de novo
                  </button>
                )}
                {!aberto && item.status === 'ASSINADO' && (
                  <Link href={rotaDoDocumento(item.id)} className="btn-ghost" style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>Ver</Link>
                )}
                {!aberto && item.status === 'ASSINADO' && (
                  // O PDF final: documento + página de evidências (rota que confere a sessão).
                  <a href={`/api/documentos/${item.id}/pdf`} target="_blank" rel="noopener" className="btn-ghost" style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>PDF</a>
                )}
                {aberto && podeColher && item.status !== 'INCOMPLETO' && (
                  <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => pedirNoPortal(item.id)}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>
                    Pedir no portal
                  </button>
                )}
                {item.status === 'PENDENTE' && podeColher && (
                  <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => enviarLink(item.id)}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Link2 size={13} /> {item.linkAte || link?.id === item.id ? 'Novo link' : 'Enviar link'}
                  </button>
                )}
                {item.status === 'PENDENTE' && podeColher && pelaConversa && (
                  <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => enviarPelaConversa(item.id)}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <MessageCircle size={13} /> Enviar pela conversa
                  </button>
                )}
                {aberto && podeColher && dispensando !== item.id && (
                  <button type="button" className="btn-ghost" onClick={() => { setDispensando(item.id); setMotivo('') }}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>
                    Dispensar
                  </button>
                )}
              </div>
            </div>

            {link?.id === item.id && (
              <div data-link-de-assinatura style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  Link de uso único, vale até {formatDate(link.dados.expiraEm)} às {formatTime(link.dados.expiraEm)}. O cliente confirma {link.dados.pede === 'CPF' ? 'o CPF' : 'a data de nascimento'} antes de ver o documento.
                  Ele só aparece agora: se perder, gere outro.
                </p>
                <input className="field" readOnly value={link.dados.url} aria-label="Link de assinatura" onFocus={e => e.currentTarget.select()} style={{ fontSize: 'var(--text-xs-sz)' }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary" onClick={() => copiar(link.dados.url)}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Copy size={13} /> {copiado ? 'Copiado' : 'Copiar link'}
                  </button>
                  <a href={link.dados.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary"
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <MessageCircle size={13} /> Abrir no WhatsApp
                  </a>
                  <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => revogarLink(item.id)}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>
                    Revogar
                  </button>
                </div>
              </div>
            )}
            {item.linkAte && link?.id !== item.id && item.status === 'PENDENTE' && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Link de assinatura enviado · vale até {formatDate(item.linkAte)} às {formatTime(item.linkAte)}</span>
                {podeColher && (
                  <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => revogarLink(item.id)}
                    style={{ padding: '2px 8px', fontSize: 'var(--text-xs-sz)' }}>
                    Revogar link
                  </button>
                )}
              </p>
            )}
            {item.status === 'INCOMPLETO' && item.faltando.some(f => !f.startsWith('Pagamento ·')) && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                Falta no cadastro: {item.faltando.filter(f => !f.startsWith('Pagamento ·')).join(', ')}.
              </p>
            )}
            {item.pedePagamento && (
              <p style={{ fontSize: 'var(--text-xs-sz)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                color: item.pagamento ? 'var(--text-muted)' : 'var(--warning)', fontWeight: item.pagamento ? 'var(--weight-regular)' : 'var(--weight-semibold)' }}>
                <span>{item.pagamento ? `Pagamento: ${item.pagamento.rotulo}` : 'Falta definir o pagamento do contrato.'}</span>
                {aberto && podeColher && pagando !== item.id && (
                  <button type="button" className={item.pagamento ? 'btn-ghost' : 'btn-secondary'} onClick={() => setPagando(item.id)}
                    style={{ padding: '4px 10px', fontSize: 'var(--text-xs-sz)' }}>
                    {item.pagamento ? 'Trocar pagamento' : 'Definir pagamento'}
                  </button>
                )}
              </p>
            )}
            {pagando === item.id && (
              <DefinirPagamento documentoId={item.id} atual={item.pagamento?.valor} descontoAtual={item.pagamento?.desconto}
                total={item.valorDoAtendimento ?? null} aoTerminar={() => setPagando(null)} />
            )}
            {(item.status === 'DISPENSADO' || item.status === 'CANCELADO') && item.motivo && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{item.motivo}</p>
            )}

            {dispensando === item.id && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="field" style={{ flex: 1, minWidth: 200 }} value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Motivo da dispensa (fica registrado)" aria-label="Motivo da dispensa" maxLength={300} />
                <button type="button" className="btn-secondary" disabled={ocupado || motivo.trim().length < 5} onClick={() => dispensar(item.id)}>
                  Dispensar
                </button>
                <button type="button" className="btn-ghost" onClick={() => setDispensando(null)}>Cancelar</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
