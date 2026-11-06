import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { zonedToUtc } from '@/lib/datetime'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Grava o pacote trazido de fora (F35, decisão 1 do Heitor) — UMA porta, da
 * ficha (`trazerPacoteDeFora`) e da importação (a coluna "Pacote de antes").
 * A conta e as conferências moram no banco (`pacote_trazer`: o catálogo de_fora
 * desativado, o pacote sem preço de venda e as sessões com o rateio do valor
 * de referência). Quem chama já conferiu a permissão e o alcance.
 */
export interface PacoteATrazer {
  clientId: string; branchId: string; procedureId: string
  total: number; usadas: number
  /** O valor de referência do pacote inteiro (opcional). */
  valor: number | null
  /** aaaa-mm-dd (válido até o fim desse dia, em Brasília) ou nulo. */
  validade: string | null
}

/** "aaaa-mm-dd" → o fim desse dia em Brasília (a validade vale o dia inteiro). */
export function fimDoDiaDaValidade(dia: string | null): string | null {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return zonedToUtc(a, m, d, 23, 59, 59, 999).toISOString()
}

export async function trazerPacoteCore(admin: Admin, tenantId: string, atorId: string | null, p: PacoteATrazer): Promise<string> {
  return await ler(admin.rpc('pacote_trazer', {
    p_tenant: tenantId, p_cliente: p.clientId, p_unidade: p.branchId, p_procedimento: p.procedureId,
    p_total: p.total, p_usadas: p.usadas, p_validade: fimDoDiaDaValidade(p.validade),
    p_valor: p.valor, p_ator: atorId,
  }), 'trazer o pacote de fora') as string
}

/**
 * A importação de novo não traz o mesmo pacote duas vezes ("importar de novo
 * é seguro"): o mesmo procedimento, o mesmo total e as mesmas usadas antes do
 * sistema, num pacote de fora vivo da cliente, é o mesmo pacote.
 */
export async function jaTemOPacoteDeFora(admin: Admin, clientId: string, p: Pick<PacoteATrazer, 'procedureId' | 'total' | 'usadas'>): Promise<boolean> {
  const linhas = await ler(admin.from('client_packages')
    .select('id, service_packages!inner(procedure_id)')
    .eq('client_id', clientId).eq('de_fora', true).is('cancelado_em', null)
    .eq('total_sessions', p.total).eq('usadas_antes', p.usadas)
    .eq('service_packages.procedure_id', p.procedureId).limit(1), 'conferir o pacote de fora da cliente')
  return (linhas ?? []).length > 0
}
