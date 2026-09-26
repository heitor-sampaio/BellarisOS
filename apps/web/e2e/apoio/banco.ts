import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Acesso direto ao banco para as conferências que a tela não mostra.
 *
 * Existe porque metade do que estas fases consertaram é invisível: o
 * `branch_id` do lançamento feito pela rede, o `branch_id` do crédito
 * interno, o movimento de estoque do produto recém-criado. Conferir só pela
 * tela deixaria passar exatamente o tipo de gravação silenciosa que motivou o
 * trabalho.
 */
export function banco(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Prefixo de tudo que a suíte cria — e o único critério da limpeza. */
export const PREFIXO = '[e2e]'

/** Nome com carimbo de tempo, para duas rodadas não colidirem. */
export function nomeDeTeste(o_que: string): string {
  return `${PREFIXO} ${o_que} ${Date.now().toString(36)}`
}

export async function tenantId(): Promise<string> {
  const { data, error } = await banco().from('tenants').select('id').limit(1).single()
  if (error) throw new Error(`Não achei o tenant: ${error.message}`)
  return data.id as string
}

export type Filial = { id: string; name: string; slug: string }

/**
 * Uma unidade em que dá para marcar: tem profissional que atende.
 *
 * O modal da rede pergunta a unidade e carrega procedimento e profissional
 * dela — numa unidade sem ninguém cadastrado o select fica vazio, e isso é
 * falta de dado no ambiente, não defeito da tela. O teste que depende disso
 * pula com explicação em vez de falhar.
 */
export async function unidadeQueAtende(): Promise<Filial | null> {
  const db = banco()
  const { data, error } = await db
    .from('users')
    .select('branch_id, branches!inner(id, name, slug, is_active)')
    .eq('provides_services', true)
    .eq('is_active', true)
    .not('branch_id', 'is', null)
  if (error) throw new Error(`Não consegui achar uma unidade com profissional: ${error.message}`)

  for (const linha of data ?? []) {
    const b = linha.branches as unknown as Filial & { is_active: boolean }
    if (b?.is_active) return { id: b.id, name: b.name, slug: b.slug }
  }
  return null
}

export async function filiaisAtivas(): Promise<Filial[]> {
  const { data, error } = await banco()
    .from('branches')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(`Não consegui listar as filiais: ${error.message}`)
  return (data ?? []) as Filial[]
}

/**
 * Apaga uma conversa e tudo que só existe por causa dela.
 *
 * Existe porque cada spec limpava à mão, e a lista do que precisa sair cresceu:
 * eventos, mensagens, a conversa — e, desde que a PESSOA virou registro próprio,
 * o contato que o gatilho `trg_conversa_ganha_contato` criou junto.
 *
 * Sem um lugar só, cada spec novo precisa lembrar do item novo. Foi o que
 * aconteceu: o gatilho entrou e cinco specs passaram a deixar um contato órfão
 * por rodada, porque nenhum deles sabia que a tabela existia.
 *
 * ⚠️ O contato só é apagado se **não sobrou outra conversa** nele. Em produção
 * conversa não se apaga, então isto é higiene de teste — não é o comportamento
 * do sistema.
 */
export async function apagarConversas(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = banco()

  const { data: convs } = await db
    .from('conversations').select('contato_id').in('id', ids)
  const contatos = [...new Set(
    (convs ?? []).map(c => c.contato_id as string | null).filter(Boolean) as string[],
  )]

  await db.from('domain_events').delete().in('entidade_id', ids)
  await db.from('messages').delete().in('conversation_id', ids)
  await db.from('conversations').delete().in('id', ids)

  for (const contatoId of contatos) {
    const { count } = await db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('contato_id', contatoId)
    if ((count ?? 0) === 0) await db.from('contacts').delete().eq('id', contatoId)
  }
}
