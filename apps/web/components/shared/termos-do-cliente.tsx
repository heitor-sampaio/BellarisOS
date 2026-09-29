'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FileSignature, FileText, ScrollText } from 'lucide-react'
import { formatDate, formatTime } from '@estetica-os/utils'
import { rotaNoPortal } from '@/lib/rotas'
import { dispensarDocumento, montarDocumentoDeNovo } from '@/actions/documentos'

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

export function TermosDoCliente({ itens, slug, podeColher, compacto = false }: {
  itens:      ItemDeTermo[]
  /** Unidade do cliente (a rota vem de `lib/rotas`, pelo portal atual). */
  slug:       string
  podeColher: boolean
  compacto?:  boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [dispensando, setDispensando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

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
                {aberto && podeColher && dispensando !== item.id && (
                  <button type="button" className="btn-ghost" onClick={() => { setDispensando(item.id); setMotivo('') }}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)' }}>
                    Dispensar
                  </button>
                )}
              </div>
            </div>

            {item.status === 'INCOMPLETO' && item.faltando.length > 0 && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                Falta no cadastro: {item.faltando.join(', ')}.
              </p>
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
