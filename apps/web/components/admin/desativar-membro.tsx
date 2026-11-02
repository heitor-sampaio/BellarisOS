'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { deactivateTeamMember, pendenciasParaDesativar } from '@/actions/team'
import type { PendenciasDoMembro, AgendamentoParaRepassar } from '@/lib/equipe/repasse'

/**
 * "Desativar membro?" com o REPASSE (H6, decisão do Heitor, 2026-11-01):
 * antes de confirmar, a janela diz quantos agendamentos futuros e quantas
 * oportunidades abertas ficam com a pessoa e oferece repassá-los — todos de
 * uma vez ("Repassar todos … para") ou um a um, ou deixar sem repasse.
 * O agendamento só oferece quem atende na unidade e está livre; quem está
 * ocupada aparece desligada, e o "todos para" avisa na linha que conflita.
 * As regras (e a conferência de novo ao gravar) estão em lib/equipe/repasse.ts.
 */

const SEM_RESPONSAVEL = '__sem__'

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function DesativarMembro({ membroId, nome, redirectPath }: { membroId: string; nome: string; redirectPath: string }) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [dados, setDados] = useState<PendenciasDoMembro | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [paraAg, setParaAg] = useState<Record<string, string>>({})
  const [avisoAg, setAvisoAg] = useState<Record<string, string>>({})
  const [paraOp, setParaOp] = useState<Record<string, string>>({})
  const [todosAg, setTodosAg] = useState('')
  const [todosOp, setTodosOp] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [fazendo, iniciar] = useTransition()

  async function carregar() {
    setDados(null); setErroCarga(null); setParaAg({}); setAvisoAg({}); setParaOp({}); setTodosAg(''); setTodosOp('')
    try {
      const r = await pendenciasParaDesativar(membroId)
      if ('error' in r) setErroCarga(r.error)
      else setDados(r)
    } catch {
      setErroCarga('Não consegui conferir o que fica com esta pessoa.')
    }
  }

  function abrir() { setErro(null); setAberta(true); void carregar() }

  function repassarTodosAg(pessoa: string) {
    setTodosAg(pessoa)
    if (!dados) return
    const nomeDela = dados.quemAtende.find(p => p.id === pessoa)?.nome ?? ''
    const para: Record<string, string> = {}
    const avisos: Record<string, string> = {}
    for (const a of dados.agendamentos) {
      if (!pessoa) { para[a.id] = ''; continue }
      if (a.livres.some(p => p.id === pessoa)) para[a.id] = pessoa
      else {
        para[a.id] = ''
        avisos[a.id] = a.ocupadas.some(p => p.id === pessoa)
          ? `${nomeDela} já tem atendimento nesse horário: escolha outra pessoa.`
          : `${nomeDela} não atende nesta unidade: escolha outra pessoa.`
      }
    }
    setParaAg(para); setAvisoAg(avisos)
  }

  function repassarTodasOp(pessoa: string) {
    setTodosOp(pessoa)
    if (!dados) return
    setParaOp(Object.fromEntries(dados.oportunidades.map(o => [o.id, pessoa])))
  }

  function confirmar() {
    setErro(null)
    const repasse = {
      agendamentos: Object.entries(paraAg).filter(([, p]) => p).map(([id, p]) => ({ id, para: p })),
      oportunidades: Object.entries(paraOp).filter(([, p]) => p).map(([id, p]) => ({ id, para: p === SEM_RESPONSAVEL ? null : p })),
    }
    iniciar(async () => {
      try {
        const r = await deactivateTeamMember(membroId, redirectPath, repasse)
        if (r?.error) { setErro(r.error); await carregar(); return }
        setAberta(false)
        router.refresh()
      } catch {
        setErro('Não deu certo. Tente de novo.')
      }
    })
  }

  const titulo = { fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' } as const
  const texto  = { fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 } as const
  const linha  = { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderTop: '1px solid var(--border)' } as const
  const repassados = Object.values(paraAg).filter(Boolean).length + Object.values(paraOp).filter(Boolean).length

  return (
    <>
      <button type="button" className="btn-ghost" title="Desativar membro" aria-label="Desativar membro"
        style={{ padding: '5px 8px', color: 'var(--text-faint)' }} onClick={abrir}>
        <UserMinus size={15} />
      </button>
      {aberta && (
        <JanelaModal rotulo="Desativar membro?" largura={560} travado={fazendo} fechaNoFundo={false} onFechar={() => setAberta(false)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Desativar membro?</h2>
            <p style={texto}>
              <strong style={{ color: 'var(--text)' }}>{nome}</strong> não entra mais no sistema, e sai da agenda. Dá para reativar depois.
            </p>

            {!dados && !erroCarga && <p style={texto}>Conferindo o que fica com {nome}…</p>}
            {erroCarga && <p role="alert" style={{ ...texto, color: 'var(--danger)' }}>{erroCarga}</p>}

            {dados && dados.agendamentos.length > 0 && (
              <section data-repasse="agendamentos" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={titulo}>Agendamentos futuros ({dados.agendamentos.length})</h3>
                {!dados.podeRepassarAgendamentos ? (
                  <p style={texto}>Seu cargo não repassa agendamentos: eles ficam com {nome} até alguém com a Agenda em Gerenciar trocar a profissional.</p>
                ) : (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...texto }}>
                      Repassar todos os agendamentos para
                      <select className="filtro-select" value={todosAg} onChange={e => repassarTodosAg(e.target.value)}>
                        <option value="">Escolher um a um</option>
                        {dados.quemAtende.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </label>
                    <div>
                      {dados.agendamentos.map(a => (
                        <LinhaDoAgendamento key={a.id} a={a} nome={nome} valor={paraAg[a.id] ?? ''} aviso={avisoAg[a.id]} estilo={linha}
                          onEscolher={v => { setParaAg(x => ({ ...x, [a.id]: v })); setAvisoAg(x => ({ ...x, [a.id]: '' })) }} />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {dados && dados.oportunidades.length > 0 && (
              <section data-repasse="oportunidades" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={titulo}>Oportunidades abertas ({dados.oportunidades.length})</h3>
                {!dados.podeRepassarOportunidades ? (
                  <p style={texto}>Seu cargo não troca o responsável: elas ficam com {nome} até alguém com o CRM em Gerenciar trocar.</p>
                ) : (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...texto }}>
                      Repassar todas as oportunidades para
                      <select className="filtro-select" value={todosOp} onChange={e => repassarTodasOp(e.target.value)}>
                        <option value="">Escolher uma a uma</option>
                        <option value={SEM_RESPONSAVEL}>Sem responsável</option>
                        {dados.quemTemCrm.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </label>
                    <div>
                      {dados.oportunidades.map(o => (
                        <div key={o.id} data-oportunidade={o.id} style={linha}>
                          <span style={{ ...texto, color: 'var(--text)' }}>
                            {o.nome}{o.etapa && <span style={{ color: 'var(--text-muted)' }}> · {o.etapa}</span>}
                          </span>
                          <select className="filtro-select" aria-label={`Responsável por ${o.nome}`} value={paraOp[o.id] ?? ''}
                            onChange={e => setParaOp(x => ({ ...x, [o.id]: e.target.value }))}>
                            <option value="">Deixar com {nome} (sem repasse)</option>
                            <option value={SEM_RESPONSAVEL}>Sem responsável</option>
                            {dados.quemTemCrm.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {dados && !dados.agendamentos.length && !dados.oportunidades.length && (
              <p style={texto}>{nome} não tem agendamentos futuros nem oportunidades abertas.</p>
            )}

            {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              {repassados > 0 && <span style={{ ...texto, marginRight: 'auto' }}>{repassados} para repassar</span>}
              <button type="button" className="btn-secondary" disabled={fazendo} onClick={() => setAberta(false)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={fazendo || (!dados && !erroCarga)} onClick={confirmar}>
                {fazendo ? 'Um momento…' : 'Desativar'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}

function LinhaDoAgendamento({ a, nome, valor, aviso, estilo, onEscolher }: {
  a: AgendamentoParaRepassar; nome: string; valor: string; aviso?: string
  estilo: React.CSSProperties; onEscolher: (v: string) => void
}) {
  return (
    <div data-agendamento={a.id} style={estilo}>
      <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        {quando(a.quando)} · {a.cliente}
        <span style={{ color: 'var(--text-muted)' }}> · {a.procedimento}{a.unidade ? ` · ${a.unidade}` : ''}</span>
      </span>
      <select className="filtro-select" aria-label={`Quem atende ${a.cliente} em ${quando(a.quando)}`} value={valor}
        onChange={e => onEscolher(e.target.value)}>
        <option value="">Deixar com {nome} (sem repasse)</option>
        {a.livres.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        {a.ocupadas.map(p => <option key={p.id} value={p.id} disabled>{p.nome} (ocupada no horário)</option>)}
      </select>
      {aviso && <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>{aviso}</span>}
      {!a.livres.length && !aviso && (
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Ninguém livre que atenda nesta unidade: remarque pela agenda.</span>
      )}
    </div>
  )
}
