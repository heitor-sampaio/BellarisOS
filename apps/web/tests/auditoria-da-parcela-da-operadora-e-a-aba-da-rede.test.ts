import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { motivoDaAbaFechada, ABAS_DA_UNIDADE } from '@/lib/configuracoes/abas'

/**
 * A21 (AD-04: "Entra na Auditoria toda gravação que muda o que alguém FAZ no
 * sistema"): marcar a parcela da operadora como recebida (a antecipação) e
 * desfazer não apareciam na Auditoria.
 * A22: a aba da rede toda, aberta por quem tem uma unidade, dizia "quem muda é
 * a Admin da rede" sem o nome — a de Tags (A-CONF2 da 25ª) diz "Quem muda: <nome>.".
 */

const pasta = join(__dirname, '../../../supabase/migrations')

describe('A21: a parcela da operadora recebida (ou desfeita) entra na Auditoria', () => {
  const nome = readdirSync(pasta).find(f => /^202612104\d{5}_auditoria_da_antecipacao_da_parcela\.sql$/.test(f))
  const sql = nome ? readFileSync(join(pasta, nome), 'utf8').replace(/\r/g, '') : ''
  it('a migration existe, na faixa da área', () => {
    expect(nome, 'supabase/migrations/202612104…_auditoria_da_antecipacao_da_parcela.sql').toBeTruthy()
  })
  it('só a mudança (a criação nasce com o pagamento, que já entra), com a parcela, o dinheiro e as datas', () => {
    expect(sql).toMatch(/create trigger auditoria_upd after update on public\.recebiveis_do_cartao\s+referencing old table as velhas new table as novas\s+for each statement execute function private\.auditar\('normal', 'parcela_numero,parcela_total',/)
    expect(sql).toContain("'valor,liquido,vencimento,recebida_em,cancelada_em,estornada_em', 'financial_transactions:transaction_id', '')")
    expect(sql).not.toMatch(/after insert on public\.recebiveis_do_cartao/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})

describe('A22: a aba da rede toda diz quem muda, pelo nome', () => {
  const base = {
    noPortal: ABAS_DA_UNIDADE, gerencia: () => true, noPlano: () => true, unidadeFixa: true,
    nomeDoModulo: (m: string) => m, abriu: 'Unidade',
  } as Parameters<typeof motivoDaAbaFechada>[1]
  it('com o nome de quem muda', () => {
    expect(motivoDaAbaFechada('comissoes', { ...base, souAdmin: false, quemMuda: ['Clotilde'] }))
      .toBe('A aba Comissões e taxas é da rede toda: quem muda é a Admin da rede. Quem muda: Clotilde. Você está na aba Unidade.')
    expect(motivoDaAbaFechada('comissoes', { ...base, souAdmin: false, quemMuda: ['Ana', 'Bia', 'Cris'] }))
      .toContain('Quem muda: Ana, Bia e Cris.')
  })
  it('sem os nomes, a frase de antes', () => {
    expect(motivoDaAbaFechada('comissoes', base))
      .toBe('A aba Comissões e taxas é da rede toda: quem muda é a Admin da rede. Você está na aba Unidade.')
  })
})
