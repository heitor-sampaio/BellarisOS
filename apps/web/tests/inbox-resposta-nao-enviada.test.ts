import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * A resposta que NÃO saiu não conta como resposta (D2 da 32ª simulação; a
 * Decisão A da rodada — decisão do Claude, 26/11, pelo princípio 3: a fila não
 * pode dizer que respondeu quem não recebeu nada). O gatilho da mensagem
 * (`on_new_message`) zerava `awaiting_since` e gravava `first_response_seconds`
 * em todo `outbound`, e o envio do inbox grava a linha como 'sending' antes de
 * falar com o provedor: a que falhava ("Não enviada") tirava a conversa de
 * "aguardando" e virava a 1ª resposta.
 *
 * A régua: só a mensagem ACEITA pelo provedor ('sent', 'delivered', 'read')
 * conta — no INSERT, se já nasce aceita (o eco do aplicativo); no UPDATE da
 * situação, quando passa a aceita (o envio que dá certo, inclusive o que
 * falhou antes e foi aceito depois). Regra em docs/regras/crm-inbox.md.
 */

const MIGRATIONS = resolve(__dirname, '../../../supabase/migrations')
const ARQUIVO = '20261210100001_resposta_nao_enviada_nao_conta.sql'
const sql = existsSync(join(MIGRATIONS, ARQUIVO)) ? readFileSync(join(MIGRATIONS, ARQUIVO), 'utf8') : ''
/** O SQL sem os comentários (o texto explica o que mudou e cita o velho). */
const codigo = sql.replace(/--[^\n]*/g, '')
const ACEITAS = /in \('sent', 'delivered', 'read'\)/

describe('a resposta não enviada não tira de "aguardando" nem conta como 1ª resposta', () => {
  it('a migration existe, na faixa do Inbox e CRM', () => {
    expect(sql, `supabase/migrations/${ARQUIVO}`).not.toBe('')
  })

  it('o INSERT troca trechos do corpo VIVO de on_new_message, com a conferência da contagem', () => {
    expect(codigo).toMatch(/create or replace function pg_temp\.trocar_no_corpo/)
    expect(codigo).toMatch(/'public\.on_new_message\(\)'::regprocedure/)
    expect(codigo).toMatch(/raise exception/)
  })

  it('no INSERT, o outbound que não nasceu aceito mantém o "aguardando" e não mede a 1ª resposta', () => {
    // A primeira troca põe, antes do "else null", o caso do outbound não aceito.
    expect(codigo).toMatch(/when new\.status not in \('sent', 'delivered', 'read'\) then c\.awaiting_since/)
    // A segunda exige a mensagem aceita para gravar a 1ª resposta.
    expect(codigo).toMatch(/c\.awaiting_since is not null and new\.status in \('sent', 'delivered', 'read'\)/)
  })

  it('no UPDATE, a mensagem que PASSA a aceita tira de "aguardando" e mede a 1ª resposta', () => {
    expect(codigo).toMatch(/create or replace function public\.on_mensagem_aceita\(\)/)
    expect(codigo).toMatch(/new\.direction <> 'outbound' or new\.importada/)
    expect(codigo).toMatch(/old\.status in \('sent', 'delivered', 'read'\)/)
    expect(codigo).toMatch(/new\.status not in \('sent', 'delivered', 'read'\)/)
    expect(codigo).toMatch(/awaiting_since\s*=\s*null/)
    expect(codigo).toMatch(/first_response_seconds\s*=\s*case/)
    expect(codigo).toMatch(
      /create trigger trg_mensagem_aceita\s+after update of status on public\.messages\s+for each row\s+when \(old\.status is distinct from new\.status\)\s+execute function public\.on_mensagem_aceita\(\)/,
    )
  })

  it('a função nova não fica aberta: revoke da sessão, grant ao service_role', () => {
    expect(codigo).toMatch(/revoke all on function public\.on_mensagem_aceita\(\) from public, anon, authenticated/)
    expect(codigo).toMatch(/grant execute on function public\.on_mensagem_aceita\(\) to service_role/)
  })

  it('os dados de antes: a conversa que a falhada tirou de "aguardando" volta, e a 1ª resposta é a da aceita', () => {
    expect(codigo).toMatch(/update public\.conversations[\s\S]*awaiting_since\s*=/)
    expect(codigo).toMatch(/update public\.conversations[\s\S]*first_response_seconds\s*=/)
    expect(codigo).toMatch(ACEITAS)
  })

  it('termina recarregando o esquema', () => {
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
