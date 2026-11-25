import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SOBRE_O_PACOTE_VENCIDO } from '@/lib/clientes/pacotes-da-ficha'

/**
 * O pacote vencido, na ficha, diz o que é e o que se pode fazer (o princípio
 * 7; A24 da 29ª — só texto, sem recurso novo): o cartão dizia "Pacote X venceu
 * em …, com N sessões que sobraram." e só oferecia "Cancelar pacote", sem
 * dizer o que o cancelar faz nem que deixar como está também vale
 * (vendas-financeiro:PA-16, PA-21).
 */
describe('o pacote vencido na ficha', () => {
  it('a dica diz o que é e as duas saídas', () => {
    expect(SOBRE_O_PACOTE_VENCIDO).toMatch(/passou da validade/)
    expect(SOBRE_O_PACOTE_VENCIDO).toMatch(/fora do Tratamento em andamento/)
    expect(SOBRE_O_PACOTE_VENCIDO).toMatch(/mostra a conta antes de confirmar/)
    expect(SOBRE_O_PACOTE_VENCIDO).toMatch(/Deixar como está também vale/)
    expect(SOBRE_O_PACOTE_VENCIDO).toMatch(/Configurações → Geral → Pacote vencido/)
  })
  it('o cartão do pacote vencido leva a dica', () => {
    const t = readFileSync(join(__dirname, '..', 'components/branch/client-profile.tsx'), 'utf8')
    expect(t).toMatch(/<Dica rotulo="Sobre o pacote vencido">\s*\{SOBRE_O_PACOTE_VENCIDO\}/)
  })
})
