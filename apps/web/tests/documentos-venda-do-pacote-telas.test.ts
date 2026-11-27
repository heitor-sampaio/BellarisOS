import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { avisoDasVazias } from '@/lib/documentos/variaveis'

const fonte = (arquivo: string) => readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8')

// A10 da 37ª (DQ-06: colher inclui "pelo app", na tela em que a assinatura é
// pedida): o contrato a colher na venda do pacote não tinha o "Pedir no portal"
// — só a ficha. O mesmo pedido da ficha (`pedirAssinaturaNoPortal`), só a quem
// tem o app e com o portal no plano da rede (A26 da 7ª, C57a).
describe('o "Pedir no portal" no contrato da venda do pacote', () => {
  it('o contrato a colher diz se a cliente tem o app (e quando já foi pedido)', () => {
    const pacote = fonte('lib/documentos/pacote.ts')
    expect(pacote).toMatch(/noPortal:\s*\{ pedidoEm: string \| null \} \| null/)
    expect(pacote).toMatch(/redeTemRecurso\(args\.tenantId, 'portal'\)/)
  })
  it('a venda mostra o "Pedir no portal" ao lado do link, pela mesma action da ficha', () => {
    const pedir = fonte('components/shared/pedir-no-portal.tsx')
    expect(pedir).toMatch(/pedirAssinaturaNoPortal\(documentoId\)/)
    expect(pedir).toContain("'Pedir de novo no portal' : 'Pedir no portal'")
    expect(pedir).toContain('Pedido enviado: o documento está no portal do cliente, com o aviso no app.')
    const venda = fonte('components/shared/vender-pacote.tsx')
    expect(venda).toMatch(/contrato\.status === 'PENDENTE' && contrato\.noPortal && <PedirNoPortal documentoId=\{contrato\.id\} pedidoEm=\{contrato\.noPortal\.pedidoEm\} \/>/)
  })
})

// A7 da 37ª (princípio 7, o nome certo): na venda do pacote, o aviso das
// variáveis vazias dizia "Neste plano…".
describe('o aviso das vazias diz o que se vende', () => {
  it('na venda do pacote, "Neste pacote"', () => {
    expect(avisoDasVazias(['pagamento.entrada'], 'pacote'))
      .toBe('Neste pacote sai vazia: Valor da entrada. Confira se o texto do contrato fica certo sem ela (a forma de pagamento já é a frase completa).')
  })
  it('a venda do pacote pede o aviso do pacote', () => {
    expect(fonte('components/shared/vender-pacote.tsx')).toMatch(/avisoDasVazias\(contrato\.vazias, 'pacote'\)/)
    expect(fonte('components/shared/vender-pacote.tsx')).not.toMatch(/avisoDasVazias\(contrato\.vazias\)/)
  })
})
