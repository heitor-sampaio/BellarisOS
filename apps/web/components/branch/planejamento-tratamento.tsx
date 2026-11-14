'use client'

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { rotaNoPortal } from '@/lib/rotas'
import { ClipboardList, Plus, ChevronLeft, Loader2, Send, CheckCircle2, UserPlus, UserCheck } from 'lucide-react'
import {
  getPlanosDoCliente, salvarPlanoNovo, salvarPlanoDoCliente, getPlanoParaEditar,
  proposeTreatmentPlan, aceitarPlano, vincularClienteAoPlano, buscarClientesParaPlano, getResumoDoPlano,
} from '@/actions/treatment-plans'
import type { FinanceiroDoPlano, LancamentoDoPlano } from '@/lib/metrics/plano'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { endOfDayTZ } from '@/lib/datetime'
import { TreatmentPlanEditor } from '@/components/branch/treatment-plan-editor'
import type { TreatmentProcedure, ExistingPlan, AvailableProduct, TreatmentPlanEditorRef } from '@/components/branch/treatment-plan-editor'
import { situacaoDoPlano, TEXTO_QUEM_MONTA } from '@/lib/plano-de-tratamento/situacao'
import { rodapeDoPlanoFechado } from '@/lib/plano-de-tratamento/textos'
import { CancelarPlano } from '@/components/shared/cancelar-pacote'
import { useFuso } from '@/components/shared/fuso'

/**
 * Planejamento de tratamento do CLIENTE.
 *
 * O plano nascia dentro de uma consulta de avaliação e só existia ali: não dava
 * para planejar antes, revisar depois nem abrir durante outro atendimento. Aqui
 * ele é do cliente — vários ao longo do tempo, criados de onde fizer sentido.
 *
 * O mesmo componente serve à aba do perfil do cliente e ao atendimento: o que
 * muda é `appointmentId`, que registra de qual atendimento o plano saiu.
 */

interface PlanoItem {
  id:       string
  status:   string
  notes:    string | null
  criadoEm: string
  total:    number
  sessoes:  number
  origemId: string | null
}

// O nome de cada situação é UM (J-37): lib/plano-de-tratamento/situacao.

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PlanejamentoTratamento({
  clientId, branchId, slug, appointmentId = null, planIdInicial = null,
  procedures, availableProducts = [],
  podeEditar, podeReceber = false, abertoId, onAbrir, planoNaTela = false,
}: {
  /** Vazio quando o plano ainda não tem cliente — o caso da tela geral. */
  clientId:      string
  branchId:      string
  slug:          string
  /** Atendimento de onde o planejamento está sendo aberto — só a origem. */
  appointmentId?: string | null
  /** Abre direto neste plano, em vez de listar os do cliente. */
  planIdInicial?: string | null
  procedures:    TreatmentProcedure[]
  availableProducts?: AvailableProduct[]
  podeEditar:    boolean
  podeReceber?:  boolean
  /**
   * Qual plano está aberto, decidido de fora. Com `onAbrir` presente, quem
   * manda é o pai — é assim que a ficha do cliente guarda o plano na URL e
   * devolve o voltar do aparelho.
   */
  abertoId?:     string | null
  onAbrir?:      (planId: string | null) => void
  /**
   * Aberto por cima da avaliação, que já tem o editor do plano NA TELA: um
   * "Novo plano" aqui seria o segundo "Nova sessão" do mesmo gesto (A29,
   * 2026-10-27). A lista e os planos que existem continuam.
   */
  planoNaTela?:  boolean
}) {
  const fuso = useFuso()
  const router   = useRouter()

  /**
   * Controlado quando o pai passa `onAbrir`; senão o estado é daqui.
   *
   * `planIdInicial` continua servindo à rota do plano (`/planejamentos/<id>`),
   * onde não há lista por trás e o plano é a própria tela.
   */
  const controlado = typeof onAbrir === 'function'
  const idPedido   = controlado ? (abertoId ?? null) : planIdInicial

  const [planosLidos, setPlanos]  = useState<PlanoItem[] | null>(null)
  // Sem cliente não há lista: a tela geral já passa o plano a abrir.
  const planos = clientId ? planosLidos : []
  const [aberto,    setAberto]    = useState<ExistingPlan | null>(null)
  // D4 da 14ª (F73): o plano aberto traz o catálogo da unidade DELE; o novo
  // usa o da tela (a unidade em que ele vai nascer).
  const [catalogoDoPlano, setCatalogoDoPlano] = useState<TreatmentProcedure[] | null>(null)
  // Nasce carregando quando há plano pedido; o efeito abaixo o busca.
  const [carregando, setCarregando] = useState(!!idPedido)
  const [salvando,  setSalvando]   = useState(false)
  const [erro,      setErro]       = useState<string | null>(null)
  // A24 da 14ª: o erro do "Aceitar plano" (e do "Cliente vai pensar") aparece
  // JUNTO do botão — no topo, a Débora não o via.
  const [erroDoBotao, setErroDoBotao] = useState<string | null>(null)

  // Vínculo com cliente — um plano pode nascer só com nome e ganhar dono depois.
  const [ligando,       setLigando]       = useState(false)
  const [termoCliente,  setTermoCliente]  = useState('')
  const [achados,       setAchados]       = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [clienteLigado, setClienteLigado] = useState<{ id: string; nome: string } | null>(null)
  const termoRef = useRef("")
  // A29 da 12ª: aceitar (ou mandar à recepção) usa o que está na tela — o editor
  // é lido e salvo antes, como o "Enviar para a recepção" da avaliação já fazia.
  const editorRef = useRef<TreatmentPlanEditorRef>(null)
  async function salvarOQueEstaNaTela(): Promise<boolean> {
    if (!aberto || !editorRef.current) return true
    const res = await salvarPlanoDoCliente(aberto.id, editorRef.current.getSessions(), editorRef.current.getNotes())
    if (res.error) { setErroDoBotao(res.error); return false }
    return true
  }

  // A carga da lista que falhou (a action lança sem a Agenda, a rede caiu) vira
  // um aviso — nunca "Carregando planos…" para sempre (D6, 2026-11-01).
  const [listaFalhou, setListaFalhou] = useState(false)

  const carregarLista = useCallback(async () => {
    if (!clientId) return
    try {
      const res = await getPlanosDoCliente(clientId)
      setPlanos(res.planos); setListaFalhou(false)
    } catch {
      setListaFalhou(true)
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let vivo = true
    getPlanosDoCliente(clientId)
      .then(res => { if (vivo) setPlanos(res.planos) })
      .catch(() => { if (vivo) setListaFalhou(true) })
    return () => { vivo = false }
  }, [clientId])

  // O pedido de abrir mudou: ajustado durante o render, guardando o anterior.
  const [pedidoVisto, setPedidoVisto] = useState(idPedido)
  if (pedidoVisto !== idPedido) {
    setPedidoVisto(idPedido)
    if (!idPedido) {
      // Só o controlado fecha sozinho: no modo local, `setAberto(null)` já
      // aconteceu no clique, e reagir aqui apagaria o que o pai não pediu.
      if (controlado) setAberto(null)
    } else if (aberto?.id !== idPedido) {
      setErro(null); setErroDoBotao(null); setCarregando(true)
    }
  }

  // Lido no efeito sem ser dependência dele: o plano aberto muda a cada
  // salvamento, e isso não é motivo para buscar de novo.
  const jaEstaAberto = useEffectEvent((id: string) => aberto?.id === id)

  useEffect(() => {
    if (!idPedido || jaEstaAberto(idPedido)) return
    let vivo = true
    getPlanoParaEditar(idPedido).then(res => { if (vivo) aplicarPlano(res) })
    return () => { vivo = false }
  }, [idPedido])

  /** Abrir/fechar passando por quem decide. */
  function pedirAbrir(planId: string | null) {
    if (controlado) { onAbrir!(planId); return }
    if (planId) void abrirPlano(planId)
    else setAberto(null)
  }

  function aplicarPlano(res: Awaited<ReturnType<typeof getPlanoParaEditar>>) {
    setCarregando(false)
    if (res.error || !res.plano) { setErro(res.error ?? 'Não foi possível abrir o plano.'); return }
    setCatalogoDoPlano(res.plano.catalogo)
    setAberto(res.plano as ExistingPlan)
  }

  async function abrirPlano(planId: string) {
    setErro(null); setErroDoBotao(null); setCarregando(true)
    aplicarPlano(await getPlanoParaEditar(planId))
  }

  // "Novo plano" abre o editor SEM gravar (2026-10-21, decisão do Heitor): o
  // plano nasce no primeiro "Salvar plano". O rascunho da tela não tem id.
  function novoPlano() {
    setErro(null)
    setAberto({ id: '', status: 'DRAFT', notes: null, sessions: [] })
  }
  const ehNovo = aberto?.id === ''

  /** Voltar à lista: o rascunho da tela só some; o plano salvo passa pelo pai. */
  function voltarALista() {
    setErro(null)
    if (ehNovo) { setAberto(null); return }
    pedirAbrir(null)
  }

  async function salvar(sessions: Parameters<typeof salvarPlanoDoCliente>[1], notes: string) {
    if (!aberto) return
    setErro(null); setSalvando(true)
    if (ehNovo) {
      const novo = await salvarPlanoNovo(clientId, branchId, appointmentId ?? null, sessions, notes)
      setSalvando(false)
      if (novo.error || !novo.planId) { setErro(novo.error ?? 'Não foi possível criar o plano.'); return }
      await carregarLista()
      if (controlado) onAbrir!(novo.planId)
      else await abrirPlano(novo.planId)
      return
    }
    const res = await salvarPlanoDoCliente(aberto.id, sessions, notes)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    await carregarLista()
  }

  async function enviarParaRecepcao() {
    if (!aberto) return
    setErro(null); setErroDoBotao(null); setSalvando(true)
    if (aberto.status === 'DRAFT' && !(await salvarOQueEstaNaTela())) { setSalvando(false); return }
    const res = await proposeTreatmentPlan(aberto.id, slug)
    setSalvando(false)
    if (res.error) { setErroDoBotao(res.error); return }
    await carregarLista()
    await abrirPlano(aberto.id)
  }

  /**
   * Busca de cliente, uma tecla por vez.
   *
   * `termoRef` descarta resposta atrasada: sem isso, a consulta de "De" chegava
   * depois da de "Demo 05" e a lista mostrava todo mundo de novo.
   */
  async function buscarClientes(termo: string) {
    setTermoCliente(termo)
    termoRef.current = termo
    if (termo.trim().length < 2) { setAchados([]); return }
    const res = await buscarClientesParaPlano(termo)
    if (termoRef.current !== termo) return
    setAchados(res.clientes)
  }

  async function ligarCliente(id: string, nome: string) {
    if (!aberto) return
    setErro(null); setSalvando(true)
    const res = await vincularClienteAoPlano(aberto.id, id)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setClienteLigado({ id, nome })
    setLigando(false); setTermoCliente(''); setAchados([])
    router.refresh()
  }

  /**
   * O aceite (PT1b, a revisão do Heitor de 2026-11-13): só "quero fazer", sem
   * dinheiro. A comanda do plano nasce no PDV, onde se escolhe a forma, a
   * cliente assina o contrato e se recebe.
   */
  async function aceitarAgora() {
    if (!aberto) return
    // Aceitar é quando vira venda: sem cliente não há a quem cobrar nem para
    // quem agendar. Em vez de recusar, pede o vínculo.
    if (!clienteLigado && !clientId) { setLigando(true); return }
    setErro(null); setErroDoBotao(null); setSalvando(true)
    if (aberto.status === 'DRAFT' && !(await salvarOQueEstaNaTela())) { setSalvando(false); return }
    const res = await aceitarPlano(aberto.id)
    setSalvando(false)
    if (res.error) { setErroDoBotao(res.error); return }
    await carregarLista()
    await abrirPlano(aberto.id)
    router.refresh()
  }

  // -- Lista -------------------------------------------------------------------
  if (!aberto) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {erro && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>{erro}</p>
      )}

      {planos === null ? (
        listaFalhou
          ? <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Não foi possível carregar os planos de tratamento.</p>
          : <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>Carregando planos…</p>
      ) : planos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-squircle)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={20} style={{ color: 'var(--text-faint)' }} />
          </div>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>Nenhum plano ainda</p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center', maxWidth: 320 }}>
            {podeEditar
              ? 'O plano de tratamento é do cliente: pode ser montado agora, revisado depois e fechado quando ele decidir.'
              // A18: sem o prontuário não há botão — a tela diz por quê e quem monta.
              : <>{TEXTO_QUEM_MONTA} Quando houver um, ele aparece aqui.</>}
          </p>
        </div>
      ) : (
        planos.map(p => {
          const st = situacaoDoPlano(p.status)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pedirAbrir(p.id)}
              className="card card-hover"
              style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
                    {p.sessoes} {p.sessoes === 1 ? 'sessão' : 'sessões'}
                  </span>
                  <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-chip-token)', color: st.cor, background: st.fundo }}>
                    {st.label}
                  </span>
                  {p.origemId && (
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>· de uma avaliação</span>
                  )}
                </div>
                {p.notes && (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.notes}
                  </p>
                )}
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 2 }}>
                  {new Date(p.criadoEm).toLocaleDateString('pt-BR', { timeZone: fuso })}
                </p>
              </div>
              <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>{fmtBRL(p.total)}</span>
            </button>
          )
        })
      )}

      {podeEditar && planoNaTela && (
        <p data-plano-na-tela style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Monte o plano desta avaliação na própria tela, em Tratamento.
        </p>
      )}
      {podeEditar && !planoNaTela && (
        <button type="button" onClick={novoPlano} disabled={carregando} className="btn-primary"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}>
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Novo plano
        </button>
      )}
    </div>
  )

  // -- Um plano aberto ---------------------------------------------------------
  const st       = situacaoDoPlano(aberto.status)
  const fechado  = aberto.status === 'ACCEPTED' || aberto.status === 'COMPLETED' || aberto.status === 'CANCELLED'
  const editavel = podeEditar && !fechado

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Na rota do plano (`planIdInicial` sem `onAbrir`) a tela É o plano: a
            página já tem o seu "Planejamentos", e este levaria a uma lista que
            não é a desta tela — a do cliente, dentro da tela do plano dele. */}
        {!(planIdInicial && !controlado) && (
          <button type="button" onClick={voltarALista} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }}>
            <ChevronLeft size={14} /> Planos
          </button>
        )}
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-chip-token)', color: st.cor, background: st.fundo }}>
          {st.label}
        </span>
      </div>

      {erro && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>{erro}</p>
      )}

      {/* Sem cliente: o plano existe pelo nome, e ganha dono quando houver um. */}
      {!clientId && podeEditar && !ehNovo && (
        <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clienteLigado ? (
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--success)' }}>
              <UserCheck size={14} /> Ligado a {clienteLigado.nome}
            </p>
          ) : ligando ? (
            <>
              <input
                className="field campo-busca"
                autoFocus
                placeholder="Buscar por nome, telefone ou CPF…"
                value={termoCliente}
                onChange={e => buscarClientes(e.target.value)}
              />
              {achados.map(c => (
                <button key={c.id} type="button" onClick={() => ligarCliente(c.id, c.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: '1px solid var(--border)', background: 'var(--surface)',
                  }}>
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
                  <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{c.phone ?? ''}</span>
                </button>
              ))}
              <button type="button" onClick={() => { setLigando(false); setTermoCliente(''); setAchados([]) }}
                className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 'var(--text-sm-sz)' }}>
                Cancelar
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                Este plano ainda não tem cliente. Aceitar exige um.
              </span>
              <button type="button" onClick={() => setLigando(true)} className="btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm-sz)' }}>
                <UserPlus size={14} /> Ligar a um cliente
              </button>
            </div>
          )}
        </div>
      )}

      {/* O editor é o mesmo da avaliação; aqui ele salva por planId, não por
          atendimento — daí `hideActions` e os botões abaixo. */}
      <TreatmentPlanEditor
        ref={editorRef}
        key={aberto.id}
        appointmentId=""
        slug={slug}
        procedures={!ehNovo && catalogoDoPlano ? catalogoDoPlano : procedures}
        availableProducts={availableProducts}
        existingPlan={aberto}
        hideActions
        branchId={branchId}
        onSalvarPorPlano={editavel ? salvar : undefined}
      />

      {editavel && ehNovo && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          O plano é criado ao salvar. Depois de salvo, ele pode ser aceito ou ficar para a cliente pensar.
        </p>
      )}

      {editavel && !ehNovo && (
        <div data-botoes-do-plano style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Aceitar deixou de depender do caixa: a profissional fecha o plano
              na sala e o valor fica em aberto, para ser recebido no check-in.
              Quem também opera caixa pode cobrar ali mesmo, no wizard. */}
          <button type="button" onClick={aceitarAgora} disabled={salvando} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Aceitar plano
          </button>
          {aberto.status === 'DRAFT' && (
            <button type="button" onClick={enviarParaRecepcao} disabled={salvando} className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}>
              <Send size={14} /> Cliente vai pensar
            </button>
          )}
          {erroDoBotao && <ErroDoBotao texto={erroDoBotao} />}
        </div>
      )}

      {/* Quem recebe e não escreve no plano aceita o plano proposto daqui,
          quando a cliente diz que quer (A44 da 5ª: a página do plano proposto
          não tinha o que fazer). O dinheiro é no PDV (PT1b). */}
      {!editavel && podeReceber && aberto.status === 'PROPOSED' && (
        <div data-botoes-do-plano style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={aceitarAgora} disabled={salvando} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Aceitar plano
          </button>
          <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            A cliente quer fazer? Aceite: a comanda do plano vai ao PDV, onde ela assina o contrato e paga.
          </span>
          {erroDoBotao && <ErroDoBotao texto={erroDoBotao} />}
        </div>
      )}

      {/* D4 da 12ª: o cancelado é um RETRATO — a data, quem, o motivo, o que
          foi devolvido e o que ficou (o `cancelamento` que o banco guarda). */}
      {(aberto.status === 'CANCELLED' || aberto.status === 'REJECTED') && (
        <div data-retrato-do-cancelamento className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
            {aberto.cancelamento?.quando ?? 'Plano cancelado.'}
          </p>
          {aberto.cancelamento?.motivo && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>Motivo: {aberto.cancelamento.motivo}</p>
          )}
          {(aberto.cancelamento?.linhas ?? []).map(l => (
            <p key={l} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{l}</p>
          ))}
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
            Só leitura: o plano cancelado não se edita. Para tratar de novo, monte um plano novo.
          </p>
        </div>
      )}

      {/* O plano fechado diz o que foi pago, o que falta e as sessões (J-42).
          Dizia só "O que estiver em aberto é recebido no check-in", e o
          check-in só cobra o que VENCEU. */}
      {/* D5 da 12ª: cancelado aqui, a tela relê o plano e a lista (o refresh não
          chega ao estado do navegador, e o "Cancelar plano" ficava na tela). */}
      {fechado && aberto.status !== 'CANCELLED' && (
        <ResumoDoPlano key={`resumo-${aberto.id}`} planId={aberto.id} slug={slug}
          onCancelado={() => { void carregarLista(); void abrirPlano(aberto.id) }} />
      )}


    </div>
  )
}

// -- O dinheiro e as sessões do plano fechado (J-42) ---------------------------

const diaNoFuso = (d: Date, fuso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)

function rotuloDoLancamento(l: LancamentoDoPlano): string {
  if (l.parcelaNumero && l.parcelaTotal) return `Parcela ${l.parcelaNumero}/${l.parcelaTotal}`
  if (/entrada/i.test(l.descricao ?? '')) return 'Entrada'
  return 'Pagamento'
}

function situacaoDoLancamento(l: LancamentoDoPlano, fuso = 'America/Sao_Paulo'): { texto: string; cor: string } {
  if (l.pago) {
    // O pagamento é um instante: o dia da unidade (F62b). O vencimento é âncora de
    // meio-dia −03 (data sem hora): cai no mesmo dia em todo fuso do Brasil (F64).
    const quando = l.pagoEm ? ` em ${diaNoFuso(new Date(l.pagoEm), fuso)}` : ''
    return { texto: `Pago${quando} · ${rotuloDaForma(l.forma, l.cartaoVezes)}`, cor: 'var(--success)' }
  }
  if (!l.vencimento) return { texto: 'A receber', cor: 'var(--warning)' }
  const venceu = new Date(l.vencimento).getTime() <= endOfDayTZ(new Date(), fuso).getTime()
  return venceu
    ? { texto: `Vencida em ${diaNoFuso(new Date(l.vencimento), fuso)} · cobrada no check-in`, cor: 'var(--danger)' }
    : { texto: `A vencer em ${diaNoFuso(new Date(l.vencimento), fuso)}`, cor: 'var(--text-muted)' }
}

function ResumoDoPlano({ planId, slug, onCancelado }: { planId: string; slug: string; onCancelado?: () => void }) {
  const fuso = useFuso()
  const pathname = usePathname()
  // PT1b: aceito e ainda não recebido — a comanda está no PDV.
  const [faltaReceber, setFaltaReceber] = useState<{ comandaId: string | null; branchId: string; podeReceber: boolean } | null>(null)
  const [resumo, setResumo] = useState<FinanceiroDoPlano | null>(null)
  // A28 da 9ª: a quem a recepção sem o Financeiro pede a parcela que vence depois.
  const [quemRecebe, setQuemRecebe] = useState<string[] | null>(null)
  // A27 da 10ª: o "Cancelar plano" também aqui, e a quem pedir para quem não pode.
  const [cancelamento, setCancelamento] = useState<{ cancelavel: boolean; podeCancelar: boolean }>({ cancelavel: false, podeCancelar: false })
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    getResumoDoPlano(planId)
      .then(res => { if (vivo) { if (res.resumo) { setResumo(res.resumo); setFaltaReceber(res.faltaReceber ?? null); setQuemRecebe(res.quemRecebe ?? null); setCancelamento({ cancelavel: !!res.cancelavel, podeCancelar: !!res.podeCancelar }) } else setErro(res.error ?? 'Não foi possível ler o plano.') } })
      .catch(() => { if (vivo) setErro('Não foi possível ler o pagamento do plano.') })
    return () => { vivo = false }
  }, [planId])

  if (erro) return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>
  if (!resumo) return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando o pagamento do plano…</p>

  const { sessoes } = resumo
  // Hierarquia por preenchimento: o número que pede ação é o preenchido.
  const destaque = resumo.aReceber > 0 ? 'aReceber' : 'recebido'
  const caixa = (chave: 'valor' | 'recebido' | 'aReceber', titulo: string, valor: number, attr: Record<string, string>) => {
    const cheio = destaque === chave
    return (
      <div style={{
        flex: '1 1 140px', padding: '10px 14px', borderRadius: 'var(--radius-field-token)',
        background: cheio ? 'var(--brand)' : 'var(--surface)', border: cheio ? 'none' : '1px solid var(--border)',
      }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: cheio ? 'var(--on-brand)' : 'var(--text-faint)' }}>{titulo}</p>
        <p {...attr} style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.02em', color: cheio ? 'var(--on-brand)' : 'var(--text)' }}>{fmtBRL(valor)}</p>
      </div>
    )
  }

  return (
    <div data-resumo-do-plano className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {faltaReceber && (
        <div data-plano-falta-receber style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)' }}>
          <p style={{ flex: 1, minWidth: 220, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            <b>Plano aceito. Falta receber:</b> a comanda do plano está no PDV — lá se escolhe a forma, a cliente assina o contrato e paga.
          </p>
          {faltaReceber.podeReceber && (
            <Link className="btn-primary" style={{ textDecoration: 'none' }}
              href={`${rotaNoPortal(pathname, slug, '/pdv')}?unidade=${faltaReceber.branchId}${faltaReceber.comandaId ? `&comanda=${faltaReceber.comandaId}` : ''}`}>
              Receber no PDV
            </Link>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {caixa('valor', 'Valor do plano', resumo.valor, { 'data-plano-valor': '' })}
        {caixa('recebido', 'Recebido', resumo.recebido, { 'data-plano-recebido': '' })}
        {caixa('aReceber', 'A receber', resumo.aReceber, { 'data-plano-a-receber': '' })}
      </div>

      <p data-plano-sessoes style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
        {sessoes.feitas} de {sessoes.total} {sessoes.total === 1 ? 'sessão feita' : 'sessões feitas'}
        {sessoes.agendadas > 0 && <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}> · {sessoes.agendadas} {sessoes.agendadas === 1 ? 'agendada' : 'agendadas'}</span>}
      </p>

      {resumo.lancamentos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {resumo.lancamentos.map(l => {
            const sit = situacaoDoLancamento(l, fuso)
            return (
              <div key={l.id} data-lancamento-do-plano style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', minWidth: 96 }}>{rotuloDoLancamento(l)}</span>
                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{fmtBRL(l.valor)}</span>
                <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: sit.cor, marginLeft: 'auto' }}>{sit.texto}</span>
              </div>
            )
          })}
        </div>
      )}

      <p data-rodape-do-plano style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)', color: resumo.aReceber > 0 ? 'var(--text-muted)' : 'var(--success)', fontWeight: 600 }}>
        <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
        {rodapeDoPlanoFechado(resumo.aReceber, quemRecebe)}
      </p>

      {cancelamento.cancelavel && (cancelamento.podeCancelar ? (
        <button type="button" className="btn-secondary" data-cancelar-plano onClick={() => setCancelando(true)} style={{ alignSelf: 'flex-start' }}>
          Cancelar plano
        </button>
      ) : quemRecebe && (
        <p data-quem-cancela-o-plano style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Cancelar o plano é de quem tem o Financeiro em Gerenciar
          {quemRecebe.length > 0 ? `: ${quemRecebe.join(', ')}.` : ' (ninguém na equipe tem hoje: veja em Configurações → Cargos).'}
        </p>
      ))}
      {cancelando && <CancelarPlano planId={planId} onFechar={() => setCancelando(false)} onCancelado={onCancelado} />}
    </div>
  )
}

/** O erro do botão, junto dele (A24 da 14ª) — o mesmo desenho do erro do topo. */
function ErroDoBotao({ texto }: { texto: string }) {
  return (
    <p data-erro-do-botao role="alert" style={{ flexBasis: '100%', fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>
      {texto}
    </p>
  )
}
