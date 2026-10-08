import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A conclusão do atendimento numa transação só (`concluir_atendimento`,
 * migration 20260928000003; CLAUDE.md §10).
 *
 * O fechamento pela tela continua provado em `atendimento-fechamento.spec.ts`.
 * Aqui se prova o que mudou, direto na função (que é o que o `finishSession`
 * chama):
 *  - uma falha no MEIO desfaz tudo — antes, o status, o prontuário e a
 *    comissão ficavam gravados e o estoque não;
 *  - dois "finalizar" ao mesmo tempo concluem UMA vez — antes, os dois
 *    passavam da checagem de status e baixavam o estoque duas vezes.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx { outra: OutraRede; cliente: string; produto: string; appt: string }
let f: Fx | null = null
let outraCriada: OutraRede | null = null

async function novoAgendamento(outra: OutraRede, cliente: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: outra.branchId, client_id: cliente, procedure_id: outra.procedureId, professional_id: outra.professionalId,
    scheduled_at: new Date(Date.now() + 3600_000).toISOString(), duration_min: 60, price: 200, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  const outra = await criarOutraRede(`conc${marca}`)
  outraCriada = outra
  const cliente = await outra.criarCliente('conclusão')
  const produto = await outra.criarProduto('insumo', 10)
  f = { outra, cliente, produto, appt: await novoAgendamento(outra, cliente) }
})

test.afterAll(async () => {
  if (!outraCriada) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const { data: appts } = await b.from('appointments').select('id').eq('branch_id', outraCriada.branchId)
  const ids = (appts ?? []).map(a => a.id as string)
  if (ids.length) {
    olhar('sessões de pacote', await b.from('package_sessions').delete().in('appointment_id', ids))
    olhar('comissões', await b.from('commissions').delete().in('appointment_id', ids))
    olhar('histórico', await b.from('appointment_history').delete().in('appointment_id', ids))
  }
  olhar('pacotes do cliente', await b.from('client_packages').delete().eq('branch_id', outraCriada.branchId))
  olhar('pacotes', await b.from('service_packages').delete().eq('tenant_id', outraCriada.tenantId))
  await outraCriada.limpar()
  expect(falhas).toEqual([])
})

const concluir = (appt: string, insumos: unknown[]) => db().rpc('concluir_atendimento', {
  p_agendamento: appt,
  p_tenant:      f!.outra.tenantId,
  p_ator:        f!.outra.professionalId,
  p_ator_nome:   'e2e',
  p_dados: {
    notas: 'e2e', intercorrencias: null, pontos: 0, insumos,
    comissoes: [{
      procedure_id: f!.outra.procedureId, origem: 'AVULSO', treatment_plan_id: null,
      regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 200,
    }],
  },
})

const insumoBom = (quantidade: number) => ({
  produto: f!.produto, quantidade: -quantidade, saldo_apos: 10 - quantidade,
  embalagens: 10 - quantidade, rendimento: null, custo: 5, minimo: 0,
})

async function estado(appt: string) {
  const b = db()
  const [a, entrada, comissao, movs, saldo] = await Promise.all([
    b.from('appointments').select('status').eq('id', appt).single(),
    b.from('medical_record_entries').select('id').eq('appointment_id', appt),
    b.from('commissions').select('id').eq('appointment_id', appt),
    b.from('stock_movements').select('id').eq('appointment_id', appt),
    b.from('branch_product_stock').select('current_stock').eq('product_id', f!.produto).eq('branch_id', f!.outra.branchId).single(),
  ])
  return {
    status: a.data?.status, entradas: entrada.data?.length, comissoes: comissao.data?.length,
    movimentos: movs.data?.length, saldo: Number(saldo.data?.current_stock),
  }
}

test.describe.serial('conclusão do atendimento numa transação', () => {
  test('falha no meio (o segundo insumo não existe): nada fica gravado', async () => {
    const naoExiste = '00000000-0000-4000-8000-000000000000'
    const { error } = await concluir(f!.appt, [insumoBom(2), { ...insumoBom(1), produto: naoExiste }])
    expect(error, 'a função recusa').not.toBeNull()
    // Status, prontuário, comissão e o PRIMEIRO insumo — tudo desfeito.
    expect(await estado(f!.appt)).toEqual({ status: 'IN_PROGRESS', entradas: 0, comissoes: 0, movimentos: 0, saldo: 10 })
  })

  test('com os dados certos grava tudo junto', async () => {
    const { data, error } = await concluir(f!.appt, [insumoBom(2)])
    expect(error).toBeNull()
    expect(data).toMatchObject({ comissao_criada: true, pacote: null })
    expect(await estado(f!.appt)).toEqual({ status: 'COMPLETED', entradas: 1, comissoes: 1, movimentos: 1, saldo: 8 })
  })

  test('sessão de pacote: marcada usada e o contador sobe, na mesma transação', async () => {
    const b = db()
    const { data: sp } = await b.from('service_packages').insert({
      tenant_id: f!.outra.tenantId, procedure_id: f!.outra.procedureId, name: '[e2e] pacote', total_sessions: 3, price: 300,
    }).select('id').single<{ id: string }>()
    const { data: cp } = await b.from('client_packages').insert({
      client_id: f!.cliente, package_id: sp!.id, branch_id: f!.outra.branchId, total_sessions: 3, used_sessions: 0,
    }).select('id').single<{ id: string }>()
    const appt = await novoAgendamento(f!.outra, f!.cliente)
    const { error: eS } = await b.from('package_sessions').insert({ client_package_id: cp!.id, appointment_id: appt, status: 'AVAILABLE', session_number: 1 })
    expect(eS).toBeNull()

    const { data, error } = await concluir(appt, [])
    expect(error).toBeNull()
    expect(data).toMatchObject({ pacote: cp!.id })
    const { data: sessao } = await b.from('package_sessions').select('status').eq('appointment_id', appt).single()
    const { data: pacote } = await b.from('client_packages').select('used_sessions').eq('id', cp!.id).single()
    expect([sessao!.status, pacote!.used_sessions]).toEqual(['USED', 1])
  })

  test('dois "finalizar" ao mesmo tempo concluem uma vez só', async () => {
    const outro = await novoAgendamento(f!.outra, f!.cliente)
    const [r1, r2] = await Promise.all([concluir(outro, [insumoBom(1)]), concluir(outro, [insumoBom(1)])])
    const erros = [r1.error, r2.error].filter(Boolean)
    expect(erros, 'um dos dois é recusado').toHaveLength(1)
    expect(erros[0]!.message).toContain('Atendimento já concluído')
    const e = await estado(outro)
    expect([e.status, e.comissoes, e.movimentos]).toEqual(['COMPLETED', 1, 1])
  })

  // A dívida da revisão do Copilot (2026-10-08): o app calcula a baixa sobre o
  // saldo que LEU, e a função gravava o resultado por cima — duas conclusões
  // (ou uma conclusão e uma transferência) ao mesmo tempo perdiam uma saída.
  // Agora o app manda o saldo lido, e a função trava a linha e confere.
  test('o saldo mudou entre a leitura do app e a gravação: recusa (PT409) sem gravar nada', async () => {
    const outro = await novoAgendamento(f!.outra, f!.cliente)
    const atual = (await estado(outro)).saldo
    const lido = atual + 3   // o app leu antes de outra saída
    const insumo = (base: number) => ({
      produto: f!.produto, quantidade: -1, saldo_apos: base - 1, embalagens: base - 1, rendimento: null,
      custo: 5, minimo: 0, antes_embalagens: base, antes_rendimento: null,
    })
    const velho = await concluir(outro, [insumo(lido)])
    expect(velho.error?.code, 'o banco recusa o saldo velho').toBe('PT409')
    expect(await estado(outro)).toEqual({ status: 'IN_PROGRESS', entradas: 0, comissoes: 0, movimentos: 0, saldo: atual })
    // Com o saldo de agora (o que o app faz ao tentar de novo), grava.
    const certo = await concluir(outro, [insumo(atual)])
    expect(certo.error).toBeNull()
    expect((await estado(outro)).saldo).toBe(atual - 1)
  })
})
