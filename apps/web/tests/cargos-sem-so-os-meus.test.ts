import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sem o "só os meus" (SM1, o Heitor, 2026-11-23), o cargo que tinha um módulo
 * em "só os meus" passaria a ver TUDO dele. O Heitor, 23/11, à pergunta do
 * Claude: o Financeiro "só os meus" e a Agenda "só os meus" viram Sem acesso
 * (o que a pessoa via é a vista pessoal: as Minhas comissões e a Minha
 * agenda); o resto (Atendimento, Prontuário, CRM, Relatórios) fica com o nível
 * e vale "todos" (cada passo, um módulo). Vale para os cargos de hoje e para
 * os modelos da rede nova.
 */

const PASTA = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migrations = readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort()
const ler = (f: string) => readFileSync(join(PASTA, f), 'utf8')

function ultimaQueDefine(funcao: string): string {
  const f = [...migrations].reverse().find(m => ler(m).includes(`create or replace function ${funcao}`))
  if (!f) throw new Error(`nenhuma migration define ${funcao}`)
  return ler(f)
}

function matrizDo(sql: string, chave: string): string {
  const m = new RegExp(`when '${chave}' then '\\{([^}]*)\\}'`).exec(sql)
  if (!m) throw new Error(`sem a matriz do ${chave}`)
  return m[1] ?? ''
}

describe('os modelos de cargo nascem sem "só os meus"', () => {
  const sql = ultimaQueDefine('private.cargos_modelo_semear')

  it('nenhum módulo de nenhum modelo nasce "só os meus"', () => {
    expect(sql).not.toContain('"OWN"')
  })

  it('os modelos RECEPTIONIST e PROFESSIONAL nascem sem o Financeiro (as Minhas comissões são a vista pessoal)', () => {
    expect(matrizDo(sql, 'RECEPTIONIST')).not.toContain('"financial"')
    expect(matrizDo(sql, 'PROFESSIONAL')).not.toContain('"financial"')
  })

  it('o modelo PROFESSIONAL nasce sem a Agenda (a Minha agenda) e com o Atendimento e o Prontuário em Gerenciar', () => {
    const p = matrizDo(sql, 'PROFESSIONAL')
    expect(p).not.toContain('"agenda"')
    expect(p).toContain('"atendimento":["MANAGE","ALL"]')
    expect(p).toContain('"medical_records":["MANAGE","ALL"]')
  })
})

describe('os cargos de hoje perdem o "só os meus"', () => {
  const sql = migrations.filter(m => m >= '20261129').map(ler).join('\n')

  it('o Financeiro e a Agenda "só os meus" viram Sem acesso, e todo escopo vira "todos"', () => {
    expect(sql).toMatch(/set level = 'NONE'[\s\S]*module in \('financial', 'agenda'\)[\s\S]*scope = 'OWN'/)
    expect(sql).toMatch(/update public\.role_permissions\s+set scope = 'ALL'/)
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
