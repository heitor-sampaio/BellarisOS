import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tagsDaUrl, tagsParaAUrl, buscaComAsTags, literalDeArrayDoPostgres } from '@/lib/tags/filtro-na-url'
import { selectComAsTags, comAsTags, EMBED_DAS_TAGS_DA_CLIENTE } from '@/lib/financeiro/filtro-de-tags'
import { linkDaAba } from '@/lib/financeiro/abas'

/**
 * As Tags no Financeiro (CLAUDE.md §1, Tags — o Heitor, 13/11: "onde tiver for
 * passível de filtro, um dos filtros que ela pode usar são as tags … além dos
 * filtros que a gente já apresenta ali fixos em cada página"; a resposta dele
 * de 18/11, noite, confirma).
 *
 * As listas do Financeiro (A receber, A pagar, Movimentações), nos dois
 * portais, ganham o filtro "Tags": a linha entra se a CLIENTE dela
 * (`clients.tags`) tem TODAS as tags marcadas (E, como a lista de Clientes e o
 * inbox); a linha sem cliente (a despesa, o fornecedor) sai quando há tag
 * marcada. O filtro vai NA CONSULTA (CLAUDE.md §14: nada de filtrar um lote já
 * lido), e mora na URL (`?tags=`), como o período e a unidade.
 */
const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('as tags na URL (?tags=)', () => {
  it('sem ?tags=, nenhuma', () => {
    expect(tagsDaUrl(undefined)).toEqual([])
    expect(tagsDaUrl('')).toEqual([])
  })
  it('várias, separadas por vírgula, e a tag com vírgula no nome sobrevive à volta', () => {
    const valor = tagsParaAUrl(['VIP', 'Indicação', 'Pacote, 10x'])
    expect(tagsDaUrl(valor)).toEqual(['VIP', 'Indicação', 'Pacote, 10x'])
    // Lida como o Next a entrega (o searchParams já decodificado uma vez).
    const q = new URLSearchParams({ tags: valor })
    expect(tagsDaUrl(new URLSearchParams(q.toString()).get('tags') ?? undefined)).toEqual(['VIP', 'Indicação', 'Pacote, 10x'])
  })
  it('a busca troca só as tags e guarda o resto; sem tag, o ?tags= sai', () => {
    expect(buscaComAsTags('aba=a-receber&period=month', ['VIP'])).toBe('?aba=a-receber&period=month&tags=VIP')
    expect(buscaComAsTags('?aba=a-receber&tags=VIP', [])).toBe('?aba=a-receber')
    expect(buscaComAsTags('', [])).toBe('')
  })
  it('o literal do array do Postgres põe aspas e escapa (a tag com vírgula, aspas ou barra)', () => {
    expect(literalDeArrayDoPostgres(['VIP'])).toBe('{"VIP"}')
    expect(literalDeArrayDoPostgres(['Pacote, 10x', 'a"b', 'c\\d'])).toBe('{"Pacote, 10x","a\\"b","c\\\\d"}')
  })
})

describe('o filtro de Tags vai na consulta dos lançamentos', () => {
  /** Um construtor de consulta de mentira: guarda os filtros pedidos. */
  function consulta() {
    const filtros: [string, string, string][] = []
    const q = { filtros, filter(col: string, op: string, v: string) { filtros.push([col, op, v]); return q } }
    return q
  }
  it('sem tag, a consulta fica como estava (as linhas sem cliente seguem na lista)', () => {
    const q = consulta()
    expect(comAsTags(q, [])).toBe(q)
    expect(q.filtros).toEqual([])
    expect(selectComAsTags('id, amount', [])).toBe('id, amount')
  })
  it('com tag, a cliente entra pelo embed INNER (a linha sem cliente sai) e precisa de TODAS (cs)', () => {
    expect(EMBED_DAS_TAGS_DA_CLIENTE).toMatch(/clients!financial_transactions_client_id_fkey!inner\(\)/)
    expect(selectComAsTags('id, amount', ['VIP'])).toBe(`id, amount, ${EMBED_DAS_TAGS_DA_CLIENTE}`)
    const q = consulta()
    comAsTags(q, ['VIP', 'Indicação'])
    expect(q.filtros).toEqual([['tags_da_cliente.tags', 'cs', '{"VIP","Indicação"}']])
  })
})

describe('as abas do Financeiro levam as tags junto', () => {
  it('o link de A receber, A pagar e Movimentações guarda ?tags=; o de Comissões não (é por profissional)', () => {
    const manter = { period: 'month', tags: 'VIP' }
    expect(linkDaAba('/x/financeiro', 'a-receber', manter)).toBe('/x/financeiro?aba=a-receber&period=month&tags=VIP')
    expect(linkDaAba('/x/financeiro', 'movimentacoes', manter)).toBe('/x/financeiro?aba=movimentacoes&period=month&tags=VIP')
    expect(linkDaAba('/x/financeiro', 'comissoes', manter)).toBe('/x/financeiro/comissoes')
  })
})

describe('as duas telas do Financeiro têm o filtro', () => {
  const PAGINAS = ['app/[slug]/financeiro/page.tsx', 'app/admin/financeiro/page.tsx']
  it('as páginas leem ?tags= e filtram NA consulta da lista, com o vocabulário lido no servidor', () => {
    for (const p of PAGINAS) {
      const s = ler(p)
      expect(s, p).toMatch(/tagsDaUrl\(sp\.tags\)/)
      expect(s, p).toMatch(/selectComAsTags\(/)
      expect(s, p).toMatch(/comAsTags\(/)
      expect(s, p).toMatch(/tagsAtivasDaRede\(ctx\.tenantId!\)/)
    }
  })
  it('as telas mostram "Tags" no PickerCompacto múltiplo e mantêm ?tags= ao trocar o período', () => {
    for (const c of ['components/branch/financial-hub.tsx', 'components/admin/admin-financial-view.tsx']) {
      const s = ler(c)
      expect(s, c).toMatch(/<FiltroDeTags/)
      expect(s, c).toMatch(/q\.set\('tags'/)
    }
    const filtro = ler('components/shared/filtro-de-tags.tsx')
    expect(filtro).toMatch(/<PickerCompacto/)
    expect(filtro).toMatch(/multiplo/)
    expect(filtro).toMatch(/buscaComAsTags\(/)
  })
})
