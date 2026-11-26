import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODULE_LEVELS } from '@/lib/permissions'
import type { AppModule, PermissionLevel } from '@estetica-os/types'

/**
 * D8 da 34ª simulação (princípio 3: o que a tela mostra é o que vale): o
 * modelo "Gerente" nascia com o Copilot em Gerenciar, nível que o módulo não
 * tem (`MODULE_LEVELS.copilot = ['NONE','VIEW']`, Q02 da revisão de 24/11). A
 * tela de Cargos mostrava "Ver" (`nivelAceito`) e o banco guardava outro. O
 * modelo nasce no nível que o módulo oferece, e o cargo já gravado com um
 * nível que o módulo não tem passa ao que a tela mostra.
 */

const PASTA = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migrations = readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort()
const ler = (f: string) => readFileSync(join(PASTA, f), 'utf8')
const FUNCAO = 'private.cargos_modelo_semear'

/** O corpo que vale: a última definição inteira, com as trocas de trecho feitas depois dela. */
function corpoQueVale(): string {
  const i = migrations.map(ler).map((s, n) => (s.includes(`create or replace function ${FUNCAO}`) ? n : -1))
    .filter(n => n >= 0).pop()
  if (i === undefined) throw new Error(`nenhuma migration define ${FUNCAO}`)
  let corpo = ler(migrations[i]!)
  const troca = new RegExp(
    `pg_temp\\.trocar_no_corpo\\(\\s*'${FUNCAO.replace('.', '\\.')}\\(uuid, uuid, text\\)'::regprocedure,\\s*` +
    `array\\[([\\s\\S]*?)\\],\\s*array\\[([\\s\\S]*?)\\],\\s*array\\[[^\\]]*\\]\\s*\\)`, 'g')
  const trechos = (lista: string) => [...lista.matchAll(/\$t\$([\s\S]*?)\$t\$/g)].map(m => m[1] ?? '')
  for (const f of migrations.slice(i + 1)) {
    for (const m of ler(f).matchAll(troca)) {
      const de = trechos(m[1] ?? '')
      const para = trechos(m[2] ?? '')
      de.forEach((d, k) => {
        expect(corpo, `${f}: o trecho ${k + 1} não está no corpo`).toContain(d)
        corpo = corpo.split(d).join(para[k] ?? '')
      })
    }
  }
  return corpo
}

function matrizes(sql: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const m of sql.matchAll(/when '([A-Z_]+)' then '\{([^}]*)\}'::jsonb/g)) {
    out[m[1]!] = Object.fromEntries(
      [...(m[2] ?? '').matchAll(/"([a-z_]+)":\["([A-Z]+)"/g)].map(x => [x[1]!, x[2]!]))
  }
  return out
}

describe('os modelos de cargo nascem nos níveis que cada módulo oferece', () => {
  const modelos = matrizes(corpoQueVale())

  it('lê os quatro modelos', () => {
    expect(Object.keys(modelos).sort()).toEqual(['BRANCH_ADMIN', 'FINANCIAL', 'PROFESSIONAL', 'RECEPTIONIST'])
  })

  it('nenhum módulo de nenhum modelo nasce num nível que o módulo não tem', () => {
    const fora: string[] = []
    for (const [modelo, matriz] of Object.entries(modelos)) {
      for (const [modulo, nivel] of Object.entries(matriz)) {
        const aceita = MODULE_LEVELS[modulo as AppModule] ?? []
        if (!aceita.includes(nivel as PermissionLevel)) fora.push(`${modelo}.${modulo}=${nivel}`)
      }
    }
    expect(fora).toEqual([])
  })

  it('o modelo BRANCH_ADMIN nasce com o Copilot em Ver', () => {
    expect(modelos.BRANCH_ADMIN?.copilot).toBe('VIEW')
  })
})

describe('os cargos já gravados passam ao nível que a tela mostra', () => {
  const soAteVer = (Object.keys(MODULE_LEVELS) as AppModule[])
    .filter(m => MODULE_LEVELS[m].includes('VIEW') && !MODULE_LEVELS[m].includes('MANAGE'))

  it('o Gerenciar gravado num módulo que só vai até o Ver vira Ver, em todos esses módulos', () => {
    const sql = migrations.filter(m => m >= '20261213500001').map(ler).join('\n')
    const m = /update public\.role_permissions\s+set level = 'VIEW'\s+where level = 'MANAGE'\s+and module in \(([^)]*)\)/.exec(sql)
    expect(m, 'falta o update do Gerenciar para o Ver').not.toBeNull()
    const listados = [...(m![1] ?? '').matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort()
    expect(listados).toEqual([...soAteVer].sort())
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
