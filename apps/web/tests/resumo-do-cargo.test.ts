import { describe, it, expect } from 'vitest'
import { rotuloDasAbasAlcancadas, ABAS_DA_REDE } from '@/lib/configuracoes/abas'
import type { AppModule } from '@estetica-os/types'

const com = (...m: AppModule[]) => (x: AppModule) => m.includes(x)

/**
 * A7 da 7ª simulação: o resumo do cargo Financeiro dizia "Configurações", sem dizer que é a aba Comissões.
 * Três casos daqui testavam o resumo que ainda contava as abas da rede toda, que nenhuma tela usava, e saíram
 * com ele (o Heitor, 25/11: "ok mas tenha certeza absoluta que ninguem usa"). O resumo que a tela usa é provado
 * em `tests/config-da-rede-sobras-da-25.test.ts`.
 */
describe('Configurações no resumo do cargo', () => {
  it('com Configurações em Gerenciar, é a tela inteira', () => {
    expect(rotuloDasAbasAlcancadas(ABAS_DA_REDE, com('settings', 'financial'))).toBeNull()
  })
})
