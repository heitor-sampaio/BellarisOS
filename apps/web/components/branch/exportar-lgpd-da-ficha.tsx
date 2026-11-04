'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Download, FileDown, RefreshCw, X } from 'lucide-react'
import { formatDateTime } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import {
  exportacaoDaFicha, exportarDadosPelaEquipe, baixarExportacaoPelaEquipe, type ExportacaoDaFicha,
} from '@/actions/lgpd'

/**
 * "Exportar dados (LGPD)" na ficha (A21 da 6ª simulação): a equipe gera o
 * pacote da cliente que pede no balcão ou não tem o app — o mesmo do portal
 * (PDF legível + JSON), em segundo plano. Com o Prontuário em Gerenciar, pode
 * incluir a parte clínica (já liberada, e o acesso fica registrado).
 */
export function ExportarLgpdDaFicha({ clientId, podeIncluirProntuario, onFechar }: {
  clientId: string
  podeIncluirProntuario: boolean
  onFechar: () => void
}) {
  const [pacote, setPacote]   = useState<ExportacaoDaFicha | null>(null)
  const [carregou, setCarregou] = useState(false)
  const [links, setLinks]     = useState<{ pdf?: string; json?: string } | null>(null)
  const [incluir, setIncluir] = useState(false)
  const [erro, setErro]       = useState<string | null>(null)
  const [gravando, iniciar]   = useTransition()

  const ler = useCallback(async () => {
    const p = await exportacaoDaFicha(clientId)
    setPacote(p)
    setCarregou(true)
    if (p?.status === 'completed' && p.temArquivos) {
      const r = await baixarExportacaoPelaEquipe(p.id)
      if (r.error) setErro(r.error)
      else setLinks({ pdf: r.pdf, json: r.json })
    } else {
      setLinks(null)
    }
  }, [clientId])

  useEffect(() => {
    let vivo = true
    // A leitura é assíncrona: o estado só muda quando a resposta chega.
    ler().catch(() => { if (vivo) { setCarregou(true); setErro('Não foi possível carregar o pacote.') } }) // eslint-disable-line react-hooks/set-state-in-effect -- a busca ao abrir a janela
    return () => { vivo = false }
  }, [ler])

  function gerar() {
    setErro(null)
    iniciar(async () => {
      const r = await exportarDadosPelaEquipe(clientId, { incluirProntuario: incluir })
      if ('error' in r) { setErro(r.error); return }
      await ler()
    })
  }

  const emPreparo = pacote && (pacote.status === 'pending' || pacote.status === 'processing')

  return (
    <JanelaModal onFechar={onFechar} rotulo="Exportar dados (LGPD)" largura={480} travado={gravando}>
      <div data-exportar-lgpd>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileDown size={16} style={{ color: 'var(--brand)' }} aria-hidden="true" />
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Exportar dados (LGPD)</h2>
          <button type="button" onClick={onFechar} className="btn-ghost" style={{ padding: '4px 6px' }} aria-label="Fechar"><X size={15} /></button>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            O pacote com os dados pessoais da cliente — cadastro, agenda, financeiro, planos, fidelidade, termos e
            comunicações —, em PDF e JSON. Fica disponível por 30 dias, e o pedido fica registrado em seu nome.
          </p>

          {!carregou && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando…</p>}

          {pacote && (
            <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                {emPreparo ? 'Em preparo — costuma ficar pronto em poucos minutos.'
                  : pacote.status === 'completed' ? 'Pronto' : 'Não foi gerado'}
              </p>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                Pedido em {formatDateTime(pacote.requestedAt)}{pacote.pedidoPor ? ` por ${pacote.pedidoPor}` : ''}
                {pacote.incluiProntuario ? ' · com o prontuário' : ' · sem o prontuário'}
                {pacote.expiresAt ? ` · disponível até ${formatDateTime(pacote.expiresAt)}` : ''}
              </p>
              {pacote.erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{pacote.erro}</p>}
              {links && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {links.pdf && <a className="btn-primary" href={links.pdf}><Download size={13} aria-hidden="true" /> Baixar PDF</a>}
                  {links.json && <a className="btn-secondary" href={links.json}><Download size={13} aria-hidden="true" /> Baixar JSON</a>}
                </div>
              )}
              {pacote && (
                <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => { void ler() }}>
                  <RefreshCw size={13} aria-hidden="true" /> Atualizar
                </button>
              )}
            </div>
          )}

          {podeIncluirProntuario && !emPreparo && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <input type="checkbox" checked={incluir} onChange={e => setIncluir(e.target.checked)} />
              Incluir o prontuário
            </label>
          )}

          {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}

          {!emPreparo && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" disabled={gravando || !carregou} onClick={gerar}>
                {gravando ? 'Gerando…' : pacote ? 'Gerar de novo' : 'Gerar o pacote'}
              </button>
            </div>
          )}
        </div>
      </div>
    </JanelaModal>
  )
}
