'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Plus, ChevronLeft, Loader2, Send, CreditCard, CheckCircle2, UserPlus, UserCheck } from 'lucide-react'
import {
  getPlanosDoCliente, criarPlanoDoCliente, salvarPlanoDoCliente, getPlanoParaEditar,
  proposeTreatmentPlan, getCheckoutPlan, vincularClienteAoPlano, buscarClientesParaPlano,
} from '@/actions/treatment-plans'
import { TreatmentPlanEditor } from '@/components/branch/treatment-plan-editor'
import type { TreatmentProcedure, ExistingPlan, AvailableProduct } from '@/components/branch/treatment-plan-editor'
import { CheckoutWizard, type CheckoutPlan } from '@/components/branch/checkout-wizard'

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

const STATUS_LABEL: Record<string, { label: string; cor: string; fundo: string }> = {
  DRAFT:     { label: 'Rascunho',   cor: 'var(--text-muted)', fundo: 'var(--bg-app)' },
  PROPOSED:  { label: 'Aguardando checkout', cor: '#92400e', fundo: '#fef3c7' },
  ACCEPTED:  { label: 'Fechado',    cor: '#1f6b47', fundo: '#f0faf4' },
  COMPLETED: { label: 'Concluído',  cor: '#1f6b47', fundo: '#f0faf4' },
  CANCELLED: { label: 'Cancelado',  cor: '#b91c1c', fundo: '#fef2f2' },
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PlanejamentoTratamento({
  clientId, branchId, slug, appointmentId = null, planIdInicial = null,
  procedures, availableProducts = [],
  podeEditar, podeReceber = false,
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
}) {
  const router   = useRouter()

  const [planos,    setPlanos]    = useState<PlanoItem[] | null>(null)
  const [aberto,    setAberto]    = useState<ExistingPlan | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [salvando,  setSalvando]   = useState(false)
  const [erro,      setErro]       = useState<string | null>(null)
  const [checkout,  setCheckout]   = useState<CheckoutPlan | null>(null)

  // Vínculo com cliente — um plano pode nascer só com nome e ganhar dono depois.
  const [ligando,       setLigando]       = useState(false)
  const [termoCliente,  setTermoCliente]  = useState('')
  const [achados,       setAchados]       = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [clienteLigado, setClienteLigado] = useState<{ id: string; nome: string } | null>(null)
  const termoRef = useRef("")

  const carregarLista = useCallback(async () => {
    // Sem cliente não há lista: a tela geral já passa o plano a abrir.
    if (!clientId) { setPlanos([]); return }
    const res = await getPlanosDoCliente(clientId)
    setPlanos(res.planos)
  }, [clientId])

  useEffect(() => { void carregarLista() }, [carregarLista])

  // Aberto direto num plano (vem da tela de Planejamentos).
  useEffect(() => {
    if (!planIdInicial) return
    void abrirPlano(planIdInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planIdInicial])

  async function abrirPlano(planId: string) {
    setErro(null); setCarregando(true)
    const res = await getPlanoParaEditar(planId)
    setCarregando(false)
    if (res.error || !res.plano) { setErro(res.error ?? 'Não foi possível abrir o plano.'); return }
    setAberto(res.plano as ExistingPlan)
  }

  async function novoPlano() {
    setErro(null); setCarregando(true)
    const res = await criarPlanoDoCliente(clientId, branchId, appointmentId)
    setCarregando(false)
    if (res.error || !res.planId) { setErro(res.error ?? 'Não foi possível criar o plano.'); return }
    await carregarLista()
    await abrirPlano(res.planId)
  }

  async function salvar(sessions: Parameters<typeof salvarPlanoDoCliente>[1], notes: string) {
    if (!aberto) return
    setErro(null); setSalvando(true)
    const res = await salvarPlanoDoCliente(aberto.id, sessions, notes)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    await carregarLista()
  }

  async function enviarParaRecepcao() {
    if (!aberto) return
    setErro(null); setSalvando(true)
    const res = await proposeTreatmentPlan(aberto.id, slug)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
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

  async function fecharAgora() {
    if (!aberto) return
    // Aceitar é quando vira venda: sem cliente não há a quem cobrar nem para
    // quem agendar. Em vez de recusar, pede o vínculo.
    if (!clienteLigado && !clientId) { setLigando(true); return }
    setErro(null); setSalvando(true)
    // Só plano proposto entra no checkout — é a regra da própria action.
    if (aberto.status === 'DRAFT') {
      const prop = await proposeTreatmentPlan(aberto.id, slug)
      if (prop.error) { setSalvando(false); setErro(prop.error); return }
    }
    const res = await getCheckoutPlan(aberto.id)
    setSalvando(false)
    if (res.error || !res.plan) { setErro(res.error ?? 'Não foi possível abrir o checkout.'); return }
    setCheckout(res.plan)
  }

  // -- Lista -------------------------------------------------------------------
  if (!aberto) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {erro && (
        <p style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{erro}</p>
      )}

      {planos === null ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando planos…</p>
      ) : planos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={20} style={{ color: 'var(--text-faint)' }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>Nenhum plano ainda</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center', maxWidth: 320 }}>
            O plano de tratamento é do cliente: pode ser montado agora, revisado depois e fechado quando ele decidir.
          </p>
        </div>
      ) : (
        planos.map(p => {
          const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.DRAFT!
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => abrirPlano(p.id)}
              className="card card-hover"
              style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                    {p.sessoes} sessão{p.sessoes !== 1 ? 'ões' : ''}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: st.cor, background: st.fundo }}>
                    {st.label}
                  </span>
                  {p.origemId && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· de uma avaliação</span>
                  )}
                </div>
                {p.notes && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.notes}
                  </p>
                )}
                <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                  {new Date(p.criadoEm).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>{fmtBRL(p.total)}</span>
            </button>
          )
        })
      )}

      {podeEditar && (
        <button type="button" onClick={novoPlano} disabled={carregando} className="btn-primary"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Novo plano
        </button>
      )}
    </div>
  )

  // -- Um plano aberto ---------------------------------------------------------
  const st       = STATUS_LABEL[aberto.status] ?? STATUS_LABEL.DRAFT!
  const fechado  = aberto.status === 'ACCEPTED' || aberto.status === 'COMPLETED' || aberto.status === 'CANCELLED'
  const editavel = podeEditar && !fechado

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={() => { setAberto(null); setErro(null) }} className="btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '5px 10px' }}>
          <ChevronLeft size={14} /> Planos
        </button>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: st.cor, background: st.fundo }}>
          {st.label}
        </span>
      </div>

      {erro && (
        <p style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{erro}</p>
      )}

      {/* Sem cliente: o plano existe pelo nome, e ganha dono quando houver um. */}
      {!clientId && podeEditar && (
        <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clienteLigado ? (
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#1f6b47' }}>
              <UserCheck size={14} /> Ligado a {clienteLigado.nome}
            </p>
          ) : ligando ? (
            <>
              <input
                className="field"
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.phone ?? ''}</span>
                </button>
              ))}
              <button type="button" onClick={() => { setLigando(false); setTermoCliente(''); setAchados([]) }}
                className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
                Cancelar
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Este plano ainda não tem cliente. Aceitar exige um.
              </span>
              <button type="button" onClick={() => setLigando(true)} className="btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <UserPlus size={14} /> Ligar a um cliente
              </button>
            </div>
          )}
        </div>
      )}

      {/* O editor é o mesmo da avaliação; aqui ele salva por planId, não por
          atendimento — daí `hideActions` e os botões abaixo. */}
      <TreatmentPlanEditor
        key={aberto.id}
        appointmentId=""
        slug={slug}
        procedures={procedures}
        availableProducts={availableProducts}
        existingPlan={aberto}
        hideActions
        onSalvarPorPlano={editavel ? salvar : undefined}
      />

      {editavel && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {podeReceber && (
            <button type="button" onClick={fecharAgora} disabled={salvando} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
              Fechar agora
            </button>
          )}
          {aberto.status === 'DRAFT' && (
            <button type="button" onClick={enviarParaRecepcao} disabled={salvando} className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <Send size={14} /> Enviar para a recepção
            </button>
          )}
        </div>
      )}

      {fechado && aberto.status !== 'CANCELLED' && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#1f6b47', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Plano fechado — o pagamento foi registrado no checkout.
        </p>
      )}

      {/* Checkout sobre o planejamento, como na tela do atendimento. */}
      {checkout && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(34,22,25,0.45)', zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
          onClick={() => setCheckout(null)}
        >
          <div className="card" style={{ width: 700, maxWidth: '100%', padding: '22px 24px' }} onClick={e => e.stopPropagation()}>
            <div className="esconde-impressao" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>Checkout</h3>
              <button type="button" onClick={() => setCheckout(null)} className="btn-ghost" style={{ padding: '6px 10px' }}>Fechar</button>
            </div>
            <CheckoutWizard
              plan={checkout}
              slug={slug}
              onDone={async () => {
                setCheckout(null)
                await carregarLista()
                await abrirPlano(aberto.id)
                router.refresh()
              }}
            />
          </div>
        </div>
      )}

    </div>
  )
}
