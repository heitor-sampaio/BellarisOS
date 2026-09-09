import Link from 'next/link'
import { getTenantContext, assertAnyPermission, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RolesEditor } from '@/components/admin/roles-editor'
import type { AppModule, PermissionLevel, PermissionScope } from '@estetica-os/types'
import type { RoleModulePermission } from '@/components/admin/roles-editor'
import { SettingsIntegrations } from '@/components/admin/settings-integrations'
import { SettingsBranches } from '@/components/admin/settings-branches'
import { SettingsAnamnesis, type AdminAnamnesisForm } from '@/components/admin/settings-anamnesis'
import { SettingsAttendance, type AdminAttendanceForm } from '@/components/admin/settings-attendance'
import { normalizeFormSchema } from '@/lib/anamnesis'
import type { IntegrationConfig } from '@/actions/integrations'
import { SettingsLgpd } from '@/components/admin/settings-lgpd'
import { listDataRequests } from '@/actions/lgpd'

// Cada aba declara o módulo que a governa: a tela é uma só, mas os assuntos são
// de três módulos diferentes desde a quebra de `settings`.
const TABS = [
  { key: 'unidades',      label: 'Unidades',     module: 'settings' },
  { key: 'permissions',   label: 'Cargos',       module: 'roles'    },
  { key: 'anamnese',      label: 'Anamnese',     module: 'forms'    },
  { key: 'atendimento',   label: 'Atendimento',  module: 'forms'    },
  { key: 'integrations',  label: 'Integrações',  module: 'settings' },
  { key: 'lgpd',          label: 'LGPD',         module: 'settings' },
  { key: 'general',       label: 'Geral',        module: 'settings' },
] as const satisfies readonly { key: string; label: string; module: AppModule }[]
type TabKey = typeof TABS[number]['key']

const TAB_MODULES = new Map<TabKey, AppModule>(TABS.map(t => [t.key, t.module]))

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; meta_step?: string; meta_error?: string; meta_error_reason?: string }>
}) {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, ['settings', 'roles', 'forms'], 'MANAGE')

  const tabs = TABS.filter(t => can(ctx, t.module, 'MANAGE'))

  const { tab: tabParam, meta_step, meta_error, meta_error_reason } = await searchParams
  const requested = tabParam as TabKey | undefined
  // Cai na primeira aba permitida quando o link aponta para uma que este cargo
  // não acessa — em vez de renderizar a tela vazia.
  const activeTab: TabKey =
    requested && tabs.some(t => t.key === requested) ? requested : tabs[0]!.key

  const activeModule = TAB_MODULES.get(activeTab)!
  const supabase = await createClient()
  const admin    = createAdminClient()

  // Cada bloco só é buscado quando a aba correspondente está aberta: as demais
  // não usam o dado, e o admin client ignora RLS.
  const wantsRoles = activeTab === 'permissions'
  const wantsForms = activeModule === 'forms'

  const [{ data: allRoles }, { data: overrides }, { data: integrationRows }, { data: anamnesisRows }, { data: attendanceRows }] = await Promise.all([
    wantsRoles
      ? supabase
          .from('tenant_roles')
          .select('id, key, label, is_system')
          .eq('tenant_id', ctx.tenantId!)
          .order('is_system', { ascending: false })
          .order('created_at')
      : { data: [] },
    wantsRoles
      ? supabase
          .from('role_permissions')
          .select('role_id, module, level, scope')
          .eq('tenant_id', ctx.tenantId!)
      : { data: [] },
    activeTab === 'integrations'
      ? admin
          .from('integration_configs')
          .select('id, provider, config, is_active, updated_at')
          .eq('tenant_id', ctx.tenantId!)
      : { data: [] },
    wantsForms
      ? admin
          .from('anamnesis_forms')
          .select('id, name, schema, is_active')
          .eq('tenant_id', ctx.tenantId!)
          .order('created_at')
      : { data: [] },
    wantsForms
      ? admin
          .from('attendance_forms')
          .select('id, name, schema, is_active')
          .eq('tenant_id', ctx.tenantId!)
          .order('created_at')
      : { data: [] },
  ])

  // Só carrega quando a aba está aberta: a lista não é usada nas outras.
  const lgpdRequests = activeTab === 'lgpd' ? await listDataRequests() : []

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

  // Mapa cargo → { módulo: { nível, escopo } } para o editor
  const permsByRole: Record<string, Partial<Record<AppModule, RoleModulePermission>>> = {}
  for (const o of (overrides ?? []) as PermissionRow[]) {
    if (!o.role_id) continue
    ;(permsByRole[o.role_id] ??= {})[o.module as AppModule] = {
      level: o.level,
      scope: o.scope ?? 'ALL',
    }
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
        {tabs.map(tab => {
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

      {activeTab === 'lgpd' && (
        <SettingsLgpd
          requests={lgpdRequests}
          canReviewMedical={ctx.permissions.medical_records === 'MANAGE'}
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

type PermissionRow = {
  role_id: string | null
  module: string
  level: PermissionLevel
  scope: PermissionScope | null
}
