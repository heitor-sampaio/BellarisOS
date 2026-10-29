import { describe, it, expect } from 'vitest'
import { nomeParaSaudar, mensagemDoLink, boasVindas } from '@/lib/saudacao'

// D19 da simulação de 2026-10-29: o link da ficha para a "Dona Ivone Becker"
// dizia "Olá, Dona! … confirme o seu data de nascimento". O mesmo texto ia no
// link de assinatura de documento.
describe('o nome para saudar a cliente', () => {
  it('pula o tratamento (Dona, Sr., Dra.…) e saúda pelo nome', () => {
    expect(nomeParaSaudar('Dona Ivone Becker')).toBe('Ivone')
    expect(nomeParaSaudar('dona ivone')).toBe('ivone')
    expect(nomeParaSaudar('Sr. João Silva')).toBe('João')
    expect(nomeParaSaudar('Sra Maria')).toBe('Maria')
    expect(nomeParaSaudar('Dra. Lívia Ramos')).toBe('Lívia')
    expect(nomeParaSaudar('Dr Paulo')).toBe('Paulo')
    expect(nomeParaSaudar('Seu Antônio')).toBe('Antônio')
    expect(nomeParaSaudar('Prof. Carla Dias')).toBe('Carla')
    expect(nomeParaSaudar('  Gabriel   Moura ')).toBe('Gabriel')
  })
  it('só o tratamento, ou nada: sem nome (a frase não diz "Olá, Dona!")', () => {
    expect(nomeParaSaudar('Dona')).toBe('')
    expect(nomeParaSaudar('')).toBe('')
    expect(nomeParaSaudar(null)).toBe('')
  })
  it('um nome que só começa como tratamento continua sendo nome', () => {
    expect(nomeParaSaudar('Donato Alves')).toBe('Donato')
    expect(nomeParaSaudar('Drauzio Lima')).toBe('Drauzio')
  })
})

describe('o texto do link', () => {
  const base = { pedido: 'Clínica Lótus mandou a sua ficha de pré-atendimento.', acao: 'Para responder', dias: 7, url: 'https://x/y' }
  it('saúda pelo nome e concorda: "o seu CPF", "a sua data de nascimento"', () => {
    const comNascimento = mensagemDoLink({ ...base, nome: 'Dona Ivone Becker', temCpf: false })
    expect(comNascimento).toMatch(/^Olá, Ivone! Clínica Lótus mandou/)
    expect(comNascimento).toContain('confirme a sua data de nascimento.')
    expect(comNascimento).not.toContain('o seu data')
    expect(mensagemDoLink({ ...base, nome: 'Gabriel Moura', temCpf: true })).toContain('confirme o seu CPF.')
  })
  it('sem nome que sirva, só "Olá!"', () => {
    expect(mensagemDoLink({ ...base, nome: 'Dona', temCpf: true })).toMatch(/^Olá! Clínica/)
  })
})

// D17: o portal dizia "Bem-vinda ao seu espaço pessoal" ao Gabriel (Masculino).
describe('as boas-vindas do portal', () => {
  it('pelo sexo da ficha; sem sexo, neutro', () => {
    expect(boasVindas('F')).toBe('Bem-vinda')
    expect(boasVindas('M')).toBe('Bem-vindo')
    expect(boasVindas(null)).toBe('Boas-vindas')
    expect(boasVindas('O')).toBe('Boas-vindas')
  })
})
