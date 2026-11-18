import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Arquivar a cliente NÃO muda quantas clientes novas houve (auditoria das
 * regras, 18/11; crm-inbox.md, "Arquivar a cliente"). "Novos clientes" é o
 * fato do período — ela passou a ser cliente naquele mês —, e arquivar hoje
 * não desfaz o fato de ontem (princípios 3 e 5). As três contas
 * (`metrics_core`, `metrics_by_branch`, `metrics_new_clients_series`)
 * filtravam `c.is_active`: arquivar a Ana tirava uma cliente nova de outubro.
 *
 * A migration que corrige remenda as três pelo `pg_get_functiondef` (o padrão
 * de 20261116300001), e este teste confere o remendo: ela tira o filtro das
 * três, e nenhuma migration POSTERIOR volta a definir uma delas com ele.
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const FUNCOES = ['metrics_core', 'metrics_by_branch', 'metrics_new_clients_series'] as const

function migrations() {
  return readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
    .map(nome => ({ nome, texto: readFileSync(join(MIGRATIONS, nome), 'utf8') }))
}

describe('arquivar não muda os novos clientes', () => {
  const todas = migrations()
  const remendo = todas.filter(m => /arquivar_nao_muda_novos_clientes/.test(m.nome)).at(-1)

  it('há a migration que tira o is_active das três contas', () => {
    expect(remendo, 'a migration *_arquivar_nao_muda_novos_clientes.sql').toBeDefined()
    for (const f of FUNCOES) expect(remendo!.texto, f).toContain(`'public.${f}`)
  })

  it('nenhuma migration depois dela redefine uma das três com o filtro', () => {
    const depois = todas.filter(m => remendo && m.nome > remendo.nome)
    for (const m of depois) {
      for (const f of FUNCOES) {
        const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${f}\\s*\\(([\\s\\S]*?)\\$function\\$;`, 'i')
        const corpo = re.exec(m.texto)?.[1]
        if (corpo) expect(corpo, `${m.nome}: ${f}`).not.toMatch(/c\.is_active/)
      }
    }
  })
})
