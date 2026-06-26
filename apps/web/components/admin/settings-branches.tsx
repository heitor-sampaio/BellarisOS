import { createClient } from '@/lib/supabase/server'
import { getTenantContext } from '@/lib/auth'
import { BranchForm } from '@/components/admin/branch-form'
import { toggleBranchStatus } from '@/actions/branches'
import { MapPin, Mail, Phone, Power, PowerOff, ChevronRight } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import Link from 'next/link'

export async function SettingsBranches() {
  const ctx = await getTenantContext()
  const supabase = await createClient()

  const { data: branches } = await supabase
    .from('branches')
    .select(`
      id, name, slug, email, phone, city, state, is_active, created_at,
      users(id)
    `)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: true })

  const total    = branches?.length ?? 0
  const active   = branches?.filter(b => b.is_active).length ?? 0
  const inactive = total - active

  return (
    <div>
      <RealtimeRefresher tables={['branches']} />

      {/* Header da seção */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{
            fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
            color: 'var(--text)',
          }}>
            Unidades
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
            Gerencie as unidades da rede
          </p>
        </div>
        <BranchForm />
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total',    value: total,    chip: 'chip chip-muted'    },
          { label: 'Ativas',   value: active,   chip: 'chip chip-success'  },
          { label: 'Inativas', value: inactive, chip: 'chip chip-muted'    },
        ].map(k => (
          <div key={k.label} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
            <span style={{ fontSize: 'var(--text-kpi)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)' }}>
              {k.value}
            </span>
            <span className={k.chip}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* Cards */}
      {!branches?.length ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhuma unidade cadastrada. Crie a primeira unidade da rede.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {branches.map(branch => {
            const memberCount = Array.isArray(branch.users) ? branch.users.length : 0
            const location = [branch.city, branch.state].filter(Boolean).join(' · ')

            return (
              <div
                key={branch.id}
                className="card"
                style={{ opacity: branch.is_active ? 1 : 0.6, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
                      color: 'var(--text)', letterSpacing: 'var(--tracking-tight)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {branch.name}
                    </p>
                    <code style={{
                      fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
                      background: 'var(--bg-app)', padding: '1px 6px',
                      borderRadius: 6, marginTop: 4, display: 'inline-block',
                      border: '1px solid var(--border)',
                    }}>
                      /{branch.slug}
                    </code>
                  </div>
                  <span className={branch.is_active ? 'chip chip-success' : 'chip chip-muted'} style={{ flexShrink: 0, marginLeft: 10 }}>
                    {branch.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                {/* Detalhes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      <MapPin size={12} style={{ flexShrink: 0 }} /> {location}
                    </span>
                  )}
                  {branch.email && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      <Mail size={12} style={{ flexShrink: 0 }} /> {branch.email}
                    </span>
                  )}
                  {branch.phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      <Phone size={12} style={{ flexShrink: 0 }} /> {branch.phone}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: 14, borderTop: '1px solid var(--hairline)',
                }}>
                  <form action={async () => {
                    'use server'
                    await toggleBranchStatus(branch.id, !branch.is_active)
                  }}>
                    <button
                      type="submit"
                      className="btn-ghost"
                      style={{ fontSize: 'var(--text-xs-sz)', gap: 5, color: branch.is_active ? 'var(--text-faint)' : 'var(--success)' }}
                    >
                      {branch.is_active
                        ? <><PowerOff size={13} /> Desativar</>
                        : <><Power size={13} /> Reativar</>
                      }
                    </button>
                  </form>

                  <Link
                    href={`/admin/branches/${branch.id}`}
                    className="btn-ghost"
                    style={{ fontSize: 'var(--text-xs-sz)', gap: 4, color: 'var(--brand)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                  >
                    Ver detalhes <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
