import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { destinoDeCadaLinha, linhasQueJuntamNaPlanilha } from '@/lib/importacao/o-que-entra'

/**
 * A prévia da importação diz o destino de CADA linha (A13 da 33ª simulação;
 * crm-inbox:IM-12 — "quem cada linha encontra na rede e por quê"). Ela listava
 * só as três primeiras ("Como as primeiras entram"), sem o destino. Agora cada
 * linha pronta diz o que vira: ficha (ou contato) nova, completa a ficha de X
 * (o mesmo CPF / telefone), junta com a linha N — pela mesma conta do botão
 * "Importar N linhas: …".
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o destino de cada linha, na prévia', () => {
  it('clientes: ficha nova, completa a ficha que existe (CPF, telefone) e junta com a linha da planilha', () => {
    const prontas = [
      { numero: 2, dados: { name: 'Ana', phone: '85999990001' } },
      { numero: 3, dados: { name: 'Bia', phone: '85999990002' } },
      { numero: 4, dados: { name: 'Carla', phone: '85999990003' } },
      { numero: 5, dados: { name: 'Dora', phone: '85999990004' } },
      { numero: 6, dados: { name: 'Eva', phone: '85999990001' }, mesmoTelefone: { numero: 2, nome: 'Ana' } },
      { numero: 7, dados: { name: 'Fê', phone: '85999990001' }, mesmoTelefone: { numero: 2, nome: 'Ana' } },
    ]
    const cruzados = [
      { numero: 3, nome: 'Beatriz', como: 'cpf' as const },
      { numero: 4, nome: 'Carla S.', como: 'telefone' as const },
      { numero: 5, nome: 'Dalva', como: 'telefone' as const },
    ]
    const naoCompletar = new Set([5, 6])
    const d = destinoDeCadaLinha({ destino: 'clientes', prontas, cruzados, naoCompletar })
    expect(d.get(2)).toBe('ficha nova')
    expect(d.get(3)).toBe('completa a ficha de Beatriz (o mesmo CPF)')
    expect(d.get(4)).toBe('completa a ficha de Carla S. (o mesmo telefone)')
    expect(d.get(5)).toBe('ficha nova (o mesmo telefone de Dalva)')
    expect(d.get(6)).toBe('ficha nova (o mesmo telefone da linha 2)')
    expect(d.get(7)).toBe('junta com a linha 2 · Ana (o mesmo telefone)')
    // A mesma conta do botão: as que juntam na planilha são as que a prévia diz.
    const juntam = linhasQueJuntamNaPlanilha('clientes', prontas, new Set(cruzados.map(c => c.numero)), naoCompletar)
    expect(juntam).toEqual([...d].filter(([, t]) => t.startsWith('junta com a linha')).map(([n]) => n))
  })

  it('contatos: contato novo, junta com quem existe (telefone, e-mail), junta com a linha, e o sem telefone', () => {
    const prontas = [
      { numero: 2, dados: { name: 'Ana', phone: '85999990001' } },
      { numero: 3, dados: { name: 'Bia', phone: '85999990001' } },
      { numero: 4, dados: { name: 'Carla', phone: '85999990003' } },
      { numero: 5, dados: { name: 'Dora', email: 'dora@exemplo.invalid' } },
      { numero: 6, dados: { name: 'Eva', email: 'eva@exemplo.invalid' } },
    ]
    const cruzados = [
      { numero: 4, nome: 'Carla Souza', como: 'telefone' as const },
      { numero: 5, nome: 'Dora', como: 'email' as const },
    ]
    const d = destinoDeCadaLinha({ destino: 'contatos', prontas, cruzados, naoCompletar: new Set() })
    expect(d.get(2)).toBe('contato novo')
    expect(d.get(3)).toBe('junta com a linha 2 (o mesmo telefone)')
    expect(d.get(4)).toBe('junta com Carla Souza (o mesmo telefone)')
    expect(d.get(5)).toBe('junta com Dora (o mesmo e-mail)')
    expect(d.get(6)).toBe('contato novo, sem telefone (entra só com o e-mail)')
  })

  it('a prévia lista TODAS as linhas prontas, com o destino, e não só as três primeiras', () => {
    const tela = fonte('components/branch/importador-de-contatos.tsx')
    expect(tela).toMatch(/destinoDeCadaLinha\(/)
    expect(tela).toMatch(/data-destino-da-linha/)
    expect(tela).not.toMatch(/Como as primeiras entram/)
    expect(tela).not.toMatch(/\.filter\(l => !l\.erros\.length\)\.slice\(0, 3\)/)
    expect(tela).toMatch(/data-mostrar-mais-linhas/)
  })
})
