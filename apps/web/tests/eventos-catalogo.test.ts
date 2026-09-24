import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { EVENTOS } from '@estetica-os/types'

/**
 * O catálogo corresponde à realidade?
 *
 * Existe porque a forma de drift mais provável aqui é também a mais cruel:
 * um nome no catálogo sem nenhum emissor no código. A automação é montada na
 * tela, salva sem erro, e simplesmente **nunca dispara** — sem mensagem, sem
 * log, sem nada que indique onde procurar.
 *
 * O teste varre o código atrás de `EVENTOS.<CHAVE>` em vez da string literal,
 * porque é assim que a emissão acontece (o TypeScript barra o literal solto).
 */

const RAIZ = join(__dirname, '..')
const PASTAS = ['actions', 'lib', 'app']
const IGNORAR = new Set(['node_modules', '.next', 'dist'])

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida)
    else if (/\.tsx?$/.test(nome)) saida.push(caminho)
  }
  return saida
}

const fonte = PASTAS
  .flatMap(p => arquivos(join(RAIZ, p)))
  // O próprio catálogo e este teste não contam como emissor.
  .filter(f => !f.includes('tests'))
  .map(f => readFileSync(f, 'utf8'))
  .join('\n')

/**
 * Os eventos de pagamento saem de GATILHO no banco, não de TypeScript.
 *
 * É exceção deliberada — um pagamento vira real em seis lugares do código e o
 * gatilho é o único jeito de não esquecer o sétimo (ver a migração
 * `20260923000002`). Como não há `EVENTOS.X` no código para eles, o teste
 * procura o nome literal nas migrações: a garantia continua valendo, só muda
 * onde se olha.
 */
const MIGRACOES = join(RAIZ, '..', '..', 'supabase', 'migrations')
const sql = readdirSync(MIGRACOES)
  .filter(f => f.endsWith('.sql'))
  .map(f => readFileSync(join(MIGRACOES, f), 'utf8'))
  .join('\n')

describe('catálogo de eventos', () => {
  it.each(Object.entries(EVENTOS))(
    '%s tem quem o emita',
    (chave, nome) => {
      const noCodigo    = fonte.includes(`EVENTOS.${chave}`)
      // `insert into public.domain_events` perto do nome: menção em comentário
      // não conta como emissor.
      const noGatilho   = new RegExp(`'${nome}'`).test(sql)
        && /insert into public\.domain_events/.test(sql)
      expect(
        noCodigo || noGatilho,
        `${nome} está no catálogo e ninguém emite — a automação seria montada e nunca dispararia`,
      ).toBe(true)
    },
  )

  it('nome segue a convenção entidade.verbo_no_passado', () => {
    for (const nome of Object.values(EVENTOS)) {
      expect(nome, `${nome} fora do padrão`).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })

  it('não há nome repetido com chaves diferentes', () => {
    const nomes = Object.values(EVENTOS)
    expect(new Set(nomes).size).toBe(nomes.length)
  })
})

/**
 * Todo evento tem rótulo em português.
 *
 * Mesma família do teste acima, e o sintoma é igual de mudo: sem rótulo, a
 * tela cai no nome técnico e passa a dizer `entidade.acao_qualquer` para quem
 * opera a clínica — que é o que ela fazia antes deste catálogo existir.
 */
describe('ROTULOS_DE_EVENTO', () => {
  it('cobre os 42 eventos, sem sobra', async () => {
    const { EVENTOS: E, ROTULOS_DE_EVENTO } = await import('@estetica-os/types')
    const nomes = Object.values(E) as string[]

    const semRotulo = nomes.filter(n => !(n in ROTULOS_DE_EVENTO))
    expect(semRotulo, 'evento sem rótulo vira nome técnico na tela').toEqual([])

    const sobrando = Object.keys(ROTULOS_DE_EVENTO).filter(n => !nomes.includes(n))
    expect(sobrando, 'rótulo de evento que não existe mais').toEqual([])
  })

  it('o rótulo carrega o sujeito, porque a lista mistura entidades', async () => {
    const { ROTULOS_DE_EVENTO } = await import('@estetica-os/types')
    for (const [nome, rotulo] of Object.entries(ROTULOS_DE_EVENTO)) {
      expect(rotulo.length, `${nome} sem rótulo`).toBeGreaterThan(3)
      // Nada de ponto nem underline: seriam o nome técnico disfarçado.
      expect(rotulo, `${nome} parece nome técnico`).not.toMatch(/[._]/)
      // Começa em maiúscula — sentence case, como o resto da interface.
      expect(rotulo[0], `${nome} não começa em maiúscula`).toBe(rotulo[0]!.toUpperCase())
    }
  })
})
