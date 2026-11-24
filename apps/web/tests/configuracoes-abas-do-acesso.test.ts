import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppModule } from '@estetica-os/types'

/**
 * Configurações diz por que aparecem só aquelas abas (27ª simulação; princípio
 * 7): quem só tinha a LGPD (pelo Prontuário em Gerenciar) via a tela com uma
 * aba, sem dizer por quê.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
describe('Configurações diz por que aparecem só aquelas abas [7]', () => {
  const nome = (m: AppModule) => ({ medical_records: 'Prontuário', crm: 'CRM', settings: 'Configurações da rede', financial: 'Financeiro e comissões' } as Record<string, string>)[m] ?? m

  it('só a LGPD (do Prontuário em Gerenciar): diz de onde vem e o que falta', async () => {
    const { porQueSoEstasAbas } = await import('@/lib/configuracoes/abas-que-faltam')
    const t = porQueSoEstasAbas(['lgpd'], { gerencia: m => m === 'medical_records', nomeDoModulo: nome })!
    expect(t).toMatch(/LGPD/)
    expect(t).toMatch(/Prontuário em Gerenciar/)
    expect(t).toMatch(/Configurações da rede em Gerenciar/)
  })

  it('com Configurações em Gerenciar, nada a dizer', async () => {
    const { porQueSoEstasAbas } = await import('@/lib/configuracoes/abas-que-faltam')
    expect(porQueSoEstasAbas(['general', 'lgpd'], { gerencia: m => m === 'settings', nomeDoModulo: nome })).toBeNull()
  })

  it('a tela mostra a nota', () => {
    const tela = fonte('app/_shared/configuracoes.tsx')
    expect(tela).toMatch(/porQueSoEstasAbas\(/)
    expect(tela).toMatch(/data-abas-do-acesso/)
  })
})
