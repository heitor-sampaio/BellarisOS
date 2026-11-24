import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O NOME do card é o da PESSOA (A18 da 27ª; o Heitor, 24/11, "1": o card
 * sempre mostra o nome do contato; crm-inbox.md §9.2.1). Duas oportunidades do
 * mesmo contato mostravam a cópia de cada uma (`leads.name`, gravada quando
 * nasceram) — a planilha e o "Nova oportunidade" escrevem o nome digitado, e
 * só a edição o leva às outras (`propagarDadosDaPessoa`). A cópia fica para a
 * pessoa sem nome.
 *
 * O e-mail e a rede social NÃO entram: são a cópia do card de propósito
 * (crm-inbox.md, "Não propagam: a oportunidade tem a SUA cópia").
 */
export function nomeNoCard(nomeDaPessoa: string | null | undefined, copia: string): string {
  return nomeDaPessoa?.trim() || copia
}

/** Ids por consulta: a lista vai na URL do PostgREST. */
const LOTE = 100

/**
 * Os nomes das pessoas do quadro (contato → nome), da rede. Leitura de página:
 * quem chama já autorizou (fora de `actions/`, como `atividadeDasPessoas`).
 */
export async function nomesDasPessoas(tenantId: string, contatoIds: string[]): Promise<Map<string, string | null>> {
  const nomes = new Map<string, string | null>()
  const ids = [...new Set(contatoIds.filter(Boolean))]
  if (ids.length === 0) return nomes
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i += LOTE) {
    const linhas = await ler(admin.from('contacts').select('id, name')
      .eq('tenant_id', tenantId).in('id', ids.slice(i, i + LOTE)), 'ler os nomes dos contatos')
    for (const l of (linhas ?? []) as { id: string; name: string | null }[]) nomes.set(l.id, l.name)
  }
  return nomes
}
