import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MENU_GROUPS } from '@/lib/menu'
import { MODULE_GROUPS } from '@/lib/permissions-copy'
import { REPORT_TAB_LABELS } from '@/lib/permissions'

/**
 * A11 da 21ª simulação (decisão do Heitor, 2026-11-17: "opcao 2"): o grupo do
 * menu com o funil, os procedimentos e os pacotes se chama "Comercial". "Vendas"
 * fica só com a aba dos Relatórios — eram dois lugares com o mesmo nome.
 */
const ler = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('A11 da 21ª: o grupo do menu é "Comercial"', () => {
  it('o menu e a tela de Cargos dizem "Comercial"', () => {
    expect(MENU_GROUPS.find(g => g.key === 'vendas')?.label).toBe('Comercial')
    expect(MODULE_GROUPS.find(g => g.key === 'vendas')?.label).toBe('Comercial')
  })

  it('a aba dos Relatórios continua "Vendas"', () => {
    expect(REPORT_TAB_LABELS.vendas).toBe('Vendas')
  })

  it('as telas que apontam o caminho dizem "Comercial"', () => {
    expect(ler('components/admin/settings-comissoes.tsx')).toContain('Comercial → Pacotes')
    expect(ler('components/shared/pergunta-da-venda.tsx')).toContain("'Quem tem o Comercial no cargo'")
  })
})
