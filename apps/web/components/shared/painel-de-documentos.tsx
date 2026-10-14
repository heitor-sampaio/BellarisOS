'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { mesclarParams } from '@/lib/query-params'
import { rotaCliente } from '@/lib/rotas'
import { PeriodSelector, type Period } from '@/components/admin/period-selector'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { BuscaNaUrl } from '@/components/shared/busca-na-url'
import { JanelaModal } from '@/components/shared/janela-modal'
import { trilhaDoDocumento, type TrilhaDoDocumento } from '@/actions/documentos'
import type { DocumentoNoPainel, ResumoDosDocumentos } from '@/lib/metrics/documentos'
import {
  SITUACOES, ROTULO_DA_SITUACAO, TIPOS_DE_DOCUMENTO, ROTULO_DO_TIPO_DE_DOCUMENTO,
  ROTULO_DO_ENVIO, ROTULO_DO_CANAL, type SituacaoDoDocumento,
} from '@/lib/documentos/situacao'

export type LinhaDoPainel = DocumentoNoPainel & { unidade: string | null; slug: string | null }

const TZ = 'America/Sao_Paulo'
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ })
const diaEHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })

const CHIP: Record<SituacaoDoDocumento, string> = {
  FALTAM_DADOS: 'chip chip-warning', A_ENVIAR: 'chip chip-brand', ENVIADO: 'chip chip-info',
  ASSINADO: 'chip chip-success', DISPENSADO: 'chip chip-muted', CANCELADO: 'chip chip-muted', SUBSTITUIDO: 'chip chip-muted',
}

function Situacao({ l }: { l: LinhaDoPainel }) {
  const extra = l.situacao === 'ASSINADO'
    ? [l.assinadoEm ? dia(l.assinadoEm) : null, l.canal ? ROTULO_DO_CANAL[l.canal] ?? l.canal : null].filter(Boolean).join(' · ')
    : ''
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
      <span className={CHIP[l.situacao]}>{ROTULO_DA_SITUACAO[l.situacao]}{extra ? ` · ${extra}` : ''}</span>
      {l.situacao === 'FALTAM_DADOS' && l.faltando.length > 0 && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>Falta: {l.faltando.join(', ')}</span>
      )}
      {(l.situacao === 'DISPENSADO' || l.situacao === 'CANCELADO') && l.motivo && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', whiteSpace: 'normal' }}>{l.motivo}</span>
      )}
    </span>
  )
}

function Envio({ l }: { l: LinhaDoPainel }) {
  if (!l.envio || !l.enviadoEm) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span>{ROTULO_DO_ENVIO[l.envio] ?? l.envio} · {dia(l.enviadoEm)}</span>
      {l.situacao === 'ENVIADO' && l.linkAte && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>link válido até {dia(l.linkAte)}</span>
      )}
      {l.situacao === 'ENVIADO' && l.envio === 'LINK_GERADO' && !l.linkAte && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)' }}>link vencido</span>
      )}
      {l.situacao === 'ENVIADO' && l.abertoEm && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>aberto em {dia(l.abertoEm)}</span>
      )}
    </span>
  )
}

function Numero({ rotulo, valor, chave, hero = false, detalhe }: {
  rotulo: string; valor: number; chave: string; hero?: boolean; detalhe?: string
}) {
  return (
    <div className="card" data-kpi={chave} style={{
      padding: '16px 20px', flex: '1 1 160px',
      ...(hero && { background: 'var(--brand)', borderColor: 'transparent', boxShadow: 'var(--shadow-brand-card)' }),
    }}>
      <p style={{
        fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px',
        color: hero ? 'color-mix(in srgb, var(--on-brand) 78%, transparent)' : 'var(--text-muted)',
      }}>{rotulo}</p>
      <p style={{ fontSize: 'var(--text-name)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: hero ? 'var(--on-brand)' : 'var(--brand)' }}>
        {valor.toLocaleString('pt-BR')}
      </p>
      {detalhe && (
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 600, margin: '4px 0 0', color: hero ? 'color-mix(in srgb, var(--on-brand) 82%, transparent)' : 'var(--text-muted)' }}>
          {detalhe}
        </p>
      )}
    </div>
  )
}

/** A janela de um documento: a trilha inteira, a assinatura e o caminho para a ficha. */
function JanelaDoDocumento({ l, onFechar }: { l: LinhaDoPainel; onFechar: () => void }) {
  const pathname = usePathname()
  const [trilha, setTrilha] = useState<TrilhaDoDocumento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    trilhaDoDocumento(l.id).then(r => {
      if (!vivo) return
      if (r.error) setErro(r.error)
      else setTrilha(r.trilha ?? null)
    })
    return () => { vivo = false }
  }, [l.id])

  return (
    <JanelaModal onFechar={onFechar} rotulo={l.titulo} largura={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 24px' }}>
        <div>
          <p className="overline" style={{ margin: '0 0 4px' }}>{ROTULO_DO_TIPO_DE_DOCUMENTO[l.tipo]}</p>
          <h2 style={{ fontSize: 'var(--text-lg-sz)', fontWeight: 800, margin: 0, color: 'var(--text)' }}>{l.titulo}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            {l.cliente ?? '—'}{l.procedimento ? ` · ${l.procedimento}` : ''}{l.agendamentoEm ? ` · atendimento em ${diaEHora(l.agendamentoEm)}` : ''}
          </p>
          <div style={{ marginTop: 8 }}><Situacao l={l} /></div>
        </div>

        <div>
          <p className="overline" style={{ margin: '0 0 6px' }}>Trilha</p>
          {erro && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm-sz)', margin: 0 }}>{erro}</p>}
          {!erro && !trilha && <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)', margin: 0 }}>Carregando…</p>}
          {trilha && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {trilha.eventos.map((e, i) => (
                <li key={i} style={{
                  display: 'flex', gap: 12, padding: '8px 0', fontSize: 'var(--text-sm-sz)',
                  borderBottom: i < trilha.eventos.length - 1 ? '1px solid var(--hairline)' : 'none',
                }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: 112, whiteSpace: 'nowrap' }}>{diaEHora(e.quando)}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{e.rotulo}</span>
                  {e.quem && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', textAlign: 'right' }}>{e.quem}</span>}
                </li>
              ))}
              {trilha.eventos.length === 0 && (
                <li style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)' }}>Nenhum passo registrado.</li>
              )}
            </ol>
          )}
        </div>

        {trilha?.assinatura && (
          <div className="card" style={{ padding: '12px 14px', background: 'var(--bg-app)' }}>
            <p className="overline" style={{ margin: '0 0 4px' }}>Assinatura</p>
            <p style={{ margin: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <strong>{trilha.assinatura.nome}</strong> · {trilha.assinatura.canal} · {diaEHora(trilha.assinatura.em)}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Identidade: {trilha.assinatura.identidade}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {l.situacao === 'ASSINADO' && (
            <a className="btn-secondary" href={`/api/documentos/${l.id}/pdf`} target="_blank" rel="noreferrer">Baixar PDF</a>
          )}
          {l.codigo && l.situacao === 'ASSINADO' && (
            <a className="btn-ghost" href={`/verificar/${l.codigo}`} target="_blank" rel="noreferrer">Verificar</a>
          )}
          <Link className="btn-primary" href={`${rotaCliente(pathname, l.slug, l.clienteId)}?aba=documentos`}>
            Abrir na ficha do cliente
          </Link>
        </div>
      </div>
    </JanelaModal>
  )
}

/**
 * A tela de Documentos (2026-10-14): todo termo e contrato emitido no período,
 * com a situação de cada um. Os números e a situação vêm do banco
 * (`documentos_emitidos`); a tela só desenha.
 */
export function PainelDeDocumentos(p: {
  escopo:   string
  periodo:  { chave: string; rotulo: string; de?: string; ate?: string }
  unidades: { id: string; nome: string }[] | null
  unidadeEscolhida: string | null
  filtros:  { situacao: SituacaoDoDocumento | null; tipo: string | null; busca: string | null }
  pagina:   number
  paginas:  number
  total:    number
  resumo:   ResumoDosDocumentos
  linhas:   LinhaDoPainel[]
  comUnidade: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [aberto, setAberto] = useState<LinhaDoPainel | null>(null)
  const ir = (mudar: Record<string, string | null>) => router.push(mesclarParams(searchParams, { ...mudar, pagina: mudar.pagina ?? null }))
  const gatilho = (ativo: boolean) => (ativo ? 'filtro-toggle is-ativo' : 'filtro-toggle')
  const inicio = p.total === 0 ? 0 : (p.pagina - 1) * 50 + 1
  const fim = (p.pagina - 1) * 50 + p.linhas.length
  const PERIODOS: readonly string[] = ['today', '7d', '15d', 'month', 'all', 'custom']
  const r = p.resumo

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
          ✦ {p.escopo}
        </p>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Documentos</h1>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Termos e contratos emitidos · {p.periodo.rotulo}
        </p>
      </div>
        <PeriodSelector
          current={(PERIODOS.includes(p.periodo.chave) ? p.periodo.chave : 'month') as Period}
          fromDate={p.periodo.de} toDate={p.periodo.ate}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Numero chave="abertos" rotulo="Aguardando assinatura" valor={r.abertos} hero
          detalhe={r.faltamDados ? `${r.faltamDados} sem os dados do cadastro` : undefined} />
        <Numero chave="a-enviar" rotulo="A enviar" valor={r.aEnviar} detalhe="ninguém mandou ainda" />
        <Numero chave="enviados" rotulo="Enviados" valor={r.enviados} detalhe="esperando o cliente" />
        <Numero chave="assinados" rotulo="Assinados" valor={r.assinados} detalhe={`de ${r.total.toLocaleString('pt-BR')} emitidos`} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <BuscaNaUrl inicial={p.filtros.busca ?? ''} placeholder="Buscar cliente ou documento…" rotulo="Buscar documentos" />
          <PickerCompacto
            rotuloBotao={p.filtros.situacao ? ROTULO_DA_SITUACAO[p.filtros.situacao] : 'Situação'}
            opcoes={[{ valor: '', rotulo: 'Todas' }, ...SITUACOES.map(s => ({ valor: s, rotulo: ROTULO_DA_SITUACAO[s] }))]}
            selecionadas={[p.filtros.situacao ?? '']}
            textoListaVazia="" larguraPainel={200}
            classeBotao={gatilho(!!p.filtros.situacao)}
            onEscolher={v => ir({ situacao: v || null })}
          />
          <PickerCompacto
            rotuloBotao={p.filtros.tipo ? ROTULO_DO_TIPO_DE_DOCUMENTO[p.filtros.tipo as keyof typeof ROTULO_DO_TIPO_DE_DOCUMENTO] : 'Tipo'}
            opcoes={[{ valor: '', rotulo: 'Todos' }, ...TIPOS_DE_DOCUMENTO.map(t => ({ valor: t, rotulo: ROTULO_DO_TIPO_DE_DOCUMENTO[t] }))]}
            selecionadas={[p.filtros.tipo ?? '']}
            textoListaVazia="" larguraPainel={200}
            classeBotao={gatilho(!!p.filtros.tipo)}
            onEscolher={v => ir({ tipo: v || null })}
          />
          {p.unidades && (
            <PickerCompacto
              rotuloBotao={p.unidades.find(u => u.id === p.unidadeEscolhida)?.nome ?? 'Unidade'}
              opcoes={[{ valor: '', rotulo: 'Todas as unidades' }, ...p.unidades.map(u => ({ valor: u.id, rotulo: u.nome }))]}
              selecionadas={[p.unidadeEscolhida ?? '']}
              textoListaVazia="" larguraPainel={240}
              classeBotao={gatilho(!!p.unidadeEscolhida)}
              onEscolher={v => ir({ unidade: v || null })}
            />
          )}
        </div>

        {p.linhas.length === 0 ? (
          <p style={{ padding: '24px 16px', margin: 0, color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)' }}>
            Nenhum documento {p.filtros.situacao || p.filtros.tipo || p.filtros.busca ? 'com esses filtros' : 'emitido no período'}.
          </p>
        ) : (
          <div className="table-wrap">
            {/* No celular cada documento vira um bloco (cards-mobile), em vez
                de a tabela rolar dentro do card. */}
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm-sz)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Documento', 'Cliente', ...(p.comUnidade ? ['Unidade'] : []), 'Emitido', 'Envio', 'Situação'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', whiteSpace: 'nowrap',
                      fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.linhas.map((l, i) => (
                  <tr key={l.id} data-documento={l.id} data-situacao={l.situacao}
                    onClick={() => setAberto(l)}
                    style={{ cursor: 'pointer', borderBottom: i < p.linhas.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                    <td data-label="" style={{ padding: '12px 16px' }}>
                      <button type="button" onClick={e => { e.stopPropagation(); setAberto(l) }} style={{
                        all: 'unset', cursor: 'pointer', fontWeight: 700, color: 'var(--text)',
                      }}>{l.titulo}</button>
                      <span style={{ display: 'block', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {ROTULO_DO_TIPO_DE_DOCUMENTO[l.tipo]}
                        {l.procedimento ? ` · ${l.procedimento}` : l.planoId ? ' · plano de tratamento' : ''}
                        {l.agendamentoEm ? ` · atendimento ${dia(l.agendamentoEm)}` : ''}
                        {l.exigencia === 'BLOQUEIA' && l.situacao !== 'ASSINADO' ? ' · bloqueia o atendimento' : ''}
                      </span>
                    </td>
                    <td data-label="Cliente" style={{ padding: '12px 16px' }}>{l.cliente ?? '—'}</td>
                    {p.comUnidade && <td data-label="Unidade" style={{ padding: '12px 16px' }}>{l.unidade ?? '—'}</td>}
                    <td data-label="Emitido" data-par style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{dia(l.criadoEm)}</td>
                    <td data-label="Envio" data-par style={{ padding: '12px 16px' }}><Envio l={l} /></td>
                    <td data-label="Situação" style={{ padding: '12px 16px' }}><Situacao l={l} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {p.paginas > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--hairline)' }}>
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{inicio}–{fim} de {p.total.toLocaleString('pt-BR')}</span>
            <button type="button" className="btn-ghost" disabled={p.pagina <= 1}
              onClick={() => ir({ pagina: p.pagina - 1 > 1 ? String(p.pagina - 1) : null })}>Anterior</button>
            <button type="button" className="btn-ghost" disabled={p.pagina >= p.paginas}
              onClick={() => ir({ pagina: String(p.pagina + 1) })}>Próxima</button>
          </div>
        )}
      </div>

      {aberto && <JanelaDoDocumento l={aberto} onFechar={() => setAberto(null)} />}
    </div>
  )
}
