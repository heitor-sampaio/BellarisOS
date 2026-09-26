import Link from 'next/link'
import { getTenantContext, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RolesEditor } from '@/components/admin/roles-editor'
import type { AppModule, PermissionLevel, PermissionScope, ReportTab } from '@estetica-os/types'
import type { RoleModulePermission } from '@/components/admin/roles-editor'
import { SettingsIntegrations } from '@/components/admin/settings-integrations'
import { SettingsBranches } from '@/components/admin/settings-branches'
import { SettingsFichas, type ItemDeFicha } from '@/components/admin/settings-fichas'
import { normalizeFormSchema } from '@/lib/anamnesis'
import type { IntegrationConfig } from '@/actions/integrations'
import { listarNumerosWhatsApp, opcoesDeVinculoDoNumero } from '@/actions/integrations'
import { SettingsLgpd } from '@/components/admin/settings-lgpd'
import { listDataRequests } from '@/actions/lgpd'
import { SettingsEventos } from '@/components/admin/settings-eventos'
import { listarEventosDeDominio, resumoDoCatalogo } from '@/actions/eventos'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { SegSelect } from '@/components/shared/seg-select'
import { SettingsGeral } from '@/components/admin/settings-geral'
import { lerDadosDaRede, lerVisibilidadeDoInbox } from '@/actions/rede'
import { SettingsVisibilidadeInbox } from '@/components/admin/settings-visibilidade-inbox'

/**
 * Corpo de Configurações, usado pelos dois portais.
 *
 * Configuração é dado da REDE: cargos, modelos de ficha e integrações valem
 * para todas as unidades. Mesmo assim a tela precisa existir em `/[slug]`,
 * porque quem tem unidade fixa não entra no portal da rede
 * (`app/admin/layout.tsx` redireciona) — e era o que fazia `settings`, `roles`
 * ou `forms` em MANAGE não valerem nada numa gerente de unidade.
 *
 * Quais abas cada portal oferece é decisão da página, não daqui: `/admin` abre
 * as sete, a unidade fica sem "Unidades" (o card leva a `/admin/branches`) e
 * sem "LGPD" (a lista é da rede inteira, sem recorte por unidade).
 */

// Cada aba declara o módulo que a governa: a tela é uma só, mas os assuntos são
// de três módulos diferentes desde a quebra de `settings`.
const TABS = [
  { key: 'unidades',      label: 'Unidades',     module: 'settings' },
  { key: 'permissions',   label: 'Cargos',       module: 'roles'    },
  { key: 'fichas',        label: 'Fichas',       module: 'forms'    },
  { key: 'integrations',  label: 'Integrações',  module: 'settings' },
  { key: 'lgpd',          label: 'LGPD',         module: 'settings' },
  { key: 'eventos',       label: 'Eventos',      module: 'settings' },
  { key: 'general',       label: 'Geral',        module: 'settings' },
] as const satisfies readonly { key: string; label: string; module: AppModule }[]

export type ChaveDeAba = typeof TABS[number]['key']

const TAB_MODULES = new Map<ChaveDeAba, AppModule>(TABS.map(t => [t.key, t.module]))

/** Todas as abas — o portal da rede. */
export const ABAS_DA_REDE: readonly ChaveDeAba[] =
  TABS.map(t => t.key)

/** O que a unidade governa sem sair do próprio portal nem ver outra unidade. */
export const ABAS_DA_UNIDADE: readonly ChaveDeAba[] =
  ['permissions', 'fichas', 'integrations', 'general']

interface Props {
  /** Prefixo dos links de aba: `/admin/settings` ou `/${slug}/settings`. */
  basePath:         string
  /** Abas que este portal oferece, antes do filtro de permissão. */
  abas:             readonly ChaveDeAba[]
  /** `?tab=` da URL. */
  abaPedida?:       string
  subtitulo:        string
  /** Faixa de aviso acima das abas — a unidade lembra que o dado é da rede. */
  aviso?:           string
  /** Liga o atalho "ver quem tem este cargo", que leva a `/admin/team`. */
  atalhoParaEquipe: boolean
  metaStep?:        string
  metaError?:       string
  metaErrorReason?: string
}

type PermissionRow = {
  role_id: string | null
  module: string
  level: PermissionLevel
  scope: PermissionScope | null
}

export async function Configuracoes({
  basePath, abas, abaPedida, subtitulo, aviso, atalhoParaEquipe,
  metaStep, metaError, metaErrorReason,
}: Props) {
  const ctx = await getTenantContext()

  const tabs = TABS.filter(t => abas.includes(t.key) && can(ctx, t.module, 'MANAGE'))
  if (tabs.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        Nenhuma configuração disponível para o seu acesso.
      </div>
    )
  }

  const requested = abaPedida as ChaveDeAba | undefined
  // Cai na primeira aba permitida quando o link aponta para uma que este cargo
  // não acessa — em vez de renderizar a tela vazia.
  const activeTab: ChaveDeAba =
    requested && tabs.some(t => t.key === requested) ? requested : tabs[0]!.key

  const activeModule = TAB_MODULES.get(activeTab)!
  const supabase = await createClient()
  const admin    = createAdminClient()

  // Cada bloco só é buscado quando a aba correspondente está aberta: as demais
  // não usam o dado, e o admin client ignora RLS.
  const wantsRoles = activeTab === 'permissions'
  const wantsForms = activeModule === 'forms'

  const [{ data: allRoles, error: rolesError }, { data: overrides }, { data: abasDeRelatorio }, { data: integrationRows }, { data: formRows }] = await Promise.all([
    // Admin client de propósito: a policy de SELECT em `users` limita quem não
    // é da rede à própria unidade, e a contagem sairia menor do que a real —
    // "0 pessoas" num cargo que tem gente em outra unidade é pior que nada.
    wantsRoles
      ? admin
          .from('tenant_roles')
          .select('id, key, label, is_system, users(count)')
          .eq('tenant_id', ctx.tenantId!)
          .order('is_system', { ascending: false })
          .order('created_at')
      : { data: [], error: null },
    wantsRoles
      ? supabase
          .from('role_permissions')
          .select('role_id, module, level, scope')
          .eq('tenant_id', ctx.tenantId!)
      : { data: [] },
    wantsRoles
      ? supabase
          .from('role_report_tabs')
          .select('role_id, tab')
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
          .from('forms')
          .select('id, name, schema, is_active')
          .eq('tenant_id', ctx.tenantId!)
          .order('created_at')
      : { data: [] },
  ])

  // Só carrega quando a aba está aberta: a lista não é usada nas outras.
  const lgpdRequests = activeTab === 'lgpd' ? await listDataRequests() : []

  // Idem para os dados da própria rede.
  const dadosDaRede = activeTab === 'general' ? await lerDadosDaRede() : null
  const visibilidadeDoInbox = wantsRoles ? await lerVisibilidadeDoInbox() : null

  // A corrente de eventos, idem. São duas consultas (o resumo agregado e as
  // últimas linhas) e nenhuma outra aba as usa.
  const [resumo, primeiraPagina] = activeTab === 'eventos'
    ? await Promise.all([resumoDoCatalogo(), listarEventosDeDominio()])
    : [null, null]

  const integrationConfigs = (integrationRows ?? []) as IntegrationConfig[]

  // As caixas de WhatsApp vêm da própria tabela delas, não de
  // `integration_configs`. Ler de um lugar e gravar no outro faria o formulário
  // reabrir com o valor antigo depois de salvar — e é exatamente o tipo de
  // divergência que não dá erro nenhum.
  const [numerosDeWhatsApp, opcoesDeVinculo] = activeTab === 'integrations'
    ? await Promise.all([listarNumerosWhatsApp(), opcoesDeVinculoDoNumero()])
    : [[], { unidades: [], pessoas: [] }]
  const fichas: ItemDeFicha[] = (formRows ?? []).map((r: any) => ({
    id:       r.id as string,
    name:     r.name as string,
    rows:     normalizeFormSchema(r.schema).rows,
    isActive: !!r.is_active,
  }))

  // Falha na consulta de cargos não é "a rede não tem cargo": sem checar, a
  // tela mostraria a lista vazia e convidaria a recriar o que já existe.
  if (rolesError) console.error('[configuracoes] tenant_roles:', rolesError.message)

  type RawRole = {
    id: string; key: string; label: string; is_system: boolean
    users?: { count: number }[] | null
  }
  const editorRoles = ((allRoles ?? []) as RawRole[]).map(r => ({
    id:          r.id,
    key:         r.key,
    label:       r.label,
    is_system:   r.is_system,
    memberCount: r.users?.[0]?.count ?? 0,
  }))

  // Mapa cargo → abas de Relatórios. Cargo ausente fica sem nenhuma: é a
  // decisão de produto de começar fechado e abrir aba a aba.
  const tabsByRole: Record<string, ReportTab[]> = {}
  for (const linha of (abasDeRelatorio ?? []) as { role_id: string; tab: string }[]) {
    (tabsByRole[linha.role_id] ??= []).push(linha.tab as ReportTab)
  }

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
          {subtitulo}
        </p>
      </div>

      {aviso && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 24,
          background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '10px 14px',
        }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
            {aviso}
          </p>
        </div>
      )}

      {/* Escolher o assunto da tela é escolha exclusiva, e no sistema isso é
          `<SegSelect>` — é o que Relatórios já usa para as abas dele. Aqui eram
          abas sublinhadas, com outra altura e outro jeito de mostrar o
          escolhido: a mesma pergunta com duas caras. Pedido do Heitor em
          2026-09-25.

          Em modo LINK (`basePath` + `paramName`), porque esta tela é Server
          Component e a aba mora na URL. E no celular o segmentado vira um
          botão que abre menu — melhor que a fila de abas rolando de lado. */}
      <div style={{ marginBottom: 28 }}>
        <SegSelect
          options={tabs.map(t => ({ key: t.key, label: t.label }))}
          value={activeTab}
          basePath={basePath}
          paramName="tab"
          ariaLabel="Assunto das configurações"
        />
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
          {/* O atalho do editor aponta para `/admin/team`: quem decide se ele
              aparece é o portal, não a abrangência de quem está olhando. */}
          <RolesEditor
            roles={editorRoles}
            permsByRole={permsByRole}
            tabsByRole={tabsByRole}
            canSeeTeam={atalhoParaEquipe && can(ctx, 'team', 'MANAGE')}
          />
          {/* Depois da matriz: refina o escopo "só os meus" que se escolhe nela. */}
          {visibilidadeDoInbox && (
            <SettingsVisibilidadeInbox
              inicial={visibilidadeDoInbox}
              podeEditar={can(ctx, 'roles', 'MANAGE')}
            />
          )}
        </div>
      )}

      {activeTab === 'fichas' && (
        <SettingsFichas forms={fichas} />
      )}

      {activeTab === 'integrations' && (
        <SettingsIntegrations
          initialConfigs={integrationConfigs}
          numeros={numerosDeWhatsApp}
          opcoesDeVinculo={opcoesDeVinculo}
          metaStep={metaStep}
          metaError={metaError === '1'}
          metaErrorReason={metaErrorReason}
        />
      )}

      {activeTab === 'lgpd' && (
        <SettingsLgpd
          requests={lgpdRequests}
          canReviewMedical={ctx.permissions.medical_records === 'MANAGE'}
        />
      )}

      {activeTab === 'eventos' && resumo && primeiraPagina && (
        <>
          {/* A corrente cresce enquanto a tela está aberta — quem veio conferir
              se um gatilho dispara quer ver o fato chegando, não recarregar. */}
          <RealtimeRefresher tables={['domain_events']} debounceMs={1500} />
          <SettingsEventos
            linhasIniciais={resumo.linhas}
            eventosIniciais={primeiraPagina.eventos}
            fimInicial={primeiraPagina.fim}
            desdeQuando={resumo.desdeQuando}
            erro={resumo.error ?? primeiraPagina.error}
          />
        </>
      )}

      {activeTab === 'general' && (
        dadosDaRede
          ? <SettingsGeral rede={dadosDaRede} podeEditar={can(ctx, 'settings', 'MANAGE')} />
          : (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
                Não foi possível carregar os dados da rede agora.
              </p>
            </div>
          )
      )}
    </div>
  )
}
