import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * A4 da 32ª simulação (AG-18: agendar escreve "agendamento criado" na linha
 * do tempo da oportunidade aberta; princípio 3). No painel da conversa, o
 * "Agendamento criado" só aparecia depois de recarregar a página:
 * - o "Agendar" do próprio painel recarregava o card, mas não a linha do
 *   tempo (`historicoKey` ficava igual);
 * - o agendamento feito em outra tela (a agenda, a ficha, o Copilot) grava só
 *   em `lead_events`, que não marcava sinal nenhum, e o painel não assinava o
 *   sinal da conversa.
 * A sessão só lê SINAIS (o Heitor, 19/11, "vai na 2"): `lead_events` passa a
 * marcar o sinal de cada conversa da pessoa da oportunidade (`c:<id>`), e o
 * painel, ao sinal, recarrega pelo servidor o card e a linha do tempo.
 */

const WEB = resolve(__dirname, '..')
const fonte = (arq: string) => readFileSync(join(WEB, arq), 'utf8')
const ARQ = resolve(WEB, '../../supabase/migrations/20261210100002_linha_do_tempo_marca_o_sinal_da_conversa.sql')
const sql = existsSync(ARQ) ? readFileSync(ARQ, 'utf8').replace(/--[^\n]*/g, '') : ''

describe('o painel da conversa mostra o agendamento sem recarregar', () => {
  it('a migration existe', () => {
    expect(sql, 'supabase/migrations/20261210100002_…').not.toBe('')
  })

  it('a linha do tempo da oportunidade marca o sinal de cada conversa da pessoa', () => {
    expect(sql).toMatch(/create or replace function private\.sinal_da_linha_do_tempo\(\)/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/insert into public\.sinais \(tenant_id, topico, chave, mudou_em\)/)
    expect(sql).toMatch(/'conversa'/)
    expect(sql).toMatch(/'c:' \|\| /)
    expect(sql).toMatch(/contato_id/)
    expect(sql).toMatch(/create trigger trg_sinal_lead_events_conversa\s+after insert on public\.lead_events/)
    expect(sql).toMatch(/revoke all on function private\.sinal_da_linha_do_tempo\(\) from public, anon, authenticated/)
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('o painel assina o sinal da conversa e, nele, recarrega o card e a linha do tempo', () => {
    const painel = fonte('components/admin/inbox-lead-panel.tsx')
    expect(painel).toMatch(/useSinalDaConversa\(conversation\.id, /)
    const ao = painel.slice(painel.indexOf('const aoSinalDoPainel'), painel.indexOf('useSinalDaConversa(conversation.id, '))
    expect(ao).toMatch(/recarregar\(\)/)
    expect(ao).toMatch(/setHistoricoKey\(k => k \+ 1\)/)
  })

  it('o "Agendar" do painel também atualiza a linha do tempo', () => {
    const painel = fonte('components/admin/inbox-lead-panel.tsx')
    expect(painel).toMatch(/onScheduled=\{\(\) => \{ setScheduling\(null\); void recarregar\(\); setHistoricoKey\(k => k \+ 1\); onLeadChanged\?\.\(\) \}\}/)
  })
})
