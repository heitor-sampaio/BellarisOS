import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * VF2-01 (varredura de 18/11; vendas-financeiro.md §9.6, F2c e C75): as vezes
 * do cartão são `cartao_vezes`, nulo = 1x — nunca `parcela_total` (a parcela
 * 2/3 do crediário recebida no crédito à vista pagava a taxa de 3x na comissão).
 * A 20261124600002 trocou as leituras sobre o corpo vivo.
 *
 * Migration que RECRIA uma dessas funções a partir de um corpo copiado antes
 * dela traz a leitura velha de volta — foi o que a 20261124900003 (A17 da 25ª)
 * fazia com `comissao_conta_detalhe` e `comissao_base_do_pagamento`, copiadas
 * da produção antes de a 600002 subir. Nenhuma migration depois da 600002 lê
 * as vezes pelo crediário.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const DESDE = '20261124600002'

describe('VF2-01: nenhuma migration depois da 600002 volta a ler as vezes pelo crediário', () => {
  const depois = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql') && f.slice(0, DESDE.length) > DESDE).sort()

  it('há migrations depois dela para conferir', () => {
    expect(depois.length).toBeGreaterThan(0)
  })

  for (const f of depois) {
    it(f, () => {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
      expect(sql).not.toMatch(/cartao_vezes,\s*\w+\.parcela_total/)
    })
  }
})
