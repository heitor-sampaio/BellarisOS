import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Ler, retomar e baixar o relatório de uma importação de CLIENTES não
 * conferem a unidade (auditoria das regras, 18/11; crm-inbox.md, "Ler,
 * retomar e baixar os erros"). A ficha é da REDE (o Heitor: "o cliente não é
 * da unidade, o cliente é da rede" — H16), e a importação é configuração da
 * rede toda — só da Admin da rede (o Heitor, 18/11: "Configuração da rede toda
 * só pela conta admin"). `alcancaUnidade(ctx, imp.branch_id)` escondia a
 * importação de quem não tinha a unidade escolhida no envio. Fica o módulo do
 * destino em Gerenciar.
 */

const WEB = join(__dirname, '..')
const ler = (r: string) => readFileSync(join(WEB, r), 'utf8')

describe('a importação de clientes não se recorta por unidade', () => {
  it('importacaoAoAlcance confere o módulo, não a unidade', () => {
    const t = ler('actions/importacao.ts')
    const ini = t.indexOf('async function importacaoAoAlcance(')
    expect(ini).toBeGreaterThan(-1)
    const corpo = t.slice(ini, t.indexOf('\n}\n', ini))
    expect(corpo).toMatch(/can\(ctx/)
    expect(corpo).not.toMatch(/alcancaUnidade/)
  })
  it('o histórico e o relatório também não', () => {
    expect(ler('lib/importacao/historico.ts')).not.toMatch(/alcancaUnidade\(/)
    expect(ler('app/api/importacoes/[id]/erros/route.ts')).not.toMatch(/alcancaUnidade\(/)
  })
})
