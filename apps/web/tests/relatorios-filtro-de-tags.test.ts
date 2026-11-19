import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  ABAS_COM_FILTRO_DE_TAGS, abaTemFiltroDeTags, tagsDaUrl, tagsNaUrl, paramDeTags, tagsDaAba,
} from '@/lib/metrics/tags-do-relatorio'

/**
 * A regra das Tags nos Relatórios (CLAUDE.md §1, o Heitor, 13/11: "onde tiver
 * for passível de filtro, um dos filtros que ela pode usar são as tags … além
 * dos filtros que a gente já apresenta ali fixos em cada página"). Nenhuma aba
 * tinha o filtro, e nenhuma `metrics_*` aceitava tag.
 *
 * Decisões do Claude (princípios 3 e 7): a tag filtra PESSOAS — a linha entra
 * se a cliente dela (`clients.tags`; na aba Oportunidades, a pessoa da
 * oportunidade — "a tag é da pessoa", o Heitor, 18/11) tem TODAS as tags marcadas (E, sem distinguir a caixa, como a
 * lista de Clientes); a linha sem cliente sai quando há tag. O filtro aparece
 * nas abas de pessoas (Vendas, Agenda, Clientes, Procedimentos, Profissionais
 * e Oportunidades); nas sem pessoa (Estoque) e nas que misturam dinheiro sem
 * pessoa (Visão geral, Financeiro: despesa, DRE e lucro), não — o número com
 * despesa "filtrado por tag" seria um número que não é de ninguém.
 */

const raiz = path.join(__dirname, '..')
const migrations = path.join(raiz, '..', '..', 'supabase', 'migrations')
const ler = (...p: string[]) => readFileSync(path.join(raiz, ...p), 'utf8')

describe('as abas com o filtro de tags', () => {
  it('são as de pessoas, e só elas', () => {
    expect([...ABAS_COM_FILTRO_DE_TAGS].sort()).toEqual(['agenda', 'clientes', 'comercial', 'procedimentos', 'profissionais', 'vendas'])
    for (const aba of ['overview', 'financeiro', 'estoque']) expect(abaTemFiltroDeTags(aba)).toBe(false)
    for (const aba of ABAS_COM_FILTRO_DE_TAGS) expect(abaTemFiltroDeTags(aba)).toBe(true)
  })
  it('numa aba sem o filtro, a tag da URL não chega à conta', () => {
    expect(tagsDaAba('financeiro', ['VIP'])).toEqual([])
    expect(tagsDaAba('overview', ['VIP'])).toEqual([])
    expect(tagsDaAba('vendas', ['VIP'])).toEqual(['VIP'])
  })
})

describe('?tags= na URL', () => {
  it('lê a lista separada por vírgula, sem vazio e sem repetir (a caixa não distingue)', () => {
    expect(tagsDaUrl(undefined)).toEqual([])
    expect(tagsDaUrl('')).toEqual([])
    expect(tagsDaUrl('VIP, vip ,Noivas,,')).toEqual(['VIP', 'Noivas'])
  })
  it('escreve a lista de volta, e nada quando não há tag', () => {
    expect(tagsNaUrl(['VIP', 'Noivas'])).toBe('VIP,Noivas')
    expect(tagsNaUrl([])).toBeNull()
  })
  it('o parâmetro da função só vai com tag (sem tag, a chamada é a de antes)', () => {
    expect(paramDeTags([])).toEqual({})
    expect(paramDeTags(null)).toEqual({})
    expect(paramDeTags(['VIP'])).toEqual({ p_tags: ['VIP'] })
  })
})

describe('o filtro vai na consulta (CLAUDE.md §14: nunca filtrar um lote já lido)', () => {
  const arquivo = readdirSync(migrations).find(f => /^2026112510\d{4}_relatorios_filtro_de_tags\.sql$/.test(f))
  const sql = arquivo ? readFileSync(path.join(migrations, arquivo), 'utf8') : ''

  it('a migration existe, na faixa dos Relatórios, e recarrega o esquema', () => {
    expect(arquivo, 'supabase/migrations/2026112510xxxx_relatorios_filtro_de_tags.sql').toBeTruthy()
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('a régua é UMA: todas as tags, sem distinguir a caixa', () => {
    expect(sql).toMatch(/create or replace function public\.metrics_tem_as_tags\(p_da_pessoa text\[\], p_tags text\[\]\)/i)
    expect(sql).toMatch(/create or replace function public\.metrics_cliente_tem_as_tags\(p_client uuid, p_tags text\[\]\)/i)
    expect(sql).toMatch(/lower\(btrim\(x\.t\)\) = lower\(btrim\(q\.t\)\)/)
  })

  it('na aba Comercial, as tags são da PESSOA da oportunidade, num lugar só (o Heitor, 18/11: "a tag é da pessoa")', () => {
    // A oportunidade não tem tag própria: vale a ficha da cliente ligada e,
    // sem cliente, o contato — até a unificação das colunas, que troca SÓ esta função.
    expect(sql).toMatch(/create or replace function public\.metrics_tags_da_pessoa_da_oportunidade\(p_lead uuid\)/i)
    expect(sql).toMatch(/l\.client_id/)
    expect(sql).toMatch(/l\.contato_id/)
    expect(sql).toMatch(/public\.contacts/)
    expect(sql).toMatch(/create or replace function public\.metrics_oportunidade_tem_as_tags\(p_lead uuid, p_tags text\[\]\)/i)
    expect(sql, 'nenhuma conta lê leads.tags').not.toMatch(/metrics_tem_as_tags\(\s*(ld|l)\.tags/)
    expect(sql).toMatch(/metrics_oportunidade_tem_as_tags\(ld\.id, p_tags\)/)
    expect(sql).toMatch(/metrics_oportunidade_tem_as_tags\(l\.id, p_tags\)/)
  })

  const FUNCOES = [
    'metrics_vendas_pagina', 'metrics_vendas_resumo', 'metrics_core', 'metrics_relatorio',
    'metrics_retention', 'metrics_new_clients_series', 'metrics_ticket_medio',
    'metrics_atendimentos_sem_receita', 'metrics_receita_por_categoria_de_procedimento',
    'metrics_comercial', 'metrics_lead_funnel', 'metrics_conversao_por_origem', 'metrics_motivos_de_perda',
  ]
  for (const f of FUNCOES) {
    it(`${f} ganha p_tags (nulo por padrão) e fica só com o service_role`, () => {
      expect(sql).toMatch(new RegExp(`'public\\.${f}\\(`))
      expect(sql).toMatch(new RegExp(`select pg_temp\\.com_tags\\(\\s*'public\\.${f}\\(`))
    })
  }
  it('a nova assinatura fecha a função como as vizinhas', () => {
    expect(sql).toMatch(/revoke execute on function %s from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function %s to service_role/)
    expect(sql).toMatch(/p_tags text\[\] DEFAULT NULL::text\[\]/)
  })
})

describe('os wrappers e a exportação levam as tags', () => {
  it('lib/metrics passa p_tags pelas funções da aba', () => {
    for (const f of ['lib/metrics/vendas.ts', 'lib/metrics/relatorio.ts', 'lib/metrics/queries.ts', 'lib/metrics/fechamento-extra.ts']) {
      expect(ler(f), f).toMatch(/paramDeTags\(/)
    }
  })
  it('o CSV de vendas respeita o filtro, como respeita os outros', () => {
    expect(ler('app/api/relatorios/vendas/route.ts')).toMatch(/tagsDaUrl\(q\.get\('tags'\)\)/)
  })
  it('a tela tem o gatilho "Tags" (PickerCompacto múltiplo) e as páginas leem ?tags=', () => {
    // O gatilho é o filtro de Tags COMPARTILHADO (o do Financeiro; ajuste 6 da
    // revisão das tags, 18/11): o mesmo PickerCompacto múltiplo, a mesma dica ao lado.
    const tela = ler('components/admin/reports-bi-view.tsx')
    expect(tela).toMatch(/<FiltroDeTags[\s\S]*?limpar=\{\['pagina'\]\}/)
    const filtro = ler('components/shared/filtro-de-tags.tsx')
    expect(filtro).toMatch(/data-filtro-de-tags/)
    expect(filtro).toMatch(/<PickerCompacto[\s\S]*?multiplo/)
    expect(ler('app/admin/reports/page.tsx')).toMatch(/rawTags/)
    expect(ler('app/[slug]/reports/page.tsx')).toMatch(/rawTags/)
  })
  it('as opções vêm do vocabulário da rede, lido no servidor', () => {
    expect(ler('components/admin/reports-bi-section.tsx')).toMatch(/tagsAtivasDaRede\(/)
  })
})
