'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  X, History, FlaskConical, ChevronRight, ChevronDown,
  CheckCircle2, AlertCircle, Clock, CircleSlash, RefreshCw,
} from 'lucide-react'
import {
  listarExecucoes, passosDaExecucao, ensaiarAutomacao,
  type ExecucaoNaLista, type PassoDaExecucao,
} from '@/actions/automacoes'
import { ROTULOS } from '@/lib/automacoes/validar'
import type { TipoDeNo } from '@estetica-os/types'

/**
 * O histórico de execuções — e o ensaio.
 *
 * Existe para uma pergunta só, a mesma que o painel de eventos responde um
 * nível abaixo: **por que não aconteceu?** Sem o passo a passo, a resposta é
 * palpite — a condição estava invertida? o cliente não tinha telefone? a
 * janela de 24h fechou? Cada passo diz o que decidiu.
 *
 * O ensaio percorre o fluxo com um fato REAL da corrente e **não executa nada**:
 * é a diferença entre conferir uma automação e descobrir que ela estava errada
 * pela mensagem que o cliente recebeu.
 */

const ICONE_STATUS: Record<string, { icone: React.ReactNode; cor: string; rotulo: string }> = {
  ok:        { icone: <CheckCircle2 size={13} />, cor: 'var(--success)',  rotulo: 'Concluída' },
  falhou:    { icone: <AlertCircle size={13} />,  cor: 'var(--danger)',         rotulo: 'Falhou' },
  esperando: { icone: <Clock size={13} />,        cor: 'var(--warning)',  rotulo: 'Esperando' },
  rodando:   { icone: <Clock size={13} />,        cor: 'var(--warning)',  rotulo: 'Rodando' },
  parado:    { icone: <CircleSlash size={13} />,  cor: 'var(--text-muted)', rotulo: 'Interrompida' },
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export function PainelDeExecucoes({
  automacaoId, podeEditar, onFechar,
}: { automacaoId: string; podeEditar: boolean; onFechar: () => void }) {
  const [execucoes, setExecucoes] = useState<ExecucaoNaLista[]>([])
  const [ensaios, setEnsaios]     = useState(false)
  const [aberta, setAberta]       = useState<string | null>(null)
  const [passos, setPassos]       = useState<PassoDaExecucao[]>([])
  const [carregando, agir]        = useTransition()

  const recarregar = useCallback((incluirEnsaios: boolean) => {
    agir(async () => {
      const r = await listarExecucoes(automacaoId, { incluirEnsaios })
      if (r.error) { toast.error(r.error); return }
      setExecucoes(r.execucoes)
    })
  }, [automacaoId])

  useEffect(() => { recarregar(ensaios) }, [recarregar, ensaios])

  function abrir(id: string) {
    if (aberta === id) { setAberta(null); return }
    setAberta(id)
    agir(async () => {
      const r = await passosDaExecucao(id)
      if (r.error) { toast.error(r.error); return }
      setPassos(r.passos)
    })
  }

  function ensaiar() {
    agir(async () => {
      const r = await ensaiarAutomacao(automacaoId)
      if (r.error) { toast.error(r.error); return }
      toast.success('Ensaio feito — nada aconteceu de verdade.')
      setEnsaios(true)
      const lista = await listarExecucoes(automacaoId, { incluirEnsaios: true })
      setExecucoes(lista.execucoes)
      if (r.runId) abrir(r.runId)
    })
  }

  return (
    <aside
      className="auto-gaveta"
      aria-label="Execuções da automação"
      style={{
        width: 360, flexShrink: 0, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--hairline)', gap: 8,
      }}>
        <span style={{
          fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <History size={15} /> Execuções
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button" onClick={() => recarregar(ensaios)} className="btn-ghost"
            aria-label="Atualizar" style={{ padding: 4 }} disabled={carregando}
          >
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {podeEditar && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <button
            type="button" onClick={ensaiar} disabled={carregando}
            className="btn-secondary"
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            <FlaskConical size={14} /> Ensaiar com o último fato
          </button>
          <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.5 }}>
            Percorre o fluxo com um evento que <strong>realmente aconteceu</strong> e
            mostra o caminho — sem mandar mensagem, mover etapa nem gravar nada.
            Funciona com a automação desligada.
          </p>
        </div>
      )}

      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        padding: '10px 16px', borderBottom: '1px solid var(--hairline)',
      }}>
        <input
          type="checkbox" checked={ensaios}
          onChange={e => setEnsaios(e.target.checked)}
          style={{ accentColor: 'var(--brand)', width: 14, height: 14 }}
        />
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
          Mostrar também os ensaios
        </span>
      </label>

      <div style={{ flex: 1 }}>
        {execucoes.length === 0 ? (
          <p style={{
            padding: '28px 20px', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', lineHeight: 1.6,
          }}>
            {carregando ? 'Carregando…' : 'Esta automação ainda não rodou.'}
          </p>
        ) : execucoes.map(ex => {
          const s = ICONE_STATUS[ex.status] ?? ICONE_STATUS.parado!
          const expandida = aberta === ex.id

          return (
            <div key={ex.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
              <button
                type="button" onClick={() => abrir(ex.id)}
                style={{
                  width: '100%', display: 'flex', gap: 9, alignItems: 'flex-start',
                  padding: '11px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {expandida
                  ? <ChevronDown size={13} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-muted)' }} />
                  : <ChevronRight size={13} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-muted)' }} />}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      color: s.cor, fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                    }}>
                      {s.icone} {s.rotulo}
                    </span>
                    {ex.simulacao && <span className="chip chip-muted">ensaio</span>}
                  </div>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 3 }}>
                    {quando(ex.criadaEm)}{ex.sobre ? ` · ${ex.sobre}` : ''}
                  </p>
                  {ex.erro && (
                    <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', marginTop: 3, lineHeight: 1.45 }}>
                      {ex.erro}
                    </p>
                  )}
                </div>
              </button>

              {expandida && <Passos passos={passos} />}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

/**
 * O passo a passo de uma execução.
 *
 * Mostra o que cada node DECIDIU, não só que ele rodou: qual saída do IF, para
 * quem foi o aviso, por que a mensagem não saiu. É a diferença entre um log e
 * uma explicação.
 */
function Passos({ passos }: { passos: PassoDaExecucao[] }) {
  if (!passos.length) {
    return (
      <p style={{ padding: '0 16px 12px 38px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        Sem passos registrados.
      </p>
    )
  }

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: '0 16px 12px 38px' }}>
      {passos.map(p => {
        const s = ICONE_STATUS[p.status === 'ok' ? 'ok' : p.status === 'falhou' ? 'falhou' : 'esperando']!
        return (
          <li key={p.ordem} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 7 }}>
            <span style={{ color: s.cor, marginTop: 2, flexShrink: 0 }}>{s.icone}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                {ROTULOS[p.tipo as TipoDeNo] ?? p.tipo}
              </span>
              <p style={{
                fontSize: 'var(--text-overline)', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 1,
                wordBreak: 'break-word',
              }}>
                {descrever(p.resumo)}
                {p.ms != null && p.ms > 400 ? ` · ${p.ms}ms` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** O resumo de um passo em linguagem de gente. */
function descrever(resumo: Record<string, unknown>): string {
  if (!resumo || !Object.keys(resumo).length) return '—'

  // Os campos que carregam a decisão vêm primeiro e sozinhos: despejar o JSON
  // inteiro transferiria para quem lê a tarefa de garimpar o que importa.
  if (resumo.erro)     return String(resumo.erro)
  if (resumo.motivo)   return String(resumo.motivo)
  if (resumo.faria)    return `Faria: ${resumo.faria}`
  if (resumo.pulou)    return `Esperaria ${resumo.pulou}`
  if (resumo.resultado) return `Resultado: ${resumo.resultado}`
  if (resumo.saida)    return `Seguiu por "${resumo.saida}"`

  return Object.entries(resumo)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ') || '—'
}
