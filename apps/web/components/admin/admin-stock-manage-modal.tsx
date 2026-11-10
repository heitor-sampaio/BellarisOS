'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X, PackagePlus, ArrowLeftRight, SlidersHorizontal,
  AlertTriangle, TrendingDown, Check, Loader2, PackageX,
} from 'lucide-react'
import {
  adminAddStock, adminTransferStock, adminAdjustStock, adminUpdateMinStock, registrarPerda,
  getProductMovements, type MovimentoDeEstoque,
} from '@/actions/stock'
import { MOTIVOS_DA_PERDA } from '@/lib/estoque/perda'
import { validadeNaTela } from '@/lib/estoque/validade'
import { erroParaTela } from '@/lib/erro-na-tela'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { SegSelect } from '@/components/shared/seg-select'
import { toast } from 'sonner'
import { parseDecimal } from '@estetica-os/utils'

type BranchStock = {
  branchId:     string
  branchName:   string
  currentStock: number
  minStock:     number
  /** O saldo em consumo (UI, ml), com unidade de consumo — o ajuste o mostra (D3 da 7ª). */
  currentRendimento?: number | null
}

type ProductInfo = {
  id:       string
  name:     string
  unit:     string
  branches: BranchStock[]
  /** Os lotes com saldo (a perda escolhe de qual lote sai — D-7). */
  lotes?:   { id: string; unidadeId: string; numero: string | null; validade: string | null; quantidade: number }[]
  /** A unidade de consumo (ml, UI) e quanto a embalagem rende: a perda aceita as duas (est-03). */
  consumptionUnit?: string | null
  unitsPerPackage?: number | null
}

type AllBranch = { id: string; name: string }

interface Props {
  product:         ProductInfo
  allBranches:     AllBranch[]
  defaultBranchId?: string
  onClose:         () => void
  onSuccess:       () => void
}

type Tab   = 'movimentacoes' | 'min-stock' | 'historico'
type MovOp = 'entrada' | 'transferencia' | 'ajuste' | 'perda'

// -- Primitivos --------------------------------------------------------
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
      {children}
    </label>
  )
}
function FieldWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
}
function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p style={{
      fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '8px 12px', borderRadius: 8,
      background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)',
    }}>{msg}</p>
  )
}

function UnitSuffix({ unit }: { unit: string }) {
  return (
    <span style={{
      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
      fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', pointerEvents: 'none',
    }}>{unit}</span>
  )
}

/** A única unidade da lista, ou vazio quando há escolha a fazer. */
const unicaUnidade = (lista: { id: string }[]) => lista.length === 1 ? lista[0]!.id : ''

function BranchSelect({
  name, branches, allBranches, label, required, onChange, defaultValue,
}: {
  name:          string
  branches:      BranchStock[]
  allBranches:   AllBranch[]
  label:         string
  required?:     boolean
  onChange?:     (id: string) => void
  defaultValue?: string
}) {
  const stockMap = Object.fromEntries(branches.map(b => [b.branchId, b.currentStock]))
  return (
    <FieldWrap>
      <Label>{label}{required && ' *'}</Label>
      {/* Uma unidade só: já vem escolhida (F8 — era obrigatório e vazio). */}
      <select name={name} required={required} defaultValue={defaultValue ?? unicaUnidade(allBranches)} className="field"
        onChange={e => onChange?.(e.target.value)}>
        <option value="" disabled>Selecionar unidade…</option>
        {allBranches.map(b => (
          <option key={b.id} value={b.id}>
            {b.name}{stockMap[b.id] !== undefined ? ` · ${stockMap[b.id]!.toLocaleString('pt-BR')}` : ''}
          </option>
        ))}
      </select>
    </FieldWrap>
  )
}

// -- Formulário: Entrada -----------------------------------------------
function EntradaForm({ product, allBranches, defaultBranchId, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  onClose: () => void; onSuccess: () => void
}) {
  const envio = useEnvioUnico()
  const [error, setError]     = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      // A chave do envio (D10): o duplo clique movimenta uma vez só.
      fd.set('_envio', envio.chave())
      const res = await adminAddStock(undefined, fd)
      if (res?.success) { envio.renovar(); onSuccess() }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches}
          label="Unidade de destino" required />
      )}

      <div className="form-2col">
        <FieldWrap>
          <Label>Quantidade *</Label>
          <div style={{ position: 'relative' }}>
            <input name="quantity" type="number" step="0.001" min="0.001" required className="field"
              placeholder="0" style={{ paddingRight: 36 }} />
            <UnitSuffix unit={product.unit} />
          </div>
        </FieldWrap>
        <FieldWrap>
          <Label>Custo unitário</Label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', pointerEvents: 'none',
            }}>R$</span>
            <input name="unit_cost" type="number" step="0.01" min="0" className="field"
              placeholder="0,00" style={{ paddingLeft: 28 }} />
          </div>
        </FieldWrap>
      </div>
      {/* Sem "lançar como despesa": movimentação de estoque nunca gera despesa
          (D13 revisto, decisão do Heitor, 2026-10-28). O custo é base de
          insumo, custo e margem. */}

      <div className="form-2col">
        <FieldWrap>
          <Label>Nº do lote</Label>
          <input name="batch_number" type="text" className="field" placeholder="LOT-001" />
        </FieldWrap>
        <FieldWrap>
          <Label>Validade</Label>
          <input name="expires_at" type="date" className="field" />
        </FieldWrap>
      </div>

      <FieldWrap>
        <Label>Observações</Label>
        <textarea name="notes" className="field" rows={2} placeholder="Nota fiscal, fornecedor…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          <PackagePlus size={14} />
          {pending ? 'Salvando…' : 'Registrar entrada'}
        </button>
      </div>
    </form>
  )
}

// -- Formulário: Transferência -----------------------------------------
function TransferenciaForm({ product, allBranches, defaultBranchId, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  /** Unidade de quem esta operando: a origem e ela, e nao ha o que escolher. */
  defaultBranchId?: string
  onClose: () => void; onSuccess: () => void
}) {
  const envio = useEnvioUnico()
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)
  const [fromId,  setFromId]  = useState(defaultBranchId ?? '')
  const [toId,    setToId]    = useState('')

  const stockMap  = Object.fromEntries(product.branches.map(b => [b.branchId, b.currentStock]))
  const fromStock = fromId ? (stockMap[fromId] ?? 0) : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      // A chave do envio (D10): o duplo clique movimenta uma vez só.
      fd.set('_envio', envio.chave())
      const res = await adminTransferStock(undefined, fd)
      if (res?.success) {
        envio.renovar()
        // A16 da 8ª simulação: o saldo do destino, que a gerente de unidade fixa não vê.
        if (res.saldos) {
          const nome = (id: string) => allBranches.find(b => b.id === id)?.name ?? 'A unidade'
          const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
          toast(`Transferido: ${nome(String(fd.get('toBranchId')))} agora tem ${n(res.saldos.destino)} ${product.unit}; ${nome(String(fd.get('fromBranchId')))} ficou com ${n(res.saldos.origem)} ${product.unit}.`)
        }
        onSuccess()
      }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex-wrap-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: 8 }}>
        <BranchSelect name="fromBranchId" branches={product.branches}
          allBranches={defaultBranchId ? allBranches.filter(b => b.id === defaultBranchId) : allBranches}
          label="Origem" required onChange={setFromId} defaultValue={defaultBranchId} />
        <div style={{ paddingBottom: 10, color: 'var(--text-faint)' }}>
          <ArrowLeftRight size={16} />
        </div>
        <BranchSelect name="toBranchId" branches={product.branches}
          allBranches={allBranches.filter(b => b.id !== fromId)}
          label="Destino" required onChange={setToId} />
      </div>

      {fromStock !== null && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border)',
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
        }}>
          Disponível na origem:&nbsp;
          <strong style={{ color: 'var(--text)' }}>
            {fromStock.toLocaleString('pt-BR')} {product.unit}
          </strong>
        </div>
      )}

      <FieldWrap>
        <Label>Quantidade *</Label>
        <div style={{ position: 'relative' }}>
          <input name="quantity" type="number" step="0.001" min="0.001" required className="field"
            placeholder="0" max={fromStock ?? undefined} style={{ paddingRight: 36 }} />
          <UnitSuffix unit={product.unit} />
        </div>
      </FieldWrap>

      <FieldWrap>
        <Label>Observações</Label>
        <textarea name="notes" className="field" rows={2} placeholder="Motivo da transferência…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending || fromId === toId}>
          <ArrowLeftRight size={14} />
          {pending ? 'Transferindo…' : 'Confirmar transferência'}
        </button>
      </div>
    </form>
  )
}

// -- Formulário: Ajuste ------------------------------------------------
function AjusteForm({ product, allBranches, defaultBranchId, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  onClose: () => void; onSuccess: () => void
}) {
  const [error,     setError]     = useState<string>()
  const [pending,   setPending]   = useState(false)
  const [branchId,  setBranchId]  = useState(defaultBranchId ?? unicaUnidade(allBranches))
  const [newQty,    setNewQty]    = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loteDoAjuste, setLoteDoAjuste] = useState('')
  const lotesDaUnidade = (product.lotes ?? []).filter(l => l.unidadeId === branchId)

  // D3 da 7ª simulação: a toxina tinha 780 UI e o ajuste mostrava "8 frasco"
  // (a embalagem aberta arredondada); a contagem de 7,7 virava 750 UI. O saldo
  // aparece em consumo E em embalagens, e a contagem vale EXATA na unidade
  // escolhida — em embalagens, a fração é o frasco aberto (7,7 = 770 UI).
  const rende        = product.consumptionUnit && Number(product.unitsPerPackage) > 0 ? Number(product.unitsPerPackage) : null
  const [emConsumo, setEmConsumo] = useState(true)
  const contaEmConsumo = !!rende && emConsumo
  const linha        = branchId ? product.branches.find(b => b.branchId === branchId) : undefined
  const embalagens   = branchId ? (linha?.currentStock ?? 0) : null
  const rendimento   = rende && branchId ? (linha?.currentRendimento ?? (embalagens ?? 0) * rende) : null
  // O saldo de agora na unidade da contagem: em consumo, o rendimento; em embalagens, o equivalente exato.
  const currentStock = embalagens === null ? null
    : rende ? (contaEmConsumo ? rendimento! : Math.round(rendimento! / rende * 10_000) / 10_000) : embalagens
  const unidadeDaContagem = contaEmConsumo ? product.consumptionUnit! : product.unit
  const lidaNova     = newQty !== '' ? parseDecimal(newQty, 4) : NaN
  const parsedNew    = Number.isFinite(lidaNova) ? lidaNova : null
  const delta        = currentStock !== null && parsedNew !== null ? Math.round((parsedNew - currentStock) * 10_000) / 10_000 : null
  const fmtQ = (n: number, casas = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas })
  const equivale = rende && parsedNew !== null && parsedNew >= 0
    ? (contaEmConsumo
      ? `${fmtQ(parsedNew)} ${product.consumptionUnit} = ${fmtQ(parsedNew / rende, 4)} ${product.unit}`
      : `${fmtQ(parsedNew, 4)} ${product.unit} = ${fmtQ(parsedNew * rende)} ${product.consumptionUnit}: o ${product.unit} aberto conta pela fração que sobra nele (0,7 ${product.unit} = ${fmtQ(0.7 * rende)} ${product.consumptionUnit}).`)
    : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!confirmed) return
    setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      fd.set('unidade', contaEmConsumo ? 'CONSUMO' : 'EMBALAGEM')
      if (parsedNew !== null) fd.set('new_quantity', String(parsedNew))
      const res = await adminAdjustStock(undefined, fd)
      if (res?.success) onSuccess()
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '10px 13px', borderRadius: 9,
        background: 'var(--cat-5-soft)', border: '1.5px solid var(--cat-5-soft)',
        display: 'flex', gap: 9, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', lineHeight: 1.5 }}>
          <strong>Operação crítica.</strong> O ajuste sobrescreve o estoque e pode gerar
          inconsistência com movimentações anteriores. Use apenas após inventário físico confirmado.
        </p>
      </div>

      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches}
          label="Unidade" required onChange={id => { setBranchId(id); setConfirmed(false) }} />
      )}

      {currentStock !== null && (
        <div className="form-2col" style={{
          padding: '10px 13px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border)',
        }}>
          <div>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
              ESTOQUE ATUAL
            </p>
            <p data-saldo-do-ajuste style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {rende ? fmtQ(rendimento ?? 0) : fmtQ(embalagens ?? 0, 3)}{' '}
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-faint)' }}>{rende ? product.consumptionUnit : product.unit}</span>
              {rende && (
                <span style={{ display: 'block', fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0 }}>
                  {`${fmtQ((rendimento ?? 0) / rende, 4)} ${product.unit}`}
                </span>
              )}
            </p>
          </div>
          {delta !== null && !isNaN(delta) && (
            <div>
              <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
                VARIAÇÃO
              </p>
              <p style={{
                fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.01em',
                color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-faint)',
              }}>
                {delta > 0 ? '+' : ''}{fmtQ(delta, 4)}
                <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-faint)', marginLeft: 4 }}>{unidadeDaContagem}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {rende && (
        <div role="group" aria-label="Contar em" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Contar em</span>
          <SegSelect ariaLabel="Contar em" value={contaEmConsumo ? 'CONSUMO' : 'EMBALAGEM'}
            options={[{ key: 'CONSUMO', label: product.consumptionUnit! }, { key: 'EMBALAGEM', label: product.unit }]}
            onSelect={k => { setEmConsumo(k === 'CONSUMO'); setNewQty(''); setConfirmed(false) }} />
        </div>
      )}

      <FieldWrap>
        <label htmlFor="ajuste-contagem" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {rende ? 'Contagem' : 'Novo estoque'} *
        </label>
        <div style={{ position: 'relative' }}>
          <input id="ajuste-contagem" name="new_quantity" type="text" inputMode="decimal" required className="field"
            placeholder="0" value={newQty}
            onChange={e => { setNewQty(e.target.value); setConfirmed(false) }}
            style={{ paddingRight: 48 }} />
          <UnitSuffix unit={unidadeDaContagem} />
        </div>
        {equivale && <span data-ajuste-equivale style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{equivale}</span>}
      </FieldWrap>

      {/* D5 da 10ª simulação: o que a contagem achou a MAIS entra num lote (era
          saldo sem lote, sem validade); o que achou a MENOS sai pelo lote que
          vence primeiro e é perda ("Inventário"), ao custo do lote. */}
      {delta !== null && delta > 0 && (
        <>
          <FieldWrap>
            <label htmlFor="ajuste-lote" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              Em qual lote entra a diferença
            </label>
            <select id="ajuste-lote" name="loteId" className="field" value={loteDoAjuste} onChange={e => setLoteDoAjuste(e.target.value)}>
              <option value="">Um lote novo, sem número</option>
              {lotesDaUnidade.map(l => (
                <option key={l.id} value={l.id}>
                  {l.numero ? `Lote ${l.numero}` : 'Lote sem número'}
                  {l.validade ? ` · vence ${validadeNaTela(l.validade)}` : ''}
                  {` · ${fmtQ(l.quantidade)} ${product.unit}`}
                </option>
              ))}
            </select>
          </FieldWrap>
          {loteDoAjuste === '' && (
            <FieldWrap>
              <label htmlFor="ajuste-lote-validade" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                Validade do lote novo (opcional)
              </label>
              <input id="ajuste-lote-validade" name="lote_validade" type="date" className="field" />
            </FieldWrap>
          )}
        </>
      )}
      {delta !== null && delta < 0 && (
        <p data-ajuste-negativo style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          A diferença sai do lote que vence primeiro e entra em Relatórios → Estoque, “Perdas no período”, como Inventário, ao custo do lote. Não gera despesa.
        </p>
      )}

      <FieldWrap>
        <label htmlFor="ajuste-motivo" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Motivo *</label>
        <textarea id="ajuste-motivo" name="reason" required className="field" rows={2}
          placeholder="Ex: Inventário físico realizado, divergência identificada…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
        borderRadius: 8, cursor: 'pointer', transition: 'all 150ms',
        border: `1.5px solid ${confirmed ? 'var(--brand)' : 'var(--border)'}`,
        background: confirmed ? 'var(--brand-soft)' : 'var(--bg-app)',
      }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--brand)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, lineHeight: 1.4,
          color: confirmed ? 'var(--brand)' : 'var(--text-muted)' }}>
          Confirmo que o novo valor foi verificado fisicamente e estou ciente da inconsistência no histórico.
        </span>
      </label>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" disabled={pending || !confirmed} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 'var(--text-base-sz)', fontWeight: 700, padding: '8px 16px', borderRadius: 10,
          border: 'none', cursor: pending || !confirmed ? 'not-allowed' : 'pointer',
          background: confirmed ? 'var(--danger)' : 'var(--border)',
          color: confirmed ? 'var(--on-brand)' : 'var(--text-faint)',
          transition: 'all 150ms',
        }}>
          <SlidersHorizontal size={14} />
          {pending ? 'Ajustando…' : 'Aplicar ajuste'}
        </button>
      </div>
    </form>
  )
}

// -- Formulário: Perda -------------------------------------------------
// D-7 (decisão do Heitor): o que saiu por vencido, quebrou, amostra ou uso
// interno — pelo LOTE escolhido (o vencido sai dele, não do que vence
// primeiro) e SEM despesa. A quantidade é em embalagens, como a entrada.
function PerdaForm({ product, allBranches, defaultBranchId, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  onClose: () => void; onSuccess: () => void
}) {
  const envio = useEnvioUnico()
  const [error,    setError]    = useState<string>()
  const [pending,  setPending]  = useState(false)
  const [branchId, setBranchId] = useState(defaultBranchId ?? unicaUnidade(allBranches))
  const lotes = (product.lotes ?? []).filter(l => l.unidadeId === branchId)
  // est-03: com unidade de consumo, a perda também se digita nela ("30 UI").
  const rende = product.consumptionUnit && Number(product.unitsPerPackage) > 0 ? Number(product.unitsPerPackage) : null
  const [emConsumo, setEmConsumo] = useState(false)
  const [quantidade, setQuantidade] = useState('')
  const lida = parseDecimal(quantidade, 4)
  const equivale = rende && Number.isFinite(lida) && lida > 0
    ? (emConsumo ? `= ${(lida / rende).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${product.unit}`
                 : `= ${(lida * rende).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${product.consumptionUnit}`)
    : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      fd.set('unidade', emConsumo ? 'CONSUMO' : 'EMBALAGEM')
      // A chave do envio (D10): o duplo clique movimenta uma vez só.
      fd.set('_envio', envio.chave())
      const res = await registrarPerda(undefined, fd)
      if (res?.success) { envio.renovar(); onSuccess() }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const rotulo: React.CSSProperties = { fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        O que saiu do estoque sem ser usado num atendimento. Não gera despesa: o custo entra no relatório de perdas.
      </p>
      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches}
          label="Unidade" required onChange={setBranchId} />
      )}

      <FieldWrap>
        <label htmlFor="perda-lote" style={rotulo}>Lote</label>
        <select id="perda-lote" name="loteId" className="field" defaultValue="">
          <option value="">Sem lote — sai o que vence primeiro</option>
          {lotes.map(l => (
            <option key={l.id} value={l.id}>
              {l.numero ? `Lote ${l.numero}` : 'Lote sem número'}
              {l.validade ? ` · vence ${validadeNaTela(l.validade)}` : ''}
              {` · ${fmt(l.quantidade)} ${product.unit}`}
            </option>
          ))}
        </select>
      </FieldWrap>

      {rende && (
        <div role="group" aria-label="Unidade da perda" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={rotulo}>Em</span>
          <SegSelect ariaLabel="Unidade da perda" value={emConsumo ? 'CONSUMO' : 'EMBALAGEM'}
            options={[{ key: 'EMBALAGEM', label: product.unit }, { key: 'CONSUMO', label: product.consumptionUnit! }]}
            onSelect={k => setEmConsumo(k === 'CONSUMO')} />
        </div>
      )}
      <div className="form-2col">
        <FieldWrap>
          <label htmlFor="perda-quantidade" style={rotulo}>Quantidade</label>
          <div style={{ position: 'relative' }}>
            <input id="perda-quantidade" name="quantity" type="text" inputMode="decimal" required className="field"
              placeholder="0" style={{ paddingRight: 48 }} value={quantidade} onChange={e => setQuantidade(e.target.value)} />
            <UnitSuffix unit={emConsumo && product.consumptionUnit ? product.consumptionUnit : product.unit} />
          </div>
          {equivale && <span data-equivale style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{equivale}</span>}
        </FieldWrap>
        <FieldWrap>
          <label htmlFor="perda-motivo" style={rotulo}>Motivo</label>
          <select id="perda-motivo" name="motivo" required className="field" defaultValue="">
            <option value="" disabled>Selecione…</option>
            {MOTIVOS_DA_PERDA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </FieldWrap>
      </div>

      <FieldWrap>
        <label htmlFor="perda-obs" style={rotulo}>Observação</label>
        <textarea id="perda-obs" name="notes" className="field" rows={2} placeholder="Ex: frasco caiu no chão"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          <PackageX size={14} />
          {pending ? 'Registrando…' : 'Registrar perda'}
        </button>
      </div>
    </form>
  )
}

// -- Tab: Estoque mínimo -----------------------------------------------
function MinStockTab({ product, allBranches, defaultBranchId }: {
  product:          ProductInfo
  allBranches:      AllBranch[]
  defaultBranchId?: string
}) {
  const stockMap = Object.fromEntries(product.branches.map(b => [b.branchId, b]))
  const visibleBranches = defaultBranchId ? allBranches.filter(b => b.id === defaultBranchId) : allBranches

  const [values,  setValues]  = useState<Record<string, string>>(() =>
    Object.fromEntries(allBranches.map(b => [
      b.id,
      String(stockMap[b.id]?.minStock ?? 0),
    ])),
  )
  const [saving,  setSaving]  = useState<Record<string, boolean>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [errors,  setErrors]  = useState<Record<string, string>>({})

  async function save(branchId: string) {
    const raw = values[branchId] ?? '0'
    const v   = parseFloat(raw.replace(',', '.'))
    if (isNaN(v) || v < 0) {
      setErrors(p => ({ ...p, [branchId]: 'Valor inválido.' }))
      return
    }
    setSaving(p => ({ ...p, [branchId]: true }))
    setErrors(p => ({ ...p, [branchId]: '' }))
    const res = await adminUpdateMinStock(product.id, branchId, v)
    setSaving(p => ({ ...p, [branchId]: false }))
    if (res?.success) {
      setSaved(p => ({ ...p, [branchId]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [branchId]: false })), 2000)
    } else {
      setErrors(p => ({ ...p, [branchId]: res?.error ?? 'Erro.' }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Configure o estoque mínimo desejável de <strong style={{ color: 'var(--text)' }}>{product.name}</strong> em
        cada unidade. Abaixo deste valor, o produto será sinalizado como alerta.
      </p>

      {visibleBranches.map(b => {
        const bs           = stockMap[b.id]
        const currentStock = bs?.currentStock ?? 0
        const isBusy       = saving[b.id]
        const isDone       = saved[b.id]
        const errMsg       = errors[b.id]

        return (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            {/* Branch info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{b.name}</p>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 1 }}>
                Atual: {currentStock.toLocaleString('pt-BR')} {product.unit}
              </p>
            </div>

            {/* Input */}
            <div style={{ position: 'relative', width: 110 }}>
              <input
                type="number" step="0.001" min="0"
                value={values[b.id] ?? '0'}
                onChange={e => {
                  setValues(p => ({ ...p, [b.id]: e.target.value }))
                  setSaved(p => ({ ...p, [b.id]: false }))
                }}
                onKeyDown={e => e.key === 'Enter' && save(b.id)}
                className="field"
                style={{ paddingRight: 36, textAlign: 'right' }}
              />
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 'var(--text-overline)', color: 'var(--text-faint)', pointerEvents: 'none',
              }}>{product.unit}</span>
            </div>

            {/* Save button */}
            <button
              type="button"
              onClick={() => save(b.id)}
              disabled={isBusy}
              style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: isBusy ? 'wait' : 'pointer',
                background: isDone ? 'var(--success-bg)' : 'var(--brand-soft)',
                color: isDone ? 'var(--success)' : 'var(--brand)',
                transition: 'all 150ms',
              }}
              title="Salvar"
            >
              {isBusy
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : isDone
                ? <Check size={14} />
                : <TrendingDown size={14} />
              }
            </button>

            {errMsg && (
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 700 }}>{errMsg}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// -- Modal principal ---------------------------------------------------
export function AdminStockManageModal({ product, allBranches, defaultBranchId, onClose, onSuccess }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [tab,   setTab]   = useState<Tab>('movimentacoes')
  const [movOp, setMovOp] = useState<MovOp>('entrada')

  useEffect(() => {
    const dialogo = dialogRef.current
    dialogo?.showModal()
    return () => dialogo?.close()
  }, [])

  const allMovOpts: { op: MovOp; label: string; icon: React.ReactNode; color: string }[] = [
    { op: 'entrada',       label: 'Entrada',       icon: <PackagePlus      size={13} />, color: 'var(--success)' },
    { op: 'transferencia', label: 'Transferência',  icon: <ArrowLeftRight   size={13} />, color: 'var(--info)' },
    { op: 'ajuste',        label: 'Ajuste',         icon: <SlidersHorizontal size={13}/>, color: 'var(--warning)' },
    { op: 'perda',         label: 'Perda',          icon: <PackageX         size={13} />, color: 'var(--danger)' },
  ]
  // Transferir some so quando nao ha para onde: a filial mandava produto para
  // lugar nenhum porque recebia apenas a propria unidade na lista.
  const MOV_OPTS = allBranches.length > 1
    ? allMovOpts
    : allMovOpts.filter(o => o.op !== 'transferencia')

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClick={e => { if (e.target === dialogRef.current) onClose() }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1,
        background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
        padding: '16px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
            Gerenciar estoque
          </h2>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>{product.name}</p>
        </div>
        <button type="button" onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
        padding: '0 22px',
        background: 'var(--surface)',
      }}>
        {([
          ['movimentacoes', 'Movimentações'],
          ['historico',     'Histórico'],
          ['min-stock',     'Estoque mínimo'],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: '10px 16px', fontSize: 'var(--text-base-sz)', fontWeight: 700,
            border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? 'var(--brand)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 120ms',
          }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 22px 26px' }}>
        {tab === 'movimentacoes' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sub-tabs de operação */}
            <div style={{
              display: 'flex', gap: 6,
              background: 'var(--bg-app)', padding: 4, borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              {MOV_OPTS.map(o => (
                <button key={o.op} type="button" onClick={() => setMovOp(o.op)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '6px 10px', borderRadius: 7,
                  border: 'none', cursor: 'pointer', transition: 'all 100ms',
                  background: movOp === o.op ? 'var(--surface)' : 'transparent',
                  color: movOp === o.op ? o.color : 'var(--text-muted)',
                  boxShadow: movOp === o.op ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>

            {movOp === 'entrada'       && <EntradaForm       product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'transferencia' && <TransferenciaForm product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'ajuste'        && <AjusteForm        product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'perda'         && <PerdaForm         product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} onClose={onClose} onSuccess={onSuccess} />}
          </div>
        ) : tab === 'historico' ? (
          <HistoricoTab product={product} defaultBranchId={defaultBranchId} />
        ) : (
          <MinStockTab product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} />
        )}
      </div>
    </dialog>
  )
}

// -- Histórico ---------------------------------------------------------
//
// De onde saiu e para onde entrou. Existia no back-end (`getProductMovements`)
// e não tinha porta nenhuma na interface desde que a filial passou a usar este
// modal — dava para movimentar sem nunca ver o que já tinha sido movimentado.

const MOV_LABEL: Record<string, string> = {
  PURCHASE:          'Entrada',
  TRANSFER_IN:       'Transferência recebida',
  TRANSFER_OUT:      'Transferência enviada',
  PROCEDURE_USAGE:   'Consumo em atendimento',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  LOSS:              'Perda',
  SALE:              'Venda',
  SALE_RETURN:       'Devolução de venda',
}

function HistoricoTab({ product, defaultBranchId }: {
  product: ProductInfo
  defaultBranchId?: string
}) {
  const [movs,    setMovs]    = useState<MovimentoDeEstoque[] | null>(null)
  const [erro,    setErro]    = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getProductMovements(product.id, defaultBranchId ?? '')
      .then(r => { if (vivo) setMovs(r) })
      .catch(e => { if (vivo) setErro(erroParaTela(e, 'Não foi possível carregar as movimentações.')) })
    return () => { vivo = false }
  }, [product.id, defaultBranchId])

  if (erro)   return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>
  if (!movs)  return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando…</p>
  if (movs.length === 0) {
    return (
      <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', textAlign: 'center', padding: '28px 0' }}>
        Nenhuma movimentação registrada para este produto.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
      {movs.map(m => {
        const entrada = m.quantity >= 0
        const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
        const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        // O lote e o custo do movimento (J-45): de qual lote saiu (ou qual a
        // entrada criou) e quanto custou a unidade de consumo e a embalagem.
        const lotes = m.lotes.map(l => [
          l.numero ? `Lote ${l.numero}` : 'Lote sem número',
          l.validade ? `val. ${validadeNaTela(l.validade)}` : null,
        ].filter(Boolean).join(' ')).join(' · ')
        const custo = m.custoUnitario != null && m.custoUnitario > 0
          ? (m.porEmbalagem
            ? `${fmtBRL(m.custoUnitario)}/${m.unidade} (${fmtBRL(m.custoPorEmbalagem ?? 0)}/${m.embalagem})`
            : `${fmtBRL(m.custoUnitario)}/${m.unidade}`)
          : null
        return (
          <div key={m.id} data-movimento style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 12px', borderRadius: 9,
            border: '1px solid var(--hairline)', background: 'var(--surface)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                {MOV_LABEL[m.type] ?? m.type}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {m.branchName}</span>
              </p>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
                {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {m.notes ? ` · ${m.notes}` : ''}
              </p>
              {(lotes || custo) && (
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                  {[lotes, custo ? `custo ${custo}` : null].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: entrada ? 'var(--success)' : 'var(--danger)' }}>
                {entrada ? '+' : ''}{fmt(m.quantity)} {m.unidade}
              </p>
              {/* O movimento também em embalagens (J-44): −32 UI = 0,32 frasco. */}
              {m.emEmbalagens != null && (
                <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)' }}>
                  {fmt(Math.abs(m.emEmbalagens))} {m.embalagem}
                </p>
              )}
              {/* O movimento está na unidade de consumo (ml, UI); o saldo
                  mostra também a equivalência em embalagens. */}
              <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)' }}>
                saldo {m.balanceAfter.toLocaleString('pt-BR')} {m.unidade}
                {m.saldoEmEmbalagens != null ? ` · ${m.saldoEmEmbalagens.toLocaleString('pt-BR')} ${m.embalagem}` : ''}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
