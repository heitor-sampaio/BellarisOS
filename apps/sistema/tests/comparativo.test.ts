import { describe, it, expect } from 'vitest'
import { comparativoDosPlanos, type CelulaDoComparativo } from '@/lib/planos/comparativo'
import { FUNCIONALIDADES, LIMITES, TUDO_LIBERADO, type RecursosDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O comparativo dos planos (2026-10-07, pedido do Heitor): tudo o que cada
 * plano inclui, numa tabela — uma coluna por plano, uma linha por item. A
 * montagem é pura (aqui); a tela só desenha.
 */
const basico: RecursosDoPlano = {
  funcionalidades: ['agenda', 'inbox'],
  limites: { unidades: 1, membros: null, whatsapp: 1 },
  adicionais: { whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 9900 } },
}
const planos = [
  { id: 'a', nome: 'Básico', valorCentavos: 19900, ativo: true, recursos: basico },
  { id: 'b', nome: 'Completo', valorCentavos: 49900, ativo: false, recursos: TUDO_LIBERADO },
]
const c = comparativoDosPlanos(planos)
const linha = (rotulo: string) => c.secoes.flatMap(s => s.linhas).find(l => l.rotulo === rotulo)!
const texto = (x: CelulaDoComparativo) => x.tipo === 'texto' ? x.texto.replace(/\s/g, ' ') : x.tipo

describe('comparativoDosPlanos', () => {
  it('uma coluna por plano, na ordem dada, com a situação', () => {
    expect(c.planos.map(p => [p.nome, p.ativo])).toEqual([['Básico', true], ['Completo', false]])
  })
  it('o preço vem primeiro, formatado', () => {
    expect(c.secoes[0]!.titulo).toBe('Preço')
    expect(linha('Valor mensal').celulas.map(texto)).toEqual(['R$ 199,00', 'R$ 499,00'])
  })
  it('toda funcionalidade do catálogo, por grupo, incluída ou não; o Copilot já lançado', () => {
    const rotulos = c.secoes.flatMap(s => s.linhas).map(l => l.rotulo)
    for (const f of FUNCIONALIDADES) expect(rotulos).toContain(f.rotulo)
    expect(linha('Agenda').celulas.map(x => x.tipo)).toEqual(['sim', 'sim'])
    expect(linha('Pacotes').celulas.map(x => x.tipo)).toEqual(['nao', 'sim'])
    // Lançado em 2026-10-08: sem o "em breve".
    expect(linha('Copilot (IA secretária)').emBreve).toBeUndefined()
    expect(c.secoes.map(s => s.titulo)).toContain('Atendimento')
  })
  it('os limites: o número ou "Ilimitado"', () => {
    for (const l of LIMITES) expect(linha(l.rotulo)).toBeDefined()
    expect(linha('Unidades').celulas.map(texto)).toEqual(['1', 'Ilimitado'])
    expect(linha('Membros da equipe').celulas.map(texto)).toEqual(['Ilimitado', 'Ilimitado'])
  })
  it('os adicionais à venda: o preço, "não oferece", ou já incluído no plano', () => {
    expect(linha('Conexão de WhatsApp adicional').celulas.map(texto)).toEqual(['R$ 49,00 por conexão', 'Ilimitado no plano'])
    expect(linha('Copilot (IA secretária) avulso').celulas.map(texto)).toEqual(['R$ 99,00 por mês', 'Incluído no plano'])
    const semOferta = comparativoDosPlanos([{ ...planos[0]!, recursos: { ...basico, adicionais: {} } }])
    const w = semOferta.secoes.flatMap(s => s.linhas).find(l => l.rotulo === 'Conexão de WhatsApp adicional')!
    expect(w.celulas.map(x => x.tipo)).toEqual(['nao'])
  })
})
