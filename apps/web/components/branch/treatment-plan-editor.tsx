'use client'

import { useState, useEffect, useEffectEvent, useTransition, forwardRef, useImperativeHandle } from 'react'
import { Plus, Trash2, Send, Save, Copy, ChevronDown, ChevronUp, FlaskConical, Package } from 'lucide-react'
import { saveTreatmentPlan, proposeTreatmentPlan, pacotesParaODicaDoPlano } from '@/actions/treatment-plans'
import { pacoteEquivalente, type PacoteParaComparar } from '@/lib/checkout/pacote-equivalente'
import type { PlanSessionInput } from '@/actions/treatment-plans'
import { situacaoDoPlano, TEXTO_QUEM_MONTA } from '@/lib/plano-de-tratamento/situacao'
import { Dica } from '@/components/shared/dica'
import { textoDeQuemConclui } from '@/lib/equipe/textos-de-quem-pode'
import type { RetratoDoCancelamento } from '@/lib/plano-de-tratamento/retrato-do-cancelamento'
import { CampoDoDesconto, contaDoDesconto, descontoDoEstado, type EstadoDoDesconto } from '@/components/shared/campo-do-desconto'
import { estadoDoCombinado, totalComOCombinado, type DescontoCombinado } from '@/lib/plano-de-tratamento/desconto-combinado'
import type { Desconto } from '@/lib/vendas/desconto'

export interface TreatmentPlanEditorRef {
  getSessions: () => PlanSessionInput[]
  getNotes:    () => string
  /** 22ª A20: o desconto do plano combinado no editor (nulo: sem desconto). */
  getDesconto: () => Desconto | null
}

// -- Tipos exportados ----------------------------------------------------------

export interface TreatmentProcedureProduct {
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

export interface TreatmentProcedure {
  id:          string
  name:        string
  category:    string
  price:       number
  durationMin: number
  products?:   TreatmentProcedureProduct[]
}

// Kept for backward compat with appointment-session.tsx
export interface TreatmentPackage {
  id:            string
  name:          string
  procedureId:   string
  totalSessions: number
  price:         number
}

export interface ExistingPlanSession {
  procedures: { procedureId: string; name: string; price: number; products?: TreatmentProcedureProduct[] }[]
}

export interface ExistingPlan {
  id:       string
  status:   string
  notes:    string | null
  sessions: ExistingPlanSession[]
  /** D4 da 12ª: o retrato do cancelado (getPlanoParaEditar). */
  cancelamento?: RetratoDoCancelamento | null
  /** 22ª A20: o desconto do plano combinado no editor. */
  descontoCombinado?: DescontoCombinado | null
  /** D8 da 28ª: o plano aceito já foi recebido (um lançamento vivo dele — `andamentoDosPlanos`). */
  recebido?: boolean
}

// Kept for backward compat with appointment-session.tsx state
export interface SerializedPlanItem {
  procedureId:      string
  servicePackageId: string | null
  sessions:         number
  unitPrice:        number
  products:         { productId: string; quantity: number }[]
}

// -- Tipos internos ------------------------------------------------------------

interface EditorProduct {
  localId:   string
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

interface EditorProc {
  localId:     string
  procedureId: string
  name:        string
  price:       number
  products:    EditorProduct[]
}

interface EditorSession {
  localId: string
  procs:   EditorProc[]
}

export interface AvailableProduct {
  id:   string
  name: string
  unit: string
}

interface Props {
  appointmentId: string
  slug:          string
  procedures:    TreatmentProcedure[]
  existingPlan:  ExistingPlan | null
  hideActions?:  boolean
  availableProducts?:   AvailableProduct[]
  // Kept for compat
  servicePackages?:     TreatmentPackage[]
  procedureProductsMap?: Record<string, unknown[]>
  onPlanChange?:        (items: SerializedPlanItem[], notes: string) => void
  /**
   * Modo planejamento do cliente: o plano já existe e não depende de
   * atendimento, então salvar é por planId — quem hospeda decide como.
   */
  onSalvarPorPlano?:    (sessions: PlanSessionInput[], notes: string) => Promise<void>
  /**
   * Escreve a anotação clínica (as "Observações de quem atende")? É do
   * Prontuário em Gerenciar (PT2, 2026-11-14): quem monta o plano sem ele vê a
   * anotação que existe (se o prontuário lhe mostra) e não a escreve — o
   * servidor também não a grava.
   */
  podeAnotar?:          boolean
  /**
   * Monta o plano: o Atendimento em Gerenciar na unidade (UM3, `montaPlano`).
   * Sem ele, o editor só mostra o plano que existe — sem "Nova sessão",
   * "Adicionar procedimento" nem as lixeiras (CLAUDE.md §14).
   */
  podeEditar?:          boolean
  /**
   * Os procedimentos de cada sessão, a cada mudança — o bloco "Documentos"
   * do plano (DC1c/PC9b) puxa os documentos deles ao vivo.
   */
  onMudarProcedimentos?: (procedimentosPorSessao: string[][]) => void
  /**
   * A unidade do plano: com ela, o editor busca os pacotes à venda e DIZ quando
   * as sessões batem com um (A28, 2026-10-27). O plano segue por procedimento;
   * quem aplica a economia é o checkout.
   */
  branchId?:            string
  /**
   * O plano é OPCIONAL neste atendimento (A37 da 7ª simulação): o formulário da
   * avaliação abre em todo atendimento avulso (a regra das fichas), e a drenagem
   * avulsa via "Tratamento / Nova sessão" sem saber que podia só finalizar.
   */
  opcional?:            boolean
  /**
   * A9 da 20ª: quem está na tela não finaliza (sem o Prontuário em Gerenciar) —
   * a dica do "é opcional" diz quem finaliza, em vez de "basta o Finalizar"
   * (o botão que ela não tem). Nulo: finaliza.
   */
  quemFinaliza?:        string[] | null
  /**
   * 23ª A21: a cada mudança, as sessões e as observações da tela — o plano
   * novo do Planejamento fica no rascunho da aba até o "Salvar plano".
   */
  onMudou?:             (plano: { sessions: ExistingPlanSession[]; notes: string }) => void
}

// -- Helpers -------------------------------------------------------------------

function uid() {
  return Math.random().toString(36).slice(2)
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fromExisting(plan: ExistingPlan | null): EditorSession[] {
  if (!plan || plan.sessions.length === 0) return []
  return plan.sessions.map(s => ({
    localId: uid(),
    procs:   s.procedures.map(p => ({
      localId:     uid(),
      procedureId: p.procedureId,
      name:        p.name,
      price:       p.price,
      products:    (p.products ?? []).map(pr => ({ localId: uid(), ...pr })),
    })),
  }))
}

// -- Sub-componentes -----------------------------------------------------------

function ProcRow({
  proc, procedures, availableProducts,
  onChangeProcedure, onChangePrice, onRemove,
  onChangeProductQty, onRemoveProduct, onAddProduct,
}: {
  proc:               EditorProc
  procedures:         TreatmentProcedure[]
  availableProducts:  AvailableProduct[]
  onChangeProcedure:  (localId: string, id: string, name: string, price: number, products: EditorProduct[]) => void
  onChangePrice:      (localId: string, price: number) => void
  onRemove:           (localId: string) => void
  onChangeProductQty: (procLocalId: string, prodLocalId: string, qty: number) => void
  onRemoveProduct:    (procLocalId: string, prodLocalId: string) => void
  onAddProduct:       (procLocalId: string, productId: string, name: string, unit: string) => void
}) {
  const [showProducts, setShowProducts] = useState(proc.products.length > 0)

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
      {/* Linha do procedimento — A29 da 11ª: no celular o nome longo empurrava
          o valor para fora da tela (só o "R$" aparecia); a linha quebra, e o
          valor desce inteiro. */}
      <div data-linha-do-procedimento style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface)', flexWrap: 'wrap' }}>
        <select
          value={proc.procedureId}
          onChange={e => {
            const found = procedures.find(p => p.id === e.target.value)
            if (found) {
              const newProds: EditorProduct[] = (found.products ?? []).map(pr => ({
                localId: uid(), productId: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
              }))
              onChangeProcedure(proc.localId, found.id, found.name, found.price, newProds)
              if (newProds.length > 0) setShowProducts(true)
            }
          }}
          style={{
            flex: '1 1 180px', minWidth: 0, padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)',
            background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          }}
        >
          <option value="">Selecionar procedimento…</option>
          {/* O que já estava no plano e a unidade dele não faz mais (D4 da 14ª):
              continua à vista, com o aviso, e o plano se salva com ele (princípio 2). */}
          {proc.procedureId && !procedures.some(p => p.id === proc.procedureId) && (
            <option value={proc.procedureId} data-fora-da-unidade>{proc.name} (não é feito nesta unidade)</option>
          )}
          {procedures.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', fontWeight: 600 }}>R$</span>
          <input
            data-preco-do-procedimento aria-label="Valor do procedimento"
            type="number" min={0} step={0.01} value={proc.price || ''}
            onChange={e => onChangePrice(proc.localId, parseFloat(e.target.value) || 0)}
            placeholder="0,00"
            style={{
              width: 90, padding: '7px 8px', borderRadius: 8, textAlign: 'right',
              border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)',
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
            }}
          />
        </div>

        <button
          type="button"
          title="Insumos"
          onClick={() => setShowProducts(v => !v)}
          style={{
            background: showProducts ? 'var(--brand-soft)' : 'none',
            border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, flexShrink: 0,
            color: proc.products.length > 0 ? 'var(--brand)' : 'var(--text-faint)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-2xs)', fontWeight: 700,
          }}
        >
          <FlaskConical size={12} />
          {proc.products.length > 0 && <span>{proc.products.length}</span>}
        </button>

        <button
          type="button"
          onClick={() => onRemove(proc.localId)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, flexShrink: 0 }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Seção de insumos */}
      {showProducts && (
        <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--hairline)', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 2 }}>INSUMOS</p>
          {proc.products.length === 0 && (
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', fontStyle: 'italic' }}>Nenhum insumo adicionado.</p>
          )}
          {proc.products.map(pr => (
            <div key={pr.localId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{pr.name}</span>
              <input
                type="number" min={0.01} step={0.01} value={pr.quantity || ''}
                onChange={e => onChangeProductQty(proc.localId, pr.localId, parseFloat(e.target.value) || 0)}
                style={{
                  width: 70, padding: '5px 8px', borderRadius: 7, textAlign: 'right',
                  border: '1px solid var(--border)', fontSize: 'var(--text-sm-sz)',
                  background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                }}
              />
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', width: 32, flexShrink: 0 }}>{pr.unit}</span>
              <button
                type="button"
                onClick={() => onRemoveProduct(proc.localId, pr.localId)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, borderRadius: 4 }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <select
              defaultValue=""
              onChange={e => {
                const found = availableProducts.find(p => p.id === e.target.value)
                if (found) { onAddProduct(proc.localId, found.id, found.name, found.unit); e.target.value = '' }
              }}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 7,
                border: '1px dashed var(--border)', fontSize: 'var(--text-sm-sz)',
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              }}
            >
              <option value="">+ Adicionar insumo…</option>
              {availableProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionCard({
  session, index, total, procedures, availableProducts,
  onAddProc, onChangeProcedure, onChangePrice, onRemoveProc,
  onDuplicate, onRemove,
  onChangeProductQty, onRemoveProduct, onAddProduct,
}: {
  session:            EditorSession
  index:              number
  total:              number
  procedures:         TreatmentProcedure[]
  availableProducts:  AvailableProduct[]
  onAddProc:          (sessLocalId: string) => void
  onChangeProcedure:  (sessLocalId: string, procLocalId: string, id: string, name: string, price: number, products: EditorProduct[]) => void
  onChangePrice:      (sessLocalId: string, procLocalId: string, price: number) => void
  onRemoveProc:       (sessLocalId: string, procLocalId: string) => void
  onDuplicate:        (sessLocalId: string) => void
  onRemove:           (sessLocalId: string) => void
  onChangeProductQty: (sessLocalId: string, procLocalId: string, prodLocalId: string, qty: number) => void
  onRemoveProduct:    (sessLocalId: string, procLocalId: string, prodLocalId: string) => void
  onAddProduct:       (sessLocalId: string, procLocalId: string, productId: string, name: string, unit: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      borderRadius: 'var(--radius-card)', border: '1px solid var(--border)',
      overflow: 'hidden', background: 'var(--surface)',
    }}>
      {/* Header da sessão */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        background: 'var(--bg-app)',
        borderBottom: collapsed ? 'none' : '1px solid var(--hairline)',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'var(--brand)', color: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-2xs)', fontWeight: 800,
        }}>
          {index + 1}
        </div>
        <span style={{ flex: 1, fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
          Sessão {index + 1}
          {session.procs.length > 0 && (
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
              {session.procs.map(p => p.name || '—').join(' · ')}
            </span>
          )}
        </span>
        {total > 0 && (
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)', flexShrink: 0 }}>
            {fmtBRL(total)}
          </span>
        )}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            title="Duplicar sessão"
            onClick={() => onDuplicate(session.localId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6 }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            title="Remover sessão"
            onClick={() => onRemove(session.localId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6 }}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6 }}
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* Corpo da sessão */}
      {!collapsed && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {session.procs.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center', padding: '8px 0' }}>
              Nenhum procedimento. Clique em “Adicionar” abaixo.
            </p>
          ) : (
            session.procs.map(proc => (
              <ProcRow
                key={proc.localId}
                proc={proc}
                procedures={procedures}
                availableProducts={availableProducts}
                onChangeProcedure={(procLocalId, id, name, price, products) =>
                  onChangeProcedure(session.localId, procLocalId, id, name, price, products)
                }
                onChangePrice={(procLocalId, price) =>
                  onChangePrice(session.localId, procLocalId, price)
                }
                onRemove={procLocalId => onRemoveProc(session.localId, procLocalId)}
                onChangeProductQty={(procLocalId, prodLocalId, qty) =>
                  onChangeProductQty(session.localId, procLocalId, prodLocalId, qty)
                }
                onRemoveProduct={(procLocalId, prodLocalId) =>
                  onRemoveProduct(session.localId, procLocalId, prodLocalId)
                }
                onAddProduct={(procLocalId, productId, name, unit) =>
                  onAddProduct(session.localId, procLocalId, productId, name, unit)
                }
              />
            ))
          )}
          <button
            type="button"
            onClick={() => onAddProc(session.localId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--brand)', fontSize: 'var(--text-sm-sz)', fontWeight: 700,
              padding: '4px 0', alignSelf: 'flex-start',
            }}
          >
            <Plus size={13} /> Adicionar procedimento
          </button>
        </div>
      )}
    </div>
  )
}

// -- Componente principal ------------------------------------------------------

export const TreatmentPlanEditor = forwardRef<TreatmentPlanEditorRef, Props>(function TreatmentPlanEditor({
  appointmentId, slug, procedures, existingPlan, hideActions, availableProducts = [], onSalvarPorPlano, branchId, opcional = false, quemFinaliza = null,
  podeAnotar = true, podeEditar = true, onMudarProcedimentos, onMudou,
}, ref) {
  const [sessions,  setSessions]  = useState<EditorSession[]>(() => fromExisting(existingPlan))
  const avisarProcedimentos = useEffectEvent((lista: EditorSession[]) =>
    onMudarProcedimentos?.(lista.map(s => s.procs.map(p => p.procedureId).filter(Boolean))))
  useEffect(() => { avisarProcedimentos(sessions) }, [sessions])
  // Os pacotes à venda na unidade — só para a dica; sem eles, nada aparece.
  const [pacotes,   setPacotes]   = useState<PacoteParaComparar[]>([])
  useEffect(() => {
    if (!branchId) return
    let vivo = true
    pacotesParaODicaDoPlano(branchId)
      .then(r => { if (vivo) setPacotes(r) })
      // Só a dica: sem ela o plano funciona igual, mas o motivo vai ao console.
      .catch(e => console.error('[plano] pacotes para a dica:', e))
    return () => { vivo = false }
  }, [branchId])
  const [notes,     setNotes]     = useState(existingPlan?.notes ?? '')
  // 22ª A20: o desconto do plano ("as três por 420"), em R$ ou %, sobre o total das sessões.
  const [desconto,  setDesconto]  = useState<EstadoDoDesconto>(() => estadoDoCombinado(existingPlan?.descontoCombinado))
  const avisarMudanca = useEffectEvent((lista: EditorSession[], texto: string) =>
    onMudou?.({
      sessions: lista.map(s => ({ procedures: s.procs.filter(p => p.procedureId).map(p => ({
        procedureId: p.procedureId, name: p.name, price: p.price,
        products: p.products.map(pr => ({ productId: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity })),
      })) })),
      notes: texto,
    }))
  useEffect(() => { avisarMudanca(sessions, notes) }, [sessions, notes])
  const [msg,       setMsg]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // D4 da 12ª: o cancelado e o recusado também são só leitura (reabriam como
  // rascunho editável, com "Nova sessão" e as lixeiras).
  // UM3: sem a permissão de montar, o plano também só se lê.
  const isPlanLocked = !podeEditar || ['PROPOSED', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(existingPlan?.status ?? '')
  const situacaoTravada = situacaoDoPlano(existingPlan?.status ?? 'PROPOSED')

  const grandTotal = sessions.reduce(
    (sum, s) => sum + s.procs.reduce((ps, p) => ps + p.price, 0),
    0,
  )
  const contaDoPlano = contaDoDesconto(grandTotal, desconto)

  // A mesma conta do checkout: a dica não promete o que ele não aplica.
  const pacoteDaDica = pacotes.length
    ? pacoteEquivalente(
        sessions.map(s => ({ procedures: s.procs.filter(p => p.procedureId).map(p => ({ procedureId: p.procedureId })) })),
        grandTotal, pacotes)
    : null

  // -- Handlers de sessão --------------------------------------------

  function addSession() {
    setSessions(prev => [...prev, { localId: uid(), procs: [] }])
  }

  function duplicateSession(sessLocalId: string) {
    setSessions(prev => {
      const idx = prev.findIndex(s => s.localId === sessLocalId)
      if (idx === -1) return prev
      const copy: EditorSession = {
        localId: uid(),
        procs:   prev[idx]!.procs.map(p => ({ ...p, localId: uid() })),
      }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function removeSession(sessLocalId: string) {
    setSessions(prev => prev.filter(s => s.localId !== sessLocalId))
  }

  // -- Handlers de procedimento --------------------------------------

  function addProc(sessLocalId: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: [...s.procs, { localId: uid(), procedureId: '', name: '', price: 0, products: [] }],
      }
    ))
  }

  function changeProcedure(sessLocalId: string, procLocalId: string, id: string, name: string, price: number, products: EditorProduct[]) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : { ...p, procedureId: id, name, price, products }
        ),
      }
    ))
  }

  function changePrice(sessLocalId: string, procLocalId: string, price: number) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : { ...p, price }
        ),
      }
    ))
  }

  function removeProc(sessLocalId: string, procLocalId: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.filter(p => p.localId !== procLocalId),
      }
    ))
  }

  function changeProductQty(sessLocalId: string, procLocalId: string, prodLocalId: string, qty: number) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : {
            ...p,
            products: p.products.map(pr => pr.localId !== prodLocalId ? pr : { ...pr, quantity: qty }),
          }
        ),
      }
    ))
  }

  function removeProduct(sessLocalId: string, procLocalId: string, prodLocalId: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : {
            ...p,
            products: p.products.filter(pr => pr.localId !== prodLocalId),
          }
        ),
      }
    ))
  }

  function addProduct(sessLocalId: string, procLocalId: string, productId: string, name: string, unit: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : {
            ...p,
            products: [...p.products, { localId: uid(), productId, name, unit, quantity: 1 }],
          }
        ),
      }
    ))
  }

  // -- Serialização para action --------------------------------------

  function toActionSessions(): PlanSessionInput[] {
    return sessions.map((s, i) => ({
      sortOrder:  i,
      procedures: s.procs
        .filter(p => p.procedureId)
        .map((p, j) => ({
          procedureId: p.procedureId,
          price:       p.price,
          sortOrder:   j,
          products:    p.products.map(pr => ({
            productId: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
          })),
        })),
    }))
  }

  useImperativeHandle(ref, () => ({
    getSessions: toActionSessions,
    getNotes:    () => notes,
    getDesconto: () => descontoDoEstado(desconto),
  }))

  // -- Salvar rascunho -----------------------------------------------

  function handleSave() {
    startTransition(async () => {
      setMsg(null)
      const result = await saveTreatmentPlan(appointmentId, toActionSessions(), notes, slug, descontoDoEstado(desconto))
      setMsg(result.error ? `Erro: ${result.error}` : 'Rascunho salvo.')
    })
  }

  // -- Propor o plano (DRAFT → PROPOSED) ----------------------
  // D5 da 15ª: o plano proposto NÃO vai ao PDV — a comanda nasce no aceite
  // (PDV4, PT1a–PT1c). O texto dizia "enviado ao PDV".

  function handlePropose() {
    if (!existingPlan?.id && sessions.length === 0) {
      setMsg('Adicione pelo menos uma sessão antes de enviar.')
      return
    }
    startTransition(async () => {
      setMsg(null)
      const saveResult = await saveTreatmentPlan(appointmentId, toActionSessions(), notes, slug, descontoDoEstado(desconto))
      if (saveResult.error) { setMsg(`Erro: ${saveResult.error}`); return }
      const propResult = await proposeTreatmentPlan(saveResult.planId!, slug)
      const erroDaProposta = (propResult as { error?: string } | undefined)?.error
      if (erroDaProposta) setMsg(`Erro: ${erroDaProposta}`)
      else setMsg('Plano proposto. A comanda vai ao PDV quando a cliente aceitar.')
    })
  }

  // -- Render --------------------------------------------------------

  if (isPlanLocked) {
    // Modo leitura: plano já foi enviado/aprovado — ou quem está na tela não
    // monta o plano (UM3): o cartão "Tratamento" fica, sem nada que edite.
    return (
      <div data-editor-do-tratamento={podeEditar ? undefined : 'leitura'} className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Tratamento</h3>
          {existingPlan && (
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: situacaoTravada.cor, background: situacaoTravada.fundo, borderRadius: 6, padding: '2px 8px' }}>
              {situacaoTravada.label}
            </span>
          )}
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!existingPlan && (
            <p data-quem-monta-o-plano style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              Nenhum plano montado. {TEXTO_QUEM_MONTA}
            </p>
          )}
          {(existingPlan?.sessions ?? []).map((s, i) => (
            <div key={i} style={{ borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-app)', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-overline)', fontWeight: 800, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>Sessão {i + 1}</span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--brand)', fontWeight: 700, marginLeft: 'auto' }}>
                  {fmtBRL(s.procedures.reduce((sum, p) => sum + p.price, 0))}
                </span>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.procedures.map((p, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                    <span>{p.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtBRL(p.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {existingPlan?.descontoCombinado && (() => {
            const subtotal = (existingPlan.sessions ?? []).reduce((t, s) => t + s.procedures.reduce((x, p) => x + p.price, 0), 0)
            const c = totalComOCombinado(subtotal, existingPlan.descontoCombinado)
            return c.reais > 0 ? (
              <p data-desconto-do-plano-combinado style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>Desconto do plano: −{fmtBRL(c.reais)}</span>
                <strong>Total {fmtBRL(c.total)}</strong>
              </p>
            ) : null
          })()}
          {existingPlan?.notes && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 12px', background: 'var(--bg-app)', borderRadius: 8 }}>
              “{existingPlan.notes}”
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div data-editor-do-tratamento className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Tratamento</span>
            {/* O "é opcional" e o "o desconto é do checkout" moram na dica (2026-11-16 — eram frases fixas).
                A34 da 7ª simulação: a profissional não tinha onde pôr os 10% pedidos,
                e a tela não dizia que o desconto é do checkout (a regra fica). */}
            <Dica rotulo="Sobre o plano do tratamento">
              {opcional && (
                <span data-plano-opcional style={{ display: 'block', marginBottom: 6 }}>
                  {quemFinaliza
                    ? `Opcional: monte só se for propor um plano à cliente. ${textoDeQuemConclui(quemFinaliza)}`
                    : 'Opcional: monte só se for propor um plano à cliente. Sem plano, basta o “Finalizar atendimento”.'}
                </span>
              )}
              <span data-desconto-no-checkout style={{ display: 'block' }}>
                O “Desconto do plano” vai pronto à comanda do plano no PDV, onde ainda se ajusta. A cliente vê o total com ele.
              </span>
            </Dica>
          </h3>
          {/* Na simulação de 2026-10-20 a profissional montou aqui a sessão que
              estava FAZENDO (com o insumo) — e virou um plano de outra sessão. Fica
              à vista (2026-11-16): sem ler, ela erra de novo. */}
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            As PRÓXIMAS sessões, para a cliente fechar. O que foi feito hoje vai na conclusão do atendimento.
          </p>
        </div>
        {grandTotal > 0 && (
          <span data-total-do-plano style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
            {contaDoPlano.reais > 0 && (
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textDecoration: 'line-through' }}>{fmtBRL(grandTotal)}</span>
            )}
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
              {fmtBRL(contaDoPlano.liquido)}
            </span>
          </span>
        )}
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Sessões */}
        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 16px', borderRadius: 'var(--radius-field-token)', border: '2px dashed var(--hairline)' }}>
            {/* A19 da 22ª (princípio 7): o vazio diz o primeiro passo — o "Planejamento" levava aqui, e não havia plano. */}
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)', marginBottom: 10 }}>Nenhuma sessão ainda: comece em “Nova sessão” e escolha o procedimento.</p>
            <button type="button" data-nova-sessao onClick={addSession} className="btn-primary" style={{ fontSize: 'var(--text-sm-sz)', justifyContent: 'center' }}>
              <Plus size={13} /> Nova sessão
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map((sess, i) => (
                <SessionCard
                  key={sess.localId}
                  session={sess}
                  index={i}
                  total={sess.procs.reduce((s, p) => s + p.price, 0)}
                  procedures={procedures}
                  availableProducts={availableProducts}
                  onAddProc={addProc}
                  onChangeProcedure={changeProcedure}
                  onChangePrice={changePrice}
                  onRemoveProc={removeProc}
                  onDuplicate={duplicateSession}
                  onRemove={removeSession}
                  onChangeProductQty={changeProductQty}
                  onRemoveProduct={removeProduct}
                  onAddProduct={addProduct}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addSession}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 10,
                border: '1.5px dashed var(--brand)', background: 'var(--brand-soft)',
                color: 'var(--brand)', fontSize: 'var(--text-sm-sz)', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Nova sessão
            </button>
          </>
        )}

        {/* As sessões batem com um pacote da rede: o plano segue por
            procedimento, e a dica diz onde a economia entra (A28). */}
        {pacoteDaDica && (
          <div data-dica-do-pacote role="note"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-field-token)', background: 'var(--info-soft)', border: '1px solid var(--info-border)' }}>
            <Package size={15} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.5 }}>
              Há o pacote <strong>{pacoteDaDica.nome}</strong> por <strong>{fmtBRL(pacoteDaDica.preco)}</strong> — no checkout a economia
              ({fmtBRL(pacoteDaDica.economia)}) entra como desconto.
            </p>
          </div>
        )}

        {/* 22ª A20: o valor fechado do plano sem mexer em cada sessão. */}
        {grandTotal > 0 && (
          <div data-desconto-do-plano>
            <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={grandTotal} rotulo="Desconto do plano (opcional)" />
          </div>
        )}

        {/* Observações — a anotação clínica é do Prontuário (PT2). */}
        {!podeAnotar ? (existingPlan?.notes ? (
          <div data-anotacao-so-leitura>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>Observações de quem atende</p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 12px', background: 'var(--bg-app)', borderRadius: 8 }}>
              “{existingPlan.notes}”
            </p>
          </div>
        ) : null) : (
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>Observações de quem atende</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            aria-label="Observações de quem atende"
            placeholder="Recomendações, contraindicações, observações clínicas…"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)',
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>
        )}

        {/* Ações.
            `onSalvarPorPlano` é o modo "planejamento do cliente": o plano já
            existe e não depende de atendimento nenhum, então salvar é por
            planId. As demais ações ficam com quem hospeda o editor. */}
        {onSalvarPorPlano ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" disabled={isPending}
              onClick={() => startTransition(async () => {
                setMsg(null)
                await onSalvarPorPlano(toActionSessions(), notes)
                setMsg('Plano salvo.')
              })}
              className="btn-primary" style={{ justifyContent: 'center' }}>
              <Save size={13} /> {isPending ? 'Salvando…' : 'Salvar plano'}
            </button>
          </div>
        ) : !hideActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={handleSave} disabled={isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
              <Save size={13} /> Salvar rascunho
            </button>
            <button type="button" onClick={handlePropose} disabled={isPending || sessions.length === 0}
              className="btn-primary" style={{ justifyContent: 'center' }}>
              <Send size={13} /> Propor o plano
            </button>
          </div>
        )}

        {msg && (
          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: msg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)' }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  )
})
