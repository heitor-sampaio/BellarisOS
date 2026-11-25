import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nomesDaAssinatura } from '@/lib/documentos/nome-de-quem-assinou'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/**
 * O documento assinado não muda (documentos.md: "assinado, não muda"; a
 * evidência `document_signatures` é imutável; o hash cobre o documento
 * montado). Corrigido o nome da ficha depois, a linha de assinatura segue com
 * o nome com que a pessoa assinou (`signer_name`), como o PDF e o /verificar;
 * o cabeçalho mostra o nome de hoje com "assinado como …" (decisão do Claude,
 * 25/11).
 */
describe('o documento assinado mostra o nome com que a pessoa assinou', () => {
  it('assinado: a linha é o signer_name, e o cabeçalho diz "assinado como" quando o nome mudou', () => {
    const r = nomesDaAssinatura({ assinanteDeHoje: 'Eulália Prado Souza', assinatura: { nome: 'Eulália Prado' } })
    expect(r.linha).toBe('Eulália Prado')
    expect(r.assinadoComo).toBe('Eulália Prado')
  })

  it('assinado com o mesmo nome de hoje: nada a dizer no cabeçalho', () => {
    const r = nomesDaAssinatura({ assinanteDeHoje: 'Eulália Prado', assinatura: { nome: 'Eulália Prado' } })
    expect(r.linha).toBe('Eulália Prado')
    expect(r.assinadoComo).toBeNull()
  })

  it('a menor assinada pelo responsável: a linha é a do responsável, sem "assinado como" se nada mudou', () => {
    const nome = 'Marta Lima, responsável legal de Beatriz Lima'
    const r = nomesDaAssinatura({ assinanteDeHoje: nome, assinatura: { nome } })
    expect(r.linha).toBe(nome)
    expect(r.assinadoComo).toBeNull()
  })

  it('a assinar: vale o nome de hoje (a pessoa assina com os dados de agora)', () => {
    const r = nomesDaAssinatura({ assinanteDeHoje: 'Eulália Prado Souza', assinatura: null })
    expect(r.linha).toBe('Eulália Prado Souza')
    expect(r.assinadoComo).toBeNull()
  })

  it('a tela de assinatura usa a regra na linha de assinatura e no cabeçalho', () => {
    const t = ler('components/shared/tela-de-assinatura.tsx')
    expect(t).toContain('nomesDaAssinatura(')
    expect(t).toContain('nomeDoAssinante={nomes.linha}')
    expect(t).toContain('data-assinado-como')
  })
})
