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
    { auth: { persistSession: false }, global: { fetch: fetchQueInsiste } },
  )
}

/**
 * A LEITURA que cai na rede (o `fetch` lança, sem resposta) tenta de novo.
 * Na completa de 2026-10-22 um GET de `package_sessions` nunca chegou ao
 * Supabase (não está no log dele): o runner ficou ~70 s pendurado e o
 * supabase-js devolveu `data: null` — o teste morreu num `null.id` sem dizer
 * nada. GET e HEAD: repetir uma gravação que talvez tenha chegado gravaria
 * duas vezes. Resposta de erro (4xx, 5xx) não é repetida — é o banco falando.
 *
 * A exceção é a GRAVAÇÃO cancelada pelo `statement_timeout` (57014, F45 —
 * a completa de 06–07/11, com o Postgres parado 9 a 45 s): o Postgres desfez
 * a transação inteira, nada ficou gravado, e repetir não grava duas vezes.
 * Era o INSERT da rede, da oportunidade, do agendamento do próprio teste.
 */
export async function fetchQueInsiste(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const metodo = (init?.method ?? 'GET').toUpperCase()
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    // Só o corpo que dá para mandar de novo (o supabase-js manda texto).
    const repetivel = init?.body === undefined || init?.body === null || typeof init.body === 'string'
    for (let tentativa = 1; ; tentativa++) {
      const r = await fetch(entrada, init)
      if (!repetivel || tentativa >= 3 || r.status < 500 || !(await foiCanceladaPeloTempo(r))) return r
      console.warn(`[e2e] ${metodo} cancelado pelo statement_timeout (57014) — nada gravado, tentando de novo`)
      await new Promise(ok => setTimeout(ok, 3_000 * tentativa))
    }
  }
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fetch(entrada, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) })
    } catch (e) {
      if (tentativa >= 3 || init?.signal?.aborted) throw e
      await new Promise(r => setTimeout(r, 1_000 * tentativa))
    }
  }
}

async function foiCanceladaPeloTempo(r: Response): Promise<boolean> {
  try {
    const corpo = await r.clone().json() as { code?: string }
    return corpo?.code === '57014'
  } catch {
    return false
  }
}

/**
 * O login de teste no Auth, com a mesma paciência (F45). Com o banco parado, o
 * Auth responde 5xx ou um erro sem mensagem ("context deadline exceeded") —
 * `ficha-lista-de-clientes` morreu em "criar o login: {}". Repete; se a
 * repetição diz "já existe", a primeira tentativa chegou a criar, e vale o
 * login com este e-mail. "Já existe" de PRIMEIRA é erro do teste (o e-mail é
 * de outro), e lança.
 */
export async function criarLoginDeTeste(db: SupabaseClient, email: string, oQue: string): Promise<string> {
  let falhou = false
  for (const espera of [0, 5, 15, 30]) {
    if (espera) await new Promise(ok => setTimeout(ok, espera * 1000))
    const r = await db.auth.admin.createUser({ email, email_confirm: true })
    if (r.data.user) return r.data.user.id
    const msg = r.error?.message ?? ''
    if (/already|registered|exists/i.test(msg)) {
      const id = falhou ? await loginPeloEmail(db, email) : null
      if (id) return id
      throw new Error(`${oQue}: ${msg}`)
    }
    falhou = true
    console.warn(`[e2e] ${oQue}: ${msg || JSON.stringify(r.error) || 'sem usuário'} — tentando de novo`)
  }
  throw new Error(`${oQue}: o Auth não respondeu`)
}

/**
 * A senha de teste no login, com a mesma paciência (F46 — a completa de 07/11,
 * com o banco parado ~40 s às 22:19Z: o PUT do Auth respondeu 504 depois de
 * 36 s, e `portal-cliente-varias-clinicas` morreu em "pôr a senha de teste:
 * {}"). Pôr a MESMA senha de novo não muda nada: repete o Auth que caiu (5xx,
 * erro sem mensagem, o fetch que não voltou). O erro com mensagem (o login não
 * existe) é o Auth falando, e volta na hora.
 */
export async function porSenhaDeTeste(db: SupabaseClient, authId: string, senha: string): Promise<void> {
  for (const espera of [0, 5, 15, 30]) {
    if (espera) await new Promise(ok => setTimeout(ok, espera * 1000))
    const { error } = await db.auth.admin.updateUserById(authId, { password: senha })
    if (!error) return
    const e = error as { message?: string; status?: number; name?: string }
    const caiu = !e.message || (e.status ?? 0) >= 500 || e.name === 'AuthRetryableFetchError'
    if (!caiu) throw new Error(`pôr a senha de teste: ${e.message}`)
    console.warn(`[e2e] pôr a senha de teste: ${e.message || JSON.stringify(error)}${e.status ? ` (HTTP ${e.status})` : ''} — tentando de novo`)
  }
  throw new Error('pôr a senha de teste: o Auth não respondeu')
}

/** O id do login com este e-mail (o Auth não busca por e-mail: pagina). */
async function loginPeloEmail(db: SupabaseClient, email: string): Promise<string | null> {
  for (let pagina = 1; pagina < 50; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) return null
    const achado = data.users.find(u => u.email === email)
    if (achado) return achado.id
    if (data.users.length < 200) return null
  }
  return null
}

/** Prefixo de tudo que a suíte cria — e o único critério da limpeza. */
export const PREFIXO = '[e2e]'

/** Nome com carimbo de tempo, para duas rodadas não colidirem. */
export function nomeDeTeste(o_que: string): string {
  return `${PREFIXO} ${o_que} ${Date.now().toString(36)}`
}

/**
 * A rede de verdade do banco de dev.
 *
 * Era `limit(1)` sem critério — funcionava porque só existia uma rede. Desde
 * que os testes de isolamento criam uma SEGUNDA (`apoio/outra-rede.ts`), a
 * resposta passou a poder ser a de teste. Nunca uma rede `[e2e]`, e a mais
 * antiga entre as outras.
 */
export async function tenantId(): Promise<string> {
  const { data, error } = await banco().from('tenants').select('id')
    .not('name', 'like', `${PREFIXO}%`)
    .order('created_at', { ascending: true })
    .limit(1).single()
  // Com o banco fora do ar, o erro é o JSON do Cloudflare, sem `message`
  // (na completa de 04/11 saía "Não achei o tenant: undefined").
  if (error) throw new Error(`Não achei o tenant: ${error.message ?? JSON.stringify(error).slice(0, 300)}`)
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
    .eq('tenant_id', await tenantId())
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
  // Só da rede de verdade: sem o filtro, a unidade `[e2e]` da segunda rede de
  // teste vinha primeiro na ordem alfabética (o `[` vem antes das letras).
  //
  // E só unidades REAIS: specs que criam uma unidade `[e2e]` na rede real
  // (permissões, indicadores, campanha) a apagam no fim — com a regressão em
  // paralelo, a `[0]` daqui podia ser uma delas, que sumia no meio do teste do
  // vizinho (chave estrangeira no insert, "intermitente" que parecia tempo).
  const { data, error } = await banco()
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', await tenantId())
    .eq('is_active', true)
    .not('name', 'like', `${PREFIXO}%`)
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
    // Pessoa com oportunidade fica: `leads.contato_id` é `on delete restrict`,
    // e apagar o card é decisão do teste que o criou.
    const { count: comCard } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('contato_id', contatoId)
    if ((count ?? 0) === 0 && (comCard ?? 0) === 0) {
      await db.from('contacts').delete().eq('id', contatoId)
    }
  }
}
