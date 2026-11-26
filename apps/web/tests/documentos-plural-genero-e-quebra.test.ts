import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os textos dos documentos (A4 da 33ª; princípio 7 e o vocabulário):
 * - o link de três documentos já assinados dizia "Este documento já foi
 *   assinado" (o título já dizia "Documentos já assinados");
 * - "Faltam dados: CPF, Data de nascimento… · bloqueia o início" saía cortado
 *   no card da janela do agendamento (a situação não encolhia nem quebrava);
 * - "ele foi avisado" / "Você será avisado" para a cliente — sem gênero fixo.
 */

const WEB = join(__dirname, '..')
const ler = (c: string) => readFileSync(join(WEB, c), 'utf8')

describe('os textos dos documentos', () => {
  it('o link de vários documentos já assinados fala no plural', async () => {
    const { MENSAGEM_DOS_ASSINADOS, mensagemDoEstado } = await import('@/lib/documentos/link')
    expect(MENSAGEM_DOS_ASSINADOS).toBe('Estes documentos já foram assinados por este link. Se precisar de uma cópia, peça à equipe.')
    // O de um documento segue como está.
    expect(mensagemDoEstado('usado', null)).toBe('Este documento já foi assinado por este link. Se precisar de uma cópia, peça à equipe.')
    const pagina = ler('app/assinar/[token]/page.tsx')
    expect(pagina).toMatch(/espiada\.documentos > 1\s*\?\s*MENSAGEM_DOS_ASSINADOS/)
  })

  it('a situação do documento na janela do agendamento encolhe e quebra a linha, em vez de sair cortada', () => {
    const f = ler('components/branch/documentos-da-janela.tsx')
    const i = f.indexOf('{d.situacao}')
    expect(i).toBeGreaterThan(0)
    const span = f.slice(f.lastIndexOf('<span', i), i)
    expect(span).not.toMatch(/flexShrink:\s*0/)
    expect(span).toMatch(/minWidth:\s*0/)
    expect(span).toMatch(/overflowWrap:\s*'anywhere'/)
  })

  it('a cliente não é "ele" nem "avisado"', () => {
    expect(ler('components/shared/termos-do-cliente.tsx')).not.toMatch(/ele foi avisado/)
    expect(ler('components/shared/tela-de-assinatura.tsx')).not.toMatch(/Você será avisado/)
  })
})
