import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * PT-04 (catálogo do Atendimento): "A mesma pessoa relendo a mesma cliente no
 * mesmo ponto em 30 minutos é um registro só". O layout e a página renderizam
 * em paralelo (CLAUDE.md §6): sem trava, as duas chamadas gravavam. A
 * referência não entra na conta (decisão do Claude, 25/11).
 */
const PASTA = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaQueMexe(nome: string): { arquivo: string; texto: string } {
  const arquivos = readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort()
  for (const f of arquivos.reverse()) {
    const t = readFileSync(join(PASTA, f), 'utf8')
    if (t.includes(nome)) return { arquivo: f, texto: t }
  }
  throw new Error(`nenhuma migration mexe em ${nome}`)
}

describe('o acesso ao prontuário: uma vez por pessoa, cliente e ponto em 30 minutos', () => {
  const { arquivo, texto } = ultimaQueMexe('prontuario_registrar_acesso')

  it('a gravação trava por pessoa e cliente antes de conferir', () => {
    expect(texto, arquivo).toContain('pg_advisory_xact_lock(hashtext(coalesce(p_usuario::text, \'-\')), hashtext(p_cliente::text))')
  })

  it('a referência sai da conta (troca o trecho por nada)', () => {
    expect(texto, arquivo).toContain('and a.referencia is not distinct from p_referencia')
    expect(texto, arquivo).toContain("array[1, 1, 1, 1]")
    expect(texto, arquivo).toContain('pg_temp.trocar_no_corpo(')
  })

  it('termina recarregando o esquema', () => {
    expect(texto.trimEnd().endsWith("notify pgrst, 'reload schema';"), arquivo).toBe(true)
  })
})
