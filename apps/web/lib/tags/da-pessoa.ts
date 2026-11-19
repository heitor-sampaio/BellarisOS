import 'server-only'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { tagsAtivasDaRede } from './vocabulario'
import { tagsDoVocabulario } from './escolha'
import { juntarTags, pessoaDaOportunidade, type PessoaDaOportunidade } from './pessoa'

/**
 * Ler e gravar as tags da PESSOA (crm-inbox.md §9.2.1, "As TAGS são da
 * pessoa"). Quem grava pelo card da oportunidade e pela automação passa por
 * aqui; a ficha e o painel do inbox gravam a própria linha (`clients.tags`,
 * `contacts.tags`) — e o banco mantém a ficha e os contatos dela iguais
 * (migration 20261125500001). Sempre pelo cliente de serviço: a sessão só lê
 * as duas tabelas. A trava (permissão, alcance) é de quem chama.
 */

/** A pessoa de um contato: a ficha dele, se tem; senão, ele mesmo. */
async function pessoaDoContato(tenantId: string, contatoId: string): Promise<PessoaDaOportunidade | null> {
  const k = await ler(createAdminClient().from('contacts').select('id, client_id')
    .eq('id', contatoId).eq('tenant_id', tenantId).maybeSingle(), 'ler o contato') as { id: string; client_id: string | null } | null
  if (!k) return null
  return k.client_id ? { tabela: 'clients', id: k.client_id } : { tabela: 'contacts', id: k.id }
}

/** A pessoa de uma oportunidade: a ficha; sem ela, a ficha do contato; senão, o contato. */
export async function pessoaDaOportunidadeNoBanco(tenantId: string, leadId: string): Promise<PessoaDaOportunidade | null> {
  const l = await ler(createAdminClient().from('leads').select('client_id, contato_id')
    .eq('id', leadId).eq('tenant_id', tenantId).maybeSingle(), 'ler a pessoa da oportunidade') as
    { client_id: string | null; contato_id: string | null } | null
  if (!l) return null
  const p = pessoaDaOportunidade(l)
  if (p?.tabela === 'contacts') return pessoaDoContato(tenantId, p.id)
  return p
}

/** A pessoa de um par (ficha, contato), como chega no contexto de uma automação. */
export async function pessoaDe(tenantId: string, ids: { clientId?: string | null; contatoId?: string | null }): Promise<PessoaDaOportunidade | null> {
  if (ids.clientId) return { tabela: 'clients', id: ids.clientId }
  if (ids.contatoId) return pessoaDoContato(tenantId, ids.contatoId)
  return null
}

export async function lerTagsDaPessoa(tenantId: string, pessoa: PessoaDaOportunidade): Promise<string[] | null> {
  const linha = await ler(createAdminClient().from(pessoa.tabela).select('tags')
    .eq('id', pessoa.id).eq('tenant_id', tenantId).maybeSingle(), 'ler as tags da pessoa') as { tags: string[] | null } | null
  return linha ? (linha.tags ?? []) : null
}

/** A lista da ficha e dos contatos mudou: a lista de Clientes e a ficha leem do cache. */
export function expirarCacheDasTags(tenantId: string, clientId: string | null) {
  // Fora de uma requisição (a automação no cron) o Next recusa: o cache vence sozinho.
  try {
    revalidateTag(`clients:${tenantId}`, { expire: 0 })
    if (clientId) revalidateTag(`client:${clientId}`, { expire: 0 })
  } catch { /* fora de requisição */ }
}

async function gravarNaPessoa(tenantId: string, pessoa: PessoaDaOportunidade, tags: string[]) {
  const linhas = await gravar(createAdminClient().from(pessoa.tabela).update({ tags })
    .eq('id', pessoa.id).eq('tenant_id', tenantId).select('id'), 'gravar as tags da pessoa') as { id: string }[] | null
  if (!linhas?.length) throw new Error('A pessoa desta oportunidade não foi encontrada.')
  expirarCacheDasTags(tenantId, pessoa.tabela === 'clients' ? pessoa.id : null)
}

export type TrocaDeTags = { antes: string[]; depois: string[] }

/**
 * As tags marcadas no card da oportunidade: a lista inteira da PESSOA passa a
 * ser esta. Só as do vocabulário ativo (e as que a pessoa já tinha — a
 * arquivada fica em quem tem; D7 da 18ª): criar tag é de Configurações → Tags.
 */
export async function gravarTagsDaOportunidade(tenantId: string, leadId: string, pedidas: readonly string[]): Promise<TrocaDeTags | null> {
  const pessoa = await pessoaDaOportunidadeNoBanco(tenantId, leadId)
  if (!pessoa) return null
  const [vocabulario, antes] = await Promise.all([tagsAtivasDaRede(tenantId), lerTagsDaPessoa(tenantId, pessoa)])
  if (antes === null) return null
  const depois = tagsDoVocabulario(pedidas, vocabulario, antes)
  if (mesmaLista(antes, depois)) return { antes, depois: antes }
  await gravarNaPessoa(tenantId, pessoa, depois)
  return { antes, depois }
}

/** Soma tags às da pessoa (a oportunidade nova que já marcou as dela). Nunca tira. */
export async function somarTagsNaPessoa(tenantId: string, pessoa: PessoaDaOportunidade, tags: readonly string[]): Promise<TrocaDeTags | null> {
  const antes = await lerTagsDaPessoa(tenantId, pessoa)
  if (antes === null) return null
  const depois = juntarTags(antes, tags)
  if (depois.length === antes.length) return { antes, depois: antes }
  await gravarNaPessoa(tenantId, pessoa, depois)
  return { antes, depois }
}

/** A ação "Adicionar tag" da automação: uma tag a mais na pessoa (sem distinguir a caixa). */
export async function somarTagNaPessoa(tenantId: string, pessoa: PessoaDaOportunidade, tag: string): Promise<{ alterado: boolean; existe: boolean }> {
  const r = await somarTagsNaPessoa(tenantId, pessoa, [tag])
  if (!r) return { alterado: false, existe: false }
  return { alterado: r.depois.length !== r.antes.length, existe: true }
}

function mesmaLista(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((t, i) => t === b[i])
}
