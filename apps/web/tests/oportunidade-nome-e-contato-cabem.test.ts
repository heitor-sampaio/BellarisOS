import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O nome, o e-mail e o telefone da oportunidade (`leads`) eram varchar(255/255/30), e os da ficha e do contato,
 * de onde eles vêm (a ficha, o contato, a propagação), `text`. A janela da oportunidade não limita o nome nem o
 * e-mail: acima de 255 o banco recusava em inglês — e a ficha com nome mais longo não virava oportunidade. O
 * Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." Decisão do Claude, 25/11: as três
 * colunas viram `text`, como na ficha; o Copilot recusa o mesmo que a janela (o nome só vazio; o e-mail, nada).
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /oportunidade_nome_e_contato_em_texto/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}
const recusa = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, campo: string) =>
  r.success ? null : r.error!.issues.find(i => i.path[0] === campo)?.message ?? null

describe('o nome e o contato da oportunidade cabem como na ficha', () => {
  it('as três colunas viram text', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    for (const c of ['name', 'email', 'phone']) expect(m).toMatch(new RegExp(`alter column ${c} type text`, 'i'))
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('o Copilot não recusa o nome nem o e-mail longos (a janela não recusa)', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { email: 'ana@exemplo.com' }
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, nome: 'A'.repeat(300) }), 'nome')).toBeNull()
    expect(recusa(criarOportunidade.parametros.safeParse({ nome: 'Ana', email: `${'a'.repeat(200)}@exemplo.com` }), 'email')).toBeNull()
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, nome: '' }), 'nome')).toBe('Nome é obrigatório.')
  })
})
