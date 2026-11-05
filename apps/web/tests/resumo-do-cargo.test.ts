import { describe, it, expect } from 'vitest'
import { rotuloDasAbasAlcancadas, ABAS_DA_REDE } from '@/lib/configuracoes/abas'
import type { AppModule } from '@estetica-os/types'

const com = (...m: AppModule[]) => (x: AppModule) => m.includes(x)

/** A7 da 7ª simulação: o resumo do cargo Financeiro dizia "Configurações", sem dizer que é a aba Comissões. */
describe('Configurações no resumo do cargo', () => {
  it('o Financeiro alcança só Comissões e taxas', () => {
    expect(rotuloDasAbasAlcancadas(ABAS_DA_REDE, com('financial'))).toBe('Configurações (só Comissões e taxas)')
  })
  it('com mais de um módulo, lista as abas', () => {
    expect(rotuloDasAbasAlcancadas(ABAS_DA_REDE, com('financial', 'forms'))).toBe('Configurações (só Fichas, Documentos e Comissões e taxas)')
  })
  it('com Configurações em Gerenciar, é a tela inteira', () => {
    expect(rotuloDasAbasAlcancadas(ABAS_DA_REDE, com('settings', 'financial'))).toBeNull()
  })
})
