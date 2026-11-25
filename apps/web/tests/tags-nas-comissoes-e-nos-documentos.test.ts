import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O filtro de Tags em Financeiro → Comissões e na tela Documentos (CLAUDE.md
 * §1, o Heitor, 13/11: "onde tiver for passível de filtro, um dos filtros que
 * ela pode usar são as tags"):
 * - Comissões: Q04 do catálogo das Comissões, revisão de 24/11 — "a aba
 *   Comissões tem filtro, então ganha o de Tags (a tag da cliente da
 *   comissão). Defeito a corrigir." Era "Comissões não: é por profissional".
 * - Documentos: DT-01 do catálogo dos Documentos — cada documento é de uma
 *   cliente, e a tela tinha os filtros fixos sem o de Tags.
 * A régua é a dos Relatórios (TF-02): entra a linha cuja cliente tem TODAS as
 * tags marcadas, na consulta (`p_tags`), e as contagens seguem a lista.
 */
const raiz = path.join(__dirname, '..')
const ler = (...p: string[]) => readFileSync(path.join(raiz, ...p), 'utf8')
const migrations = path.join(raiz, '..', '..', 'supabase', 'migrations')
const arquivo = readdirSync(migrations).find(f => /^202612034\d{5}_tags_nas_comissoes_e_nos_documentos\.sql$/.test(f))
const sql = arquivo ? readFileSync(path.join(migrations, arquivo), 'utf8') : ''

describe('as Comissões e os Documentos com o filtro de Tags', () => {
  it('a migration existe, na faixa R, e recarrega o esquema', () => {
    expect(arquivo).toBeTruthy()
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
  it('a cliente da comissão mora num lugar só (o atendimento, o lançamento ou a venda da linha)', () => {
    expect(sql).toMatch(/create or replace function public\.cliente_da_comissao\(p_line uuid, p_appointment uuid, p_transaction uuid\)/)
    expect(sql).toMatch(/create or replace function public\.comissao_tem_as_tags\(p_line uuid, p_appointment uuid, p_transaction uuid, p_tags text\[\]\)/)
    expect(sql).toMatch(/revoke execute on function public\.cliente_da_comissao\(uuid, uuid, uuid\) from public, anon, authenticated/)
  })
  for (const f of ['comissoes_resumo', 'comissoes_extrato_com_regra', 'documentos_emitidos_pagina', 'documentos_emitidos_resumo']) {
    it(`${f} ganha p_tags`, () => {
      expect(sql).toMatch(new RegExp(`select pg_temp\\.com_tags\\(\\s*'public\\.${f}\\(`))
    })
  }
  it('a leitura leva as tags às funções', () => {
    expect(ler('lib/comissoes/leitura.ts')).toMatch(/paramDeTags\(r\.tags\)/)
    expect(ler('lib/metrics/documentos.ts')).toMatch(/paramDeTags\(r\.tags\)/)
  })
  it('as telas têm o gatilho "Tags" e as páginas leem ?tags=', () => {
    const c = ler('components/shared/financeiro-comissoes.tsx')
    expect(c).toMatch(/<FiltroDeTags/)
    // O "Fechar e pagar" paga TODAS as comissões da pessoa: com tag marcada, sai (princípio 3).
    expect(c).toMatch(/p\.podeFechar && r\.aPagar > 0 && !comTag/)
    expect(ler('app/_shared/comissoes-da-equipe.tsx')).toMatch(/tagsDaUrl\(/)
    expect(ler('app/_shared/comissoes-da-equipe.tsx')).toMatch(/tagsAtivasDaRede\(/)
    expect(ler('app/_shared/documentos-emitidos.tsx')).toMatch(/tagsDaUrl\(params\.tags\)/)
    expect(ler('app/_shared/documentos-emitidos.tsx')).toMatch(/tagsAtivasDaRede\(/)
  })
})
