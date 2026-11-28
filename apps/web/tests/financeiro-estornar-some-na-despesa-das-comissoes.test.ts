import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * A3 da 43ª simulação (comissoes:CF-17, "É a única porta: o Financeiro comum
 * recusa estornar essa despesa"; CLAUDE.md §14, "Botão que a pessoa não pode
 * usar: a tela esconde"): nas Movimentações, o "Estornar" aparecia na despesa
 * "Comissões — …" do fechamento pago e, ao clicar, o banco recusava ("Esta
 * despesa é de um fechamento de comissões: estorne pelo fechamento…").
 *
 * A marca é a MESMA do gatilho que recusa
 * (`private.despesa_de_fechamento_so_pelo_fechamento`): existe um
 * `commission_payouts` vivo (`estornado_at is null`) com `transaction_id` = a
 * despesa. O servidor a lê e a linha não tem o "Estornar", nos dois portais.
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')
const HELPER = 'lib/financeiro/despesa-das-comissoes.ts'

describe('A3 da 43ª: o "Estornar" some na despesa do fechamento das comissões', () => {
  it('o servidor lê a marca do gatilho: o fechamento vivo que pagou a despesa', () => {
    expect(existsSync(path.join(raiz, HELPER))).toBe(true)
    const h = fonte(HELPER)
    expect(h).toContain("from('commission_payouts')")
    expect(h).toContain("in('transaction_id'")
    expect(h).toContain("is('estornado_at', null)")
    expect(h).toContain(".eq('tenant_id', tenantId)")
  })

  it('as duas páginas do Financeiro marcam a linha', () => {
    for (const p of ['app/[slug]/financeiro/page.tsx', 'app/admin/financeiro/page.tsx']) {
      const s = fonte(p)
      expect(s, p).toContain('despesasDasComissoes(')
      expect(s, p).toMatch(/do_fechamento_das_comissoes: /)
    }
  })

  it('as duas listas não desenham o "Estornar" nessa linha', () => {
    expect(fonte('components/branch/financial-table.tsx')).toMatch(/!tx\.do_fechamento_das_comissoes && canReverse/)
    expect(fonte('components/admin/admin-financial-view.tsx')).toMatch(/!t\.do_fechamento_das_comissoes && canReverse/)
  })
})
