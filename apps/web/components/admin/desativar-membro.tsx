'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { deactivateTeamMember, pendenciasParaDesativar, marcarUnidadeNoAtende } from '@/actions/team'
import type { PendenciasDoMembro, AgendamentoParaRepassar } from '@/lib/equipe/repasse'
import { useFuso } from '@/components/shared/fuso'
import { Dica } from '@/components/shared/dica'
import { rotuloDoDesativar, linhasDoRodapeDoDesativar, quemNaoEstaLivre } from '@/lib/equipe/textos-do-cadastro'

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
/** "Cancelar este agendamento" (A10 da 8ª simulação): o que não se repassa também se cancela aqui. */
export const CANCELAR = '__cancelar__'

const quando = (iso: string, fuso = 'America/Sao_Paulo') => new Date(iso).toLocaleString('pt-BR', {
  timeZone: fuso, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function DesativarMembro({ membroId, nome, redirectPath, atende = true }: {
  membroId: string; nome: string; redirectPath: string
  /** A21 da 17ª: quem não atende nunca esteve na agenda — o texto não diz que sai dela. */
  atende?: boolean
}) {
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
  const idDoTodos = useId()

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

  // A29 da 18ª: marcar quem atende pela Equipe (em outra aba) e voltar à janela
  // sem perder o que já foi escolhido: só a lista de quem atende é lida de novo.
  const [atualizando, setAtualizando] = useState(false)
  async function atualizarALista() {
    setAtualizando(true); setErroCarga(null)
    try {
      const r = await pendenciasParaDesativar(membroId)
      if ('error' in r) setErroCarga(r.error)
      else setDados(r)
    } catch {
      setErroCarga('Não consegui conferir o que fica com esta pessoa.')
    } finally {
      setAtualizando(false)
    }
  }

  function repassarTodosAg(pessoa: string) {
    setTodosAg(pessoa)
    if (!dados) return
    const nomeDela = dados.quemAtende.find(p => p.id === pessoa)?.nome ?? ''
    const para: Record<string, string> = {}
    const avisos: Record<string, string> = {}
    for (const a of dados.agendamentos) {
      if (!pessoa) { para[a.id] = ''; continue }
      if (pessoa === CANCELAR) { para[a.id] = CANCELAR; continue }
      if (a.livres.some(p => p.id === pessoa)) para[a.id] = pessoa
      else {
        para[a.id] = ''
        avisos[a.id] = a.ocupadas.some(p => p.id === pessoa)
          ? `${nomeDela} já tem atendimento nesse horário: escolha outra pessoa.`
          : (a.bloqueadas ?? []).some(p => p.id === pessoa)
            ? `${nomeDela} está com o horário bloqueado: escolha outra pessoa.`
            // R15 (o Heitor, 26/11: "quem está fora do horário também some das listas").
            : (a.foraDoHorario ?? []).some(p => p.id === pessoa)
              ? `${nomeDela} está fora do horário de atendimento nesse horário: escolha outra pessoa.`
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
      agendamentos: Object.entries(paraAg).filter(([, p]) => p && p !== CANCELAR).map(([id, p]) => ({ id, para: p })),
      cancelar: Object.entries(paraAg).filter(([, p]) => p === CANCELAR).map(([id]) => id),
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
  const rodape = linhasDoRodapeDoDesativar({
    agendamentosRepassados: Object.values(paraAg).filter(p => p && p !== CANCELAR).length,
    agendamentosCancelados: Object.values(paraAg).filter(p => p === CANCELAR).length,
    oportunidadesRepassadas: Object.values(paraOp).filter(Boolean).length,
  })
  const vencidos = dados?.agendamentos.filter(a => a.vencido).length ?? 0
  // A19 da 15ª (princípios 6 e 3): o padrão segue "sem repasse", e o Desativar diz o que fica com ela.
  const ficamAg = dados?.agendamentos.filter(a => !paraAg[a.id]).length ?? 0
  const ficamOp = dados?.oportunidades.filter(o => !paraOp[o.id]).length ?? 0
  const ficaCom = [
    ficamAg ? `${ficamAg} ${ficamAg === 1 ? 'agendamento' : 'agendamentos'}` : '',
    ficamOp ? `${ficamOp} ${ficamOp === 1 ? 'oportunidade' : 'oportunidades'}` : '',
  ].filter(Boolean).join(' e ')

  return (
    <>
      {/* A3 da 8ª simulação: o ícone sozinho, o último da linha, se confundia com os outros. */}
      <button type="button" className="btn-ghost" title="Desativar membro" aria-label="Desativar membro"
        style={{ padding: '5px 8px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs-sz)' }} onClick={abrir}>
        <UserMinus size={14} /> Desativar
      </button>
      {aberta && (
        <JanelaModal rotulo="Desativar membro?" largura={560} travado={fazendo} fechaNoFundo={false} onFechar={() => setAberta(false)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Desativar membro?</h2>
            <p style={texto}>
              <strong style={{ color: 'var(--text)' }}>{nome}</strong> não entra mais no sistema{atende ? ', e sai da agenda' : ''}. Dá para reativar depois.
            </p>
            {/* A11 (princípio 3): a comissão não se repassa — fica no nome da pessoa, a pagar, e a linha diz onde se vê. */}
            <p data-comissao-em-aberto style={texto}>
              A comissão em aberto continua no nome de {nome}, a pagar: aparece em Financeiro → Comissões.
            </p>

            {!dados && !erroCarga && <p style={texto}>Conferindo o que fica com {nome}…</p>}
            {erroCarga && <p role="alert" style={{ ...texto, color: 'var(--danger)' }}>{erroCarga}</p>}

            {dados && dados.agendamentos.length > 0 && (
              <section data-repasse="agendamentos" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={titulo}>Agendamentos em aberto ({dados.agendamentos.length})</h3>
                {/* A10 da 8ª: o que fica com a pessoa, dito antes — os vencidos inclusive.
                    A7 da 14ª: neutro de gênero (a equipe tem homens). */}
                <p data-o-que-fica style={texto}>
                  O que ficar sem repasse continua no nome de {nome}: a pessoa desativada sai da lista de quem atende, e
                  alguém precisa remarcar, cancelar ou fechar pela agenda.
                  {vencidos > 0 && <> {vencidos === 1 ? '1 já passou' : `${vencidos} já passaram`} sem ninguém fechar (marcar falta ou concluir).</>}
                </p>
                {!dados.podeRepassarAgendamentos ? (
                  <p style={texto}>Seu cargo não repassa agendamentos: eles ficam com {nome} até alguém com a Agenda em Gerenciar trocar quem atende.</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...texto }}>
                      {/* A7 da 14ª: o "todos para" é um atalho que preenche as linhas, não um
                          segundo repasse — o "como usar" mora na dica (2026-11-16). */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <label htmlFor={`${idDoTodos}-ag`}>Repassar todos os agendamentos para</label>
                        <Dica rotulo="Como funciona o repassar todos os agendamentos">
                          <span data-repassar-todos-explica>
                            Preenche todas as linhas abaixo de uma vez; depois, cada linha muda só aquele agendamento. Nada é gravado antes do “Desativar”.
                          </span>
                        </Dica>
                      </span>
                      <select id={`${idDoTodos}-ag`} className="filtro-select" value={todosAg} onChange={e => repassarTodosAg(e.target.value)}>
                        <option value="">Escolher um a um</option>
                        {dados.quemAtende.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        <option value={CANCELAR}>Cancelar todos</option>
                      </select>
                    </div>
                    <div>
                      {dados.agendamentos.map(a => (
                        <LinhaDoAgendamento key={a.id} a={a} nome={nome} valor={paraAg[a.id] ?? ''} aviso={avisoAg[a.id]} estilo={linha}
                          equipe={redirectPath} onAtualizar={atualizarALista} atualizando={atualizando}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...texto }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <label htmlFor={`${idDoTodos}-op`}>Repassar todas as oportunidades para</label>
                        <Dica rotulo="Como funciona o repassar todas as oportunidades">
                          Preenche todas as linhas abaixo de uma vez; depois, cada linha muda só aquela oportunidade.
                        </Dica>
                      </span>
                      <select id={`${idDoTodos}-op`} className="filtro-select" value={todosOp} onChange={e => repassarTodasOp(e.target.value)}>
                        <option value="">Escolher uma a uma</option>
                        <option value={SEM_RESPONSAVEL}>Sem responsável</option>
                        {dados.quemTemCrm.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
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

            {ficaCom && (
              <p data-fica-com style={{ ...texto, color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                {ficaCom} {ficamAg + ficamOp === 1 ? 'fica' : 'ficam'} com {nome}, que não entra mais.
              </p>
            )}
            {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* A9 da 40ª: os agendamentos e as oportunidades, cada um na sua linha. */}
              {rodape.length > 0 && (
                <span style={{ ...texto, marginRight: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {rodape.map(l => <span key={l}>{l}</span>)}
                </span>
              )}
              <button type="button" className="btn-secondary" disabled={fazendo} onClick={() => setAberta(false)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={fazendo || (!dados && !erroCarga)} onClick={confirmar}>
                {/* A3 da 23ª: com o "todos para", quantos vão. */}
                {fazendo ? 'Um momento…' : rotuloDoDesativar({
                  todosParaAlguem: !!todosAg && todosAg !== CANCELAR,
                  repassados: Object.values(paraAg).filter(p => p && p !== CANCELAR).length,
                  total: dados?.agendamentos.length ?? 0,
                })}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}

/** Uma linha do repasse (o Desativar, e o "Atende" desmarcado — D3 da 9ª). */
export function LinhaDoAgendamento({ a, nome, valor, aviso, estilo, onEscolher, deNovo = 'abra o Desativar de novo', equipe, onAtualizar, atualizando }: {
  a: AgendamentoParaRepassar; nome: string; valor: string; aviso?: string
  estilo: React.CSSProperties; onEscolher: (v: string) => void
  /** Como voltar a esta janela depois de marcar a unidade em outra pessoa. */
  deNovo?: string
  /** A29 da 18ª: a Equipe abre em outra aba, e a janela relê a lista sem fechar. */
  equipe?: string; onAtualizar?: () => void; atualizando?: boolean
}) {
  const fuso = useFuso()
  // A9 da 43ª: quem atende aqui e não está livre no horário, e por quê — a lista segue só com as livres (R14).
  const naoLivres = quemNaoEstaLivre(a)
  const ninguemLivre = naoLivres
    ? <>Ninguém livre que atenda nesta unidade: <span data-quem-nao-esta-livre>{naoLivres}</span>.</>
    : null
  return (
    <div data-agendamento={a.id} style={estilo}>
      <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        {quando(a.quando, fuso)} · {a.cliente}
        <span style={{ color: 'var(--text-muted)' }}> · {a.procedimento}{a.unidade ? ` · ${a.unidade}` : ''}</span>
        {a.vencido && <span className="chip chip-warning" style={{ marginLeft: 6 }}>já passou, sem fechar</span>}
      </span>
      <select className="filtro-select" aria-label={`Quem atende ${a.cliente} em ${quando(a.quando, fuso)}`} value={valor}
        onChange={e => onEscolher(e.target.value)}>
        <option value="">Deixar com {nome} (sem repasse)</option>
        {a.livres.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        {/* R13/R14/R15 (o Heitor, 26/11): quem não está livre no horário (ocupada, bloqueada, fora do horário) não aparece na lista. */}
        <option value={CANCELAR}>Cancelar este agendamento</option>
      </select>
      {aviso && <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>{aviso}</span>}
      {!a.livres.length && !aviso && (
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {/* A11 da 8ª: diz quem atende em outra unidade e como incluí-la. */}
          {a.emOutraUnidade.length
            ? <>{ninguemLivre ?? 'Ninguém livre que atenda nesta unidade.'} Atende{a.emOutraUnidade.length > 1 ? 'm' : ''} em outra unidade:{' '}
                {a.emOutraUnidade.map(p => `${p.nome} (${p.unidades.join(', ')})`).join('; ')}.
                {/* 18ª A29 (resto): marca a unidade no "Atende" dela daqui mesmo, pelo núcleo da Equipe. */}
                {equipe && onAtualizar && a.unidadeId && (
                  <MarcarNoAtende pessoas={a.emOutraUnidade} unidade={a.unidade} unidadeId={a.unidadeId} equipe={equipe} onMarcou={onAtualizar} />
                )}
                {' '}Ou marque o “Atende clientes” (com mais de uma unidade, “{a.unidade}” em “Escolher em quais
                unidades atende”) no lápis dela na{' '}
                {equipe && onAtualizar
                  ? <>
                      <a data-abrir-equipe href={equipe} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 'var(--weight-semibold)' }}>Equipe (abre em outra aba)</a>
                      , e volte aqui:{' '}
                      <button type="button" className="btn-ghost" disabled={atualizando} onClick={onAtualizar}
                        style={{ padding: '2px 6px', fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-semibold)' }}>
                        {atualizando ? 'Atualizando…' : 'Atualizar a lista'}
                      </button>
                      {' '}— ou cancele aqui.
                    </>
                  : <>Equipe, e {deNovo} — ou cancele aqui.</>}</>
            : ninguemLivre
              ? <>{ninguemLivre} Remarque pela agenda, ou cancele aqui.</>
              : 'Ninguém livre que atenda nesta unidade: remarque pela agenda, ou cancele aqui.'}
        </span>
      )}
    </div>
  )
}

/** 18ª A29 (resto): "Marcar <unidade> no Atende de X" — e a lista do repasse se relê. */
function MarcarNoAtende({ pessoas, unidade, unidadeId, equipe, onMarcou }: {
  pessoas: { id: string; nome: string }[]; unidade: string; unidadeId: string; equipe: string; onMarcou: () => void
}) {
  const [marcando, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '6px 0' }}>
      {pessoas.map(p => (
        <button key={p.id} type="button" data-marcar-no-atende={p.id} className="btn-secondary" disabled={marcando}
          style={{ fontSize: 'var(--text-xs-sz)', padding: '4px 10px' }}
          onClick={() => {
            setErro(null)
            iniciar(async () => {
              const r = await marcarUnidadeNoAtende(p.id, unidadeId, equipe)
              if (r.error) { setErro(r.error); return }
              onMarcou()
            })
          }}>
          {marcando ? 'Marcando…' : `Marcar ${unidade} no Atende de ${p.nome}`}
        </button>
      ))}
      {erro && <span role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</span>}
    </span>
  )
}
