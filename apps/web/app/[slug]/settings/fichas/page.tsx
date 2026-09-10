import Link from 'next/link'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeFormSchema } from '@/lib/anamnesis'
import { SettingsAnamnesis, type AdminAnamnesisForm } from '@/components/admin/settings-anamnesis'
import { SettingsAttendance, type AdminAttendanceForm } from '@/components/admin/settings-attendance'

/**
 * Modelos de ficha no portal da unidade.
 *
 * Os construtores existiam só dentro de `/admin/settings`, e o portal da rede
 * barra quem tem unidade fixa (`app/admin/layout.tsx`: branch_id não nulo é
 * redirecionado). Resultado: dar `forms: MANAGE` a uma gerente de unidade não
 * fazia nada — a única tela que o módulo governa ficava fora do alcance dela.
 *
 * Os modelos são da REDE (`anamnesis_forms.tenant_id`, sem branch_id): editar
 * aqui muda o molde para todas as unidades. É o que o aviso no topo diz.
 */

const TABS = [
  { key: 'anamnese',    label: 'Anamnese'   },
  { key: 'atendimento', label: 'Atendimento' },
] as const
type TabKey = typeof TABS[number]['key']

export default async function BranchFormsPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug }       = await params
  const { tab: rawTab } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'forms', 'MANAGE')

  const activeTab: TabKey = rawTab === 'atendimento' ? 'atendimento' : 'anamnese'

  const admin = createAdminClient()

  const [{ data: anamnesisRows, error: anamnesisError }, { data: attendanceRows, error: attendanceError }] =
    await Promise.all([
      admin.from('anamnesis_forms')
        .select('id, name, schema, is_active')
        .eq('tenant_id', ctx.tenantId!)
        .order('created_at'),
      admin.from('attendance_forms')
        .select('id, name, schema, is_active')
        .eq('tenant_id', ctx.tenantId!)
        .order('created_at'),
    ])

  if (anamnesisError || attendanceError) {
    console.error('[branch/fichas]', anamnesisError?.message ?? attendanceError?.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        Não foi possível carregar os modelos agora. Tente recarregar em instantes.
      </div>
    )
  }

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

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
        }}>
          Modelos de ficha
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          O molde que os profissionais preenchem no atendimento. Preencher a ficha de um cliente é Prontuário.
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 24,
        background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '10px 14px',
      }}>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
          Os modelos valem para a rede inteira. Alterar aqui muda a ficha de todas as unidades.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab
          return (
            <Link
              key={tab.key}
              href={`/${slug}/settings/fichas?tab=${tab.key}`}
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

      {activeTab === 'anamnese'    && <SettingsAnamnesis  forms={anamnesisForms} />}
      {activeTab === 'atendimento' && <SettingsAttendance forms={attendanceForms} />}
    </div>
  )
}
