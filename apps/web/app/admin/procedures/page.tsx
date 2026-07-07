import { notFound } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProcedureModal } from '@/components/admin/procedure-modal'
import { ToggleProcedureBtn } from '@/components/admin/toggle-procedure-btn'
import { Pencil, Smartphone } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

function formatBRL(v: string | number) {
  return parseFloat(String(v)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function AdminProceduresPage() {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'FINANCIAL'])
  const canEdit = ctx.role === 'NETWORK_ADMIN'

  const admin = createAdminClient()

  // Queries paralelas sem usar embed do PostgREST (evita dependência do schema cache)
  const [
    { data: branches },
    { data: procedures, error: proceduresError },
    { data: products },
  ] = await Promise.all([
    admin.from('branches').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'),

    admin.from('procedures')
      .select('id, name, category, description, duration_min, price, labor_cost, visible_on_client_app, is_active, created_at')
      .eq('tenant_id', ctx.tenantId!).is('branch_id', null)
      .order('category').order('name'),

    admin.from('products').select('id, name, unit, branch_id, cost_price, consumption_unit, units_per_package')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'),
  ])

  if (proceduresError) console.error('[AdminProcedures]', proceduresError.message)

  const baseProcs = procedures ?? []

  // Busca dados relacionados separadamente (sem depender do schema cache do PostgREST)
  const procIds = baseProcs.map(p => p.id)

  const [
    { data: availability },
    { data: procProducts },
    { data: branchPricing },
  ] = procIds.length > 0
    ? await Promise.all([
        admin.from('procedure_branch_availability').select('procedure_id, branch_id').in('procedure_id', procIds),
        admin.from('procedure_products').select('procedure_id, product_id, quantity, unit_cost').in('procedure_id', procIds),
        admin.from('procedure_branch_pricing').select('procedure_id, branch_id, price, labor_cost').in('procedure_id', procIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  // Junta os dados manualmente
  const procList = baseProcs.map(p => ({
    ...p,
    procedure_branch_availability: (availability   ?? []).filter(a  => a.procedure_id  === p.id),
    procedure_products:            (procProducts   ?? []).filter(pp => pp.procedure_id  === p.id),
    procedure_branch_pricing:      (branchPricing  ?? []).filter(bp => bp.procedure_id  === p.id),
  }))

  // Usa as filiais já carregadas para montar o mapa de nomes (sem embed PostgREST)
  const branchNameMap = Object.fromEntries((branches ?? []).map(b => [b.id, b.name]))

  const productList = (products ?? []).map(p => ({
    id:                p.id,
    name:              p.name,
    unit:              p.unit,
    branch_name:       p.branch_id ? (branchNameMap[p.branch_id] ?? '—') : 'Rede',
    cost_price:        p.cost_price ?? null,
    consumption_unit:  p.consumption_unit ?? null,
    units_per_package: p.units_per_package ?? null,
  }))

  // Agrupa por categoria
  const grouped = procList.reduce<Record<string, typeof procList>>((acc, p) => {
    const cat = p.category ?? 'Outros'
    if (!acc[cat]) acc[cat] = []
    acc[cat]!.push(p)
    return acc
  }, {})

  const totalActive   = procList.filter(p => p.is_active).length
  const totalInactive = procList.filter(p => !p.is_active).length
  const branchList    = branches ?? []

  return (
    <div>
      <RealtimeRefresher tables={['procedures', 'products']} />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Procedimentos
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {totalActive} ativos · {totalInactive} inativos · catálogo da rede
          </p>
        </div>
        {canEdit && <ProcedureModal branches={branchList} products={productList} />}
      </div>

      {/* Lista agrupada por categoria */}
      {Object.entries(grouped).map(([cat, procs]) => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            {cat}
          </p>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Procedimento', 'Duração', 'Preço', 'Filiais', 'App', 'Situação', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: 'var(--text-overline)', fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {procs.map((p, i) => {
                  const availability = p.procedure_branch_availability as { branch_id: string }[] | null
                  const branchCount  = availability?.length ?? 0
                  const branchLabel  = branchCount === 0
                    ? 'Toda a rede'
                    : `${branchCount} ${branchCount === 1 ? 'filial' : 'filiais'}`

                  const existingForEdit = {
                    id:                   p.id,
                    name:                 p.name,
                    category:             p.category,
                    description:          p.description,
                    duration_min:         p.duration_min,
                    price:                p.price,
                    labor_cost:           p.labor_cost,
                    visible_on_client_app: p.visible_on_client_app,
                    is_active:            p.is_active,
                    branch_ids:           (availability ?? []).map(a => a.branch_id),
                    procedure_products:   (p.procedure_products   as { product_id: string; quantity: number; unit_cost: number }[]              | null) ?? [],
                    branch_pricing:       (p.procedure_branch_pricing as { branch_id: string; price: number | null; labor_cost: number | null }[] | null) ?? [],
                  }

                  return (
                    <tr key={p.id} style={{ borderBottom: i < procs.length - 1 ? '1px solid var(--hairline)' : undefined, opacity: p.is_active ? 1 : 0.55 }}>
                      <td style={{ padding: '13px 16px' }}>
                        <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                        {p.description && (
                          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>{p.duration_min} min</span>
                      </td>
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>{formatBRL(p.price)}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: branchCount === 0 ? 'var(--brand)' : 'var(--text-soft)',
                          background: branchCount === 0 ? 'var(--brand-soft)' : 'var(--bg-app)',
                          border: `1px solid ${branchCount === 0 ? 'var(--brand-soft-border)' : 'var(--border)'}`,
                          padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                        }}>
                          {branchLabel}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {p.visible_on_client_app
                          ? <Smartphone size={14} color="var(--brand)" aria-label="Visível no app" />
                          : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span className={p.is_active ? 'chip chip-success' : 'chip chip-muted'}>
                          {p.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <ProcedureModal
                              branches={branchList}
                              products={productList}
                              existing={existingForEdit}
                              trigger={
                                <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-xs-sz)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Pencil size={13} /> Editar
                                </button>
                              }
                            />
                            <ToggleProcedureBtn
                              procedureId={p.id}
                              isActive={p.is_active}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {procList.length === 0 && (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 16 }}>
            Nenhum procedimento cadastrado na rede ainda.
          </p>
          <ProcedureModal branches={branchList} products={productList} />
        </div>
      )}
    </div>
  )
}
