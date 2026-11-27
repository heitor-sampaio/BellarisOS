import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * A6 e A7 da 38ª simulação: a prévia da lista mostrava o texto da resposta NÃO
 * enviada como se tivesse saído, e ela punha "Última interação há agora".
 * crm-inbox:IN-18 ("a resposta que não saiu não é resposta"), princípio 3. A
 * prévia, a hora da última mensagem (a ordem da fila) e a "Última interação"
 * contam só o que saiu (aceito pelo provedor) ou chegou.
 *
 * No banco: `on_new_message` (o INSERT) não mexe na prévia com a saída que
 * ainda não foi aceita, e `on_mensagem_aceita` (o UPDATE da situação) a põe
 * quando ela passa a aceita. Na tela: nada de prévia otimista antes da
 * resposta do servidor.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')
const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations')
const ARQUIVO = '20261217100001_inbox_previa_so_o_que_saiu.sql'
const sql = fs.existsSync(path.join(MIGRATIONS, ARQUIVO)) ? fs.readFileSync(path.join(MIGRATIONS, ARQUIVO), 'utf8') : ''
const codigo = sql.replace(/--[^\n]*/g, '')

describe('A6/A7: a prévia da conversa conta o que saiu ou chegou', () => {
  const conversa = { id: 'c1', last_message: 'Oi, tudo bem?', last_message_at: '2026-11-27T10:00:00.000Z' }

  it('a mensagem aceita pelo provedor vira a prévia', async () => {
    const { comPreviaDaMensagem } = await import('@/lib/inbox/previa')
    const msg = { conversation_id: 'c1', content: 'Temos sim!', created_at: '2026-11-27T10:05:00.000Z', direction: 'outbound', status: 'sent' }
    expect(comPreviaDaMensagem(conversa, msg)).toEqual({ ...conversa, last_message: 'Temos sim!', last_message_at: msg.created_at })
  })

  it('a "Não enviada" e a que ainda está saindo não mexem na prévia nem na hora', async () => {
    const { comPreviaDaMensagem } = await import('@/lib/inbox/previa')
    for (const status of ['failed', 'sending']) {
      const msg = { conversation_id: 'c1', content: 'Temos sim!', created_at: '2026-11-27T10:05:00.000Z', direction: 'outbound', status }
      expect(comPreviaDaMensagem(conversa, msg)).toBe(conversa)
    }
  })

  it('a que chegou da cliente vira a prévia', async () => {
    const { comPreviaDaMensagem } = await import('@/lib/inbox/previa')
    const msg = { conversation_id: 'c1', content: 'Obrigada', created_at: '2026-11-27T10:06:00.000Z', direction: 'inbound', status: 'delivered' }
    expect(comPreviaDaMensagem(conversa, msg).last_message).toBe('Obrigada')
  })

  it('a mensagem de outra conversa não mexe nesta', async () => {
    const { comPreviaDaMensagem } = await import('@/lib/inbox/previa')
    const msg = { conversation_id: 'c2', content: 'x', created_at: '2026-11-27T10:06:00.000Z', direction: 'inbound', status: 'delivered' }
    expect(comPreviaDaMensagem(conversa, msg)).toBe(conversa)
  })
})

describe('A6/A7: a tela não põe a prévia antes de a mensagem sair', () => {
  const tela = fonte('components/admin/crm-inbox.tsx')

  it('o envio de texto, de anexo e de modelo passam pela mesma régua', () => {
    expect(tela).not.toMatch(/\{ \.\.\.c, last_message: text, last_message_at: optimistic\.created_at \}/)
    expect(tela).not.toMatch(/last_message: res\.message!\.content/)
    expect(tela).not.toMatch(/last_message: msg\.content/)
    expect((tela.match(/comPreviaDaMensagem\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('A6/A7: no banco, só o que saiu ou chegou mexe na prévia', () => {
  it('a migration existe, na faixa do Inbox', () => {
    expect(sql, `supabase/migrations/${ARQUIVO}`).not.toBe('')
  })

  it('o INSERT troca os trechos da prévia no corpo VIVO de on_new_message, com a conferência', () => {
    expect(codigo).toMatch(/create or replace function pg_temp\.trocar_no_corpo/)
    expect(codigo).toMatch(/'public\.on_new_message\(\)'::regprocedure/)
    expect(codigo).toMatch(/raise exception/)
    expect(codigo).toMatch(/new\.direction = 'outbound' and new\.status not in \('sent', 'delivered', 'read'\) then c\.last_message\b/)
    expect(codigo).toMatch(/then coalesce\(c\.last_message_at, new\.created_at\)/)
  })

  it('o UPDATE para aceita põe a prévia (sem passar por cima de uma mensagem mais nova)', () => {
    expect(codigo).toMatch(/create or replace function public\.on_mensagem_aceita\(\)/)
    expect(codigo).toMatch(/last_message\s*=\s*case when c\.last_message_at is null or new\.created_at >= c\.last_message_at then left\(new\.content, 80\)/)
    expect(codigo).toMatch(/revoke all on function public\.on_mensagem_aceita\(\) from public, anon, authenticated/)
    expect(codigo).toMatch(/grant execute on function public\.on_mensagem_aceita\(\) to service_role/)
  })

  it('os dados de antes: a prévia que era de uma não enviada volta à última que saiu ou chegou', () => {
    expect(codigo).toMatch(/update public\.conversations[\s\S]*last_message\s*=/)
  })

  it('termina recarregando o esquema', () => {
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
