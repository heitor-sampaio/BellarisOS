import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/** Ids por consulta: a lista vai na URL do PostgREST. */
const LOTE = 150

/**
 * Os NOMES da cliente e do profissional de registros da unidade (D2 da
 * simulação de 2026-11-01).
 *
 * A agenda e o Financeiro da unidade leem o registro pela SESSÃO — a RLS
 * recorta o agendamento e o lançamento pela unidade —, mas o nome não pode
 * vir pelo join da sessão: `clients_select` só mostra a ficha da unidade de
 * CADASTRO, e a política de `users` só mostra a quem tem unidade fixa os
 * membros da MESMA unidade. A cliente cadastrada em outra unidade e o
 * profissional da rede (que atende em todas, §9.1) viravam "—".
 *
 * Aqui só os nomes, pelo cliente de serviço, dos ids que vieram dos registros
 * que a sessão já leu (recortados por rede, unidade e `ownerFilter`), e
 * sempre com a rede: não abre registro nenhum que a tela já não mostrava.
 */
export async function nomesDosRegistros(
  tenantId: string,
  ids: { clientes?: (string | null | undefined)[]; membros?: (string | null | undefined)[] },
): Promise<{ clientes: Record<string, string>; membros: Record<string, string> }> {
  const admin = createAdminClient()
  const unicos = (xs?: (string | null | undefined)[]) => [...new Set((xs ?? []).filter((x): x is string => !!x))]
  const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE))

  const nomesDe = (tabela: 'clients' | 'users', lista: string[], oQue: string) =>
    Promise.all(lotes(lista).map(l => ler(admin.from(tabela).select('id, name')
      .eq('tenant_id', tenantId).in('id', l), oQue)))

  const [clientes, membros] = await Promise.all([
    nomesDe('clients', unicos(ids.clientes), 'buscar o nome das clientes'),
    nomesDe('users', unicos(ids.membros), 'buscar o nome dos profissionais'),
  ])
  const mapa = (rs: ({ id: string; name: string }[] | null)[]) =>
    Object.fromEntries(rs.flatMap(r => (r ?? []).map(x => [x.id, x.name] as const)))
  return { clientes: mapa(clientes), membros: mapa(membros) }
}
