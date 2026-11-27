import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * D6 da 38ª simulação: a faixa "30 aguardando resposta" contava só as
 * conversas carregadas (o banco tinha 44). crm-inbox:IN-10 ("filtro, busca e
 * as opções dos menus alcançam a rede inteira, não só as conversas
 * carregadas"), princípio 3. A contagem (e a cor da mais antiga) vem do
 * servidor, com o mesmo alcance e os mesmos filtros da lista, sem o corte da
 * página — a mesma conta de `inbox_pagina`, que passa a ler as conversas de
 * `private.inbox_filtradas` junto com a contagem.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')
const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations')
const ARQUIVO = '20261217100002_inbox_aguardando_da_rede.sql'
const sql = fs.existsSync(path.join(MIGRATIONS, ARQUIVO)) ? fs.readFileSync(path.join(MIGRATIONS, ARQUIVO), 'utf8') : ''
const codigo = sql.replace(/--[^\n]*/g, '')

describe('D6: no banco, a contagem e a página dividem o mesmo filtro', () => {
  it('a migration existe, na faixa do Inbox', () => {
    expect(sql, `supabase/migrations/${ARQUIVO}`).not.toBe('')
  })

  it('o filtro mora num lugar só, sem corte nem cursor', () => {
    expect(codigo).toMatch(/create or replace function private\.inbox_filtradas\(/)
    const corpo = codigo.slice(codigo.indexOf('private.inbox_filtradas('), codigo.indexOf('create or replace function public.inbox_pagina('))
    expect(corpo).not.toMatch(/\blimit\b/)
    expect(corpo).toMatch(/c\.whatsapp_number_id = any\(p_caixas\)/)
  })

  it('a página lê dele, com o cursor e o corte de sempre', () => {
    const corpo = codigo.slice(codigo.indexOf('create or replace function public.inbox_pagina('))
    expect(corpo).toMatch(/from private\.inbox_filtradas\(p_tenant, p_dono, p_modo, p_caixas, p_filtros, p_busca\)/)
    expect(corpo).toMatch(/\(p_antes_em is null or \(c\.last_message_at, c\.id\) < \(p_antes_em, p_antes_id\)\)/)
    expect(corpo).toMatch(/limit greatest\(1, least\(coalesce\(p_limite, 30\), 500\)\)/)
  })

  it('a contagem: as aguardando de todas as páginas, e desde quando a mais antiga espera', () => {
    expect(codigo).toMatch(/create or replace function public\.inbox_aguardando\(/)
    expect(codigo).toMatch(/count\(\*\)/)
    expect(codigo).toMatch(/min\(c\.awaiting_since\)/)
    expect(codigo).toMatch(/where c\.awaiting_since is not null/)
  })

  it('as funções não ficam abertas à sessão', () => {
    expect(codigo).toMatch(/revoke all on function public\.inbox_aguardando\([^)]*\) from public, anon, authenticated/)
    expect(codigo).toMatch(/grant execute on function public\.inbox_aguardando\([^)]*\) to service_role/)
    expect(codigo).toMatch(/revoke all on function private\.inbox_filtradas\([^)]*\) from public, anon, authenticated/)
  })

  it('termina recarregando o esquema', () => {
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

describe('D6: a página do inbox traz a contagem, e a faixa a usa', () => {
  it('a primeira página (sem cursor) traz o aguardando, pelo alcance de quem pede', () => {
    const pagina = fonte('lib/inbox/pagina.ts')
    expect(pagina).toMatch(/export async function aguardandoDoInbox\(/)
    expect(pagina).toMatch(/rpc\('inbox_aguardando'/)
    expect(pagina).toMatch(/caixasDoAlcance\(admin, ctx\)/)
    const action = fonte('actions/inbox.ts')
    expect(action).toMatch(/aguardando:\s+AguardandoDoInbox \| null/)
    expect(action).toMatch(/!opcoes\.depois\s*\?\s*aguardandoDoInbox\(admin, ctx,/)
  })

  it('a faixa conta pelo servidor, não pelas carregadas', () => {
    const tela = fonte('components/admin/crm-inbox.tsx')
    expect(tela).not.toMatch(/awaitingCount = awaitingConvs\.length/)
    expect(tela).toMatch(/const awaitingCount = aguardando\?\.total \?\? 0/)
    expect(tela).toMatch(/aguardando\?\.desde/)
  })
})
