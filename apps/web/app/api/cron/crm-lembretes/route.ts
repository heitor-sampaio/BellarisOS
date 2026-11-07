import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from '@/lib/notifications/notify'
import { ler, lerTodas } from '@/lib/db'
import { dayKeyTZ, partsInTZ } from '@/lib/datetime'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { textoDoRetorno } from '@/lib/crm/retorno'

/**
 * Os lembretes do CRM (9ª simulação, 2026-11-07), no sino de quem tem o lead.
 * Princípio 6 — nada se move sozinho: só AVISA; o card fica onde está.
 *
 * - A42: o dia do retorno combinado (`leads.retornar_em`) chegou → "Retorno de
 *   hoje: X" (a partir das 7h de Brasília: o cron é de hora em hora, e o aviso
 *   à meia-noite tocaria o celular de madrugada) ou, passado o dia sem aviso,
 *   "Retorno atrasado: X (10/11)". Uma vez por dia marcado
 *   (`retorno_avisado_em`; trocar a data o zera).
 * - A45: a cliente ligada comprou com a oportunidade aberta → "Marque o ganho:
 *   X" (`crm_lembretes_de_ganho`, a régua da sugestão do card). Uma vez por
 *   oportunidade (`ganho_lembrado_em`).
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
    'ler os responsáveis dos leads') as unknown as Dono[] | null
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
  const hoje  = dayKeyTZ(agora)
  const bloqueadas = new Map<string, boolean>()
  const bloqueada = async (tenantId: string) => {
    if (!bloqueadas.has(tenantId)) bloqueadas.set(tenantId, await redeEstaBloqueada(tenantId))
    return bloqueadas.get(tenantId)!
  }
  let retornos = 0
  let ganhos = 0

  try {
    // --- A42: os retornos -------------------------------------------------
    const cedo = partsInTZ(agora).hour < HORA_DO_RETORNO
    const pendentes = await lerTodas((de, ate) => {
      let q = admin.from('leads')
        .select('id, tenant_id, name, owner_id, retornar_em, retornar_obs, crm_stages(outcome)')
        .not('retornar_em', 'is', null).is('retorno_avisado_em', null).not('owner_id', 'is', null)
      // Antes das 7h, só o atrasado (o de hoje espera a manhã).
      q = cedo ? q.lt('retornar_em', hoje) : q.lte('retornar_em', hoje)
      return q.order('retornar_em').order('id').range(de, ate)
    }, 'ler os retornos do dia') as unknown as {
      id: string; tenant_id: string; name: string; owner_id: string; retornar_em: string; retornar_obs: string | null
      crm_stages: { outcome: string | null } | null
    }[]
    const abertos = pendentes.filter(l => !['WON', 'LOST'].includes(l.crm_stages?.outcome ?? ''))
    const donosDosRetornos = await donos(admin, abertos.map(l => l.owner_id))
    for (const l of abertos) {
      const dono = donosDosRetornos.get(l.owner_id)
      if (!dono?.is_active || await bloqueada(l.tenant_id)) continue
      const meu = await ler(admin.from('leads').update({ retorno_avisado_em: agora.toISOString() })
        .eq('id', l.id).is('retorno_avisado_em', null).eq('retornar_em', l.retornar_em).select('id'), 'reivindicar o retorno')
      if (!meu?.length) continue
      const r = textoDoRetorno(l.retornar_em, hoje)
      await notifyUser(admin, dono.id, {
        type: 'crm.lembrete',
        title: r.atrasado ? `Retorno atrasado: ${l.name} (${l.retornar_em.slice(8, 10)}/${l.retornar_em.slice(5, 7)})` : `Retorno de hoje: ${l.name}`,
        body: l.retornar_obs ? `Combinado: ${l.retornar_obs}` : `Hoje é o dia combinado para retomar o contato com ${l.name}.`,
        data: { leadId: l.id, caminho: caminhoDoLead(dono, l.id) },
      })
      retornos++
    }

    // --- A45: o ganho a marcar -------------------------------------------
    const aLembrar = (await ler(admin.rpc('crm_lembretes_de_ganho', { p_limite: 500 }), 'ler as oportunidades a lembrar do ganho') ?? []) as {
      lead_id: string; tenant_id: string; owner_id: string; nome: string; compra: string; compra_em: string
    }[]
    const donosDosGanhos = await donos(admin, aLembrar.map(g => g.owner_id))
    for (const g of aLembrar) {
      const dono = donosDosGanhos.get(g.owner_id)
      if (!dono?.is_active || await bloqueada(g.tenant_id)) continue
      const meu = await ler(admin.from('leads').update({ ganho_lembrado_em: agora.toISOString() })
        .eq('id', g.lead_id).is('ganho_lembrado_em', null).select('id'), 'reivindicar o lembrete do ganho')
      if (!meu?.length) continue
      await notifyUser(admin, dono.id, {
        type: 'crm.lembrete',
        title: `Marque o ganho: ${g.nome}`,
        body: `${g.nome} comprou ${g.compra}, e a oportunidade dela segue aberta. Se fechou, leve o card a Ganho no quadro — ele não muda sozinho.`,
        data: { leadId: g.lead_id, caminho: caminhoDoLead(dono, g.lead_id) },
      })
      ganhos++
    }

    return NextResponse.json({ ok: true, retornos, ganhos })
  } catch (e) {
    console.error('[cron/crm-lembretes]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), retornos, ganhos }, { status: 500 })
  }
}
