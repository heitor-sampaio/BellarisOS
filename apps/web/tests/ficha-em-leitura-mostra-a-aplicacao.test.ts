import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A19 da 35ª simulação (princípio 3; atendimento.md, "A aplicação registrada
 * por Planejamento → Injetáveis chega à ficha", D6 da 7ª): o Dr. Anselmo (o
 * Atendimento em Gerenciar e o Prontuário em Ver) registrou a aplicação pela
 * sub-aba do mapa; a ficha de atendimento dele é de LEITURA (escrever é do
 * Prontuário em Gerenciar), e o campo do planejador, vazio, dizia "Nenhum ponto
 * marcado". Na edição, o campo vazio abre sozinho o planejamento com a
 * aplicação deste atendimento (`abrirOAplicado`); na leitura, nada.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('o campo do planejador em leitura, no atendimento em aberto, mostra a aplicação registrada', () => {
  it('o campo vazio abre o planejamento aplicado neste atendimento, como na edição', () => {
    const f = fonte('components/branch/anamnesis-form-renderer.tsx')
    const i = f.indexOf("if (f.type === 'injectable_map') {")
    const ramo = f.slice(i, f.indexOf('\n  }\n', i))
    expect(ramo).toMatch(/linkDoPlanejamento\?\.aoVivo|injetaveis\?\.aoVivo/)
    expect(ramo).toMatch(/<PlanejadorEmLeitura /)
    const i2 = f.indexOf('function PlanejadorEmLeitura(')
    const fim = f.indexOf('const dicaStyle', i2)
    expect(f.slice(i2, fim)).toMatch(/<PlanejamentoInjetaveis[\s\S]*onAbrir=\{setAberto\} abrirOAplicado/)
  })
  it('a tela do atendimento diz ao formulário quando o atendimento está em aberto', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    const n = (s.match(/planejadorAoVivo=\{!editLocked\}/g) ?? []).length
    expect(n).toBe(2)
  })
})
