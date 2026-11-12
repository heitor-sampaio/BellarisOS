import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O que fica para trás quando uma unidade sai do ar (C67 do levantamento das
 * regras, F70; H6 = a, o Heitor): quem da equipe é FIXO só nela (a
 * abrangência é ela — sem ela no ar, essa pessoa não tem onde entrar) e
 * quantos agendamentos futuros continuam marcados ali. A tela mostra e
 * oferece resolver; não impede (princípios 2 e 3).
 */
export interface OQueFicaNaUnidade {
  fixos:        { id: string; nome: string }[]
  agendamentos: number
}

const ABERTOS = ['SCHEDULED', 'CONFIRMED']

export async function oQueFicaNaUnidade(admin: Admin, tenantId: string, branchId: string): Promise<OQueFicaNaUnidade> {
  const [fixos, { count, error }] = await Promise.all([
    ler(admin.from('users').select('id, name')
      .eq('tenant_id', tenantId).eq('branch_id', branchId).eq('is_active', true).order('name'), 'carregar a equipe fixa da unidade') as
      Promise<{ id: string; name: string }[] | null>,
    admin.from('appointments').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).in('status', ABERTOS).gte('scheduled_at', new Date().toISOString()),
  ])
  if (error) throw new Error(`contar os agendamentos da unidade: ${error.message}`)
  return { fixos: (fixos ?? []).map(f => ({ id: f.id, nome: f.name })), agendamentos: count ?? 0 }
}

/** O resumo da janela: "A unidade X tem 2 pessoas da equipe só nela e 14 agendamentos marcados." (null = nada fica). */
export function resumoDoQueFica(nome: string, o: OQueFicaNaUnidade): string | null {
  const partes: string[] = []
  if (o.fixos.length) partes.push(o.fixos.length === 1 ? '1 pessoa da equipe só nela' : `${o.fixos.length} pessoas da equipe só nela`)
  if (o.agendamentos) partes.push(o.agendamentos === 1 ? '1 agendamento marcado' : `${o.agendamentos} agendamentos marcados`)
  return partes.length ? `A unidade ${nome} tem ${partes.join(' e ')}.` : null
}
