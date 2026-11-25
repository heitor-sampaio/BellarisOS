import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O que falta assinar para o atendimento começar, dito ANTES da pergunta do
 * horário adiantado (A7 da 29ª; princípio 7): "Iniciar mesmo assim?" vinha
 * primeiro, e só depois da resposta o banco recusava pelo termo.
 *
 * A trava continua sendo o banco (`trg_documentos_bloqueiam_inicio`): isto
 * só ADIANTA a mesma frase, com os mesmos documentos
 * (`documentos_pendentes_do_atendimento`, os de "Bloqueia").
 */
export function fraseDoFaltaAssinar(titulos: string[]): string | null {
  if (!titulos.length) return null
  const lista = [...titulos].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')
  return `Falta assinar: ${lista}. Colha a assinatura antes de iniciar o atendimento.`
}

export async function faltaAssinarParaIniciar(
  admin: ReturnType<typeof createAdminClient>, appointmentId: string,
): Promise<string | null> {
  const linhas = await ler(admin.rpc('documentos_pendentes_do_atendimento', { p_agendamento: appointmentId }),
    'conferir os documentos que bloqueiam o início') as { title: string; enforcement: string }[] | null
  return fraseDoFaltaAssinar((linhas ?? []).filter(l => l.enforcement === 'BLOQUEIA').map(l => l.title))
}
