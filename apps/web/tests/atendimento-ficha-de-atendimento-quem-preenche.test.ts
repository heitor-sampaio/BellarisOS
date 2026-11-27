import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A15 da 35ª simulação (AT-05: o aviso vem antes e diz quem faz; FI-07: a
 * obrigatória em branco barra o "Finalizar"): o Dr. Anselmo (o Atendimento em
 * Gerenciar e o Prontuário em Ver) via "Falta preencher "Tipo de pele" na
 * ficha de atendimento." só DEPOIS de "Confirmar conclusão" (a recusa do
 * servidor), e sem dizer quem preenche. A ficha de saúde já barrava antes, na
 * janela "O que falta para finalizar", com quem responde. A ficha de
 * atendimento em leitura não conferia nada: `validar` devolvia vazio.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('a ficha de atendimento em leitura confere as obrigatórias antes do "Confirmar conclusão"', () => {
  it('o validar do formulário em leitura devolve o que falta (sem marcar campo)', () => {
    const f = fonte('components/branch/anamnesis-form-renderer.tsx')
    const i = f.indexOf('function validar(')
    const corpo = f.slice(i, f.indexOf('\n  }\n', i))
    expect(corpo).not.toMatch(/if \(!canEdit\) return \{\}/)
    expect(corpo).toMatch(/if \(!canEdit\) \{/)
  })
  it('o texto de quem preenche é o da permissão, com os nomes', async () => {
    const { textoDeQuemPreencheAFicha } = await import('@/lib/atendimento/obrigatorias')
    expect(textoDeQuemPreencheAFicha(['Rosana'])).toBe('Quem preenche a ficha de atendimento é quem tem o Prontuário em Gerenciar (Rosana).')
    expect(textoDeQuemPreencheAFicha(['Rosana', 'Ernestina'])).toBe('Quem preenche a ficha de atendimento é quem tem o Prontuário em Gerenciar (Rosana e Ernestina).')
    expect(textoDeQuemPreencheAFicha([])).toBe('Quem preenche a ficha de atendimento é quem tem o Prontuário em Gerenciar.')
  })
  it('a janela diz quem responde a ficha de saúde e quem preenche a de atendimento, cada uma na sua falta', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    const i = s.indexOf('function OQueFaltaParaFinalizar')
    const janela = s.slice(i, s.indexOf('\nfunction ', i + 10))
    expect(janela).toMatch(/data-quem-preenche-a-ficha/)
    expect(janela).toMatch(/textoDeQuemPreencheAFicha\(quemResponde\)/)
    expect(janela).toMatch(/faltaNaSaude && \(/)
    expect(janela).toMatch(/faltaNaFicha && \(/)
  })
})
