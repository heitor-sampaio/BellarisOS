import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AT-03 / AT-05 (FI-07): quem tem o Atendimento em Gerenciar e NÃO tem o
 * Prontuário só descobria a ficha de saúde (ou a de atendimento) obrigatória
 * em branco DEPOIS do "Confirmar conclusão" — o "Finalizar" abria a janela de
 * concluir e vinha a recusa do servidor. A trava fica (FI-07); o defeito era a
 * HORA do aviso: a tela diz antes do "Confirmar conclusão", com quem responde.
 *
 * Sem dado clínico (`podeVerClinico`): o servidor manda à tela só o NOME das
 * perguntas que faltam (a estrutura da ficha — o mesmo que a recusa dele já
 * dizia), nunca uma resposta.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

type Linhas = Record<string, Record<string, unknown> | null>
function adminFalso(linhas: Linhas) {
  return {
    from(tabela: string) {
      let tipo = ''
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { if (c === 'tipo') tipo = String(v); return q },
        maybeSingle: () => Promise.resolve({ data: linhas[tipo ? `${tabela}:${tipo}` : tabela] ?? null, error: null }),
      }
      return q
    },
  }
}

const FICHA_DE_SAUDE = { id: 'f-saude', name: 'Ficha de saúde', schema: { rows: [{ id: 'r1', fields: [
  { id: 'alergia', type: 'text', label: 'Tem alergia?', required: true },
  { id: 'remedios', type: 'text', label: 'Remédios em uso', required: true },
  { id: 'obs', type: 'text', label: 'Observação' },
] }] } }
const FICHA_DO_PROCEDIMENTO = { id: 'f-proc', name: 'Ficha do peeling', schema: { rows: [{ id: 'r1', fields: [
  { id: 'fototipo', type: 'text', label: 'Fototipo', required: true },
] }] } }

describe('quem não vê o clínico sabe, antes do "Confirmar conclusão", o que falta', () => {
  it('os rótulos de TODAS as obrigatórias vazias da ficha de atendimento', async () => {
    const { rotulosQueFaltamNaFicha } = await import('@/lib/atendimento/obrigatorias')
    const rows = FICHA_DO_PROCEDIMENTO.schema.rows as never
    expect(rotulosQueFaltamNaFicha(rows, {})).toEqual(['Fototipo'])
    expect(rotulosQueFaltamNaFicha(rows, { fototipo: 'III' })).toEqual([])
  })

  it('o servidor devolve só os nomes das perguntas que faltam, nas duas fichas', async () => {
    const { oQueFaltaSemOClinico } = await import('@/lib/atendimento/obrigatorias-no-servidor')
    const admin = adminFalso({
      'forms:PRE_ATENDIMENTO': FICHA_DE_SAUDE,
      'forms:PROCEDIMENTO': FICHA_DO_PROCEDIMENTO,
      medical_records: { general_anamnesis: null },
      procedures: { form_id: 'f-proc' },
      medical_record_entries: null,
    })
    const r = await oQueFaltaSemOClinico(admin as never, {
      tenantId: 't1', appointmentId: 'a1', procedureId: 'p1', clientId: 'c1', semInjetaveis: true,
    })
    expect(r.saude).toEqual(['Tem alergia?', 'Remédios em uso'])
    expect(r.ficha).toEqual(['Fototipo'])
    expect(JSON.stringify(r)).not.toMatch(/general_anamnesis|respostas/)
  })

  it('nada falta: as duas listas vazias', async () => {
    const { oQueFaltaSemOClinico } = await import('@/lib/atendimento/obrigatorias-no-servidor')
    const r = await oQueFaltaSemOClinico(adminFalso({ procedures: { form_id: null } }) as never, {
      tenantId: 't1', appointmentId: 'a1', procedureId: 'p1', clientId: 'c1', semInjetaveis: true,
    })
    expect(r).toEqual({ saude: [], ficha: [] })
  })

  it('a tela usa o que o servidor mandou, e não abre o "Confirmar conclusão" com a falta', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    const i = s.indexOf('function conferirObrigatorias(')
    const corpo = s.slice(i, s.indexOf('\n  }\n', i))
    expect(corpo).not.toMatch(/if \(!canViewRecords\) return null/)
    expect(corpo).toMatch(/faltaSemVerOClinico/)
  })

  it('a janela, a quem nem lê a ficha, não diz "Você lê a ficha de saúde"', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    const i = s.indexOf('function OQueFaltaParaFinalizar')
    const janela = s.slice(i, s.indexOf('\nfunction ', i + 10))
    expect(janela).toMatch(/leAFicha \? 'Você lê a ficha de saúde, mas não a responde\. ' : ''/)
    expect(s).toMatch(/<OQueFaltaParaFinalizar [^\n]*leAFicha=\{canViewRecords\}/)
  })

  it('a página manda a falta só a quem conclui sem ver o clínico, com quem responde', () => {
    const p = fonte('app/_shared/sessao-de-atendimento.tsx')
    expect(p).toMatch(/faltaSemVerOClinico=\{!canViewRecords && canManage[\s\S]{0,400}oQueFaltaSemOClinico\(admin/)
    expect(p).toMatch(/faltaSemVerOClinico=\{[\s\S]{0,900}quemRespondeAFichaDeSaude\(/)
  })
})
