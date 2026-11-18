import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * D4 da 25ª simulação: a sessão do plano começava e terminava com o "Termo de
 * consentimento" do plano, que BLOQUEIA, sem assinatura. documentos.md:
 * "nenhuma porta põe IN_PROGRESS com documento BLOQUEIA aberto"; a sessão de
 * plano não emite documento (o plano tem os dele, `modelos_do_atendimento`),
 * então são os do PLANO que valem para ela — como os do pacote valem para a
 * sessão do pacote (PC2).
 * - `documentos_pendentes_do_atendimento` contava o agendamento e o pacote,
 *   não o plano.
 * - A trava (`documentos_bloqueiam_inicio`) saía na hora para toda sessão de
 *   plano (`if new.treatment_plan_id is not null then return new`).
 *
 * A prova no banco é `e2e/documentos-plano-bloqueia-a-sessao.spec.ts`; aqui, a
 * definição VIGENTE de cada função (a última migration que a cria).
 */

const migrations = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaDefinicao(nomeCompleto: string): { arquivo: string; corpo: string } {
  const re = new RegExp(String.raw`function\s+` + nomeCompleto.replace('.', String.raw`\.`) + String.raw`\s*\(`, 'i')
  const arquivos = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()
  const comFuncao = arquivos.filter(f => re.test(readFileSync(path.join(migrations, f), 'utf8')))
  const arquivo = comFuncao[comFuncao.length - 1]!
  const texto = readFileSync(path.join(migrations, arquivo), 'utf8')
  const inicio = texto.search(re)
  const fim = texto.indexOf('$function$;', inicio)
  return { arquivo, corpo: texto.slice(inicio, fim < 0 ? undefined : fim) }
}

describe('D4: o documento do plano que bloqueia trava a sessão do plano', () => {
  it('os pendentes do atendimento contam os do plano da sessão', () => {
    const { arquivo, corpo } = ultimaDefinicao('public.documentos_pendentes_do_atendimento')
    expect(corpo, arquivo).toMatch(/d\.treatment_plan_id\s*=\s*\(\s*select\s+a\.treatment_plan_id\s+from\s+public\.appointments\s+a\s+where\s+a\.id\s*=\s*p_agendamento\s*\)/i)
    // Os de antes seguem: o agendamento e o pacote (PC2).
    expect(corpo, arquivo).toMatch(/d\.appointment_id = p_agendamento/)
    expect(corpo, arquivo).toMatch(/package_sessions/)
  })
  it('a trava do início não deixa a sessão de plano passar direto', () => {
    const { arquivo, corpo } = ultimaDefinicao('private.documentos_bloqueiam_inicio')
    expect(corpo, arquivo).not.toMatch(/if\s+new\.treatment_plan_id\s+is\s+not\s+null\s+then\s+return\s+new/i)
    expect(corpo, arquivo).toMatch(/documentos_pendentes_do_atendimento\(new\.id\)/)
  })
  it('a janela de documentos da sessão mostra os do plano', () => {
    const t = readFileSync(path.join(__dirname, '..', 'lib', 'documentos', 'leitura.ts'), 'utf8')
    const i = t.indexOf('export async function documentosDoAgendamento(')
    const corpo = t.slice(i, t.indexOf('\nexport ', i + 10))
    expect(corpo).toMatch(/treatment_plan_id\.eq\./)
  })
})
