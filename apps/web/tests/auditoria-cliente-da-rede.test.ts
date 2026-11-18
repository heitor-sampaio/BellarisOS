import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gravacoesDaUnidade } from '@/lib/auditoria/frase'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A linha da cliente na Auditoria é da REDE (auditoria das regras, 18/11; o
 * Heitor: "o cliente não é da unidade, o cliente é da rede" — H16; "Nada se
 * prende a clients.branch_id" — CLAUDE.md §5). O gatilho tirava a unidade da
 * linha de `clients` de `clients.branch_id` (onde a ficha nasceu), e o filtro
 * de unidade a mostrava só na unidade de cadastro.
 */

const MONO = join(__dirname, '..', '..', '..')

let id = 5000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-18T10:00:00.000Z', branch_id: null, client_id: null, tabela: 'clients', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Rita', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cM: 'Marlene' }, membros: {}, unidades: { bA: 'Moinhos', bB: 'Zona Sul' }, produtos: {},
} as unknown as NomesDaAuditoria

describe('a ficha na Auditoria é da rede', () => {
  it('o filtro de unidade não esconde a gravação da ficha (sem unidade)', () => {
    const ficha = [r({ tabela: 'clients', client_id: 'cM', registro_id: 'cM', colunas: ['phone'] })]
    expect(gravacoesDaUnidade(ficha, nomes, 'bA')).toHaveLength(1)
    expect(gravacoesDaUnidade(ficha, nomes, 'bB')).toHaveLength(1)
  })

  it('o que é de uma unidade segue no filtro dela (o controle)', () => {
    const ag = [r({ tabela: 'appointments', branch_id: 'bA', client_id: 'cM', registro_id: 'ag1', colunas: ['status'] })]
    expect(gravacoesDaUnidade(ag, nomes, 'bA')).toHaveLength(1)
    expect(gravacoesDaUnidade(ag, nomes, 'bB')).toHaveLength(0)
  })

  it('o gatilho não tira a unidade da linha de clients de clients.branch_id', () => {
    const pasta = join(MONO, 'supabase', 'migrations')
    const ultima = readdirSync(pasta).filter(n => n.endsWith('.sql')).sort()
      .map(n => readFileSync(join(pasta, n), 'utf8'))
      .filter(sql => /create\s+or\s+replace\s+function\s+private\.auditar\s*\(|pg_get_functiondef\('private\.auditar\(\)'/i.test(sql)).at(-1)!
    // A coluna da unidade: para `clients`, nula (a ficha é da rede).
    expect(ultima).toMatch(/when\s+'clients'\s+then\s+null/i)
  })

  it('a leitura com o filtro de unidade traz também as linhas da ficha', () => {
    const leitura = readFileSync(join(MONO, 'apps', 'web', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/branch_id\.is\.null,tabela\.eq\.clients/)
  })
})
