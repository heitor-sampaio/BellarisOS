import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNumerosDaRede } from '@/lib/whatsapp/factory'
import type { OfficialConfig } from '@/lib/whatsapp/types'
import { gravar, ler } from '@/lib/db'
import { listarCatalogoDaMeta } from './meta-api'
import { daMeta } from './importar'

/**
 * O catálogo de templates SEGUE os números oficiais conectados (pedido do
 * Heitor, 2026-10-09):
 *  - ligar um número puxa da Meta tudo o que a conta dele (a WABA) tem;
 *  - desligar ou remover tira do BellarisOS os templates da conta que ficou
 *    sem número ligado. Só daqui: na Meta continuam, e ligar de novo os traz.
 *
 * O catálogo continua sendo da WABA, não do número (`whatsapp-push.md`): dois
 * números da mesma conta dividem os templates, e desligar um deles não apaga
 * nada enquanto o outro estiver ligado.
 */

type Admin = ReturnType<typeof createAdminClient>

export interface NumeroOficial {
  id: string; label: string; phone: string | null; wabaId: string; isDefault: boolean
  config: OfficialConfig
}

/** Os números oficiais LIGADOS da rede, com a conta (só os que têm WABA). */
export async function numerosOficiais(tenantId: string): Promise<NumeroOficial[]> {
  return (await getNumerosDaRede(tenantId))
    .filter(n => n.isActive && n.provider === 'official' && n.wabaId)
    .map(n => ({
      id: n.id, label: n.label, phone: n.phone, wabaId: n.wabaId!, isDefault: n.isDefault,
      config: n.config as OfficialConfig,
    }))
}

/**
 * A credencial com que se fala com a conta: a de um número ligado dela (o
 * padrão da rede primeiro). Sem número ligado na conta, nenhuma — e o template
 * dela nem aparece na tela.
 */
export async function configDaWaba(tenantId: string, wabaId: string | null): Promise<OfficialConfig | null> {
  if (!wabaId) return null
  const daConta = (await numerosOficiais(tenantId)).filter(n => n.wabaId === wabaId)
  const n = daConta.find(x => x.isDefault) ?? daConta[0]
  return n ? { ...n.config, wabaId } : null
}

/**
 * Traz da Meta o catálogo de UMA conta e o casa com o nosso: pelo id da Meta,
 * ou pelo nome + idioma (o rascunho daqui que foi submetido e perdeu o id).
 * O que sumiu de lá volta a rascunho, como no "Sincronizar" de antes.
 */
export async function importarCatalogoDaWaba(
  admin: Admin, tenantId: string, wabaId: string,
): Promise<{ novos: number; atualizados: number }> {
  const config = await configDaWaba(tenantId, wabaId)
  if (!config) return { novos: 0, atualizados: 0 }

  const remotos = (await listarCatalogoDaMeta(config))
    .map(daMeta).filter((t): t is NonNullable<typeof t> => !!t)

  const locais = (await ler(admin
    .from('message_templates').select('id, name, language, meta_template_id')
    .eq('tenant_id', tenantId).eq('waba_id', wabaId), 'ler os templates da conta')) as
    { id: string; name: string; language: string; meta_template_id: string | null }[] | null

  let novos = 0
  let atualizados = 0
  const casados = new Set<string>()
  for (const r of remotos) {
    const local = (locais ?? []).find(l => l.meta_template_id === r.meta_template_id)
      ?? (locais ?? []).find(l => !l.meta_template_id && l.name === r.name && l.language === r.language)
    if (local) {
      casados.add(local.id)
      await gravar(admin.from('message_templates')
        .update({ ...r, updated_at: new Date().toISOString() })
        .eq('id', local.id), 'atualizar o template da Meta')
      atualizados++
    } else {
      await gravar(admin.from('message_templates')
        .insert({ ...r, tenant_id: tenantId, waba_id: wabaId }), 'importar o template da Meta')
      novos++
    }
  }

  // Apagado pelo painel da Meta: volta a rascunho em vez de continuar
  // oferecido no inbox como se desse para enviar.
  for (const l of locais ?? []) {
    if (casados.has(l.id) || !l.meta_template_id) continue
    await gravar(admin.from('message_templates')
      .update({ status: 'DRAFT', meta_template_id: null, nao_suportado: null })
      .eq('id', l.id), 'devolver o template a rascunho')
    atualizados++
  }
  return { novos, atualizados }
}

/**
 * Tira do BellarisOS os templates das contas que ficaram SEM número oficial
 * ligado (e os de antes dos múltiplos números, sem conta). Na Meta, nada muda.
 */
export async function limparCatalogosSemNumero(admin: Admin, tenantId: string): Promise<void> {
  const contas = [...new Set((await numerosOficiais(tenantId)).map(n => n.wabaId))]
  let q = admin.from('message_templates').delete().eq('tenant_id', tenantId)
  q = contas.length
    ? q.or(`waba_id.is.null,waba_id.not.in.(${contas.map(c => `"${c}"`).join(',')})`)
    : q
  await gravar(q, 'tirar os templates das contas sem número')
}

/**
 * Depois de ligar, desligar ou remover um número: limpa o que ficou sem
 * número e importa as contas pedidas. Falha da Meta na importação NÃO desfaz
 * a conexão — vira aviso (o "Sincronizar" da tela tenta de novo).
 */
export async function acompanharCatalogos(
  tenantId: string, importar: (string | null | undefined)[] = [],
): Promise<{ avisos: string[] }> {
  const admin = createAdminClient()
  const avisos: string[] = []
  await limparCatalogosSemNumero(admin, tenantId)
  for (const waba of new Set(importar.filter((w): w is string => !!w))) {
    try {
      await importarCatalogoDaWaba(admin, tenantId, waba)
    } catch (e) {
      console.error('[acompanharCatalogos]', waba, e instanceof Error ? e.message : e)
      avisos.push(`Os templates desta conta não vieram da Meta (${e instanceof Error ? e.message : 'erro'}). Use "Sincronizar" na tela de templates.`)
    }
  }
  return { avisos }
}
