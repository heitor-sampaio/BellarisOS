import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O cartão "A receber da cliente · em aberto" soma TODO o em aberto
 * (vendas-financeiro:FN-11), inclusive o lançamento SEM cliente — a sublocação
 * da sala, um aluguel. O nome do cartão dizia "da cliente" e a tela não dizia
 * que ali havia o que não é de cliente nenhuma (princípio 3: "o que a tela
 * mostra é o que vale na conta"). A nota diz a parte sem cliente, contada no
 * banco com o mesmo conjunto do em aberto.
 */
const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')

const migration = () => {
  const pasta = join(RAIZ, 'supabase', 'migrations')
  const nome = readdirSync(pasta).find(f => /^202612062\d{5}_.*\.sql$/.test(f) && readFileSync(join(pasta, f), 'utf8').includes('metrics_a_receber_sem_cliente'))
  return nome ? readFileSync(join(pasta, nome), 'utf8').replace(/\r/g, '') : ''
}

describe('o a receber sem cliente, contado no banco', () => {
  it('a função conta o conjunto do em aberto, só o lançamento sem cliente nem atendimento', () => {
    const sql = migration()
    expect(sql, 'a migration da metrics_a_receber_sem_cliente').toContain('create or replace function public.metrics_a_receber_sem_cliente(')
    expect(sql).toContain("t.type = 'INCOME'")
    expect(sql).toContain('not t.is_paid')
    expect(sql).toContain("coalesce(t.notes, '')    <> 'Estornada'")
    expect(sql).toContain("coalesce(t.category, '') <> 'Estorno'")
    expect(sql).toContain('t.client_id is null')
    expect(sql).toContain('t.appointment_id is null')
    expect(sql).toMatch(/revoke execute on function public\.metrics_a_receber_sem_cliente\(uuid, uuid\[\]\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.metrics_a_receber_sem_cliente\(uuid, uuid\[\]\) to service_role/)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('lib/metrics lê pela função, e a falha para a tela', () => {
    const t = ler('lib/metrics/a-receber-sem-cliente.ts')
    expect(t).toContain("rpc('metrics_a_receber_sem_cliente'")
    expect(t).toMatch(/if \(error\) throw/)
  })
})

describe('a nota do cartão diz a parte sem cliente', () => {
  it('NotaDoVencimento escreve "Inclui sem cliente: R$ …" quando há', () => {
    const t = ler('components/shared/nota-do-vencimento.tsx')
    expect(t).toMatch(/semCliente\?: number/)
    expect(t).toMatch(/semCliente !== undefined && semCliente > 0 && \([\s\S]*data-a-receber-sem-cliente[\s\S]*Inclui sem cliente: <strong>\{formatBRL\(semCliente\)\}<\/strong>/)
  })
  it('os dois Financeiros passam o número, o da unidade e o da rede (e cada unidade no recorte)', () => {
    const hub = ler('components/branch/financial-hub.tsx')
    expect(hub).toMatch(/aReceberSemCliente\?: number/)
    expect(hub).toMatch(/<NotaDoVencimento noTopoOEmAberto valor=\{pendingIncome\}[^>]*semCliente=\{aReceberSemCliente\}/)
    const rede = ler('components/admin/admin-financial-view.tsx')
    expect(rede).toMatch(/const aReceberSemCliente = statDaUnidade \? statDaUnidade\.aReceberSemCliente \?\? 0 : totalAReceberSemCliente/)
    expect(rede).toMatch(/<NotaDoVencimento noTopoOEmAberto valor=\{aReceber\}[^>]*semCliente=\{aReceberSemCliente\}/)
    const daUnidade = ler('app/[slug]/financeiro/page.tsx')
    expect(daUnidade).toContain('getAReceberSemCliente(argsDoNucleo)')
    expect(daUnidade).toMatch(/aReceberSemCliente=\{aReceberSemCliente\.total\}/)
    const daRede = ler('app/admin/financeiro/page.tsx')
    expect(daRede).toContain('getAReceberSemCliente({ tenantId: ctx.tenantId!, branchIds: null })')
    expect(daRede).toMatch(/aReceberSemCliente: aReceberSemCliente\.porUnidade\[b\.branchId\] \?\? 0/)
    expect(daRede).toMatch(/totalAReceberSemCliente=\{aReceberSemCliente\.total\}/)
  })
})
