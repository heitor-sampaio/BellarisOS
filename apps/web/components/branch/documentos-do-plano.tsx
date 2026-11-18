'use client'

import { useEffect, useState, useTransition } from 'react'
import { FileText, RotateCcw, ScrollText, Trash2 } from 'lucide-react'
import { getDocumentosDoPlano, salvarDocumentosExcluidosDoPlano, type DocumentosDoPlanoNaTela } from '@/actions/treatment-plans'
import { documentosPuxadosDoPlano } from '@/lib/plano-de-tratamento/documentos'
import { erroParaTela } from '@/lib/erro-na-tela'
import { Dica } from '@/components/shared/dica'

/**
 * Os documentos do plano (DC1c/PC9b e DC4, a revisão do Heitor de
 * 2026-11-13): o termo e os outros documentos de cada procedimento das
 * sessões — nunca o contrato do procedimento —, cada um com "Excluir"; e o
 * contrato de plano da rede, que nasce no PDV com o pagamento. Os puxados
 * nascem na CRIAÇÃO (DC4: "o do pacote e o do plano, na venda/na criação") e
 * acompanham o plano salvo: o que sai é cancelado, o que entra nasce.
 *
 * As sessões vêm do editor, ao vivo (`procedimentosPorSessao`). No plano
 * salvo, "Excluir" grava na hora; no novo (sem id), a lista fica aqui e quem
 * cria o plano a grava depois (`onExcluidosDoNovo`).
 */
export function DocumentosDoPlano({ planId, procedimentosPorSessao, editavel, aceito, onExcluidosDoNovo }: {
  /** Vazio: o plano novo, ainda sem id. */
  planId: string
  procedimentosPorSessao: string[][]
  /** Quem monta o plano, antes do aceite. */
  editavel: boolean
  /** Aceito: os documentos já nasceram — só leitura. */
  aceito: boolean
  onExcluidosDoNovo?: (excluidos: string[]) => void
}) {
  const [dados, setDados] = useState<DocumentosDoPlanoNaTela | null | undefined>(undefined)
  const [excluidos, setExcluidos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    getDocumentosDoPlano(planId || null)
      .then(r => { if (!vivo) return; setDados(r); setExcluidos(r?.excluidos ?? []) })
      .catch(e => { if (vivo) { setDados(null); console.error('[plano] documentos:', e) } })
    return () => { vivo = false }
  }, [planId])

  // Sem o recurso de documentos (ou ainda carregando): nada a mostrar.
  if (!dados) return null

  const puxados = documentosPuxadosDoPlano(procedimentosPorSessao, dados.procedimentos, dados.modelos, excluidos)
  const podeMudar = editavel && !aceito

  function mudar(novos: string[]) {
    setErro(null)
    const antes = excluidos
    setExcluidos(novos)
    if (!planId) { onExcluidosDoNovo?.(novos); return }
    iniciar(async () => {
      try {
        const r = await salvarDocumentosExcluidosDoPlano(planId, novos)
        if (r.error) { setErro(r.error); setExcluidos(antes) }
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível salvar agora.'))
        setExcluidos(antes)
      }
    })
  }

  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 } as const
  const linha = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-field-token)', background: 'var(--surface)', border: '1px solid var(--border)' } as const

  return (
    <section data-documentos-do-plano aria-label="Documentos do plano" className="card"
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Quando os documentos nascem mora na dica (2026-11-16 — era o parágrafo de abertura). */}
      <p className="overline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Documentos</span>
        <Dica rotulo="Sobre os documentos do plano">
          {aceito
            ? 'Os termos e os outros documentos nasceram quando o plano foi salvo; a cliente assina quando quiser (no app, pelo link ou na unidade).'
            : 'Os termos e os outros documentos nascem quando o plano é salvo e acompanham o que muda nele; a cliente assina quando quiser.'}
        </Dica>
      </p>
      <div data-contrato-do-plano style={linha}>
        <ScrollText size={15} color="var(--brand)" aria-hidden style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', overflowWrap: 'anywhere', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{dados.contrato ?? 'Nenhum contrato de plano ativo'}</span>
            {/* Com contrato, o "quando nasce" mora na dica; sem ele, o caminho para criar fica à vista. */}
            {dados.contrato && (
              <Dica rotulo="Quando nasce o contrato do plano">
                Contrato de plano da rede: nasce no PDV, com a forma de pagamento escolhida.
              </Dica>
            )}
          </p>
          {!dados.contrato && (
            <p style={ajuda}>
              Crie um em Documentos, com o tipo “Contrato de plano”. Ele nasce no PDV, com o pagamento.
            </p>
          )}
        </div>
      </div>
      {puxados.length === 0 && <p style={ajuda}>Os procedimentos deste plano não têm termo nem outros documentos.</p>}
      {puxados.map(d => (
        <div key={d.id} data-puxado={d.id} style={{ ...linha, opacity: d.excluido ? 0.6 : 1 }}>
          <FileText size={15} color="var(--text-muted)" aria-hidden style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', overflowWrap: 'anywhere', textDecoration: d.excluido ? 'line-through' : 'none' }}>
              {d.nome}
            </p>
            <p style={ajuda}>
              {d.excluido ? 'Fora do plano' : `${d.tipo === 'TERMO' ? 'Termo' : 'Documento'} de ${d.de.join(', ')}`}
            </p>
          </div>
          {podeMudar && (d.excluido ? (
            <button type="button" className="btn-ghost" disabled={salvando} onClick={() => mudar(excluidos.filter(x => x !== d.id))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <RotateCcw size={14} aria-hidden /> Incluir de novo
            </button>
          ) : (
            <button type="button" className="btn-ghost" disabled={salvando} onClick={() => mudar([...excluidos, d.id])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, color: 'var(--text-muted)' }}>
              <Trash2 size={14} aria-hidden /> Excluir
            </button>
          ))}
        </div>
      ))}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </section>
  )
}
