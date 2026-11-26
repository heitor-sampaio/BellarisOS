import { describe, it, expect } from 'vitest'
import type { AppModule } from '@estetica-os/types'

/**
 * Princípio 3 e A-CONF1 da 25ª (a conta das abas que a pessoa USA sem ser a
 * Admin da rede: as da rede toda dizem "Esta configuração é só da Admin da
 * rede." e não contam — `rotuloDasAbasAlcancadas`). A nota de Configurações
 * dizia "Você vê as abas Tags (vem de Clientes em Gerenciar) e Importações…",
 * e dentro da aba a pessoa lia "Esta configuração é só da Admin da rede".
 */
const nome = (m: AppModule) => ({ clients: 'Clientes', crm: 'CRM', settings: 'Configurações da rede', medical_records: 'Prontuário' } as Record<string, string>)[m] ?? m

describe('a nota das abas não diz que a aba da rede toda vem da permissão', () => {
  it('Tags e Importações (Clientes em Gerenciar, sem ser a Admin): ditas como da rede toda; a LGPD, de onde vem', async () => {
    const { porQueSoEstasAbas } = await import('@/lib/configuracoes/abas-que-faltam')
    const t = porQueSoEstasAbas(['tags', 'importacoes', 'lgpd'], { gerencia: m => m === 'clients', nomeDoModulo: nome })!
    expect(t).not.toMatch(/Tags \(vem de/)
    expect(t).not.toMatch(/Importações \(vem de/)
    expect(t).toMatch(/Você vê a aba LGPD \(vem de Clientes em Gerenciar\)/)
    expect(t).toMatch(/Tags e Importações são da rede toda: só a Admin da rede as muda\./)
  })

  it('só abas da rede toda: nenhuma "vem de"', async () => {
    const { porQueSoEstasAbas } = await import('@/lib/configuracoes/abas-que-faltam')
    const t = porQueSoEstasAbas(['tags', 'importacoes'], { gerencia: m => m === 'crm', nomeDoModulo: nome })!
    expect(t).not.toMatch(/vem de/)
    expect(t).not.toMatch(/Você vê/)
    expect(t).toMatch(/^As abas Tags e Importações são da rede toda: só a Admin da rede as muda\./)
  })

  it('uma aba da rede toda, no singular', async () => {
    const { porQueSoEstasAbas } = await import('@/lib/configuracoes/abas-que-faltam')
    const t = porQueSoEstasAbas(['tags', 'lgpd'], { gerencia: m => m === 'clients', nomeDoModulo: nome })!
    expect(t).toMatch(/A aba Tags é da rede toda: só a Admin da rede a muda\./)
  })
})
