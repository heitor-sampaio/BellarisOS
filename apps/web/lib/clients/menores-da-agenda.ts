import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ehMenorDeIdade, linhaDoResponsavel, responsavelDaFicha } from './menor'
import type { MenorDoAgendamento } from '@/components/shared/selo-do-menor'

/** Ids por consulta: a lista vai na URL do PostgREST. */
const LOTE = 150

/**
 * As clientes MENORES de idade entre as da agenda, com a linha do responsável
 * (decisão 2 do Heitor, 2026-11-05) — a marca "Menor" do bloco e da janela.
 * Pelo cliente de serviço, com a rede, só os ids já lidos pela agenda (a
 * cliente cadastrada em outra unidade, como em `nomesDosRegistros`).
 */
export async function menoresDaAgenda(tenantId: string, clientes: (string | null)[]): Promise<Record<string, MenorDoAgendamento>> {
  const ids = [...new Set(clientes.filter((c): c is string => !!c))]
  const menores: Record<string, MenorDoAgendamento> = {}
  if (!ids.length) return menores
  const admin = createAdminClient()
  const lotes = Array.from({ length: Math.ceil(ids.length / LOTE) }, (_, i) => ids.slice(i * LOTE, (i + 1) * LOTE))
  const linhas = await Promise.all(lotes.map(l => ler(admin.from('clients')
    .select('id, birth_date, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone')
    .eq('tenant_id', tenantId).in('id', l).not('birth_date', 'is', null), 'buscar as menores da agenda')))
  for (const c of linhas.flat() as ({ id: string; birth_date: string | null } & Parameters<typeof responsavelDaFicha>[0])[]) {
    if (ehMenorDeIdade(c.birth_date)) menores[c.id] = { responsavel: linhaDoResponsavel(responsavelDaFicha(c)) }
  }
  return menores
}
