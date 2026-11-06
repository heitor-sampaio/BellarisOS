import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { partsInTZ } from '@/lib/datetime'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/**
 * As aniversariantes do mês de Brasília (A9 da 8ª simulação, 2026-11-06: não
 * havia tela nem filtro, só a automação desligada). Quem faz aniversário é
 * decidido PELO BANCO (`clientes_aniversariantes`, só o servidor — §14 do
 * CLAUDE.md: nada de filtrar no app depois de ler um lote); a lista de
 * Clientes recebe o dia de cada uma e filtra a lista que já carregou inteira.
 */
export async function aniversariantesDoMes(tenantId: string, hoje: Date = new Date()): Promise<{
  mes: number; nomeDoMes: string; dias: Record<string, number>
}> {
  const mes = partsInTZ(hoje).month
  const linhas = await lerTodas<{ client_id: string; dia: number }>((de, ate) => createAdminClient()
    .rpc('clientes_aniversariantes', { p_tenant: tenantId, p_mes: mes })
    .order('client_id').range(de, ate), 'carregar as aniversariantes do mês')
  return { mes, nomeDoMes: MESES[mes - 1]!, dias: Object.fromEntries(linhas.map(l => [l.client_id, l.dia])) }
}
