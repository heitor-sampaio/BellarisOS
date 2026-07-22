import Link from 'next/link'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RolesEditor } from '@/components/admin/roles-editor'
import type { AppModule, PermissionLevel } from '@estetica-os/types'
import { SettingsIntegrations } from '@/components/admin/settings-integrations'
import { SettingsBranches } from '@/components/admin/settings-branches'
import { SettingsAnamnesis, type AdminAnamnesisForm } from '@/components/admin/settings-anamnesis'
import { SettingsAttendance, type AdminAttendanceForm } from '@/components/admin/settings-attendance'
import { normalizeFormSchema } from '@/lib/anamnesis'
import type { IntegrationConfig } from '@/actions/integrations'

const TABS = [
  { key: 'unidades',      label: 'Unidades'     },
  { key: 'permissions',   label: 'Cargos'       },
  { key: 'anamnese',      label: 'Anamnese'     },
  { key: 'atendimento',   label: 'Atendimento'  },
  { key: 'integrations',  label: 'Integrações'  },
  { key: 'general',       label: 'Geral'        },
] as const
type TabKey = typeof TABS[number]['key']

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; meta_step?: string; meta_error?: string; meta_error_reason?: string }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const { tab: tabParam, meta_step, meta_error, meta_error_reason } = await searchParams
  const activeTab: TabKey = (tabParam as TabKey) ?? 'permissions'

  const supabase = await createClient()
  const admin    = createAdminClient()

  const [{ data: allRoles }, { data: overrides }, { data: integrationRows }, { data: anamnesisRows }, { data: attendanceRows }] = await Promise.all([
    supabase
      .from('tenant_roles')
      .select('id, key, label, is_system')
      .eq('tenant_id', ctx.tenantId!)
      .order('is_system', { ascending: false })
      .order('created_at'),
    supabase
      .from('role_permissions')
      .select('role_id, module, level')
      .eq('tenant_id', ctx.tenantId!),
    admin
      .from('integration_configs')
      .select('id, provider, config, is_active, updated_at')
      .eq('tenant_id', ctx.tenantId!),
    admin
      .from('anamnesis_forms')
      .select('id, name, schema, is_active')
      .eq('tenant_id', ctx.tenantId!)
      .order('created_at'),
    admin
      .from('attendance_forms')
      .select('id, name, schema, is_active')
      .eq('tenant_id', ctx.tenantId!)
      .order('created_at'),
  ])

  const integrationConfigs = (integrationRows ?? []) as IntegrationConfig[]
  const anamnesisForms: AdminAnamnesisForm[] = (anamnesisRows ?? []).map((r: any) => ({
    id:       r.id as string,
    name:     r.name as string,
    rows:     normalizeFormSchema(r.schema).rows,
    isActive: !!r.is_active,
  }))
  const attendanceForms: AdminAttendanceForm[] = (attendanceRows ?? []).map((r: any) => ({
    id:       r.id as string,
    name:     r.name as string,
    rows:     normalizeFormSchema(r.schema).rows,
    isActive: !!r.is_active,
  }))

  // Mapa cargo → { módulo: nível } para o editor
  const permsByRole: Record<string, Partial<Record<AppModule, PermissionLevel>>> = {}
  for (const o of (overrides ?? []) as { role_id: string | null; module: string; level: PermissionLevel }[]) {
    if (!o.role_id) continue
    ;(permsByRole[o.role_id] ??= {})[o.module as AppModule] = o.level
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Configurações
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Preferências globais da rede
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab
          return (
            <Link
              key={tab.key}
              href={`/admin/settings?tab=${tab.key}`}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
                color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                textDecoration: 'none', transition: 'color 120ms', marginBottom: -1,
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {activeTab === 'unidades' && (
        <SettingsBranches />
      )}

      {activeTab === 'permissions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
              Cargos e acessos
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
              Crie um cargo com qualquer nome e defina, por módulo, o nível de acesso. O cargo <strong>Admin da rede</strong> tem acesso total e não pode ser editado.
            </p>
          </div>
          <RolesEditor roles={allRoles ?? []} permsByRole={permsByRole} />
        </div>
      )}

      {activeTab === 'anamnese' && (
        <SettingsAnamnesis forms={anamnesisForms} />
      )}

      {activeTab === 'atendimento' && (
        <SettingsAttendance forms={attendanceForms} />
      )}

      {activeTab === 'integrations' && (
        <SettingsIntegrations
          initialConfigs={integrationConfigs}
          metaStep={meta_step}
          metaError={meta_error === '1'}
          metaErrorReason={meta_error_reason}
        />
      )}

      {activeTab === 'general' && (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Em breve: configurações gerais da rede (nome, logo, plano).
          </p>
        </div>
      )}
    </div>
  )
}
