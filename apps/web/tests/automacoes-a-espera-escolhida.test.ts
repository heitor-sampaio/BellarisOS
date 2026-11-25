import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'
import {
  nomeDoDeslocamento, partesDoDeslocamento, minutosDoDeslocamento, nomeQueAcompanhaODeslocamento,
} from '@/lib/automacoes/deslocamento'
import { caminhoDoFluxo } from '@/lib/automacoes/caminho-do-fluxo'
import { quandoChegarEm } from '@/lib/automacoes/tempo'

/**
 * A espera que a tela mostra é a ESCOLHIDA (princípio 3: "o que a tela mostra é
 * o que vale na conta"), e o prazo é da rede (princípios 1 e 2: "não recusar o
 * valor que a rede escolheu (… prazo)").
 *
 * - O lembrete de 3 horas aparecia na lista das Automações como "Um dia antes":
 *   o card dizia o nome do passo do modelo, que não acompanhava o deslocamento.
 * - O "Esperar até" só oferecia uma lista fixa (2 dias, 1 dia, 3 h, 1 h…): não
 *   havia "6 horas antes".
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

const lembreteCom = (minutos: number): GrafoDeAutomacao => {
  const g = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'lembrete-antes-do-agendamento')!.grafo()
  return { ...g, nos: g.nos.map(n => (n.tipo === NODES.ESPERA_ATE ? { ...n, config: { ...n.config, minutos } } : n)) }
}

describe('o deslocamento em palavras', () => {
  it('antes, depois e o momento exato', () => {
    expect(nomeDoDeslocamento(-180)).toBe('3 horas antes')
    expect(nomeDoDeslocamento(-1440)).toBe('1 dia antes')
    expect(nomeDoDeslocamento(-360)).toBe('6 horas antes')
    expect(nomeDoDeslocamento(-90)).toBe('90 minutos antes')
    expect(nomeDoDeslocamento(60)).toBe('1 hora depois')
    expect(nomeDoDeslocamento(4320)).toBe('3 dias depois')
    expect(nomeDoDeslocamento(0)).toBe('No momento exato')
  })
})

describe('D8: a lista das Automações diz a espera escolhida', () => {
  it('o lembrete de 3 horas diz "3 horas antes", não o nome do passo do modelo', () => {
    const caminho = caminhoDoFluxo(lembreteCom(-180))
    expect(caminho).toContain('3 horas antes')
    expect(caminho).not.toContain('Um dia antes')
  })
  it('a espera de duração diz a duração gravada', () => {
    const g = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'retorno-depois-do-atendimento')!.grafo()
    const com45 = { ...g, nos: g.nos.map(n => (n.tipo === NODES.ESPERA_DURACAO ? { ...n, config: { quantidade: 45, unidade: 'dias' as const } } : n)) }
    expect(caminhoDoFluxo(com45)).toContain('Esperar 45 dias')
  })
  it('a lista vem do caminho do fluxo de lib/automacoes', () => {
    expect(fonte('actions/automacoes.ts')).toMatch(/caminhoDoFluxo\(a\.grafo/)
    expect(fonte('actions/automacoes.ts')).toMatch(/from '@\/lib\/automacoes\/caminho-do-fluxo'/)
  })
  it('o nome do passo acompanha o deslocamento quando é o nome automático', () => {
    const g = lembreteCom(-1440)
    const espera = g.nos.find(n => n.tipo === NODES.ESPERA_ATE)!
    // O nome do modelo ("Um dia antes") passa a dizer o novo prazo.
    expect(nomeQueAcompanhaODeslocamento(espera, -180, g)).toBe('3 horas antes')
    // O nome que a rede escreveu fica.
    const daRede = { ...espera, nome: 'Véspera do horário' }
    expect(nomeQueAcompanhaODeslocamento(daRede, -180, { ...g, nos: g.nos.map(n => (n.id === espera.id ? daRede : n)) })).toBeNull()
  })
  it('o editor troca o nome junto com o deslocamento (renomearPasso, que conserta quem citava)', () => {
    const t = fonte('components/admin/automacoes/editor.tsx')
    expect(t).toMatch(/nomeQueAcompanhaODeslocamento\(/)
  })
})

describe('A27: o prazo do "Esperar até" é da rede', () => {
  it('6 horas antes se escreve e se grava', () => {
    expect(partesDoDeslocamento(-360)).toEqual({ quantidade: 6, unidade: 'horas', sentido: 'antes' })
    expect(minutosDoDeslocamento({ quantidade: 6, unidade: 'horas', sentido: 'antes' })).toBe(-360)
    expect(minutosDoDeslocamento({ quantidade: 2, unidade: 'dias', sentido: 'depois' })).toBe(2880)
    expect(minutosDoDeslocamento({ quantidade: 0, unidade: 'horas', sentido: 'antes' })).toBe(0)
    expect(partesDoDeslocamento(0)).toEqual({ quantidade: 0, unidade: 'horas', sentido: 'antes' })
  })
  it('o painel não tem mais a lista fixa de deslocamentos', () => {
    const t = fonte('components/admin/automacoes/painel-do-no.tsx')
    expect(t).not.toMatch(/<option value="-180">/)
    expect(t).toMatch(/minutosDoDeslocamento\(/)
  })
})

/**
 * O EXECUTOR lê o prazo gravado, no formato novo e no do menu antigo: os dois
 * são `config.minutos` (número; negativo = antes). A espera da primeira vez
 * (`executar.ts`) e a refeita na remarcação (`remarcacao.ts`) passam pela mesma
 * conta, `quandoChegarEm`.
 */
describe('A27: o executor espera o prazo escolhido (o livre e o do menu antigo)', () => {
  const agora = new Date('2026-11-25T12:00:00.000Z')
  const contexto = { evento: { dados: { agendadoPara: '2026-11-27T17:00:00.000Z' } } }
  const espera = (minutos: number) => quandoChegarEm({ campo: 'evento.dados.agendadoPara', minutos }, contexto, agora).data?.toISOString()

  it('o prazo livre: 6 horas antes, 45 minutos depois — do jeito que o painel grava', () => {
    expect(espera(minutosDoDeslocamento({ quantidade: 6, unidade: 'horas', sentido: 'antes' }))).toBe('2026-11-27T11:00:00.000Z')
    expect(espera(minutosDoDeslocamento({ quantidade: 45, unidade: 'minutos', sentido: 'depois' }))).toBe('2026-11-27T17:45:00.000Z')
    expect(espera(minutosDoDeslocamento({ quantidade: 0, unidade: 'horas', sentido: 'antes' }))).toBe('2026-11-27T17:00:00.000Z')
  })
  it('os do menu antigo (os gravados na produção: 1 dia e 3 horas antes) seguem valendo', () => {
    expect(espera(-1440)).toBe('2026-11-26T17:00:00.000Z')
    expect(espera(-180)).toBe('2026-11-27T14:00:00.000Z')
  })
  it('o prazo livre que já passou segue na hora, como o antigo', () => {
    expect(espera(minutosDoDeslocamento({ quantidade: 3, unidade: 'dias', sentido: 'antes' }))).toBeUndefined()
  })
  it('a primeira espera e a remarcação usam a mesma conta, com os minutos gravados', () => {
    expect(fonte('lib/automacoes/executar.ts')).toMatch(/quandoChegarEm\(cfg, contexto\)/)
    expect(fonte('lib/automacoes/remarcacao.ts')).toMatch(/quandoChegarEm\(cfg, contexto, agora\)/)
    expect(fonte('lib/automacoes/tempo.ts')).toMatch(/Number\(cfg\.minutos \?\? 0\) \* MINUTO/)
  })
})
