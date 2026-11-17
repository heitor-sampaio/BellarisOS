import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A13 e A35 da 21ª simulação (2026-11-17), o app da cliente.
 *
 * A13 [7]: "Foto nova" no sino levava ao Histórico na aba padrão
 * (Procedimentos), e a foto está na aba Documentos.
 * A35 [3]: o plano aceito dizia "Nenhum documento neste plano", sem dizer que
 * o contrato se assina no pagamento, na unidade (PT1c).
 */

const raiz = join(__dirname, '..')
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), 'utf8')

describe('A13: o documento enviado leva à aba Documentos do Histórico', () => {
  it('o link do aviso abre a aba Documentos', async () => {
    const { linkDoDocumentoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(linkDoDocumentoNoApp('violeta-manaira')).toBe('/violeta-manaira/cliente/historico?aba=documentos')
  })
  it('a aba do endereço, e a padrão quando não é uma das três', async () => {
    const { abaDoHistoricoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(abaDoHistoricoNoApp('documentos')).toBe('documentos')
    expect(abaDoHistoricoNoApp('pagamentos')).toBe('pagamentos')
    expect(abaDoHistoricoNoApp(undefined)).toBe('procedimentos')
    expect(abaDoHistoricoNoApp('<x>')).toBe('procedimentos')
  })
  it('o envio do documento usa o link, e a página passa a aba à tela', () => {
    const acao = ler('actions/client-documents.ts')
    expect(acao).toContain('linkDoDocumentoNoApp(unidade.slug)')
    expect(acao).not.toMatch(/link:\s*`\/\$\{unidade\.slug\}\/cliente\/historico`/)
    const pagina = ler('app/[slug]/cliente/historico/page.tsx')
    expect(pagina).toContain('abaDoHistoricoNoApp(')
    expect(ler('components/client-portal/historico-tabs.tsx')).toMatch(/useState<Tab>\(abaInicial/)
  })
})

describe('A35: o plano aceito diz onde se assina o contrato', () => {
  it('aceito, a receber, sem o contrato emitido e com o contrato de plano na rede: diz que se assina no pagamento, na unidade', async () => {
    const { avisoDoContratoDoPlanoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(avisoDoContratoDoPlanoNoApp({ status: 'ACCEPTED', tipos: [], recebido: false, redeTemContrato: true }))
      .toBe('O contrato do plano se assina no pagamento, na unidade.')
    expect(avisoDoContratoDoPlanoNoApp({ status: 'ACCEPTED', tipos: ['TERMO'], recebido: false, redeTemContrato: true }))
      .toBe('O contrato do plano se assina no pagamento, na unidade.')
  })
  it('nada a dizer: o contrato já está, o plano já se recebeu, a rede não tem contrato de plano, ou é proposto', async () => {
    const { avisoDoContratoDoPlanoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(avisoDoContratoDoPlanoNoApp({ status: 'ACCEPTED', tipos: ['CONTRATO_PLANO'], recebido: false, redeTemContrato: true })).toBeNull()
    expect(avisoDoContratoDoPlanoNoApp({ status: 'ACCEPTED', tipos: [], recebido: true, redeTemContrato: true })).toBeNull()
    expect(avisoDoContratoDoPlanoNoApp({ status: 'ACCEPTED', tipos: [], recebido: false, redeTemContrato: false })).toBeNull()
    expect(avisoDoContratoDoPlanoNoApp({ status: 'PROPOSED', tipos: [], recebido: false, redeTemContrato: true })).toBeNull()
  })
  it('a página do plano usa o aviso', () => {
    expect(ler('app/[slug]/cliente/planos/[id]/page.tsx')).toContain('avisoDoContratoDoPlanoNoApp(')
  })
})
