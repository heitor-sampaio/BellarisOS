import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * D5 da 37ª simulação (DE-14: "A sessão não emite documento próprio"; PA-08).
 *
 * A sessão de pacote nasce JÁ ligada ao pacote: o agendamento e a ligação vão
 * numa transação só (`agendamento_criar_na_sessao_de_pacote`, migration
 * `20261216300001`), e o gatilho do INSERT não emite os documentos do
 * procedimento — os da cliente são os do pacote, emitidos na venda. Antes, o
 * agendamento nascia avulso, emitia, e a ligação (no pedido seguinte) cancelava
 * o que acabara de nascer.
 *
 * `linha` é a mesma linha que o núcleo do agendamento grava em `appointments`.
 * A sessão já tomada por outro agendamento (a corrida) volta como `jaUsado`, e
 * nada fica gravado.
 */
export async function inserirAgendamentoDaSessaoDePacote(
  admin: Admin, linha: Record<string, unknown>, sessaoId: string,
): Promise<{ id: string } | { jaUsado: true } | { error: string }> {
  const { data, error } = await admin.rpc('agendamento_criar_na_sessao_de_pacote', { p_agendamento: linha, p_sessao: sessaoId })
  if (error) {
    if (error.message.includes('CREDITO_JA_USADO')) return { jaUsado: true }
    return { error: `Erro ao criar agendamento: ${error.message}` }
  }
  if (typeof data !== 'string' || !data) return { error: 'Erro ao criar agendamento: desconhecido' }
  return { id: data }
}
