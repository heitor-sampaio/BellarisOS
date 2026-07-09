'use client'

import { useActionState, useState, useEffect } from 'react'
import { Plus, Trash2, CheckCircle2, ChevronDown } from 'lucide-react'
import { addProcedure, updateProcedure } from '@/actions/procedures'

const CATEGORIES = [
  'Toxina botulínica', 'Preenchimento', 'Fios', 'Bioestimuladores',
  'Limpeza de pele', 'Peeling', 'Microagulhamento', 'Laser',
  'Depilação', 'Massagem', 'Drenagem linfática', 'Corpo',
  'Estética íntima', 'Tricologia', 'Outros',
]

interface Branch { id: string; name: string }
interface Product {
  id:                string
  name:              string
  unit:              string
  branch_name:       string
  cost_price?:       number | null
  consumption_unit?: string | null
  units_per_package?: number | null
}

interface BranchPricingOverride {
  branch_id:  string
  price:      number | null
  labor_cost: number | null
}

interface ExistingProcedure {
  id: string
  name: string
  category: string
  description?: string | null
  duration_min: number
  price: string | number
  labor_cost?: string | number
  visible_on_client_app: boolean
  is_active: boolean
  branch_ids: string[]
  procedure_products: { product_id: string; quantity: number; unit_cost?: number | null }[]
  branch_pricing?: BranchPricingOverride[]
  anamnesis_form_id?: string | null
}

interface ProcedureFormProps {
  branches: Branch[]
  products: Product[]
  anamnesisForms?: { id: string; name: string }[]
  existing?: ExistingProcedure
  onSuccess?: () => void
  onCancel?: () => void
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>{hint}</p>}
    </div>
  )
}

function formatPrice(raw: string | number) {
  const n = parseFloat(String(raw))
  if (isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type ActionState = { error?: string; success?: boolean; procedureId?: string } | undefined
type InnerProps  = ProcedureFormProps & { isEdit: boolean; state: ActionState; formAction: (f: FormData) => void; pending: boolean }

function CreateProcedureForm(props: ProcedureFormProps) {
  const [state, formAction, pending] = useActionState(addProcedure, undefined)
  return <ProcedureFormInner {...props} isEdit={false} state={state} formAction={formAction} pending={pending} />
}
function EditProcedureForm(props: ProcedureFormProps) {
  const [state, formAction, pending] = useActionState(updateProcedure, undefined)
  return <ProcedureFormInner {...props} isEdit={true} state={state} formAction={formAction} pending={pending} />
}

export function ProcedureForm(props: ProcedureFormProps) {
  return props.existing ? <EditProcedureForm {...props} /> : <CreateProcedureForm {...props} />
}

function ProcedureFormInner({ branches, products, anamnesisForms = [], existing, onSuccess, onCancel, isEdit, state, formAction, pending }: InnerProps) {

  const [selectedBranches, setSelectedBranches] = useState<string[]>(existing?.branch_ids ?? [])
  const [insumos, setInsumos] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>(
    (existing?.procedure_products ?? []).map(pp => ({
      ...pp,
      unit_cost: pp.unit_cost ?? products.find(p => p.id === pp.product_id)?.cost_price ?? 0,
    }))
  )
  const [price,     setPrice]     = useState(existing ? formatPrice(existing.price)      : '')
  const [laborCost, setLaborCost] = useState(existing?.labor_cost ? formatPrice(existing.labor_cost) : '')

  type BranchOverrideState = { branch_id: string; price: string; labor_cost: string }
  const [branchPricing, setBranchPricing] = useState<BranchOverrideState[]>(
    (existing?.branch_pricing ?? []).map(b => ({
      branch_id:  b.branch_id,
      price:      b.price      != null ? formatPrice(b.price)      : '',
      labor_cost: b.labor_cost != null ? formatPrice(b.labor_cost) : '',
    }))
  )

  const [branchPricingOpen, setBranchPricingOpen] = useState(false)

  function setBranchOverride(branchId: string, field: 'price' | 'labor_cost', value: string) {
    setBranchPricing(prev => {
      const idx = prev.findIndex(b => b.branch_id === branchId)
      if (idx >= 0) return prev.map((b, i) => i === idx ? { ...b, [field]: value } : b)
      return [...prev, { branch_id: branchId, price: '', labor_cost: '', [field]: value }]
    })
  }

  function branchOverrideInput(branchId: string, field: 'price' | 'labor_cost') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '')
      const num    = parseInt(digits || '0', 10) / 100
      setBranchOverride(branchId, field, num > 0
        ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '')
    }
  }

  // Serializa apenas overrides com pelo menos um valor preenchido
  const branchPricingPayload = JSON.stringify(
    branchPricing
      .filter(b => b.price !== '' || b.labor_cost !== '')
      .map(b => ({
        branch_id:  b.branch_id,
        price:      b.price      !== '' ? parseBRL(b.price)      : null,
        labor_cost: b.labor_cost !== '' ? parseBRL(b.labor_cost) : null,
      }))
  )

  const productsCostCalc = insumos.reduce((sum, ins) => sum + (ins.unit_cost ?? 0) * ins.quantity, 0)

  function parseBRL(v: string) { return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0 }
  const priceNum     = parseBRL(price)
  const laborCostNum = parseBRL(laborCost)
  const margin       = priceNum - laborCostNum - productsCostCalc
  const marginPct    = priceNum > 0 ? (margin / priceNum) * 100 : 0

  useEffect(() => {
    if (state?.success) onSuccess?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success])

  function toggleBranch(id: string) {
    setSelectedBranches(p => p.includes(id) ? p.filter(b => b !== id) : [...p, id])
  }

  function calcUnitCost(prod: Product): number {
    const cp  = parseFloat(String(prod.cost_price ?? 0)) || 0
    const upp = parseFloat(String(prod.units_per_package ?? 0)) || 0
    if (upp > 0 && prod.consumption_unit) return cp / upp
    return cp
  }

  function addInsumo() {
    if (products.length === 0) return
    const first = products[0]!
    setInsumos(p => [...p, { product_id: first.id, quantity: 1, unit_cost: calcUnitCost(first) }])
  }

  function removeInsumo(i: number) {
    setInsumos(p => p.filter((_, idx) => idx !== i))
  }

  function makeCurrencyHandler(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '')
      const num    = parseInt(digits || '0', 10) / 100
      setter(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    }
  }
  const handlePriceInput     = makeCurrencyHandler(setPrice)
  const handleLaborCostInput = makeCurrencyHandler(setLaborCost)

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isEdit && <input type="hidden" name="_procedureId" value={existing!.id} />}
      <input type="hidden" name="branch_ids"     value={JSON.stringify(selectedBranches)} />
      <input type="hidden" name="products"       value={JSON.stringify(insumos)} />
      <input type="hidden" name="branch_pricing" value={branchPricingPayload} />

      {/* -- Dados básicos -- */}
      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Nome *">
            <input name="name" type="text" required className="field"
              defaultValue={existing?.name} placeholder="Ex: Toxina botulínica" />
          </Field>
        </div>

        <Field label="Categoria *">
          <select name="category" required className="field" defaultValue={existing?.category ?? ''}>
            <option value="" disabled>Selecione…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Duração (minutos) *">
          <input name="duration_min" type="number" required className="field"
            min={1} defaultValue={existing?.duration_min ?? 60} />
        </Field>

        <Field label="Preço (R$) *">
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5, color: 'var(--text-muted)', pointerEvents: 'none' }}>
              R$
            </span>
            <input
              name="price" type="text" required className="field"
              value={price}
              onChange={handlePriceInput}
              placeholder="0,00"
              style={{ paddingLeft: 30 }}
            />
          </div>
        </Field>

        <Field label="Visível no app do cliente">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 6 }}>
            <input type="checkbox" name="visible_on_client_app"
              defaultChecked={existing?.visible_on_client_app ?? true}
              style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-soft)' }}>
              Permitir agendamento self-service
            </span>
          </label>
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Ficha de anamnese" hint="Opcional — preenchida pelo profissional durante o atendimento">
            <select name="anamnesis_form_id" className="field" defaultValue={existing?.anamnesis_form_id ?? ''}>
              <option value="">Nenhuma</option>
              {anamnesisForms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Descrição">
            <textarea name="description" rows={2} className="field"
              defaultValue={existing?.description ?? ''}
              placeholder="Descrição opcional para a equipe…"
              style={{ resize: 'vertical' }} />
          </Field>
        </div>
      </div>

      {/* -- Disponibilidade por filial -- */}
      <div>
        <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 8 }}>
          DISPONÍVEL NAS FILIAIS
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10 }}>
          Sem seleção = disponível em toda a rede
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {branches.map(b => {
            const on = selectedBranches.includes(b.id)
            return (
              <button key={b.id} type="button" onClick={() => toggleBranch(b.id)} style={{
                padding: '5px 12px',
                background: on ? 'var(--brand-soft)' : 'var(--bg-app)',
                border: `1.5px solid ${on ? 'var(--brand-soft-border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-chip-token)',
                fontSize: 12.5, fontWeight: 'var(--weight-bold)',
                color: on ? 'var(--brand)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}>
                {b.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* -- Insumos -- */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            INSUMOS UTILIZADOS
          </p>
          {products.length > 0 && (
            <button type="button" onClick={addInsumo} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11.5, fontWeight: 700, color: 'var(--brand)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              <Plus size={13} /> Adicionar insumo
            </button>
          )}
        </div>

        {products.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
            Nenhum produto cadastrado no estoque ainda.
          </p>
        )}

        {insumos.length === 0 && products.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
            Nenhum insumo adicionado. Clique em "Adicionar insumo" para vincular produtos do estoque.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insumos.map((ins, i) => {
            const prod = products.find(p => p.id === ins.product_id)
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Produto */}
                <select
                  className="field"
                  style={{ flex: 1 }}
                  value={ins.product_id}
                  onChange={e => {
                    const newProd = products.find(p => p.id === e.target.value)
                    setInsumos(p => p.map((x, idx) => idx === i ? {
                      ...x,
                      product_id: e.target.value,
                      unit_cost: newProd ? calcUnitCost(newProd) : 0,
                    } : x))
                  }}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit}) — {p.branch_name}</option>
                  ))}
                </select>

                {/* Quantidade */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number" min={0.001} step={0.001} className="field"
                    style={{ width: 80 }}
                    value={ins.quantity}
                    onChange={e => setInsumos(p => p.map((x, idx) => idx === i ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))}
                  />
                  <span style={{ fontSize: 11.5, color: 'var(--text-faint)', minWidth: 24 }}>
                    {(prod?.consumption_unit && prod?.units_per_package) ? prod.consumption_unit : (prod?.unit ?? '')}
                  </span>
                </div>

                {/* Custo unitário */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="number" min={0} step={0.01} className="field"
                    style={{ width: 100, paddingLeft: 28 }}
                    value={ins.unit_cost}
                    onChange={e => setInsumos(p => p.map((x, idx) => idx === i ? { ...x, unit_cost: parseFloat(e.target.value) || 0 } : x))}
                    placeholder="0,00"
                    title="Custo por unidade"
                  />
                </div>

                <button type="button" onClick={() => removeInsumo(i)} style={{
                  width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg-app)', color: 'var(--text-faint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* -- Custos e margem -- */}
      <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
          Custos
        </p>
        <div className="form-3col">
          {/* Mão de obra */}
          <Field label="Mão de obra">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5, color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
              <input
                name="labor_cost" type="text" className="field"
                value={laborCost}
                onChange={handleLaborCostInput}
                placeholder="0,00"
                style={{ paddingLeft: 30 }}
              />
            </div>
          </Field>

          {/* Custo dos produtos — calculado dos insumos */}
          <Field label="Custo dos produtos" hint="Calculado dos insumos">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5, color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
              <div className="field" style={{ paddingLeft: 30, background: 'var(--surface)', color: insumos.length > 0 ? 'var(--text)' : 'var(--text-faint)', cursor: 'default', userSelect: 'none' }}>
                {insumos.length > 0 ? formatPrice(productsCostCalc) : '—'}
              </div>
            </div>
          </Field>

          {/* Margem bruta */}
          <Field label="Margem bruta">
            <div className="field" style={{
              background: 'var(--surface)', cursor: 'default', userSelect: 'none',
              fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
              color: priceNum === 0 ? 'var(--text-faint)' : margin >= 0 ? '#16a34a' : '#dc2626',
            }}>
              {priceNum === 0 ? '—' : (
                <>
                  {formatPrice(margin)}
                  <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.75 }}>
                    {marginPct.toFixed(1).replace('.', ',')}%
                  </span>
                </>
              )}
            </div>
          </Field>
        </div>
      </div>

      {/* -- Personalizar valores por filial (acordeão) -- */}
      {branches.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Gatilho do acordeão */}
          <button
            type="button"
            onClick={() => setBranchPricingOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 14px', background: 'var(--bg-app)', border: 'none', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Personalizar valores por filial
              </span>
              {branchPricing.some(b => b.price !== '' || b.labor_cost !== '') && (
                <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--brand-soft)', color: 'var(--brand)', border: '1px solid var(--brand-soft-border)', borderRadius: 99, padding: '1px 7px' }}>
                  {branchPricing.filter(b => b.price !== '' || b.labor_cost !== '').length} filial(is) com override
                </span>
              )}
            </div>
            <ChevronDown
              size={15}
              color="var(--text-muted)"
              style={{ transform: branchPricingOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }}
            />
          </button>

          {/* Conteúdo do acordeão */}
          {branchPricingOpen && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', padding: '8px 14px 6px' }}>
                Deixe em branco para usar os valores base do procedimento.
              </p>
              {/* Header da tabela */}
              <div className="form-3col" style={{ background: 'var(--bg-app)', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--border)', padding: '6px 12px' }}>
                {['Filial', 'Preço', 'Mão de obra'].map(h => (
                  <span key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>
              {branches.map((b, i) => {
                const ov = branchPricing.find(bp => bp.branch_id === b.id) ?? { branch_id: b.id, price: '', labor_cost: '' }
                return (
                  <div key={b.id} className="form-3col" style={{
                    padding: '8px 12px', alignItems: 'center',
                    borderBottom: i < branches.length - 1 ? '1px solid var(--hairline)' : undefined,
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{b.name}</span>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
                      <input type="text" className="field" value={ov.price}
                        onChange={branchOverrideInput(b.id, 'price')}
                        placeholder={price || '—'}
                        style={{ paddingLeft: 26, fontSize: 12, height: 32 }} />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
                      <input type="text" className="field" value={ov.labor_cost}
                        onChange={branchOverrideInput(b.id, 'labor_cost')}
                        placeholder={laborCost || '—'}
                        style={{ paddingLeft: 26, fontSize: 12, height: 32 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* -- Feedback -- */}
      {state?.error && (
        <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          <CheckCircle2 size={14} /> {isEdit ? 'Procedimento atualizado.' : 'Procedimento criado com sucesso.'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={pending}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? (isEdit ? 'Salvando…' : 'Criando…') : (isEdit ? 'Salvar alterações' : 'Criar procedimento')}
        </button>
      </div>
    </form>
  )
}
