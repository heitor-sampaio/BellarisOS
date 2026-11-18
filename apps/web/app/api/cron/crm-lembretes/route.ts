import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from '@/lib/notifications/notify'
import { ler, lerTodas } from '@/lib/db'
import { dayKeyTZ, partsInTZ } from '@/lib/datetime'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { avisoDoRetorno } from '@/lib/crm/retorno'
import { FUSOS } from '@/lib/unidades/fuso'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'

/**
 * Os lembretes do CRM (9ª simulação, 2026-11-07), no sino de quem tem o lead.
 * Princípio 6 — nada se move sozinho: só AVISA; o card fica onde está.
 *
 * - A42: o dia do retorno combinado (`leads.retornar_em`) chegou → "Retorno de
 *   hoje: X" (a partir das 7h da clínica, F62: o cron é de hora em hora, e o aviso
 *   à meia-noite tocaria o celular de madrugada) ou, passado o dia sem aviso,
 *   "Retorno atrasado: X (10/11)". Uma vez por dia marcado
 *   (`retorno_avisado_em`; trocar a data o zera).
 *   O aviso a pedido da rede (o "Retorno em N dias" com outro texto, outro
 *   alvo, por WhatsApp) é das Automações; este é só o lembrete no sino de
 *   quem tem o card (decisão do Claude na 9ª simulação, pelo princípio 6).
 *
 * O lembrete do ganho a marcar (A45) SAIU daqui em 2026-11-18 (auditoria das
 * regras; r2-cfg-04: "toda e qualquer automação deve ser feita através dos
 * módulos de automações"): é um modelo das Automações (`marque-o-ganho`, em
 * lib/automacoes/modelos.ts), no fato `lead.cliente_comprou`, que nasce rascunho.
 *
 * Cada aviso REIVINDICA a linha antes de sair (a marca gravada só se ainda
 * estava vazia): duas passagens do cron não avisam duas vezes (§9.9).
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HORA_DO_RETORNO = 7

type Admin = ReturnType<typeof createAdminClient>
interface Dono { id: string; is_active: boolean; branch_id: string | null; branches: { slug: string } | null }

async function donos(admin: Admin, ids: string[]): Promise<Map<string, Dono>> {
  if (!ids.length) return new Map()
  const linhas = await ler(admin.from('users').select('id, is_active, branch_id, branches(slug)').in('id', [...new Set(ids)]),
    'ler os responsáveis das oportunidades') as unknown as Dono[] | null
  return new Map((linhas ?? []).map(d => [d.id, d]))
}

/** O quadro no portal de quem recebe, com o card aberto (`?lead=`). */
function caminhoDoLead(dono: Dono, leadId: string): string {
  return dono.branch_id && dono.branches?.slug
    ? `/${dono.branches.slug}/oportunidades?lead=${leadId}`
    : `/admin/oportunidades?lead=${leadId}`
}

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const agora = new Date()
  // O "hoje" e as 7h são do relógio da CLÍNICA (F62): o fuso comum das
  // unidades da rede (sem fuso, o de Brasília). O banco lê até o dia mais
  // adiantado dos fusos; cada retorno se confere no relógio da rede dele.
  const hojeMaisAdiante = FUSOS.map(f => dayKeyTZ(agora, f.valor)).sort().at(-1)!
  const relogioDaRede = async (tenantId: string) => {
    const fuso = await fusoDaRede(tenantId)
    return { hoje: dayKeyTZ(agora, fuso), cedo: partsInTZ(agora, fuso).hour < HORA_DO_RETORNO }
  }
  const bloqueadas = new Map<string, boolean>()
  const bloqueada = async (tenantId: string) => {
    if (!bloqueadas.has(tenantId)) bloqueadas.set(tenantId, await redeEstaBloqueada(tenantId))
    return bloqueadas.get(tenantId)!
  }
  let retornos = 0

  try {
    // --- A42: os retornos -------------------------------------------------
    const pendentes = await lerTodas((de, ate) => admin.from('leads')
      .select('id, tenant_id, name, owner_id, retornar_em, retornar_obs, crm_stages(outcome)')
      .not('retornar_em', 'is', null).is('retorno_avisado_em', null).not('owner_id', 'is', null)
      .lte('retornar_em', hojeMaisAdiante)
      .order('retornar_em').order('id').range(de, ate), 'ler os retornos do dia') as unknown as {
      id: string; tenant_id: string; name: string; owner_id: string; retornar_em: string; retornar_obs: string | null
      crm_stages: { outcome: string | null } | null
    }[]
    const abertos = pendentes.filter(l => !['WON', 'LOST'].includes(l.crm_stages?.outcome ?? ''))
    const donosDosRetornos = await donos(admin, abertos.map(l => l.owner_id))
    for (const l of abertos) {
      const dono = donosDosRetornos.get(l.owner_id)
      if (!dono?.is_active || await bloqueada(l.tenant_id)) continue
      // Antes das 7h da clínica, só o atrasado (o de hoje espera a manhã).
      const { hoje, cedo } = await relogioDaRede(l.tenant_id)
      if (cedo ? l.retornar_em >= hoje : l.retornar_em > hoje) continue
      const meu = await ler(admin.from('leads').update({ retorno_avisado_em: agora.toISOString() })
        .eq('id', l.id).is('retorno_avisado_em', null).eq('retornar_em', l.retornar_em).select('id'), 'reivindicar o retorno')
      if (!meu?.length) continue
      await notifyUser(admin, dono.id, {
        type: 'crm.lembrete',
        ...avisoDoRetorno({ nome: l.name, dia: l.retornar_em, obs: l.retornar_obs }, hoje),
        data: { leadId: l.id, caminho: caminhoDoLead(dono, l.id) },
      })
      retornos++
    }

    return NextResponse.json({ ok: true, retornos })
  } catch (e) {
    console.error('[cron/crm-lembretes]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), retornos }, { status: 500 })
  }
}
