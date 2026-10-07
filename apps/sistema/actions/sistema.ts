'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@estetica-os/nucleo/lib/plataforma/auditoria'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { gravar, ler, mensagemDoErro, tentar } from '@estetica-os/nucleo/lib/db'
import { linkDeDefinirSenha } from '@estetica-os/nucleo/lib/plataforma/destino'
import { tagDaRede } from '@estetica-os/nucleo/lib/redes/cache'
import { expirarNaClinica } from '@estetica-os/nucleo/lib/plataforma/expirar-na-clinica'
import { semearRede, fimDoTesteParaHoje, soDigitos } from '@estetica-os/nucleo/lib/redes/criar'
import { tagDaSessao } from '@estetica-os/nucleo/lib/suporte/sessao'
import { avisarQuemAdministraARede } from '@estetica-os/nucleo/lib/suporte/avisos'
import { depoisDaMudanca } from '@estetica-os/nucleo/lib/redes/assinatura'
import {
  ativarCobranca, levarValorAoAsaas, levarDadosAoAsaas, encerrarCobranca, sincronizarCobranca,
} from '@/lib/redes/cobranca'
import { configDoAsaas } from '@/lib/asaas/cliente'
import { normalizarRecursos, TUDO_LIBERADO } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * Expira uma tag AQUI e na CLÍNICA: a situação da rede e a sessão de suporte
 * são cache do processo da clínica (o `buildContext` lê a cada tela), e o
 * `updateTag` daqui não chega lá (`expirarNaClinica`).
 */
async function expirarAqui(tag: string): Promise<void> {
  updateTag(tag)
  await expirarNaClinica([tag])
}

/**
 * As ações da ADMINISTRAÇÃO DO SISTEMA (/sistema) — só ADMIN da plataforma.
 *
 * Todo export daqui é endpoint público (§6): cada um confere quem chama com
 * `getPlatformContext({ papel: 'ADMIN' })` (marca + equipe ativa + verificação
 * em duas etapas + papel). Tudo fica em `platform_audit_log`.
 *
 * Mudou a situação da rede → `updateTag(tagDaRede)`: o portão de
 * `buildContext` barra (ou libera) já na próxima tela.
 */
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATA = /^\d{4}-\d{2}-\d{2}$/
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
/** O e-mail no `ilike` sem curinga: `%`, `_` e `\` valem literalmente. */
const escaparLike = (v: string) => v.replace(/[%_\\]/g, c => `\\${c}`)

/** O dia de hoje no fuso das clínicas (AAAA-MM-DD). */
const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function recarregarRede(tenantId?: string) {
  revalidatePath('/')
  revalidatePath('/redes')
  if (tenantId) {
    revalidatePath(`/redes/${tenantId}`)
  }
}

/** Documento: CPF (11) ou CNPJ (14) dígitos — o Asaas recusa outro formato. */
function documentoValido(d: string | null): boolean {
  return !!d && (d.length === 11 || d.length === 14)
}

type PlanoDoCatalogo = { id: string; nome: string; valor_centavos: number; recursos: unknown }

// --- Redes -------------------------------------------------------------------

export interface NovaRedePeloSistema {
  nomeDaRede: string; documento: string; emailDoResponsavel: string; nomeDoResponsavel: string
  telefone?: string | null; planoId?: string | null; valorCentavos?: number | null
  inicio: 'teste' | 'cobrando'; diasDeTeste?: number | null
  /** "Já cobrando": o primeiro vencimento (AAAA-MM-DD). Com o Asaas configurado, a cobrança liga já. */
  primeiroVencimento?: string | null
}

/**
 * Cria a rede pelo admin: o login do responsável (e-mail confirmado), a rede
 * pelo MESMO caminho do cadastro público (`semearRede`), o plano, e o convite
 * (o e-mail de definir senha). A unidade e o onboarding ficam para o `/setup`,
 * no primeiro acesso do responsável.
 */
export async function criarRede(d: NovaRedePeloSistema): Promise<Resultado<{ tenantId: string; aviso?: string }>> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const nome = texto(d?.nomeDaRede, 100)
  const email = texto(d?.emailDoResponsavel, 200).toLowerCase()
  const responsavel = texto(d?.nomeDoResponsavel, 100)
  const documento = soDigitos(texto(d?.documento, 30))
  if (nome.length < 2) return { ok: false, error: 'Diga o nome da rede.' }
  if (!EMAIL.test(email)) return { ok: false, error: 'E-mail do responsável inválido.' }
  if (!responsavel) return { ok: false, error: 'Diga o nome do responsável.' }
  if (!documentoValido(documento)) return { ok: false, error: 'CPF ou CNPJ inválido (11 ou 14 dígitos).' }
  if (d.inicio !== 'teste' && d.inicio !== 'cobrando') return { ok: false, error: 'Diga como a rede começa.' }
  if (d.planoId && !ehUuid(d.planoId)) return { ok: false, error: 'Plano inválido.' }
  const dias = d.diasDeTeste == null ? null : Math.round(Number(d.diasDeTeste))
  if (dias != null && (!Number.isFinite(dias) || dias < 1 || dias > 90)) return { ok: false, error: 'Dias de teste entre 1 e 90.' }

  const admin = createAdminClient()
  try {
    // Plano (se escolhido) e valor (o do plano, ou um especial).
    let plano = null as PlanoDoCatalogo | null
    if (d.planoId) {
      plano = await ler(admin.from('platform_plans').select('id, nome, valor_centavos, recursos').eq('id', d.planoId).eq('ativo', true).maybeSingle(),
        'buscar o plano') as PlanoDoCatalogo | null
      if (!plano) return { ok: false, error: 'Plano não encontrado ou desativado.' }
    }
    const valor = d.valorCentavos != null ? Math.round(Number(d.valorCentavos)) : plano?.valor_centavos ?? null
    if (valor != null && (!Number.isFinite(valor) || valor < 0)) return { ok: false, error: 'Valor inválido.' }
    if (d.inicio === 'cobrando' && (!plano || !valor)) return { ok: false, error: 'Para começar cobrando, escolha um plano com valor.' }
    if (d.inicio === 'cobrando' && d.primeiroVencimento && !DATA.test(d.primeiroVencimento)) return { ok: false, error: 'Primeiro vencimento inválido.' }

    const membro = await ler(admin.from('users').select('id').ilike('email', escaparLike(email)).limit(1), 'conferir o e-mail') as { id: string }[] | null
    if (membro?.length) return { ok: false, error: 'Este e-mail já é de alguém de outra rede.' }

    const { data: criado, error: eAuth } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (eAuth || !criado.user) {
      return { ok: false, error: /already|registered|exists/i.test(eAuth?.message ?? '') ? 'Já existe um login com este e-mail.' : `O Auth recusou: ${eAuth?.message ?? 'sem resposta'}` }
    }

    const rede = await semearRede({
      authId: criado.user.id, email, nomeDoResponsavel: responsavel, nomeDaRede: nome,
      documento, telefone: texto(d.telefone, 30) || null, slugBase: nome,
      planStatus: d.inicio === 'cobrando' ? 'active' : 'trial',
      trialEndsAt: d.inicio === 'teste' ? await fimDoTesteParaHoje(dias) : null,
    })
    if (!rede.ok) {
      await admin.auth.admin.deleteUser(criado.user.id)
      return { ok: false, error: rede.error }
    }

    // Daqui em diante a rede EXISTE: o que falhar vira aviso (a tela segue
    // para o detalhe, onde dá para completar), nunca uma rede órfã.
    const avisos: string[] = []
    if (plano || valor != null) {
      const { error: eSub } = await admin.from('tenant_subscriptions').insert({
        // O RETRATO dos recursos do plano (lib/planos/recursos.ts); sem plano, nenhum (tudo liberado).
        tenant_id: rede.tenantId, plan_id: plano?.id ?? null, valor_centavos: valor ?? 0, recursos: plano?.recursos ?? null,
      })
      if (eSub) avisos.push('O plano não foi gravado; defina-o no detalhe da rede.')
      else if (plano) await tentar(admin.from('tenants').update({ plan_name: plano.nome }).eq('id', rede.tenantId), 'gravar o nome do plano')
      // "Já cobrando" com o Asaas configurado: a cobrança liga agora.
      if (!eSub && d.inicio === 'cobrando' && configDoAsaas().temChave) {
        const venc = d.primeiroVencimento && DATA.test(d.primeiroVencimento)
          ? d.primeiroVencimento
          : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
        try { await ativarCobranca(rede.tenantId, venc) }
        catch (e) { avisos.push(`A cobrança no Asaas não ligou (${mensagemDoErro(e)}); ligue no detalhe da rede.`) }
      }
    }

    // O convite: o mesmo e-mail de "definir senha" do esqueci-minha-senha.
    const { error: eConvite } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: linkDeDefinirSenha({ para: 'membro' }),
    })

    await registrarNaPlataforma(ctx, 'rede.criada', {
      tenantId: rede.tenantId, dados: { nome, email, plano: plano?.nome ?? null, valor, inicio: d.inicio, convite: !eConvite },
    })
    recarregarRede(rede.tenantId)
    // A rede EXISTE: o convite que não saiu é aviso, não erro (a tela segue
    // para o detalhe, onde está o "Reenviar acesso").
    if (eConvite) avisos.push(`O convite não saiu (${eConvite.message}); use "Reenviar acesso" na equipe.`)
    return { ok: true, tenantId: rede.tenantId, ...(avisos.length ? { aviso: `A rede foi criada. ${avisos.join(' ')}` } : {}) }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Os dados da rede (o slug fica: as URLs são as das unidades). */
export async function editarRede(tenantId: string, d: { nome: string; documento: string; email: string; telefone: string | null }): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  const nome = texto(d?.nome, 100)
  const email = texto(d?.email, 200).toLowerCase()
  const documento = soDigitos(texto(d?.documento, 30))
  if (nome.length < 2) return { ok: false, error: 'Diga o nome da rede.' }
  if (!EMAIL.test(email)) return { ok: false, error: 'E-mail inválido.' }
  if (documento && !documentoValido(documento)) return { ok: false, error: 'CPF ou CNPJ inválido (11 ou 14 dígitos).' }
  try {
    const admin = createAdminClient()
    const antes = await ler(admin.from('tenants').select('name, document, email, phone').eq('id', tenantId).maybeSingle(), 'buscar a rede')
    if (!antes) return { ok: false, error: 'Rede não encontrada.' }
    const depois = { name: nome, document: documento, email, phone: texto(d.telefone, 30) || null }
    const { error } = await admin.from('tenants').update({ ...depois, updated_at: new Date().toISOString() }).eq('id', tenantId)
    if (error) return { ok: false, error: error.code === '23505' ? 'Já existe outra rede com este CPF/CNPJ.' : error.message }
    await registrarNaPlataforma(ctx, 'rede.editada', { tenantId, dados: { antes, depois } })
    await expirarAqui(tagDaRede(tenantId))
    recarregarRede(tenantId)
    try { await levarDadosAoAsaas(tenantId) } catch (e) {
      return { ok: false, error: `Salvo aqui, mas o Asaas recusou os dados novos: ${mensagemDoErro(e)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Derruba as sessões de suporte em curso na rede (desligada, ninguém entra). */
async function derrubarSuporteDaRede(tenantId: string) {
  const admin = createAdminClient()
  const ativas = await ler(admin.from('support_sessions').select('id, auth_session_id')
    .eq('tenant_id', tenantId).in('status', ['abrindo', 'ativa']), 'buscar as sessões de suporte da rede') as
    { id: string; auth_session_id: string | null }[] | null
  for (const s of ativas ?? []) {
    await gravar(admin.rpc('suporte_sessao_encerrar', { p_sessao: s.id, p_motivo: 'rede desligada' }), 'encerrar a sessão de suporte')
    if (s.auth_session_id) await expirarAqui(tagDaSessao(s.auth_session_id))
  }
}

/**
 * DESLIGAR a rede (abuso, pedido): ninguém da equipe entra e o portal do
 * paciente fica indisponível. Manual dos dois lados — a cobrança nunca religa.
 */
export async function desligarRede(tenantId: string, motivo: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const m = texto(motivo, 300)
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  if (m.length < 3) return { ok: false, error: 'Diga o motivo.' }
  try {
    const admin = createAdminClient()
    await gravar(admin.from('tenants').update({
      is_active: false, desligada_motivo: m, desligada_em: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', tenantId).select('id').single(), 'desligar a rede')
    await expirarAqui(tagDaRede(tenantId))
    await derrubarSuporteDaRede(tenantId)
    await registrarNaPlataforma(ctx, 'rede.desligada', { tenantId, dados: { motivo: m } })
    await avisarQuemAdministraARede(tenantId, { title: 'Acesso ao BellarisOS desligado', body: 'Fale com o BellarisOS para entender e regularizar.' })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function religarRede(tenantId: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    await gravar(createAdminClient().from('tenants').update({
      is_active: true, desligada_motivo: null, desligada_em: null, updated_at: new Date().toISOString(),
    }).eq('id', tenantId).select('id').single(), 'religar a rede')
    await expirarAqui(tagDaRede(tenantId))
    await registrarNaPlataforma(ctx, 'rede.religada', { tenantId })
    await avisarQuemAdministraARede(tenantId, { title: 'Acesso ao BellarisOS religado', body: 'A rede voltou a funcionar normalmente.' })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

// --- Assinatura --------------------------------------------------------------

async function situacaoAtual(tenantId: string): Promise<string | null> {
  const t = await ler(createAdminClient().from('tenants').select('plan_status').eq('id', tenantId).maybeSingle(), 'ler a situação da rede') as { plan_status: string | null } | null
  return t?.plan_status ?? null
}

async function mudarSituacao(tenantId: string, para: string, extra: Record<string, unknown> = {}) {
  const de = await situacaoAtual(tenantId)
  await gravar(createAdminClient().from('tenants').update({ plan_status: para, updated_at: new Date().toISOString(), ...extra })
    .eq('id', tenantId).select('id').single(), 'mudar a situação da rede')
  await depoisDaMudanca(tenantId, de, para, 'admin', expirarAqui)
  return de
}

/** Plano e valor (o valor pode ser especial). Com a cobrança ligada, o Asaas acompanha. */
export async function definirAssinatura(tenantId: string, d: { planoId: string | null; valorCentavos: number }): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId) || (d?.planoId != null && !ehUuid(d.planoId))) return { ok: false, error: 'Pedido inválido.' }
  const valor = Math.round(Number(d?.valorCentavos))
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, error: 'Valor inválido.' }
  try {
    const admin = createAdminClient()
    const plano = d.planoId
      ? await ler(admin.from('platform_plans').select('id, nome, recursos').eq('id', d.planoId).maybeSingle(), 'buscar o plano') as { id: string; nome: string; recursos: unknown } | null
      : null
    if (d.planoId && !plano) return { ok: false, error: 'Plano não encontrado.' }
    const antes = await ler(admin.from('tenant_subscriptions').select('plan_id, valor_centavos, recursos').eq('tenant_id', tenantId).maybeSingle(), 'ler a assinatura') as
      { plan_id: string | null; valor_centavos: number; recursos: unknown } | null
    // O RETRATO dos recursos só muda quando o PLANO muda (ou a rede ainda não
    // tinha retrato): trocar só o valor não traz, de carona, a versão nova do
    // plano — isso é o "Aplicar a versão atual do plano". Sem plano: nenhum
    // retrato, tudo liberado.
    const trocouDePlano = (antes?.plan_id ?? null) !== (plano?.id ?? null)
    const recursos = !plano ? null : (trocouDePlano || antes?.recursos == null) ? plano.recursos : antes!.recursos
    await gravar(admin.from('tenant_subscriptions').upsert({
      tenant_id: tenantId, plan_id: plano?.id ?? null, valor_centavos: valor, recursos, updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' }), 'gravar a assinatura')
    await gravar(admin.from('tenants').update({ plan_name: plano?.nome ?? null }).eq('id', tenantId).select('id').single(), 'gravar o nome do plano')
    let aviso: string | undefined
    try { await levarValorAoAsaas(tenantId) } catch (e) { aviso = `Gravado aqui, mas o Asaas recusou o valor novo: ${mensagemDoErro(e)}` }
    // O plano decide o que a clínica pode usar: o portão dela lê na próxima tela.
    // Expira ANTES de registrar: falhar no registro não deixa a clínica com o velho.
    await expirarAqui(tagDaRede(tenantId))
    await registrarNaPlataforma(ctx, 'assinatura.alterada', { tenantId, dados: { antes, depois: { plan_id: plano?.id ?? null, valor_centavos: valor, recursos } } })
    recarregarRede(tenantId)
    return aviso ? { ok: false, error: aviso } : { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/**
 * "Aplicar a versão atual do plano": copia de novo os recursos do plano da
 * rede para o retrato dela. Editar o plano no catálogo não muda quem já o
 * assina (decisão do Heitor) — é aqui que o admin traz a mudança, rede a rede.
 */
export async function aplicarPlanoAtual(tenantId: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const admin = createAdminClient()
    const sub = await ler(admin.from('tenant_subscriptions').select('plan_id, recursos').eq('tenant_id', tenantId).maybeSingle(), 'ler a assinatura') as
      { plan_id: string | null; recursos: unknown } | null
    if (!sub?.plan_id) return { ok: false, error: 'Esta rede não tem plano.' }
    const plano = await ler(admin.from('platform_plans').select('recursos').eq('id', sub.plan_id).single(), 'ler o plano') as { recursos: unknown }
    await gravar(admin.from('tenant_subscriptions').update({ recursos: plano.recursos, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).select('tenant_id').single(), 'aplicar o plano à rede')
    await expirarAqui(tagDaRede(tenantId))
    await registrarNaPlataforma(ctx, 'assinatura.plano_aplicado', { tenantId, dados: { plan_id: sub.plan_id, antes: sub.recursos, depois: plano.recursos } })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Estende (ou dá) o período de teste até a data — a rede volta a "em teste". */
export async function estenderTeste(tenantId: string, ate: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId) || !DATA.test(ate ?? '')) return { ok: false, error: 'Pedido inválido.' }
  const fim = `${ate}T23:59:59-03:00`
  if (Date.parse(fim) <= Date.now()) return { ok: false, error: 'A data precisa estar no futuro.' }
  try {
    // Perdoa as faturas vencidas até hoje: sem isso, o próximo evento do Asaas
    // recalcularia o atraso antigo (e o cron suspenderia na hora seguinte).
    const de = await mudarSituacao(tenantId, 'trial', { trial_ends_at: fim, em_atraso_desde: null, atraso_perdoado_ate: hojeEmSP() })
    await registrarNaPlataforma(ctx, 'assinatura.teste_estendido', { tenantId, dados: { ate: fim, de } })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Pagou por fora (ou acerto combinado): em dia, sem atraso. */
export async function marcarEmDia(tenantId: string, motivo: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const m = texto(motivo, 300)
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  if (m.length < 3) return { ok: false, error: 'Diga o motivo.' }
  try {
    const de = await mudarSituacao(tenantId, 'active', { em_atraso_desde: null, atraso_perdoado_ate: hojeEmSP() })
    await registrarNaPlataforma(ctx, 'assinatura.em_dia', { tenantId, dados: { motivo: m, de } })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Cancela: a cobrança no Asaas é encerrada e a rede fica bloqueada. */
export async function cancelarAssinatura(tenantId: string, motivo: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const m = texto(motivo, 300)
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  if (m.length < 3) return { ok: false, error: 'Diga o motivo.' }
  try {
    try { await encerrarCobranca(tenantId) } catch (e) {
      return { ok: false, error: `O Asaas não encerrou a cobrança: ${mensagemDoErro(e)}` }
    }
    const de = await mudarSituacao(tenantId, 'canceled')
    await registrarNaPlataforma(ctx, 'assinatura.cancelada', { tenantId, dados: { motivo: m, de } })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Reabre uma assinatura cancelada: volta a "em dia", e a cobrança se liga de novo. */
export async function reabrirAssinatura(tenantId: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    if (await situacaoAtual(tenantId) !== 'canceled') return { ok: false, error: 'A assinatura não está cancelada.' }
    await gravar(createAdminClient().from('tenant_subscriptions').update({
      cobranca: 'sem_cobranca', asaas_subscription_id: null, cancelada_em: null, updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId).select('tenant_id'), 'reabrir a assinatura')
    await mudarSituacao(tenantId, 'active', { em_atraso_desde: null })
    await registrarNaPlataforma(ctx, 'assinatura.reaberta', { tenantId })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Liga a cobrança no Asaas, com o primeiro vencimento escolhido. */
export async function ativarCobrancaNoAsaas(tenantId: string, primeiroVencimento: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId) || !DATA.test(primeiroVencimento ?? '')) return { ok: false, error: 'Pedido inválido.' }
  if (!configDoAsaas().temChave) return { ok: false, error: 'O Asaas ainda não está configurado (ASAAS_API_KEY).' }
  try {
    await ativarCobranca(tenantId, primeiroVencimento)
    await registrarNaPlataforma(ctx, 'assinatura.cobranca_ativada', { tenantId, dados: { primeiroVencimento } })
    recarregarRede(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function sincronizarComOAsaas(tenantId: string): Promise<Resultado<{ cobrancas: number }>> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const n = await sincronizarCobranca(tenantId, expirarAqui)
    await registrarNaPlataforma(ctx, 'assinatura.sincronizada', { tenantId, dados: { cobrancas: n } })
    recarregarRede(tenantId)
    return { ok: true, cobrancas: n }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

// --- Planos e configuração ---------------------------------------------------

export async function salvarPlano(d: { id?: string | null; nome: string; descricao?: string | null; valorCentavos: number; ativo: boolean; ordem?: number; recursos?: unknown }): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const nome = texto(d?.nome, 60)
  const valor = Math.round(Number(d?.valorCentavos))
  if (nome.length < 2) return { ok: false, error: 'Diga o nome do plano.' }
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, error: 'Valor inválido.' }
  if (d.id != null && !ehUuid(d.id)) return { ok: false, error: 'Pedido inválido.' }
  // O que o plano inclui (catálogo fechado): sem a lista, um plano NOVO nasce
  // com tudo; editar sem ela não mexe no que o plano já tinha.
  let recursos = d.id ? undefined : TUDO_LIBERADO
  if (d.recursos !== undefined) {
    const r = normalizarRecursos(d.recursos)
    if (!r.ok) return { ok: false, error: r.error }
    recursos = r.recursos
  }
  try {
    const linha = {
      nome, descricao: texto(d.descricao, 500) || null, valor_centavos: valor, ativo: !!d.ativo,
      ordem: Number.isFinite(Number(d.ordem)) ? Math.round(Number(d.ordem)) : 0, updated_at: new Date().toISOString(),
      ...(recursos ? { recursos } : {}),
    }
    const admin = createAdminClient()
    const { error } = d.id
      ? await admin.from('platform_plans').update(linha).eq('id', d.id)
      : await admin.from('platform_plans').insert(linha)
    if (error) return { ok: false, error: error.code === '23505' ? 'Já existe um plano com este nome.' : error.message }
    await registrarNaPlataforma(ctx, 'plano.salvo', { dados: { id: d.id ?? null, ...linha } })
    revalidatePath('/planos')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function salvarConfiguracoes(d: { diasDeTeste: number; diasDeCarencia: number; exigirVerificacao?: boolean }): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const teste = Math.round(Number(d?.diasDeTeste))
  const carencia = Math.round(Number(d?.diasDeCarencia))
  if (!Number.isFinite(teste) || teste < 0 || teste > 90) return { ok: false, error: 'Dias de teste entre 0 e 90.' }
  if (!Number.isFinite(carencia) || carencia < 0 || carencia > 60) return { ok: false, error: 'Dias de carência entre 0 e 60.' }
  // A verificação em duas etapas da equipe é opção (2026-10-06); só true liga.
  const exigir = d?.exigirVerificacao === true
  try {
    await gravar(createAdminClient().from('platform_settings').update({
      dias_de_teste: teste, dias_de_carencia: carencia, exigir_verificacao: exigir, updated_at: new Date().toISOString(), updated_by: ctx.staffId,
    }).eq('id', 1).select('id').single(), 'salvar as configurações da plataforma')
    await registrarNaPlataforma(ctx, 'plataforma.configurada', { dados: { dias_de_teste: teste, dias_de_carencia: carencia, exigir_verificacao: exigir } })
    revalidatePath('/configuracoes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

