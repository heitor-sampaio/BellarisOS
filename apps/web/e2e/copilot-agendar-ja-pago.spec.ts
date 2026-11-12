import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { apagarAgendamentos } from './apoio/limpeza'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * C5 (F65, a parte da Agenda): o "agendar" do Copilot passa pelas mesmas
 * regras da janela "+ Agendar".
 *  - o "Já pago": o crédito do MESMO procedimento (pré-pago, pacote, sessão do
 *    plano) entra sozinho, e o cartão diz — agendava avulso, e o checkout
 *    cobrava de novo;
 *  - "Quem realiza": a profissional fora da lista é AVISADA no cartão, sem
 *    barrar (o encaixe é da clínica — princípio 2);
 *  - "Atende na unidade": quem não atende na unidade é recusada já no cartão
 *    (o núcleo, `conferirPecasDoAgendamento`).
 */
test.skip(!contraAFalsa(), 'só contra o servidor com a OpenAI falsa (OPENAI_BASE_URL_TESTE)')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let cliente = ''
const PROFISSIONAL = `${PREFIXO} Prof cjp${marca}`
const DIA = diaEmQueAUnidadeAbre(2)
const db = () => banco()
const agendamentosDa = async () => ((await db().from('appointments').select('id, price')
  .eq('client_id', cliente)).data ?? []) as { id: string; price: number }[]

async function pedir(p: Page, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome: 'agendar', args }] }, { texto: 'Confira o cartão e confirme.' })
  const painel = await falarComOCopilot(p, 'agende')
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`cjp${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.outra.branchId, name: PROFISSIONAL })
    .eq('id', rede.outra.professionalId)).error).toBeNull()
  // O preço de tabela (o pré-pago sai com desconto: R$ 270 de R$ 300).
  expect((await db().from('procedures').update({ price: 300 }).eq('id', rede.outra.procedureId)).error).toBeNull()
  cliente = await rede.outra.criarCliente('Ja Pago')
})
test.afterAll(async () => {
  await db().from('procedure_professionals').delete().eq('procedure_id', rede?.outra.procedureId ?? '')
  await apagarAgendamentos((await agendamentosDa()).map(a => a.id))
  await rede?.limpar()
  await falsa?.fechar()
})

test('C5: o crédito do mesmo procedimento entra sozinho, e o cartão diz "Já pago"', async ({ browser }) => {
  const { data: venda, error } = await db().rpc('procedimento_vender', {
    p_tenant: rede.outra.tenantId, p_cliente: cliente, p_procedimento: rede.outra.procedureId, p_unidade: rede.outra.branchId,
    p_ator: null, p_quantidade: 1, p_desconto: 30, p_validade_dias: null,
    p_lancamentos: [{ amount: 270, payment_method: 'PIX', is_paid: true }], p_unidades: [{ preco: 270 }],
  })
  expect(error, 'vender o pré-pago').toBeNull()
  const unidade = (await db().from('procedure_sale_units').select('id').eq('sale_id', venda as string).single<{ id: string }>()).data!.id
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const cartao = await pedir(p, { cliente, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: DIA, hora: '09:00' })
    await expect(cartao.getByText(/Já pago/).first(), 'o cartão diz o que ela já pagou').toBeVisible()
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const [ag] = await agendamentosDa()
  expect(ag, 'agendou').toBeTruthy()
  const u = (await db().from('procedure_sale_units').select('appointment_id').eq('id', unidade).single<{ appointment_id: string | null }>()).data!
  expect(u.appointment_id, 'a unidade pré-paga ficou com o agendamento').toBe(ag!.id)
  expect(Number(ag!.price)).toBe(270)
})

test('C5: a profissional fora de "Quem realiza" é avisada no cartão, sem barrar', async ({ browser }) => {
  expect((await db().from('procedure_professionals').insert({ tenant_id: rede.outra.tenantId, procedure_id: rede.outra.procedureId, user_id: rede.dono.userId })).error).toBeNull()
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const cartao = await pedir(p, { cliente, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: DIA, hora: '11:00' })
    await expect(cartao.getByText(/não está em “Quem realiza”/), 'o aviso').toBeVisible()
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  expect(await agendamentosDa(), 'agendou mesmo assim').toHaveLength(2)
})

test('C5: quem não atende na unidade é recusada já no cartão', async ({ browser }) => {
  expect((await db().from('users').update({ atende_em: [] }).eq('id', rede.outra.professionalId)).error).toBeNull()
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    await pedir(p, { cliente, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: DIA, hora: '14:00' })
    const saida = falsa.saidasDeFerramenta().filter(s => s.nome === 'agendar').at(-1)
    // A lista do Copilot já é a de quem atende na unidade; o núcleo confere de novo.
    expect(String((saida?.saida as { erro?: string })?.erro)).toMatch(/não atende nesta unidade|não encontrado/)
  })
  expect(await agendamentosDa()).toHaveLength(2)
})
