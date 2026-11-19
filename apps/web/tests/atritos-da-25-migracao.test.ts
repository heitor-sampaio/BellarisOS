import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A 25ª simulação, a migração e a busca (o banco).
 *
 * D7 (decisão 1 (c) do Heitor, "concordo"; `crm-inbox.md`): a "Última visita"
 * de antes do sistema entra no "Reativar clientes" e no público "sem retorno".
 * A ficha importada SÓ com a última visita (sem "Cliente desde") ficava com o
 * cadastro de hoje e saía das duas listas — o "é cliente antes do corte" lia só
 * `coalesce(cliente_desde, created_at)`. Agora vale também a visita de antes
 * (`least(…, ultima_visita_antes)`; decisão do Claude pelo princípio 3).
 *
 * D17 (princípio 3; "próximo agendamento", `busca.md`): os "Próximos
 * agendamentos" da busca mostravam a falta e o concluído de hoje. Próximo é o
 * EM ABERTO (a regra de `STATUS_DO_PROXIMO`).
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function migrations(): { nome: string; sql: string }[] {
  return readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
    .map(n => ({ nome: n, sql: readFileSync(join(MIGRATIONS, n), 'utf8') }))
}

function ultimaQueMexeEm(funcao: string): { nome: string; sql: string } {
  const todas = migrations()
  for (let i = todas.length - 1; i >= 0; i--) {
    if (todas[i]!.sql.includes(`public.${funcao}(`)) return todas[i]!
  }
  throw new Error(`nenhuma migration mexe em ${funcao}`)
}

/**
 * A última que mexe na função E no trecho (`marca`). As que vêm depois e só
 * remendam outra parte do corpo vivo (`pg_temp.trocar_no_corpo`) não citam o
 * trecho — e o remendo só troca o que cita: `depois` as devolve para conferir.
 */
function ultimaQueMexeNoTrecho(funcao: string, marca: RegExp) {
  const todas = migrations()
  for (let i = todas.length - 1; i >= 0; i--) {
    const m = todas[i]!
    if (m.sql.includes(`public.${funcao}(`) && marca.test(m.sql)) {
      return { ...m, depois: todas.slice(i + 1).filter(d => d.sql.includes(`public.${funcao}(`)) }
    }
  }
  throw new Error(`nenhuma migration mexe em ${funcao} com ${marca}`)
}

describe('D7: a visita de antes do sistema conta como "cliente antes do corte"', () => {
  it('o público "sem retorno" (clientes_do_publico)', () => {
    const { nome, sql, depois } = ultimaQueMexeNoTrecho('clientes_do_publico', /ultima_visita_antes/)
    expect(sql, nome).toMatch(/least\(coalesce\(c\.cliente_desde::timestamp at time zone f\.fuso, c\.created_at\),\s*c\.ultima_visita_antes::timestamp at time zone f\.fuso\) < f\.cliente_desde_antes/)
    // O remendo que vem depois (a 20261125500001, as tags em E) não cita a visita de antes: não a tira.
    for (const r of depois) expect(r.sql, r.nome).not.toMatch(/ultima_visita_antes/)
  })
  it('o "Reativar clientes" da rede (metrics_clientes_para_reativar_rede)', () => {
    const { nome, sql } = ultimaQueMexeEm('metrics_clientes_para_reativar_rede')
    expect(sql, nome).toMatch(/least\(coalesce\(c\.cliente_desde::timestamp at time zone \(select f from fuso\), c\.created_at\),\s*c\.ultima_visita_antes::timestamp at time zone \(select f from fuso\)\) as created_at/)
  })
  it('os "Novos clientes" ficam como estão (a pergunta do A29 ao Heitor)', () => {
    const { nome, sql } = ultimaQueMexeEm('metrics_clientes_para_reativar_rede')
    expect(sql, nome).not.toMatch(/public\.metrics_core\(|public\.metrics_new_clients_series\(/)
  })
})

describe('D17: os próximos agendamentos da busca são os em aberto', () => {
  it('busca_universal filtra pelos status em aberto, não só tira o cancelado', () => {
    const { nome, sql } = ultimaQueMexeEm('busca_universal')
    expect(sql, nome).toContain(`a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')`)
  })
  it('as migrations terminam recarregando o esquema', () => {
    for (const f of ['clientes_do_publico', 'metrics_clientes_para_reativar_rede', 'busca_universal']) {
      const { nome, sql } = ultimaQueMexeEm(f)
      expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`), nome).toBe(true)
    }
  })
})
