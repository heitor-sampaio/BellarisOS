import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  limpezaAdiada, adiarRede, lerRegistro, redeAdiada, esvaziarRegistro,
  ehRedeDeTeste, redesDaVarredura, loginDeTeste,
} from '../e2e/apoio/limpeza-adiada'

/**
 * A limpeza do E2E ADIADA para o fim da completa (F25, 2026-11-05).
 *
 * As duas completas de 2026-11-04/05 travaram o Supabase da produção com a
 * própria limpeza: ~17 mil DELETEs pelo PostgREST no meio da rodada, cada
 * `afterAll` apagando a rede de teste dele enquanto os outros testes rodavam.
 * Agora, na completa, a rede de teste é só ANOTADA, e sai inteira no fim.
 *
 * O que estes testes travam: o que é adiado (só na completa, só a rede
 * anotada), o que a varredura apaga e o que ela NUNCA apaga — as redes [sim]
 * da simulação e as reais.
 */

const UMA = '11111111-1111-4111-8111-111111111111'
const OUTRA = '22222222-2222-4222-8222-222222222222'

describe('o que é adiado', () => {
  let dir: string
  let antes: string | undefined
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-limpeza-'))
    antes = process.env.E2E_LIMPEZA_ADIADA
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (antes === undefined) delete process.env.E2E_LIMPEZA_ADIADA
    else process.env.E2E_LIMPEZA_ADIADA = antes
  })

  it('só a completa adia: sem E2E_LIMPEZA_ADIADA=1, o spec avulso limpa na hora', () => {
    expect(limpezaAdiada({})).toBe(false)
    expect(limpezaAdiada({ E2E_LIMPEZA_ADIADA: '0' })).toBe(false)
    expect(limpezaAdiada({ E2E_LIMPEZA_ADIADA: '1' })).toBe(true)
  })

  it('a rede anotada fica no registro, uma vez só, e as anotações de vários processos somam', () => {
    adiarRede(UMA, dir)
    adiarRede(UMA, dir)
    fs.writeFileSync(path.join(dir, 'redes-outro-processo.txt'), `${OUTRA}\nlixo que não é id\n\n`)
    expect(lerRegistro(dir).sort()).toEqual([UMA, OUTRA].sort())
  })

  it('redeAdiada: só com a completa ligada e só a rede anotada', () => {
    adiarRede(UMA, dir)
    delete process.env.E2E_LIMPEZA_ADIADA
    expect(redeAdiada(UMA, dir), 'fora da completa, nada é adiado').toBe(false)
    process.env.E2E_LIMPEZA_ADIADA = '1'
    expect(redeAdiada(UMA, dir)).toBe(true)
    expect(redeAdiada(OUTRA, dir), 'a rede que não foi anotada limpa na hora').toBe(false)
    expect(redeAdiada(null, dir), 'membro da rede real (sem tenant) limpa na hora').toBe(false)
  })

  it('o registro sem pasta é vazio, e esvaziar tira só o que saiu', () => {
    expect(lerRegistro(path.join(dir, 'nao-existe'))).toEqual([])
    adiarRede(UMA, dir)
    adiarRede(OUTRA, dir)
    esvaziarRegistro(dir, [OUTRA])
    expect(lerRegistro(dir), 'a rede que não saiu continua anotada').toEqual([OUTRA])
    esvaziarRegistro(dir, [])
    expect(lerRegistro(dir)).toEqual([])
  })
})

describe('o que a varredura apaga e o que ela NUNCA apaga', () => {
  const agora = new Date('2026-11-05T12:00:00Z')
  const velha = '2026-11-05T09:00:00Z'
  const nova = '2026-11-05T11:30:00Z'
  const rede = (name: string, created_at = velha, slug = 'x', email: string | null = null) =>
    ({ id: `${name}|${created_at}`, name, slug, email, created_at })

  it('é rede de teste: o prefixo [e2e], ou o endereço e o e-mail que o criarOutraRede dá', () => {
    expect(ehRedeDeTeste({ name: '[e2e] Outra rede abc', slug: 'e2e-outra-abc', email: 'e2e-outra-abc@bellaris.invalid' })).toBe(true)
    expect(ehRedeDeTeste({ name: '[e2e] Rede dona x', slug: 'qualquer', email: null })).toBe(true)
    // Renomeada pela tela (o nome é dado da clínica): o endereço e o e-mail de teste seguram.
    expect(ehRedeDeTeste({ name: 'Clínica Renomeada', slug: 'e2e-outra-abc', email: 'e2e-outra-abc@bellaris.invalid' })).toBe(true)
  })

  it('NUNCA: as redes [sim] da simulação, nem com endereço e e-mail de teste', () => {
    for (const name of ['[sim] Clínica Aurora', '[sim] Clínica Lótus', '[sim] Clínica Jasmim', '[sim] Rede Magnólia', '[sim] Clínica Begônia', '[sim] Clínica Camélia']) {
      expect(ehRedeDeTeste({ name, slug: 'sim-clinica', email: 'sim-dona@bellaris.invalid' }), name).toBe(false)
      expect(ehRedeDeTeste({ name, slug: 'e2e-outra-x', email: 'e2e-outra-x@bellaris.invalid' }), `${name} com cara de teste`).toBe(false)
    }
  })

  it('NUNCA: as redes reais, nem com [e2e] no meio do nome ou só o endereço de teste', () => {
    expect(ehRedeDeTeste({ name: 'Bellaris Clinic', slug: 'bellaris', email: 'admin@bellarisos.com' })).toBe(false)
    expect(ehRedeDeTeste({ name: 'AgapeFlow', slug: 'gmail-4165cb', email: 'consultor@gmail.com' })).toBe(false)
    expect(ehRedeDeTeste({ name: 'Clínica [e2e]', slug: 'clinica', email: null })).toBe(false)
    expect(ehRedeDeTeste({ name: '[E2E] maiúsculo', slug: 'x', email: null })).toBe(false)
    expect(ehRedeDeTeste({ name: 'Clínica', slug: 'e2e-clinica', email: 'dona@clinica.com.br' }), 'o endereço sozinho não basta').toBe(false)
    expect(ehRedeDeTeste({ name: 'Clínica', slug: 'clinica', email: 'e2e-x@bellaris.invalid' }), 'o e-mail sozinho não basta').toBe(false)
  })

  it('a varredura leva a rede de teste com mais de N minutos; a mais nova é de uma rodada em curso', () => {
    const lista = [
      rede('[e2e] Outra rede velha'),
      rede('[e2e] Outra rede nova', nova),
      rede('[sim] Clínica Aurora'),
      rede('Bellaris Clinic', '2026-07-08T00:00:00Z', 'bellaris'),
    ]
    expect(redesDaVarredura(lista, agora, 60)).toEqual([lista[0]!.id])
    expect(redesDaVarredura(lista, agora, 10), 'com 10 min, a nova também').toEqual([lista[0]!.id, lista[1]!.id])
  })

  it('o login que a limpeza apaga é só o de teste', () => {
    expect(loginDeTeste('e2e-membro-abc@bellaris.invalid')).toBe(true)
    expect(loginDeTeste('e2e-cv1abc@bellaris.invalid')).toBe(true)
    expect(loginDeTeste('qualquer@exemplo.invalid')).toBe(true)
    expect(loginDeTeste('admin@bellaris.com.br')).toBe(false)
    expect(loginDeTeste('heitor@gmail.com')).toBe(false)
    expect(loginDeTeste(null)).toBe(false)
  })
})
