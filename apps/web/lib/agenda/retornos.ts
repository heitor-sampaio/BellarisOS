// Os retornos a marcar da unidade (D-12, 2026-10-30). Sem 'use server': a
// página que chama já conferiu a sessão e a unidade.
//
// A profissional diz, ao finalizar, "retorno em 15 dias" (revisão da toxina);
// a recepção vê aqui os que vencem nos próximos dias e os que já venceram sem
// ninguém marcar — até a cliente ter um agendamento depois do atendimento. A
// lista e o total vêm do banco (`retornos_a_marcar`): a tela não conta.
// Respeita o "só os meus" da agenda (`ownerFilter`).

import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownerFilter } from '@/lib/auth'
import { mensagemDoErro } from '@/lib/db'

/** Quantos dias à frente a lista olha (a semana que vem) e quantos para trás (o vencido esquecido). */
export const RETORNO_DIAS_A_FRENTE = 7
export const RETORNO_DIAS_ATRAS = 60
const NA_TELA = 20

export interface RetornoAMarcar {
  id: string
  clientId: string
  cliente: string
  procedimento: string
  profissional: string
  /** AAAA-MM-DD (o dia do retorno, em Brasília). */
  retornoPara: string
  retornoEmDias: number | null
}

/** O dia de hoje em Brasília, AAAA-MM-DD, mais `n` dias. */
export function diaDeBrasilia(agora: Date, n = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
    .format(new Date(agora.getTime() + n * 86_400_000))
}

export async function retornosAMarcar(ctx: TenantContext, branchId: string, agora = new Date()): Promise<{ total: number; itens: RetornoAMarcar[] }> {
  const { data, error } = await createAdminClient()
    .rpc('retornos_a_marcar', {
      p_tenant: ctx.tenantId!, p_branch: branchId,
      p_de: diaDeBrasilia(agora, -RETORNO_DIAS_ATRAS), p_ate: diaDeBrasilia(agora, RETORNO_DIAS_A_FRENTE),
      p_professional_id: ownerFilter(ctx, 'agenda'),
    })
    .limit(NA_TELA)
  // É aviso: a falha vai ao log e a tela segue sem ele.
  if (error) { console.error('[retornos-a-marcar]', mensagemDoErro(error)); return { total: 0, itens: [] } }
  const linhas = (data ?? []) as {
    id: string; client_id: string; cliente: string | null; procedimento: string | null; profissional: string | null
    retorno_para: string; retorno_em_dias: number | null; total: number | string
  }[]
  return {
    total: Number(linhas[0]?.total ?? 0),
    itens: linhas.map(l => ({
      id: l.id, clientId: l.client_id, cliente: l.cliente ?? '—', procedimento: l.procedimento ?? '—',
      profissional: l.profissional ?? '—', retornoPara: l.retorno_para, retornoEmDias: l.retorno_em_dias,
    })),
  }
}
