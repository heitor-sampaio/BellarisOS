import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz o fato (AD-13, AD-14, AD-15, AD-21, AD-22 do catálogo de
 * plataforma; o texto é decisão do Claude, 27/11):
 *
 * - O vencimento remarcado diz o nome da conta também com o que o banco grava
 *   de verdade: a coluna GERADA `data_de_referencia` muda junto do `due_date`
 *   (migration 20260930000023) — a frase voltava a "Editou o lançamento".
 *   A coluna derivada não conta como o que a pessoa mudou, em frase nenhuma.
 * - Toda permissão diz o módulo pelo nome da tela de Cargos ("de Atendimento",
 *   não "de atendimento").
 * - A ficha de saúde que a equipe preenche e grava o prontuário é "Preencheu a
 *   ficha de saúde de X"; pela cliente (o link), "Respondeu a ficha de saúde".
 *   O gatilho passa a dizer, no INSERT do prontuário, que a ficha veio junto
 *   (só o nome da coluna, nunca o conteúdo).
 * - Confirmar, fazer o check-in e iniciar o atendimento são o fato, não
 *   "Editou o agendamento (check-in, confirmação e situação)".
 * - Cada parte com o seu plural (R40, o Heitor, 27/11): "Criou 2 regras e apagou 1
 *   regra de comissão"; salvar os acessos do cargo é "Mudou os acessos do cargo X (N
 *   permissões)" (R39, o Heitor, 27/11).
 * - O "máximo de vezes" da maquininha é o "Parcelar no crédito até" da tela.
 */
let id = 7700
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-28T12:00:00.000Z', branch_id: 'b1', client_id: null, tabela: 'appointments',
  operacao: 'editou', registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Edwiges',
  ator_tipo: 'membro', incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { c1: 'Dona Cida' }, membros: { m1: 'Marcela' }, unidades: { b1: 'Centro' }, fusos: { b1: 'America/Sao_Paulo' },
  procedimentos: { p1: 'Limpeza de pele' },
  lancamentos: { t1: { tipo: 'EXPENSE', valor: 120, forma: 'BOLETO', parcela: null, de: null, descricao: 'Internet', categoria: 'Contas' } },
}

describe('o vencimento remarcado, com a coluna gerada que muda junto', () => {
  it('"Remarcou o vencimento da despesa Internet: 10/12/2026 → 20/12/2026"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    // O que o banco grava de verdade: due_date, a data de referência (gerada) e o histórico.
    const remarcou = r({
      tabela: 'financial_transactions', registro_id: 't1', colunas: ['data_de_referencia', 'due_date', 'vencimentos_anteriores'],
      antes: { due_date: '2026-12-10T15:00:00+00:00', data_de_referencia: '2026-12-10T15:00:00+00:00' },
      depois: { due_date: '2026-12-20T15:00:00+00:00', data_de_referencia: '2026-12-20T15:00:00+00:00' },
    })
    expect(fraseDoGrupo([remarcou], nomes)).toBe('Remarcou o vencimento da despesa Internet: 10/12/2026 → 20/12/2026')
  })

  it('a data de referência sem valor não é o que a pessoa mudou: "Editou o lançamento (descrição)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'financial_transactions', colunas: ['data_de_referencia', 'description'] }), nomes))
      .toBe('Editou o lançamento (descrição)')
  })
})

describe('a permissão diz o módulo pelo nome da tela de Cargos', () => {
  it('todo módulo tem nome ("Criou a permissão de Atendimento do cargo Balcão")', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const { MODULE_LEVELS, MODULE_LABELS } = await import('@/lib/permissions')
    const comCargo: NomesDaAuditoria = { ...nomes, cargos: { rp1: 'Balcão' } }
    const sem = Object.keys(MODULE_LEVELS).filter(m =>
      fraseDaAuditoria(r({ tabela: 'role_permissions', operacao: 'criou', registro_id: 'rp1', branch_id: null, depois: { module: m } }), comCargo)
        !== `Criou a permissão de ${MODULE_LABELS[m as keyof typeof MODULE_LABELS]} do cargo Balcão`)
    expect(sem).toEqual([])
  })
})

describe('a ficha de saúde gravada no prontuário', () => {
  const prontuario = (x: Partial<RegistroDaAuditoria>) => r({ tabela: 'medical_records', branch_id: null, client_id: 'c1', registro_id: 'mr1', ...x })

  it('a equipe preenche ao criar o prontuário: "Preencheu a ficha de saúde de Dona Cida"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([prontuario({ operacao: 'criou', colunas: ['general_anamnesis'] })], nomes))
      .toBe('Preencheu a ficha de saúde de Dona Cida')
  })

  it('a equipe preenche no prontuário que já existia: a mesma frase', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([prontuario({ colunas: ['general_anamnesis'] })], nomes)).toBe('Preencheu a ficha de saúde de Dona Cida')
  })

  it('a cliente, pelo link: "Respondeu a ficha de saúde", dela', async () => {
    const { linhaDaAuditoria } = await import('@/lib/auditoria/frase')
    const l = linhaDaAuditoria(prontuario({ operacao: 'criou', colunas: ['general_anamnesis'], ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' }),
      nomes, '/admin/auditoria', null)
    expect(l.oQue).toBe('Respondeu a ficha de saúde')
    expect(l.quem).toBe('Dona Cida, pelo link')
  })

  it('o prontuário criado sem a ficha (e a gravação de antes) segue "Criou o prontuário"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([prontuario({ operacao: 'criou' })], nomes)).toBe('Criou o prontuário — Dona Cida')
  })

  const resposta = () => r({ tabela: 'pre_atendimentos', branch_id: null, client_id: 'c1', colunas: ['origem', 'respondido_em', 'respondido_por', 'respostas', 'status'] })

  it('a conclusão que fecha a ficha pendente é o fato: "Concluiu o atendimento — Dona Cida" (AD-13)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    // O que o banco grava na conclusão com a ficha preenchida pela equipe e um pendente a fechar.
    expect(fraseDoGrupo([
      resposta(),
      prontuario({ colunas: ['general_anamnesis'] }),
      r({ tabela: 'medical_record_entries', operacao: 'criou', branch_id: null, client_id: 'c1' }),
      prontuario({ operacao: 'criou' }),
      r({ client_id: 'c1', registro_id: 'a1', colunas: ['aconteceu_em', 'completed_at', 'status'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } }),
    ], nomes)).toBe('Concluiu o atendimento — Dona Cida')
  })

  it('sem a conclusão na gravação, a ficha preenchida pela equipe segue o fato (AD-22)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([resposta(), prontuario({ colunas: ['general_anamnesis'] })], nomes)).toBe('Preencheu a ficha de saúde de Dona Cida')
  })

  it('o gatilho diz, no INSERT do prontuário, que a ficha veio junto (só o nome da coluna)', () => {
    const pasta = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(pasta).find(f => /^2026121910\d{4}_auditoria_a_ficha_de_saude_ao_criar_o_prontuario\.sql$/.test(f))
    expect(arquivo, 'a migration da faixa A').toBeTruthy()
    const sql = readFileSync(path.join(pasta, arquivo!), 'utf8')
    expect(sql).toMatch(/pg_temp\.trocar_no_corpo\(\s*'private\.auditar\(\)'::regprocedure/)
    expect(sql).toMatch(/tg_op = 'INSERT' and v_tab = 'medical_records'/)
    expect(sql).toMatch(/array\['general_anamnesis'\]::text\[\]/)
    expect(sql).toMatch(/alter function private\.auditar\(\) set plan_cache_mode = force_generic_plan;/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})

describe('a agenda: confirmar, o check-in e o início são o fato', () => {
  const ag = (x: Partial<RegistroDaAuditoria>) => r({ client_id: 'c1', registro_id: 'a1', ...x })

  it('"Confirmou o agendamento de Dona Cida"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([ag({ colunas: ['confirmed_at', 'status'], antes: { status: 'SCHEDULED' }, depois: { status: 'CONFIRMED' } })], nomes))
      .toBe('Confirmou o agendamento de Dona Cida')
  })

  it('"Fez o check-in de Dona Cida" (com a confirmação junto, ou sem ela)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([ag({ colunas: ['arrived_at', 'confirmed_at', 'status'], antes: { status: 'SCHEDULED' }, depois: { status: 'ARRIVED' } })], nomes))
      .toBe('Fez o check-in de Dona Cida')
    expect(fraseDoGrupo([ag({ colunas: ['arrived_at', 'status'], antes: { status: 'CONFIRMED' }, depois: { status: 'ARRIVED' } })], nomes))
      .toBe('Fez o check-in de Dona Cida')
  })

  it('o início sozinho (a avaliação de R$ 0, sem comanda): "Iniciou o atendimento — Dona Cida"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([ag({ colunas: ['started_at', 'status'], antes: { status: 'ARRIVED' }, depois: { status: 'IN_PROGRESS' } })], nomes))
      .toBe('Iniciou o atendimento — Dona Cida')
  })

  it('a conclusão sozinha: "Concluiu o atendimento — Dona Cida"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([ag({ colunas: ['aconteceu_em', 'completed_at', 'status'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } })], nomes))
      .toBe('Concluiu o atendimento — Dona Cida')
  })

  it('o check-in gravado com outro registro também é o fato', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([
      r({ tabela: 'issued_documents', operacao: 'editou', client_id: 'c1', colunas: ['status'] }),
      ag({ colunas: ['arrived_at', 'status'], antes: { status: 'CONFIRMED' }, depois: { status: 'ARRIVED' } }),
    ], nomes)).toBe('Fez o check-in de Dona Cida')
  })
})

describe('o plural de cada parte (R40, o Heitor, 27/11: "Cada parte com o seu plural")', () => {
  it('"Criou 2 regras e apagou 1 regra de comissão de Limpeza de pele (…)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([
      r({ tabela: 'commission_rules', operacao: 'criou', depois: { procedure_id: 'p1', professional_id: 'm1', type: 'FIXED_AMOUNT', value: 50 } }),
      r({ tabela: 'commission_rules', operacao: 'criou', depois: { procedure_id: 'p1', professional_id: null, type: 'PERCENTAGE', value: 30 } }),
      r({ tabela: 'commission_rules', operacao: 'apagou', antes: { procedure_id: 'p1', professional_id: 'm1', type: 'PERCENTAGE', value: 30 } }),
    ], nomes).replace(/\s/g, ' ')).toBe('Criou 2 regras e apagou 1 regra de comissão de Limpeza de pele (Marcela: R$ 50,00; a mesma para todos: 30%)')
  })

  it('"Criou 1 regra e apagou 1 regra de comissão de Limpeza de pele (Marcela: R$ 50,00)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([
      r({ tabela: 'commission_rules', operacao: 'criou', depois: { procedure_id: 'p1', professional_id: 'm1', type: 'FIXED_AMOUNT', value: 50 } }),
      r({ tabela: 'commission_rules', operacao: 'apagou', antes: { procedure_id: 'p1', professional_id: 'm1', type: 'PERCENTAGE', value: 30 } }),
    ], nomes).replace(/\s/g, ' ')).toBe('Criou 1 regra e apagou 1 regra de comissão de Limpeza de pele (Marcela: R$ 50,00)')
  })

  it('nas outras tabelas: "Criou 2 maquininhas e apagou 1 maquininha"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([
      r({ tabela: 'maquininhas', operacao: 'criou', branch_id: null }),
      r({ tabela: 'maquininhas', operacao: 'criou', branch_id: null }),
      r({ tabela: 'maquininhas', operacao: 'apagou', branch_id: null }),
    ], nomes)).toBe('Criou 2 maquininhas e apagou 1 maquininha')
  })
})

describe('salvar os acessos do cargo (R39, o Heitor, 27/11: "Mudou os acessos do cargo X (N permissões)")', () => {
  const comCargo: NomesDaAuditoria = { ...nomes, cargos: Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`rp${i}`, 'Balcão'])) }
  const perm = (i: number, x: Partial<RegistroDaAuditoria> = {}) =>
    r({ tabela: 'role_permissions', operacao: 'criou', branch_id: null, registro_id: `rp${i}`, depois: { module: 'agenda' }, ...x })

  it('a matriz salva (19 permissões criadas numa gravação): "Mudou os acessos do cargo Balcão (19 permissões)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo(Array.from({ length: 19 }, (_, i) => perm(i)), comCargo)).toBe('Mudou os acessos do cargo Balcão (19 permissões)')
  })

  it('criadas e editadas juntas contam todas: "Mudou os acessos do cargo Balcão (3 permissões)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([perm(0), perm(1), perm(2, { operacao: 'editou', colunas: ['level'] })], comCargo))
      .toBe('Mudou os acessos do cargo Balcão (3 permissões)')
  })

  it('o cargo novo com as permissões segue "Criou o cargo X (N permissões)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([r({ tabela: 'tenant_roles', operacao: 'criou', branch_id: null, depois: { label: 'Balcão' } }), perm(0), perm(1)], comCargo))
      .toBe('Criou o cargo Balcão (2 permissões)')
  })
})

describe('a maquininha pelo nome da tela', () => {
  it('"Editou a maquininha Stone (parcelar no crédito até, nome e taxas)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ tabela: 'maquininhas', branch_id: null, colunas: ['max_vezes', 'nome', 'taxas'], depois: { nome: 'Stone' } }), nomes))
      .toBe('Editou a maquininha Stone (parcelar no crédito até, nome e taxas)')
  })
})
