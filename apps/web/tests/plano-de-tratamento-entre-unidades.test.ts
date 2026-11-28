import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { situacaoComercialDoPlano } from '@/lib/plano-de-tratamento/situacao'
import { totalDoPlanoNaLista } from '@/lib/plano-de-tratamento/desconto-combinado'
import { sessaoFeitaDoPlano, contarSessoesDosPlanos } from '@/lib/plano-de-tratamento/sessoes-feitas'
import { rotaDoAgendarDaSessaoNoApp } from '@/lib/plano-de-tratamento/sessao-no-app'
import { creditosOferecidosNaUnidade } from '@/lib/creditos/oferecidos-na-unidade'
import type { CreditoParaAgendar } from '@/lib/creditos/credito'

const raiz = path.join(__dirname, '..')
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')
const MIGRATIONS = path.join(raiz, '..', '..', 'supabase', 'migrations')

/** O corpo de uma função exportada (até o próximo `export` do arquivo). */
function corpo(texto: string, nome: string): string {
  const i = texto.indexOf(`export async function ${nome}(`)
  expect(i, nome).toBeGreaterThanOrEqual(0)
  const fim = texto.indexOf('\nexport ', i + 10)
  return texto.slice(i, fim < 0 ? undefined : fim)
}

/**
 * O plano de tratamento numa rede de duas unidades.
 *
 * PL-01 (o plano é do Atendimento, "vê todos os planos das unidades ao
 * alcance") e CLAUDE.md §11 ("a abrangência se confere"): a ficha listava os
 * planos de TODAS as unidades a quem só tem uma. PL-20: "Concluído" é uma
 * situação da lista, e o plano com todas as sessões feitas nunca chegava lá.
 * DP-08: quem cancela o plano é quem alcança a unidade DELE. PL-19/H5: a
 * sessão do plano se agenda pelo app, e o "Agendar" abre na unidade do plano.
 * Princípio 3: o cancelado antes do aceite vale o que foi proposto (com o
 * desconto). Princípio 7: o "Incluído" do agendar oferece só o que a unidade
 * do agendamento faz.
 */

describe('D2: a ficha lista só os planos das unidades ao alcance (PL-01, §11)', () => {
  const t = ler('actions/treatment-plans.ts')
  it('getPlanosDoCliente lê a unidade do plano e confere o alcance de quem vê', () => {
    const f = corpo(t, 'getPlanosDoCliente')
    expect(f).toMatch(/select\(`[^`]*\bbranch_id\b/)
    expect(f).toMatch(/alcancaUnidade\(ctx, p\.branch_id as string\)/)
  })
  it('a página do plano pelo id confere o alcance (planoDoTenant)', () => {
    expect(corpo(t, 'getCabecalhoDoPlano')).toMatch(/planoDoTenant\(admin, planId, ctx\)/)
  })
})

describe('D4: o plano com todas as sessões feitas é "Concluído" (PL-20)', () => {
  const base = { recebido: true, documentosAbertos: 0, contratoFalta: false }
  it('aceito, recebido, todas feitas: Concluído', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', sessoes: { total: 1, feitas: 1 } })).toBe('CONCLUIDO')
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', sessoes: { total: 2, feitas: 2 } })).toBe('CONCLUIDO')
  })
  it('falta sessão: segue em andamento', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', sessoes: { total: 2, feitas: 1 } })).toBe('EM_ANDAMENTO')
  })
  it('feitas e sem dinheiro: o que falta é pagar (aceitar → assinar → pagar → agendar)', () => {
    expect(situacaoComercialDoPlano({ ...base, recebido: false, status: 'ACCEPTED', sessoes: { total: 1, feitas: 1 } })).toBe('FALTA_PAGAR')
  })
  it('plano sem sessão não se conclui', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', sessoes: { total: 0, feitas: 0 } })).toBe('EM_ANDAMENTO')
  })
  it('a sessão feita é a de metrics_financeiro_do_plano: concluída, ou iniciada e desistida (AT-21)', () => {
    expect(sessaoFeitaDoPlano({ status: 'COMPLETED', started_at: null })).toBe(true)
    expect(sessaoFeitaDoPlano({ status: 'CANCELLED', started_at: '2026-11-28T12:00:00Z' })).toBe(true)
    expect(sessaoFeitaDoPlano({ status: 'CANCELLED', started_at: null })).toBe(false)
    expect(sessaoFeitaDoPlano({ status: 'SCHEDULED', started_at: null })).toBe(false)
    expect(sessaoFeitaDoPlano(null)).toBe(false)
    const sql = readFileSync(path.join(MIGRATIONS, '20261123900004_desistencia_nao_devolve_a_sessao.sql'), 'utf8').replace(/\s+/g, ' ')
    expect(sql).toContain("(a.status = 'COMPLETED' or (a.status = 'CANCELLED' and a.started_at is not null))")
  })
  it('conta as sessões de cada plano', () => {
    const m = contarSessoesDosPlanos(['p1', 'p2'], [
      { plan_id: 'p1', appointments: { status: 'COMPLETED', started_at: 'x' } },
      { plan_id: 'p1', appointments: null },
      { plan_id: 'p2', appointments: { status: 'COMPLETED', started_at: 'x' } },
    ])
    expect(m.get('p1')).toEqual({ total: 2, feitas: 1 })
    expect(m.get('p2')).toEqual({ total: 1, feitas: 1 })
  })
  it('a lista de Tratamentos e a página do plano contam as sessões; o filtro "Concluído" lê os aceitos', () => {
    const t = ler('actions/treatment-plans.ts')
    expect(corpo(t, 'listarPlanejamentos')).toMatch(/situacaoPedida === 'CONCLUIDO' \? \['ACCEPTED', 'COMPLETED'\]/)
    expect(corpo(t, 'getPassosDoPlano')).toMatch(/sessoes: \{ total: financeiro\.sessoes\.total, feitas: financeiro\.sessoes\.feitas \}/)
    const a = ler('lib/plano-de-tratamento/andamento-do-plano.ts')
    expect(a).toMatch(/getSessoesDosPlanos\(/)
    expect(a).toMatch(/sessoes: a \? sessoes\.get\(p\.id\)/)
  })
})

describe('D5: quem cancela o plano é quem alcança a unidade DELE (DP-08)', () => {
  it('as duas fichas pedem a lista pela unidade do cartão, não pela do portal', () => {
    for (const pagina of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      const p = ler(pagina)
      expect(p, pagina).toMatch(/quemCancelaNosCartoes\(/)
    }
    expect(ler('lib/plano-de-tratamento/quem-cancela-na-ficha.ts')).toMatch(/quemDesfazNoCaixa\(tenantId, unidade\)/)
    const perfil = ler('components/branch/client-profile.tsx')
    expect(perfil).toMatch(/quemCancela\?:\s+string\[\] \| null/)
    expect(perfil).toMatch(/Cancelar o \{pacote\.planId \? 'plano' : 'pacote'\} é de quem tem o Financeiro em Gerenciar: \{quemCancelaDoCartao\(pacote\)!\.join\(', '\)\}\./)
  })
  it('o plano em andamento leva a unidade dele', () => {
    const q = ler('lib/cached-queries.ts')
    expect(q).toMatch(/\.from\('treatment_plans'\)\s*\.select\('id, status, branch_id, treatment_plan_sessions/)
  })
})

describe('D6: o "Agendar" da sessão no app abre na unidade do plano (PL-19, §6)', () => {
  it('a unidade do plano, ativa: o endereço dela; senão, o de onde ela está', () => {
    expect(rotaDoAgendarDaSessaoNoApp('apucarana', { slug: 'arapongas', is_active: true }, 'proc-1'))
      .toBe('/arapongas/cliente/agendamentos/novo?procedimento=proc-1')
    expect(rotaDoAgendarDaSessaoNoApp('apucarana', { slug: 'arapongas', is_active: false }, 'proc-1'))
      .toBe('/apucarana/cliente/agendamentos/novo?procedimento=proc-1')
    expect(rotaDoAgendarDaSessaoNoApp('apucarana', null, 'proc-1'))
      .toBe('/apucarana/cliente/agendamentos/novo?procedimento=proc-1')
  })
  it('a página do plano usa a rota', () => {
    const p = ler('app/[slug]/cliente/planos/[id]/page.tsx')
    expect(p).toMatch(/rotaDoAgendarDaSessaoNoApp\(slug, /)
    expect(p).not.toMatch(/href=\{`\/\$\{slug\}\/cliente\/agendamentos\/novo/)
  })
})

describe('D9: o plano cancelado antes do aceite vale o proposto, com o desconto (princípio 3)', () => {
  const combinado = { tipo: 'VALOR' as const, valor: 30 }
  it('cancelado antes do aceite: o subtotal menos o combinado', () => {
    expect(totalDoPlanoNaLista('CANCELLED', 480, combinado, { antes_do_aceite: true })).toBe(450)
    expect(totalDoPlanoNaLista('REJECTED', 480, combinado, null)).toBe(450)
  })
  it('cancelado depois do aceite: o gravado já é o vendido', () => {
    expect(totalDoPlanoNaLista('CANCELLED', 450, combinado, { modo: 'CREDITO' })).toBe(450)
    expect(totalDoPlanoNaLista('CANCELLED', 450, combinado, null)).toBe(450)
  })
  it('as duas listas mandam o retrato do cancelamento', () => {
    const t = ler('actions/treatment-plans.ts')
    for (const f of ['getPlanosDoCliente', 'listarPlanejamentos']) {
      expect(corpo(t, f), f).toMatch(/\(p as \{ cancelamento\?: unknown \}\)\.cancelamento/)
    }
  })
})

describe('A3: o "Incluído" do agendar oferece só o que a unidade do agendamento faz (princípio 7)', () => {
  const credito = (procedureId: string): CreditoParaAgendar => ({
    tipo: 'PLANO', id: `s-${procedureId}`, procedureId, procedimento: procedureId, origem: 'Plano de tratamento',
    preco: 100, restantes: 1, venceEm: null,
  })
  it('a sessão de procedimento que a unidade não faz não se oferece', () => {
    const lista = creditosOferecidosNaUnidade([credito('limpeza'), credito('micro')], [{ id: 'limpeza' }])
    expect(lista.map(c => c.procedureId)).toEqual(['limpeza'])
  })
  it('sem a lista da unidade (ainda não escolhida), não corta nada', () => {
    expect(creditosOferecidosNaUnidade([credito('micro')], null).map(c => c.procedureId)).toEqual(['micro'])
  })
  it('a janela do agendar usa o filtro', () => {
    const m = ler('components/branch/appointment-modal.tsx')
    expect(m).toMatch(/creditosOferecidosNaUnidade\(/)
  })
})
