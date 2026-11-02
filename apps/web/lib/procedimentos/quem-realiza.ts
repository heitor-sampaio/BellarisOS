import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * "Quem realiza" o procedimento (por-01, revisão do Heitor de 2026-11-02: "já
 * deveria ter um cadastro das profissionais que podem realizar o
 * procedimento"). A ligação mora em `procedure_professionals`, marcada no
 * cadastro do procedimento.
 *
 * A regra é UMA: sem ninguém marcado, TODAS as que atendem realizam (o de
 * antes); com alguém marcado, só as marcadas. Quem usa: o app da cliente (a
 * lista, o "Sem preferência" e a action), o aviso da agenda da clínica e o
 * repasse ao desativar (`lib/equipe/repasse.ts`).
 */
export function realiza(quemRealiza: readonly string[] | null | undefined, profissionalId: string): boolean {
  return !quemRealiza || quemRealiza.length === 0 || quemRealiza.includes(profissionalId)
}

/** A recusa do servidor, a mesma no app e no repasse. */
export const NAO_REALIZA = 'Esta profissional não realiza este procedimento.'

/** Quem realiza cada procedimento (vazio = todas). Os ids vão no corpo de uma consulta por lote. */
export async function quemRealizaOsProcedimentos(admin: Admin, procedimentos: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  const ids = [...new Set(procedimentos.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 150) {
    const linhas = (await ler(admin.from('procedure_professionals').select('procedure_id, user_id')
      .in('procedure_id', ids.slice(i, i + 150)), 'carregar quem realiza os procedimentos')) as { procedure_id: string; user_id: string }[] | null
    for (const l of linhas ?? []) mapa.set(l.procedure_id, [...(mapa.get(l.procedure_id) ?? []), l.user_id])
  }
  return mapa
}

/** Quem realiza um procedimento (vazio = todas). */
export async function quemRealizaOProcedimento(admin: Admin, procedimento: string): Promise<string[]> {
  return (await quemRealizaOsProcedimentos(admin, [procedimento])).get(procedimento) ?? []
}
