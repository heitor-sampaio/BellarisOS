import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { capturarAcao, reenviarAcao } from './apoio/acao'

/**
 * O membro só pode ser preso a uma unidade DA REDE.
 *
 * `createTeamMember` e `updateTeamMember` recebiam o `branchId` do formulário
 * sem conferir de quem era a unidade. Um admin de rede criava um membro preso à
 * unidade de OUTRA clínica — e toda consulta que filtra só por `branch_id`
 * passava a entregar os dados dela a esse membro. O id não é segredo: o slug da
 * unidade aparece na URL.
 *
 * A tela só oferece as unidades da rede; o ataque é reenviar a chamada trocando
 * o id (`apoio/acao.ts`). O controle é o MESMO reenvio apontando para outra
 * unidade real — tem de gravar, senão "não mudou" seria só o reenvio que falha.
 */

const marca = Date.now().toString(36)
let alvo: MembroDeTeste | null = null
let outra: OutraRede | null = null

test.beforeAll(async () => {
  const unidade = (await filiaisAtivas())[0]!
  alvo  = await criarMembro(`unid${marca}`, { rotulo: 'Unidade', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }], branchId: unidade.id })
  outra = await criarOutraRede(`unid${marca}`)
})

test.afterAll(async () => {
  if (alvo) {
    await banco().from('domain_events').delete().eq('entidade_id', alvo.userId)
    await alvo.limpar()
  }
  await outra?.limpar()
})

test('editar o membro não aceita unidade de outra rede', async ({ page }) => {
  const [unidade, segunda] = await filiaisAtivas()
  test.skip(!segunda, 'o controle precisa de uma segunda unidade real na rede')
  const unidadeDoMembro = async () =>
    (await banco().from('users').select('branch_id').eq('id', alvo!.userId).single()).data?.branch_id

  await page.goto('/admin/team')
  await page.getByTitle(`Editar [e2e] Unidade unid${marca}`).click()
  const chamada = capturarAcao(page, corpo => corpo.includes(alvo!.userId))
  await page.getByRole('button', { name: 'Salvar' }).click()
  const req = await chamada
  // A RESPOSTA do salvar, antes dos reenvios: o membro já nasce nesta unidade,
  // então o poll abaixo passava na hora — e no CI lento o salvar terminava
  // DEPOIS do reenvio de controle, devolvendo a unidade antiga (completa de
  // 2026-10-08).
  await req.response()
  await expect.poll(unidadeDoMembro).toBe(unidade!.id)

  // O ataque: a unidade de OUTRA rede.
  await reenviarAcao(page, req, [[unidade!.id, outra!.branchId]])
  expect(await unidadeDoMembro(), 'membro preso a unidade de outra rede').toBe(unidade!.id)

  // O controle: a segunda unidade real — o mesmo reenvio grava.
  await reenviarAcao(page, req, [[unidade!.id, segunda!.id]])
  await expect.poll(unidadeDoMembro, { message: 'o reenvio funciona' }).toBe(segunda!.id)
})
