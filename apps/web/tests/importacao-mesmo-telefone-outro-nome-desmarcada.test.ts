import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linhasQueNaoJuntam } from '@/lib/importacao/o-que-entra'

/**
 * Importação de clientes: duas pessoas sem CPF no mesmo telefone (mãe e filha).
 * A prévia vinha MARCADA para juntar (completar a ficha de quem já existe, ou
 * juntar com a linha anterior), mesmo com nomes diferentes. O Heitor, 25/11,
 * escolheu "Vem desmarcada, a não ser que o nome case" (princípio 4, não
 * chutar): com outro nome a caixa vem desmarcada (a linha vira a ficha dela);
 * só vem marcada quando o nome também casa — a mesma comparação da importação
 * (`nomeDiferente`: sem caixa, acento e espaço a mais). Vale para completar a
 * ficha (IM-13) e para juntar com a linha anterior (IM-15). A escolha da
 * pessoa na prévia vence o padrão; o mesmo CPF junta sempre.
 */
const linha = (numero: number, name: string, mesmoTelefone?: { numero: number; nome: string }) =>
  ({ numero, dados: { name }, ...(mesmoTelefone ? { mesmoTelefone } : {}) })

describe('o mesmo telefone sem CPF e outro nome vem desmarcado', () => {
  it('completar a ficha pelo telefone: outro nome vem desmarcado, o mesmo nome (sem acento nem caixa) vem marcado', () => {
    const r = linhasQueNaoJuntam({
      prontas: [linha(2, 'Filha da Marlene'), linha(3, 'FILOMENA  SA'), linha(4, 'Ana da Planilha')],
      cruzados: [
        { numero: 2, nome: 'Marlene', como: 'telefone' },
        { numero: 3, nome: 'Filomena Sá', como: 'telefone' },
        { numero: 4, nome: 'Ana', como: 'cpf' },
      ],
      escolhas: new Map(),
    })
    expect([...r].sort()).toEqual([2])
  })

  it('juntar com a linha anterior do mesmo telefone (outro nome) vem desmarcado', () => {
    const r = linhasQueNaoJuntam({
      prontas: [linha(2, 'Bianca'), linha(3, 'Karina', { numero: 2, nome: 'Bianca' })],
      cruzados: [],
      escolhas: new Map(),
    })
    expect([...r]).toEqual([3])
  })

  it('a escolha da pessoa na prévia vence o padrão, nos dois sentidos', () => {
    const r = linhasQueNaoJuntam({
      prontas: [linha(2, 'Filha'), linha(3, 'Filomena'), linha(5, 'Karina', { numero: 4, nome: 'Bianca' })],
      cruzados: [
        { numero: 2, nome: 'Marlene', como: 'telefone' },
        { numero: 3, nome: 'Filomena', como: 'telefone' },
      ],
      escolhas: new Map([[2, true], [3, false], [5, true]]),
    })
    expect([...r]).toEqual([3])
  })

  it('a marca de juntar que vai ao servidor: só as linhas de outro nome que a pessoa marcou', async () => {
    const { linhasDeOutroNomeQueJuntam } = await import('@/lib/importacao/o-que-entra')
    const r = linhasDeOutroNomeQueJuntam({
      prontas: [linha(2, 'Filha'), linha(3, 'Filomena'), linha(4, 'Ana'), linha(5, 'Karina', { numero: 4, nome: 'Bianca' }), linha(6, 'Joana')],
      cruzados: [
        { numero: 2, nome: 'Marlene', como: 'telefone' },
        { numero: 3, nome: 'Filomena', como: 'telefone' },
        { numero: 4, nome: 'Outra', como: 'cpf' },
        { numero: 6, nome: 'Rita', como: 'telefone' },
      ],
      // A 3 casa o nome (não precisa da marca); a 4 é pelo CPF; a 6 ficou no padrão (desmarcada).
      escolhas: new Map([[2, true], [3, true], [4, true], [5, true]]),
    })
    expect(r).toEqual([2, 5])
  })

  it('a prévia parte desse padrão (não de "tudo marcado")', () => {
    const t = readFileSync(join(__dirname, '..', 'components/branch/importador-de-contatos.tsx'), 'utf8')
    expect(t).toMatch(/linhasQueNaoJuntam\(/)
    expect(t).not.toMatch(/useState<Set<number>>\(\(\) => new Set\(\)\)/)
  })
})
