import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatBRL } from '@estetica-os/utils'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

/**
 * As pendências das simulações 15ª–23ª na área do PDV, do financeiro, do
 * estoque e dos documentos (2026-11-17): a transferência no relatório de
 * Estoque (A33 da 20ª), a parcela recebida em várias formas numa linha só
 * (limite da 21ª), a marca "não usa insumo" (A7 da 23ª = A23 da 21ª) e a
 * confirmação do "Tornar ativo" do contrato (A32 da 15ª).
 */

const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = (trecho: string) => {
  const nome = readdirSync(MIGRATIONS).find(f => f.startsWith('202611232') && f.includes(trecho))
  return nome ? readFileSync(join(MIGRATIONS, nome), 'utf8') : null
}

describe('A33 da 20ª: a transferência entre unidades no relatório de Estoque', () => {
  it('a conta é do banco: metrics_transferencias_de_estoque, só do servidor, com o notify', () => {
    const sql = migration('transferencias_de_estoque')
    expect(sql).not.toBeNull()
    expect(sql!).toMatch(/create or replace function public\.metrics_transferencias_de_estoque\(/)
    expect(sql!).toMatch(/TRANSFER_OUT/)
    expect(sql!).toMatch(/TRANSFER_IN/)
    expect(sql!).toMatch(/custo_do_movimento/)
    expect(sql!).toMatch(/revoke execute on function public\.metrics_transferencias_de_estoque[^;]+from public, anon, authenticated/)
    expect(sql!.trim()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('lib/metrics monta as linhas e o total de cada unidade (saiu e entrou), sem somar na tela', async () => {
    const { montarTransferencias } = await import('@/lib/metrics/transferencias')
    const r = montarTransferencias([
      { branch_id: 'a', unidade: 'Centro', direcao: 'SAIU', outra_id: 'b', outra: 'Bairro', product_id: 'p', produto: 'Toxina', unidade_medida: 'U', embalagem: 'frasco', quantidade: 200, embalagens: 2, custo: 1000, movimentos: 1 },
      { branch_id: 'b', unidade: 'Bairro', direcao: 'ENTROU', outra_id: 'a', outra: 'Centro', product_id: 'p', produto: 'Toxina', unidade_medida: 'U', embalagem: 'frasco', quantidade: 200, embalagens: 2, custo: 1000, movimentos: 1 },
      { branch_id: 'a', unidade: 'Centro', direcao: 'SAIU', outra_id: null, outra: null, product_id: null, produto: null, unidade_medida: null, embalagem: null, quantidade: null, embalagens: null, custo: 1000, movimentos: 1 },
      { branch_id: 'b', unidade: 'Bairro', direcao: 'ENTROU', outra_id: null, outra: null, product_id: null, produto: null, unidade_medida: null, embalagem: null, quantidade: null, embalagens: null, custo: 1000, movimentos: 1 },
    ])
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({ unidade: 'Centro', direcao: 'SAIU', outra: 'Bairro', produto: 'Toxina', quantidade: 200, embalagens: 2, custo: 1000 })
    expect(r.porUnidade).toEqual([
      { branchId: 'a', unidade: 'Centro', saiu: 1000, entrou: 0, movimentos: 1 },
      { branchId: 'b', unidade: 'Bairro', saiu: 0, entrou: 1000, movimentos: 1 },
    ])
    expect(r.movimentos).toBe(2)
  })

  it('a aba Estoque pede e mostra a seção "Transferências entre unidades"', () => {
    const secao = ler('components/admin/reports-bi-section.tsx')
    expect(secao).toContain('getTransferenciasDeEstoque(')
    const vista = ler('components/admin/reports-bi-view.tsx')
    expect(vista).toContain('data-transferencias')
    expect(vista).toContain('Transferências entre unidades')
  })
})

describe('Limite da 21ª: a parcela recebida em várias formas é uma linha só', () => {
  const base = { type: 'INCOME', is_paid: true, notes: null, category: 'Pacote', description: 'Pacote 4 limpezas — parcela 2/4', parcela_numero: 2, parcela_total: 4, created_at: '2026-11-17T12:00:00Z', paid_at: '2026-11-17T15:00:00Z', cartao_vezes: null }

  it('junta as formas da mesma parcela, com o total e cada forma', async () => {
    const { juntarAsFormasDaParcela, formasDaParcelaEmTexto } = await import('@/lib/financeiro/formas-da-parcela')
    const linhas = [
      { ...base, id: '1', amount: 400, payment_method: 'PIX' },
      { ...base, id: '2', amount: '200', payment_method: 'CASH' },
      { ...base, id: '3', amount: 600, payment_method: null, is_paid: false, paid_at: null, parcela_numero: 3 },
    ]
    const r = juntarAsFormasDaParcela(linhas)
    expect(r).toHaveLength(2)
    expect(r[0]!.id).toBe('1')
    expect(Number(r[0]!.amount)).toBe(600)
    expect(r[0]!.formasDaParcela).toEqual([
      { id: '1', forma: 'PIX', vezes: null, valor: 400 },
      { id: '2', forma: 'CASH', vezes: null, valor: 200 },
    ])
    expect(r[1]!.formasDaParcela).toBeNull()
    expect(formasDaParcelaEmTexto(r[0]!.formasDaParcela!)).toBe(`Pix ${formatBRL(400)} + Dinheiro ${formatBRL(200)}`)
  })

  it('não junta a estornada, o estorno, o em aberto nem o que não é parcela', async () => {
    const { juntarAsFormasDaParcela } = await import('@/lib/financeiro/formas-da-parcela')
    const r = juntarAsFormasDaParcela([
      { ...base, id: '1', amount: 400, payment_method: 'PIX' },
      { ...base, id: '2', amount: 200, payment_method: 'CASH', notes: 'Estornada' },
      { ...base, id: '3', amount: 100, payment_method: 'PIX', parcela_numero: null, parcela_total: null },
      { ...base, id: '4', amount: 100, payment_method: 'CASH', parcela_numero: null, parcela_total: null },
    ])
    expect(r.map(l => l.id)).toEqual(['1', '2', '3', '4'])
    expect(r.every(l => l.formasDaParcela === null)).toBe(true)
  })

  it('no CSV cada forma é uma linha, mas diz que é a forma 1 de 2 da parcela', async () => {
    const { posicaoNaParcela } = await import('@/lib/financeiro/formas-da-parcela')
    const pos = posicaoNaParcela([
      { ...base, id: '1', amount: 400, payment_method: 'PIX' },
      { ...base, id: '2', amount: 200, payment_method: 'CASH' },
      { ...base, id: '5', amount: 100, payment_method: 'PIX', parcela_numero: 4 },
    ])
    expect(pos.get('1')).toBe('forma 1 de 2')
    expect(pos.get('2')).toBe('forma 2 de 2')
    expect(pos.has('5')).toBe(false)
    const tabela = ler('components/branch/financial-table.tsx')
    expect(tabela).toContain('posicaoNaParcela(')
  })

  it('as listas do Financeiro, da ficha e do plano usam a junção', () => {
    expect(ler('components/branch/financial-table.tsx')).toContain('juntarAsFormasDaParcela(')
    expect(ler('lib/clientes/financeiro-da-ficha.ts')).toContain('juntarAsFormasDaParcela(')
    expect(ler('lib/metrics/plano.ts')).toContain('juntarAsFormasDaParcela(')
    expect(ler('components/branch/client-profile.tsx')).toContain('data-formas-da-parcela')
    expect(ler('components/branch/planejamento-tratamento.tsx')).toContain('formasDaParcelaEmTexto(')
  })
})

describe('A7 da 23ª (= A23 da 21ª): a marca "Este procedimento não usa insumo"', () => {
  it('a coluna procedures.sem_insumo, com o notify', () => {
    const sql = migration('sem_insumo')
    expect(sql).not.toBeNull()
    expect(sql!).toMatch(/alter table public\.procedures\s+add column if not exists sem_insumo boolean not null default false/)
    expect(sql!.trim()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('a faixa ignora o marcado (e o inativo, e o que tem insumo)', async () => {
    const { procedimentosSemInsumoLigado, marcaSemInsumo } = await import('@/lib/procedimentos/sem-insumo')
    const r = procedimentosSemInsumoLigado([
      { id: '1', name: 'Avaliação', is_active: true, sem_insumo: true, procedure_products: [] },
      { id: '2', name: 'Peeling', is_active: true, sem_insumo: false, procedure_products: [] },
      { id: '3', name: 'Toxina', is_active: true, sem_insumo: false, procedure_products: [{}] },
      { id: '4', name: 'Antigo', is_active: false, sem_insumo: false, procedure_products: [] },
      { id: '5', name: 'Massagem', is_active: true, sem_insumo: null, procedure_products: [] },
    ])
    expect(r.map(p => p.name)).toEqual(['Peeling', 'Massagem'])
    // Com insumo ligado, a marca não vale (o procedimento usa insumo).
    expect(marcaSemInsumo(true, 0)).toBe(true)
    expect(marcaSemInsumo(true, 2)).toBe(false)
    expect(marcaSemInsumo(false, 0)).toBe(false)
  })

  it('o formulário tem a caixa, a action grava e o catálogo lê a marca', () => {
    const form = ler('components/admin/procedure-form.tsx')
    expect(form).toContain('name="sem_insumo"')
    expect(form).toContain('Este procedimento não usa insumo')
    const acao = ler('actions/procedures.ts')
    expect(acao.match(/sem_insumo:\s+marcaSemInsumo\(/g)?.length).toBe(2)
    const cat = ler('app/_shared/catalogo-de-procedimentos.tsx')
    expect(cat).toMatch(/select\('[^']*sem_insumo/)
    expect(cat).toContain('procedimentosSemInsumoLigado(')
  })
})

describe('A32 da 15ª: o "Tornar ativo" do contrato pede confirmação', () => {
  it('o texto diz o que passa a valer e o que fica inativo', async () => {
    const { confirmacaoDeTornarAtivo } = await import('@/lib/documentos/tornar-ativo')
    expect(confirmacaoDeTornarAtivo({ tipo: 'CONTRATO_PACOTE', novo: 'Contrato Íris', atual: 'Contrato de fábrica' }))
      .toBe('O contrato de pacote “Contrato Íris” passa a valer; “Contrato de fábrica” fica inativo.')
    expect(confirmacaoDeTornarAtivo({ tipo: 'CONTRATO_PLANO', novo: 'B', atual: null }))
      .toBe('O contrato de plano “B” passa a valer.')
  })

  it('a linha da lista confirma antes de trocar', () => {
    const f = ler('components/admin/settings-documentos.tsx')
    expect(f).toContain('BotaoComConfirmacao')
    expect(f).toContain('confirmacaoDeTornarAtivo(')
    expect(existsSync(join(__dirname, '..', 'lib', 'documentos', 'tornar-ativo.ts'))).toBe(true)
  })
})

describe('a lista de insumos do procedimento é a dos INSUMOS (E2 do Bloco Estoque, atendimento.md)', () => {
  const WEB = nodePath.join(__dirname, "..")
  const ler = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB, caminho), "utf8")

  // ─── a lista de insumos vazia fala de insumo ──────────────────────────
  describe('"Nenhum insumo cadastrado"', () => {
    it('o procedimento sem insumo no estoque não diz que não há produto', () => {
      const f = ler('components/admin/procedure-form.tsx')
      expect(f).toContain('Nenhum insumo cadastrado no estoque ainda.')
      expect(f).not.toContain('Nenhum produto cadastrado no estoque ainda.')
    })
  })
})
