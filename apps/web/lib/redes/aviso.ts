import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { faturaEmAberto, lerAssinatura } from '@/lib/redes/assinatura'
import { diasDoTeste } from '@/lib/redes/dias-do-teste'

/**
 * O aviso da assinatura no topo — só para a Admin da rede (a equipe não
 * precisa saber da cobrança do sistema). Dois casos:
 *  - teste acabando (7 dias ou menos);
 *  - em atraso: até quando regulariza antes da suspensão, e o link da fatura.
 * Suspensa não chega aqui: o portão manda para `/conta-suspensa`.
 */
export type AvisoDaAssinatura =
  | { tipo: 'teste'; dias: number }
  | { tipo: 'atraso'; suspendeEm: string | null; url: string | null }

/**
 * Quem responde pela conta com o BellarisOS: a Admin da rede, e só ela — o
 * cargo de SISTEMA gravado (`ctx.isNetworkAdmin`), como a aba Assinatura e
 * contratar o adicional (o Heitor, 18/11: a configuração da rede toda é "só
 * pela conta admin"). Era "A rede inteira" com Configurações em Gerenciar.
 */
export function administraARede(ctx: Pick<TenantContext, 'tenantId' | 'isClient' | 'isNetworkAdmin'>): boolean {
  return !!ctx.tenantId && !ctx.isClient && ctx.isNetworkAdmin === true
}

export async function avisoDaAssinatura(ctx: Pick<TenantContext, 'tenantId' | 'isClient' | 'isNetworkAdmin' | 'suporte'>): Promise<AvisoDaAssinatura | null> {
  if (!administraARede(ctx) || ctx.suporte) return null
  try {
    const t = await ler(createAdminClient().from('tenants').select('plan_status, trial_ends_at, em_atraso_desde')
      .eq('id', ctx.tenantId!).maybeSingle(), 'ler a situação da assinatura') as
      { plan_status: string | null; trial_ends_at: string | null; em_atraso_desde: string | null } | null
    if (!t) return null
    if (t.plan_status === 'trial' && t.trial_ends_at) {
      // A mesma conta da aba Assinatura (A30 da 25ª): dias de calendário em
      // Brasília até o último dia — no último dia, 0 ("termina hoje").
      const dias = diasDoTeste(t.trial_ends_at, new Date())
      return dias !== null && dias <= 7 ? { tipo: 'teste', dias } : null
    }
    if (t.plan_status === 'past_due') {
      const cfg = await ler(createAdminClient().from('platform_settings').select('dias_de_carencia').eq('id', 1).maybeSingle(),
        'ler a carência') as { dias_de_carencia: number } | null
      const suspendeEm = t.em_atraso_desde
        ? new Date(Date.parse(`${t.em_atraso_desde}T12:00:00-03:00`) + (cfg?.dias_de_carencia ?? 7) * 86_400_000).toISOString()
        : null
      const fatura = faturaEmAberto(await lerAssinatura(ctx.tenantId!))
      return { tipo: 'atraso', suspendeEm, url: fatura?.url ?? null }
    }
    return null
  } catch (e) {
    // Acessório: o aviso falhar não pode derrubar o portal.
    console.error('[assinatura] aviso:', (e as Error).message)
    return null
  }
}
