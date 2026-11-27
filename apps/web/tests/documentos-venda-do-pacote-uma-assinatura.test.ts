import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * P3 da 37ª simulação (PA-10 do catálogo de Vendas e financeiro: os termos e os
 * "outros documentos" do pacote "vão à cliente junto do contrato de pacote,
 * para uma assinatura só"). O contrato se colhia ANTES da venda, sozinho; os
 * puxados nasciam DEPOIS (com o pacote vendido) e pediam uma segunda
 * assinatura.
 *
 * Agora, com o contrato de pacote a colher, os puxados nascem com ele (do
 * pacote do catálogo, antes da venda): o link e a tela de assinar levam o
 * MOMENTO inteiro — o contrato e os puxados —, e a venda os ADOTA, como adota
 * o contrato.
 */

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations')
const migration = () => {
  const nome = readdirSync(MIGRATIONS).find(n => /^202612163\d{5}_.*puxados.*antes_da_venda.*\.sql$/.test(n))
  expect(nome, 'a migration da área D com os puxados antes da venda').toBeTruthy()
  return readFileSync(path.join(MIGRATIONS, nome!), 'utf8')
}

describe('o contrato do pacote e os puxados, numa assinatura só', () => {
  it('o banco emite os puxados junto do contrato a colher, e a venda os adota', () => {
    const sql = migration()
    // Um contrato vivo por cliente e pacote — o índice passa a olhar só o CONTRATO.
    expect(sql).toMatch(/drop index if exists public\.uniq_contrato_da_venda_do_pacote/)
    expect(sql).toMatch(/create unique index if not exists uniq_contrato_da_venda_do_pacote[\s\S]*?kind = 'CONTRATO_PACOTE'/)
    // E um puxado vivo por cliente, pacote e modelo, antes da venda.
    expect(sql).toMatch(/create unique index if not exists uniq_puxado_da_venda_do_pacote/)
    // Os modelos puxados do pacote do CATÁLOGO (a mesma conta do vendido).
    expect(sql).toMatch(/create or replace function private\.modelos_do_pacote_a_vender\(p_pacote uuid\)/)
    // O contrato da venda emite os puxados (o corpo vivo, trocado).
    expect(sql).toMatch(/'public\.documento_contrato_da_venda_do_pacote\(uuid,uuid,uuid,uuid,uuid,boolean\)'::regprocedure/)
    expect(sql).toMatch(/private\.documentos_puxados_antes_da_venda\(/)
    // A venda adota os puxados de antes (e o contrato adotado é só o CONTRATO).
    expect(sql).toMatch(/'public\.documentos_emitir_do_pacote\(uuid\)'::regprocedure/)
    expect(sql).toMatch(/d2\.kind = 'CONTRATO_PACOTE'/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('o "Colher assinatura" da venda entrega o contrato e os puxados juntos (uma assinatura)', () => {
    const acao = readFileSync(path.resolve(__dirname, '../actions/documentos.ts'), 'utf8')
    expect(acao).toMatch(/export async function documentoParaAssinar\(id: string, opcoes: \{ juntos\?: boolean \} = \{\}\)/)
    expect(acao).toMatch(/documentos: await abertosNaTela\(ctx\.tenantId!, momento\.abertos/)
    const venda = readFileSync(path.resolve(__dirname, '../components/shared/vender-pacote.tsx'), 'utf8')
    expect(venda).toMatch(/documentoParaAssinar\(id, \{ juntos: true \}\)/)
    expect(venda).toMatch(/<TelaDeAssinatura doc=\{assinando\.doc\} juntos=\{assinando\.juntos\}/)
  })

  it('o assinável e a tela de assinar conhecem o pacote do catálogo', () => {
    expect(readFileSync(path.resolve(__dirname, '../lib/documentos/assinar.ts'), 'utf8')).toMatch(/COLUNAS_ASSINAVEIS = '[^']*service_package_id/)
    expect(readFileSync(path.resolve(__dirname, '../app/_shared/assinatura-de-documento.tsx'), 'utf8'))
      .toMatch(/select\('id, client_id, appointment_id, treatment_plan_id, client_package_id, service_package_id'\)/)
  })
})

// O MOMENTO antes da venda: a cliente e o pacote do catálogo, sem o vendido.
const filtros: [string, ...unknown[]][] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order']) q[m] = (...a: unknown[]) => { filtros.push([m, ...a]); return q }
    q.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null })
    return { from: () => q }
  },
}))

describe('o momento do documento antes da venda do pacote', () => {
  beforeEach(() => { filtros.length = 0 })
  it('junta o contrato e os puxados da mesma cliente e do mesmo pacote do catálogo', async () => {
    const { documentosDoMomento } = await import('@/lib/documentos/momento')
    await documentosDoMomento('rede', {
      id: 'contrato', client_id: 'cli', appointment_id: null, treatment_plan_id: null, client_package_id: null, service_package_id: 'sp-1',
    })
    expect(filtros).toContainEqual(['eq', 'service_package_id', 'sp-1'])
    expect(filtros).toContainEqual(['is', 'client_package_id', null])
    expect(filtros).not.toContainEqual(['eq', 'id', 'contrato'])
  })
  it('o documento vendido segue no pacote vendido', async () => {
    const { documentosDoMomento } = await import('@/lib/documentos/momento')
    await documentosDoMomento('rede', {
      id: 'x', client_id: 'cli', appointment_id: null, treatment_plan_id: null, client_package_id: 'cp-1', service_package_id: 'sp-1',
    })
    expect(filtros).toContainEqual(['eq', 'client_package_id', 'cp-1'])
    expect(filtros).not.toContainEqual(['eq', 'service_package_id', 'sp-1'])
  })
})
