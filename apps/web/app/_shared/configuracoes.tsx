import { getTenantContext, can, temRecurso } from '@/lib/auth'
import { lerRecursos, limiteDe, modulosForaDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'
import { usoDoCopilot } from '@estetica-os/nucleo/lib/planos/uso-do-copilot'
import { copilotNoPlano } from '@/lib/copilot/disponivel'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RolesEditor } from '@/components/admin/roles-editor'
import type { AppModule, PermissionLevel, PermissionScope, ReportTab } from '@estetica-os/types'
import type { RoleModulePermission } from '@/components/admin/roles-editor'
import { SettingsIntegrations } from '@/components/admin/settings-integrations'
import { SettingsBranches } from '@/components/admin/settings-branches'
import { SettingsFichas, type ItemDeFicha } from '@/components/admin/settings-fichas'
import { SettingsPreAtendimento } from '@/components/admin/settings-pre-atendimento'
import { SettingsDocumentos } from '@/components/admin/settings-documentos'
import { modelosDaRede, urlsDasImagensDosModelos } from '@/lib/documentos/modelos'
import { envioPelaConversaLigado } from '@/lib/documentos/link-pela-conversa'
import { normalizeFormSchema } from '@/lib/anamnesis'
import type { IntegrationConfig } from '@/actions/integrations'
import { listarNumerosWhatsApp, opcoesDeVinculoDoNumero } from '@/actions/integrations'
import { SettingsLgpd } from '@/components/admin/settings-lgpd'
import { listDataRequests } from '@/actions/lgpd'
import { SettingsEventos } from '@/components/admin/settings-eventos'
import { SettingsAcoesEmLote } from '@/components/admin/settings-acoes-em-lote'
import { ImportarContatos } from '@/app/_shared/importar-contatos'
import { SettingsTags } from '@/components/admin/settings-tags'
import { listarTagsComUso } from '@/actions/tags'
import { acoesEmLote } from '@/lib/lotes/acoes'
import { listarEventosDeDominio, resumoDoCatalogo } from '@/actions/eventos'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { SegSelect } from '@/components/shared/seg-select'
import { SettingsGeral } from '@/components/admin/settings-geral'
import { lerDadosDaRede, lerVisibilidadeDoInbox } from '@/actions/rede'
import { SettingsVisibilidadeInbox } from '@/components/admin/settings-visibilidade-inbox'
import { lerCaixas } from '@/lib/inbox/visibilidade'
import { ler } from '@/lib/db'
import { mascararSegredos } from '@/lib/integracoes/sem-segredo'
import { dadosDaAbaSuporte } from '@/lib/suporte/painel-da-clinica'
import { podeIncluirClinico } from '@/lib/suporte/regras'
import { SettingsSuporte } from '@/components/admin/settings-suporte'
import { SettingsAssinatura } from '@/components/admin/settings-assinatura'
import { lerAssinatura } from '@/lib/redes/assinatura'
import { FidelidadeConfig } from '@/components/admin/fidelidade-config'
import { FidelidadeCatalogo } from '@/components/admin/fidelidade-catalogo'
import { catalogoDeRecompensas } from '@/actions/fidelidade'
import { configDaRede, redeTemLancamentos } from '@/lib/fidelidade/leitura'
import { SettingsComissoes } from '@/components/admin/settings-comissoes'
import { configDeComissaoDaRede, taxasDaRede, profissionaisSemComissao } from '@/lib/comissoes/leitura'
import { maximoDeVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import {
  ABAS_DE_CONFIGURACAO, ABAS_DA_REDE, ABAS_DA_UNIDADE, abaNoPlano, abaLiberada, type ChaveDeAba,
} from '@/lib/configuracoes/abas'

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

// A lista das abas (e o módulo de cada uma) mora em `lib/configuracoes/abas.ts`,
// que a busca universal também lê.
const TABS = ABAS_DE_CONFIGURACAO
export { ABAS_DA_REDE, ABAS_DA_UNIDADE }
export type { ChaveDeAba }

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
  /** No portal da unidade: a unidade da tela (a de Importações cadastra nela). */
  unidadeDaTela?:   { id: string; nome: string }
}

type PermissionRow = {
  role_id: string | null
  module: string
  level: PermissionLevel
  scope: PermissionScope | null
}

export async function Configuracoes({
  basePath, abas, abaPedida, subtitulo, aviso, atalhoParaEquipe,
  metaStep, metaError, metaErrorReason, unidadeDaTela,
}: Props) {
  const ctx = await getTenantContext()

  const tabs = TABS.filter(t => abas.includes(t.key) && abaLiberada(t, m => can(ctx, m, 'MANAGE')) && abaNoPlano(t, ctx.plano))

  // O pedido de LGPD esperando a liberação do prontuário aparece no NOME da
  // aba (2026-10-21): só dentro dela, ninguém sabia que havia pedido.
  const lgpdEsperando = tabs.some(t => t.key === 'lgpd')
    ? (await createAdminClient().from('lgpd_requests').select('id', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId!).eq('medical_status', 'pending')).count ?? 0
    : 0
  const rotuloDaAba = (t: (typeof tabs)[number]) => t.key === 'lgpd' && lgpdEsperando > 0 ? `${t.label} (${lgpdEsperando})` : t.label

  // O topo diz o que a pessoa vê: a SDR, que só mexe em Tags e Importações,
  // lia "Cargos, modelos de ficha e integrações" (2026-10-21).
  const listaPt = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`
  const subtituloDaTela = tabs.some(t => t.key === 'permissions')
    ? subtitulo
    : `${listaPt(tabs.map(t => t.label.toLowerCase())).replace(/^./, c => c.toUpperCase())} da rede`

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

  const supabase = await createClient()
  const admin    = createAdminClient()

  // Cada bloco só é buscado quando a aba correspondente está aberta: as demais
  // não usam o dado, e o admin client ignora RLS.
  const wantsRoles = activeTab === 'permissions'
  const wantsForms = activeTab === 'fichas'

  const [allRoles, overrides, abasDeRelatorio, integrationRows, formRows] = await Promise.all([
    // Admin client de propósito: a policy de SELECT em `users` limita quem não
    // é da rede à própria unidade, e a contagem sairia menor do que a real —
    // "0 pessoas" num cargo que tem gente em outra unidade é pior que nada.
    wantsRoles
      ? ler(admin
          .from('tenant_roles')
          .select('id, key, label, is_system, inbox_caixas, users(count)')
          .eq('tenant_id', ctx.tenantId!)
          .order('is_system', { ascending: false })
          .order('created_at'), 'carregar os cargos')
      : [],
    // Matriz e abas de relatório: uma falha aqui mostraria o cargo SEM
    // permissão nenhuma, e salvar gravaria isso por cima do que existe.
    wantsRoles
      ? ler(supabase
          .from('role_permissions')
          .select('role_id, module, level, scope')
          .eq('tenant_id', ctx.tenantId!), 'carregar as permissões dos cargos')
      : [],
    wantsRoles
      ? ler(supabase
          .from('role_report_tabs')
          .select('role_id, tab')
          .eq('tenant_id', ctx.tenantId!), 'carregar as abas de relatório dos cargos')
      : [],
    activeTab === 'integrations'
      ? ler(admin
          .from('integration_configs')
          .select('id, provider, config, is_active, updated_at')
          .eq('tenant_id', ctx.tenantId!), 'carregar as integrações')
      : [],
    wantsForms
      ? ler(admin
          .from('forms')
          .select('id, name, schema, is_active')
          .eq('tenant_id', ctx.tenantId!)
          .eq('tipo', 'PROCEDIMENTO')
          .order('created_at'), 'carregar as fichas')
      : [],
  ])

  // A ficha de pré-atendimento é da REDE (uma por rede): só quem é da rede a vê aqui.
  const preAtendimento = wantsForms && ctx.branchId === null
    ? await Promise.all([
        ler(admin.from('forms').select('id, name, schema')
          .eq('tenant_id', ctx.tenantId!).eq('tipo', 'PRE_ATENDIMENTO').maybeSingle(), 'carregar a ficha de pré-atendimento'),
        ler(admin.from('tenants').select('pre_atendimento_envio, pre_atendimento_validade_meses')
          .eq('id', ctx.tenantId!).single(), 'carregar o envio do pré-atendimento'),
      ])
    : null

  // Só carrega quando a aba está aberta: a lista não é usada nas outras.
  // A lista mostra nomes de clientes e pede Clientes (Ver): sem o módulo, a tela
  // inteira caía em "sem acesso" (2026-10-21). Sem ele, a aba diz o porquê.
  const lgpdSemClientes = activeTab === 'lgpd' && !can(ctx, 'clients', 'VIEW')
  const lgpdRequests = activeTab === 'lgpd' && !lgpdSemClientes ? await listDataRequests() : []
  const dadosDoSuporte = activeTab === 'suporte' && !ctx.suporte ? await dadosDaAbaSuporte(ctx.tenantId!) : null
  // A assinatura do BellarisOS (o plano, as faturas): só a aba dela lê.
  const assinatura = activeTab === 'assinatura' ? await lerAssinatura(ctx.tenantId!) : null
  const extrasDaAssinatura = assinatura ? await Promise.all([
    assinatura.assinatura?.planoId
      ? ler(admin.from('platform_plans').select('nome').eq('id', assinatura.assinatura.planoId).maybeSingle(), 'ler o plano')
      : null,
    ler(admin.from('platform_settings').select('dias_de_carencia').eq('id', 1).maybeSingle(), 'ler a carência'),
  ]) : null
  // O uso de cada limite do plano (os ATIVOS), para o "2 de 3" da aba.
  const usoDosLimites = assinatura ? Object.fromEntries(await Promise.all(
    ([['unidades', 'branches'], ['membros', 'users'], ['whatsapp', 'whatsapp_numbers']] as const).map(async ([chave, tabela]) => {
      const { count, error } = await admin.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId!).eq('is_active', true)
      if (error) throw new Error(`contar ${chave}: ${error.message}`)
      return [chave, count ?? 0] as const
    }),
  )) as Record<'unidades' | 'membros' | 'whatsapp', number> : null

  // O consumo do Copilot no mês, para a aba (só com o Copilot no plano).
  const usoDoCopilotNaAba = assinatura && copilotNoPlano(ctx) ? await usoDoCopilot(admin, ctx.tenantId!, ctx.plano ?? null) : null

  const modelosDeDocumento = activeTab === 'documentos' ? await modelosDaRede(ctx.tenantId!) : null
  const linkPelaConversa = activeTab === 'documentos' ? await envioPelaConversaLigado(ctx.tenantId!) : false
  const imagensDosModelos = modelosDeDocumento ? await urlsDasImagensDosModelos(modelosDeDocumento) : {}

  // Idem para os dados da própria rede.
  const dadosDaRede = activeTab === 'general' ? await lerDadosDaRede() : null
  // A fidelidade é da rede: a aba só existe no portal da rede (ABAS_DA_UNIDADE não a tem).
  const configFidelidade = activeTab === 'fidelidade' ? await configDaRede(ctx.tenantId!) : null
  const catalogo = activeTab === 'fidelidade' ? await catalogoDeRecompensas() : null
  const temLancamentos = activeTab === 'fidelidade' ? await redeTemLancamentos(ctx.tenantId!) : false
  // As comissões também são da rede (a aba não está em ABAS_DA_UNIDADE).
  const comissoes = activeTab === 'comissoes'
    ? await Promise.all([configDeComissaoDaRede(ctx.tenantId!), taxasDaRede(ctx.tenantId!), profissionaisSemComissao(ctx.tenantId!), maximoDeVezesDaRede(ctx.tenantId!)])
    : null
  const visibilidadeDoInbox = wantsRoles ? await lerVisibilidadeDoInbox() : null

  // A corrente de eventos, idem. São duas consultas (o resumo agregado e as
  // últimas linhas) e nenhuma outra aba as usa.
  const [resumo, primeiraPagina] = activeTab === 'eventos'
    ? await Promise.all([resumoDoCatalogo(), listarEventosDeDominio()])
    : [null, null]
  const lotes = activeTab === 'lotes' ? await acoesEmLote(ctx.tenantId!) : null
  const tagsDaRede = activeTab === 'tags' ? await listarTagsComUso() : null

  // Credencial não vai ao navegador: o segredo guardado vira o marcador
  // (lib/integracoes/sem-segredo.ts), e salvar com ele mantém o do banco.
  const integrationConfigs = ((integrationRows ?? []) as IntegrationConfig[])
    .map(r => ({ ...r, config: mascararSegredos(r.config as Record<string, unknown>) })) as IntegrationConfig[]

  // As caixas de WhatsApp vêm da própria tabela delas, não de
  // `integration_configs`. Ler de um lugar e gravar no outro faria o formulário
  // reabrir com o valor antigo depois de salvar — e é exatamente o tipo de
  // divergência que não dá erro nenhum.
  const [numerosDeWhatsApp, opcoesDeVinculo] = activeTab === 'integrations'
    ? await Promise.all([listarNumerosWhatsApp(), opcoesDeVinculoDoNumero()])
    : [[], { unidades: [], pessoas: [] }]
  // Quantas conexões de WhatsApp o plano dá (o efetivo: plano + adicionais) e
  // quantas estão em uso — os ATIVOS, a mesma conta de conferirLimite.
  const usoDoWhatsapp = activeTab === 'integrations'
    ? {
        emUso: numerosDeWhatsApp.filter(n => n.isActive).length,
        limite: limiteDe(lerRecursos(ctx.plano ?? null), 'whatsapp'),
      }
    : null
  const fichas: ItemDeFicha[] = ((formRows ?? []) as { id: string; name: string; schema: unknown; is_active: boolean | null }[]).map(r => ({
    id:       r.id,
    name:     r.name,
    rows:     normalizeFormSchema(r.schema).rows,
    isActive: !!r.is_active,
  }))

  // Falha na consulta de cargos não é "a rede não tem cargo": o `ler` acima
  // para a tela em vez de mostrar a lista vazia e convidar a recriar o que já
  // existe (antes o erro ia só para o log).

  type RawRole = {
    id: string; key: string; label: string; is_system: boolean; inbox_caixas?: string
    users?: { count: number }[] | null
  }
  const editorRoles = ((allRoles ?? []) as RawRole[]).map(r => ({
    id:          r.id,
    key:         r.key,
    label:       r.label,
    is_system:   r.is_system,
    memberCount: r.users?.[0]?.count ?? 0,
    inboxCaixas: lerCaixas(r.inbox_caixas),
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
          {subtituloDaTela}
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
          options={tabs.map(t => ({ key: t.key, label: rotuloDaAba(t) }))}
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
            // O Copilot é a única função que "sem plano" NÃO libera (lib/copilot/disponivel):
            // a matriz não o oferece à rede que não o tem (2026-10-21).
            foraDoPlano={[...modulosForaDoPlano(lerRecursos(ctx.plano ?? null)), ...(copilotNoPlano(ctx) ? [] : ['copilot' as const])]}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {preAtendimento && (() => {
            const [ficha, rede] = preAtendimento as [{ id: string; name: string; schema: unknown } | null, { pre_atendimento_envio: boolean; pre_atendimento_validade_meses: number }]
            return (
              <SettingsPreAtendimento
                ficha={ficha ? { id: ficha.id, name: ficha.name, rows: normalizeFormSchema(ficha.schema).rows } : null}
                envio={rede.pre_atendimento_envio}
                validadeMeses={rede.pre_atendimento_validade_meses}
                podePersonalizar={temRecurso(ctx, 'fichas')}
              />
            )
          })()}
          <SettingsFichas forms={fichas} semInjetaveis={!temRecurso(ctx, 'injetaveis')} />
        </div>
      )}

      {activeTab === 'documentos' && modelosDeDocumento && (
        <SettingsDocumentos modelos={modelosDeDocumento} imagens={imagensDosModelos}
          envio={{ pelaConversa: linkPelaConversa, podeMudar: ctx.branchId === null }} />
      )}

      {activeTab === 'integrations' && (
        <SettingsIntegrations
          initialConfigs={integrationConfigs}
          numeros={numerosDeWhatsApp}
          usoDoWhatsapp={usoDoWhatsapp ?? { emUso: 0, limite: null }}
          opcoesDeVinculo={opcoesDeVinculo}
          metaStep={metaStep}
          metaError={metaError === '1'}
          metaErrorReason={metaErrorReason}
          // O config_id do cadastro incorporado (Embedded Signup) da Meta. Não é
          // segredo, mas é por instalação: mora no ambiente, lido aqui no servidor.
          configIdDoCadastro={process.env.META_ES_CONFIG_ID || null}
          // O app da Meta do SDK, que só carrega no "Conectar pela Meta".
          appIdDaMeta={process.env.NEXT_PUBLIC_META_APP_ID || null}
        />
      )}

      {activeTab === 'assinatura' && assinatura && (
        <SettingsAssinatura
          dados={assinatura}
          planoNome={(extrasDaAssinatura?.[0] as { nome: string } | null)?.nome ?? assinatura.rede.planName}
          carencia={(extrasDaAssinatura?.[1] as { dias_de_carencia: number } | null)?.dias_de_carencia ?? 7}
          // Quem paga é a clínica, não o atendente do suporte entrando na conta.
          podePagar={!ctx.suporte}
          uso={usoDosLimites ?? { unidades: 0, membros: 0, whatsapp: 0 }}
          copilot={usoDoCopilotNaAba}
          // A mensalidade é da REDE: contrata quem é dela, com configurações; o suporte não.
          semContratar={ctx.suporte ? 'No modo suporte não dá para contratar: isto é feito pela própria clínica.'
            : ctx.branchId === null && can(ctx, 'settings', 'MANAGE') ? null
            : 'Para contratar ou cancelar, fale com quem administra a rede.'}
        />
      )}

      {activeTab === 'suporte' && (dadosDoSuporte
        ? <SettingsSuporte dados={dadosDoSuporte} podeClinico={podeIncluirClinico(ctx)} />
        : (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Indisponível no modo suporte: quem autoriza o acesso é a própria clínica.
          </p>
        ))}

      {lgpdSemClientes && (
        <p className="card" style={{ padding: 20, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Os pedidos mostram os nomes das clientes: para vê-los, o cargo precisa de Clientes (Ver).
        </p>
      )}

      {activeTab === 'lgpd' && !lgpdSemClientes && (
        <SettingsLgpd
          requests={lgpdRequests}
          canReviewMedical={ctx.permissions.medical_records === 'MANAGE'}
        />
      )}

      {activeTab === 'lotes' && lotes && <SettingsAcoesEmLote iniciais={lotes} />}

      {activeTab === 'tags' && tagsDaRede && <SettingsTags iniciais={tagsDaRede} />}

      {activeTab === 'importacoes' && <ImportarContatos unidadeFixa={unidadeDaTela ?? null} />}

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

      {activeTab === 'fidelidade' && configFidelidade && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FidelidadeConfig inicial={configFidelidade} podeEditar={can(ctx, 'settings', 'MANAGE') && ctx.branchId === null}
            temLancamentos={temLancamentos} />
          {catalogo && (
            <FidelidadeCatalogo inicial={catalogo} podeEditar={can(ctx, 'settings', 'MANAGE') && ctx.branchId === null}
              trocaPeloPortal={configFidelidade.client_redeem} />
          )}
        </div>
      )}

      {activeTab === 'comissoes' && comissoes && (
        <SettingsComissoes inicial={comissoes[0]} taxas={comissoes[1]} semRegra={comissoes[2]} maximoDeVezes={comissoes[3].configurado}
          podeEditar={can(ctx, 'financial', 'MANAGE') && ctx.branchId === null} />
      )}

      {activeTab === 'general' && (
        dadosDaRede
          ? <SettingsGeral rede={dadosDaRede} podeEditar={can(ctx, 'settings', 'MANAGE')} naRede={ctx.branchId === null} />
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
