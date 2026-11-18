import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A desistência no meio gasta a sessão do pacote (o Heitor, 2026-11-18: "Não
 * existe isso de desistir no meio do atendimento. Se isso por ventura
 * acontecer, problema de quem desistir."; `pre_pago_libera`, migration
 * `20261123900004`). A sessão ficava USADA sem o fato "Sessão de pacote usada"
 * (`pacote.sessao_usada`), que só a conclusão emitia: a automação de "acabou,
 * renove" (restantes = 0) não via a última sessão gasta na desistência.
 *
 * O MESMO evento, com os mesmos campos e a mesma chave da conclusão
 * (`pacote.sessao_usada:<agendamento>`, `emitirSessaoDePacoteUsada`) — um
 * atendimento não gera dois consumos. A prova no banco é
 * `e2e/atendimento-desistencia-evento-do-pacote.spec.ts`; aqui, a definição
 * VIGENTE do gatilho (a última migration que o cria).
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaDefinicao(funcao: string): { arquivo: string; corpo: string } {
  const re = new RegExp(`function\\s+${funcao.replace('.', '\\.')}\\s*\\(`, 'i')
  const arquivos = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()
    .filter(f => re.test(readFileSync(path.join(migrations, f), 'utf8')))
  const arquivo = arquivos[arquivos.length - 1]!
  const texto = readFileSync(path.join(migrations, arquivo), 'utf8')
  const inicio = texto.search(re)
  return { arquivo, corpo: texto.slice(inicio, texto.indexOf('$function$;', inicio)) }
}

describe('a desistência emite "Sessão de pacote usada", como a conclusão', () => {
  it('o pre_pago_libera grava o fato no ramo do iniciado e cancelado', () => {
    const { arquivo, corpo } = ultimaDefinicao('private.pre_pago_libera')
    const ramo = corpo.slice(corpo.indexOf("old.status::text = 'IN_PROGRESS'"), corpo.indexOf('return new;'))
    expect(ramo, arquivo).toMatch(/insert into public\.domain_events/)
    expect(ramo, arquivo).toMatch(/'pacote\.sessao_usada'/)
    // A chave da conclusão: um atendimento, um consumo.
    expect(ramo, arquivo).toMatch(/'pacote\.sessao_usada:' \|\| new\.id/)
    expect(ramo, arquivo).toMatch(/on conflict \(tenant_id, chave\) where chave is not null do nothing/)
    // Os campos do catálogo (eventos-campos.ts).
    for (const campo of ['clienteId', 'clienteNome', 'pacoteNome', 'agendamentoId', 'restantes']) {
      expect(ramo, `${arquivo}: ${campo}`).toContain(`'${campo}'`)
    }
  })

  it('a chave é a mesma do TS da conclusão', () => {
    const ts = readFileSync(path.join(__dirname, '..', 'lib', 'events', 'atendimento-financeiro.ts'), 'utf8')
    expect(ts).toContain('chave: `pacote.sessao_usada:${appointmentId}`')
  })
})
