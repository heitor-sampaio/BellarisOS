import { createAdminClient } from '@/lib/supabase/admin'
import { contar, lerTodas } from '@/lib/db'

/**
 * O público de uma campanha ou de um fluxo de automação, filtrado NO BANCO
 * (`clientes_do_publico`, 2026-10-22). Só clientes ativos da rede.
 *
 * Era lido pelo app — 1000 (ou 501) clientes, sem ordem, por causa do teto do
 * PostgREST — e o aniversário, o "sem retorno" e o procedimento eram
 * filtrados DEPOIS, em JavaScript, sobre esse lote arbitrário: a
 * aniversariante que não vinha no lote nunca recebia nada, e a prévia do
 * público com procedimento contava no máximo 400.
 *
 * Fora de `actions/`: recebe a rede por parâmetro, e quem chama já conferiu.
 */
export interface FiltrosDoPublico {
  branch_ids?:        string[]
  genders?:           string[]
  tags?:              string[]
  has_app_account?:   boolean
  /** Já fez algum destes, concluído. */
  procedure_ids?:     string[]
  /** Faz aniversário neste dia (mês e dia da data gravada). */
  aniversario?:       { mes: number; dia: number }
  /** Nenhum atendimento concluído marcado desde este instante (ISO). */
  sem_retorno_desde?: string
}

export interface ClienteDoPublico {
  id: string; name: string; phone: string | null; auth_id: string | null
}

const argumentos = (tenantId: string, filtros: FiltrosDoPublico) => ({ p_tenant: tenantId, p_filtros: filtros })

/** Todo o público, em páginas. */
export function lerPublico(tenantId: string, filtros: FiltrosDoPublico): Promise<ClienteDoPublico[]> {
  const admin = createAdminClient()
  return lerTodas<ClienteDoPublico>(
    (de, ate) => admin.rpc('clientes_do_publico', argumentos(tenantId, filtros)).order('id').range(de, ate),
    'carregar o público',
  )
}

/** Os primeiros `limite` do público (ordem estável), para quem tem teto. */
export async function lerPublicoAte(tenantId: string, filtros: FiltrosDoPublico, limite: number): Promise<ClienteDoPublico[]> {
  const { data, error } = await createAdminClient()
    .rpc('clientes_do_publico', argumentos(tenantId, filtros)).order('id').limit(limite)
  if (error) throw new Error(`Não consegui buscar os clientes: ${error.message}`)
  return (data ?? []) as ClienteDoPublico[]
}

/** O tamanho do público, contado no banco. */
export function contarPublico(tenantId: string, filtros: FiltrosDoPublico): Promise<number> {
  return contar(
    createAdminClient().rpc('clientes_do_publico', argumentos(tenantId, filtros), { count: 'exact', head: true }),
    'contar o público da campanha',
  )
}
