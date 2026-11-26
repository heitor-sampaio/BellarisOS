import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * D21 da 31ª simulação (DC-02, DT-01; princípio 3; AD-04: entra na Auditoria
 * toda gravação que muda o que alguém FAZ). Depois do "Pedir no portal", a
 * linha do documento seguia "Para assinar · bloqueia", com os mesmos botões e
 * sem marca do pedido — e a Auditoria não tinha o pedido (o evento
 * `NOTIFICADO_PORTAL` fica de fora dela, que é andamento; o "Enviar link"
 * entra, pelo link criado).
 *
 * A linha diz que foi pedido, e quando; o botão vira "Pedir de novo no
 * portal"; e o pedido marca o documento (`pedido_no_portal_em`), o que a
 * Auditoria registra.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => '/unidade/clients/c1' }))
vi.mock('@/actions/documentos', () => ({}))
vi.mock('@/components/shared/definir-pagamento', () => ({ DefinirPagamento: () => null }))

const raiz = join(__dirname, '..')
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), 'utf8')

const item = {
  id: 'd1', titulo: 'Termo do peeling', tipo: 'TERMO' as const, status: 'PENDENTE' as const, exigencia: 'BLOQUEIA' as const,
  faltando: [], agendamentoEm: null, procedimento: 'Peeling', criadoEm: '2026-11-25T23:00:00Z', assinadoEm: null,
  canal: null, codigo: null, motivo: null,
}

describe('o pedido no portal na linha do documento', () => {
  it('pedido: a linha diz quando, e o botão é "Pedir de novo no portal"', async () => {
    const { TermosDoCliente } = await import('@/components/shared/termos-do-cliente')
    const html = renderToStaticMarkup(createElement(TermosDoCliente, {
      itens: [{ ...item, pedidoNoPortalEm: '2026-11-26T01:10:00Z' }], slug: 'unidade',
    }))
    expect(html).toContain('data-pedido-no-portal')
    expect(html).toContain('Pedido no portal em 25/11/2026 às 22:10')
    expect(html).toContain('Pedir de novo no portal')
  })

  it('sem pedido: "Pedir no portal", sem a marca', async () => {
    const { TermosDoCliente } = await import('@/components/shared/termos-do-cliente')
    const html = renderToStaticMarkup(createElement(TermosDoCliente, { itens: [item], slug: 'unidade' }))
    expect(html).toContain('Pedir no portal')
    expect(html).not.toContain('Pedir de novo no portal')
    expect(html).not.toContain('data-pedido-no-portal')
  })

  it('a leitura dos documentos traz o pedido mais recente (o evento NOTIFICADO_PORTAL)', () => {
    const fonte = ler('lib/documentos/leitura.ts')
    expect(fonte).toMatch(/pedidoNoPortalEm:/)
    expect(fonte).toMatch(/'NOTIFICADO_PORTAL'/)
  })

  it('o pedido marca o documento, e a marca entra na Auditoria (issued_documents é auditada)', () => {
    const acao = ler('actions/documentos.ts')
    const i = acao.indexOf('export async function pedirAssinaturaNoPortal')
    expect(acao.slice(i, acao.indexOf('\n}\n', i))).toMatch(/pedido_no_portal_em/)
    const pasta = join(raiz, '..', '..', 'supabase', 'migrations')
    const migration = readdirSync(pasta).find(f => /^202612091\d{5}_.*pedido_no_portal/.test(f))
    expect(migration, 'a migration da coluna').toBeTruthy()
    const sql = readFileSync(join(pasta, migration!), 'utf8')
    expect(sql).toMatch(/add column if not exists pedido_no_portal_em timestamptz/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
