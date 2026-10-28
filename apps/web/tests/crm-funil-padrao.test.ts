import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * O funil padrão nasce numa TRANSAÇÃO só, pela função `crm_funil_padrao`
 * (2026-10-27, frente 9). `seedDefaultFunnel` inseria o funil e, depois, as
 * etapas, em duas idas ao banco: dois primeiros acessos juntos (o quadro, o
 * dashboard e o inbox abrem na mesma hora) batiam no índice
 * `uq_crm_funnels_default` — "duplicate key" no log a cada corrida, visto no
 * crm-atritos —, e um processo que caísse entre as duas idas deixava a rede
 * com um funil sem etapa nenhuma. A função trava a rede, cria os dois juntos
 * ou devolve o que já existe.
 */
const FUNIS = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'crm', 'funis.ts'), 'utf8')

describe('o funil padrão', () => {
  it('é semeado pela função do banco, não por insert solto', () => {
    expect(FUNIS).toMatch(/rpc\(\s*'crm_funil_padrao'/)
    expect(FUNIS).not.toMatch(/from\(\s*'(crm_funnels|crm_stages)'\s*\)\s*\.\s*(insert|upsert)/)
  })
})
