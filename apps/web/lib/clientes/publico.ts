import { createAdminClient } from '@/lib/supabase/admin'
import { contar, lerTodas } from '@/lib/db'

/**
 * O público de uma campanha ou de um fluxo de automação, filtrado NO BANCO
 * (`clientes_do_publico`, 2026-10-22). Só clientes ativos da rede — a cliente
 * é da rede, e o público não tem filtro de unidade (MK2 do Bloco Tags,
 * 2026-11-14: as tags e o filtro de tag já cobrem o caso).
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
  genders?:           string[]
  tags?:              string[]
  has_app_account?:   boolean
  /** Já fez algum destes, concluído. */
  procedure_ids?:     string[]
  /** Faz aniversário neste dia (mês e dia da data gravada). */
  aniversario?:       { mes: number; dia: number }
  /** Nenhum atendimento concluído marcado desde este instante (ISO). */
  sem_retorno_desde?: string
  /** Cliente da clínica de antes deste instante: coalesce(cliente_desde, created_at) (ISO). */
  cliente_desde_antes?: string
  /** Ao menos N atendimentos concluídos. */
  min_visitas?:       number
  /** Só estas fichas (o recorte do fato, nas campanhas automáticas). */
  client_ids?:        string[]
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

/**
 * Quantas do público têm um aparelho para receber o aviso no celular — o app
 * (`push_tokens`) ou os avisos do navegador (`web_push_subscriptions`). É o
 * mesmo critério do disparo da campanha (D-3, 2026-10-30). Contado no banco.
 */
export async function contarPublicoComAparelho(tenantId: string, filtros: FiltrosDoPublico): Promise<number> {
  const { data, error } = await createAdminClient().rpc('publico_com_aparelho', argumentos(tenantId, filtros))
  if (error) throw new Error(`Não consegui contar quem tem o app: ${error.message}`)
  return Number(data ?? 0)
}

/**
 * Quantas do público têm uma conversa de WhatsApp por onde a mensagem sai
 * (`conversa_de_whatsapp_da_cliente`: pela ficha, senão pelo telefone; nunca
 * a de um número removido). É a régua do envio da automação (C55/C65, F69).
 */
export async function contarPublicoComConversa(tenantId: string, filtros: FiltrosDoPublico): Promise<number> {
  const { data, error } = await createAdminClient().rpc('publico_com_conversa', argumentos(tenantId, filtros))
  if (error) throw new Error(`Não consegui contar quem tem conversa aberta: ${error.message}`)
  return Number(data ?? 0)
}
