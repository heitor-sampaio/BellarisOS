import { createClient } from '@supabase/supabase-js'
import { banco } from './banco'

/**
 * O CONTROLE dos testes de RLS desde 19/11 (o Heitor, "vai na 2": a sessão só
 * lê SINAIS — CLAUDE.md §4). Até ali o controle era a sessão LER uma linha da
 * própria rede, para o "zero" da outra rede não sair de um token que não vale
 * nada. Agora a sessão não lê tabela nenhuma: o que ela ainda lê é o sinal.
 *
 * `leOSinalDaRede`: o serviço marca o sinal da EQUIPE da rede (chave vazia) e a
 * sessão o lê — o token vale e alcança a própria rede.
 * `leOSinalDela`: o serviço marca o sinal de UMA pessoa (a chave é o login
 * dela: os avisos) e a sessão o lê — vale para a cliente final, que não lê o
 * sinal da equipe.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function comToken(accessToken: string) {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/** O login (auth.uid) dono do token. */
export function loginDoToken(accessToken: string): string {
  const corpo = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub: string }
  return corpo.sub
}

async function marcarELer(accessToken: string, tenantId: string, topico: string, chave: string): Promise<number> {
  const { error } = await banco().from('sinais')
    .upsert({ tenant_id: tenantId, topico, chave, mudou_em: new Date().toISOString() }, { onConflict: 'tenant_id,topico,chave' })
  if (error) throw new Error(`marcar o sinal de controle: ${error.message}`)
  const { data, error: e } = await comToken(accessToken).from('sinais').select('topico')
    .eq('tenant_id', tenantId).eq('topico', topico).eq('chave', chave)
  if (e) throw new Error(`ler o sinal de controle: ${e.message}`)
  return (data ?? []).length
}

/** Quantos sinais da equipe da rede a sessão lê (1 = o token vale e alcança a rede). */
export function leOSinalDaRede(accessToken: string, tenantId: string): Promise<number> {
  return marcarELer(accessToken, tenantId, 'unidades', '')
}

/** Quantos sinais DELA a sessão lê (1 = o token da pessoa vale). */
export function leOSinalDela(accessToken: string, tenantId: string): Promise<number> {
  return marcarELer(accessToken, tenantId, 'avisos', loginDoToken(accessToken))
}
