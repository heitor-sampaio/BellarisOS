import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { leOSinalDaRede } from './apoio/sinais'
import { criarAtendente, plataformaNoAr, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import {
  sessaoDoNavegador, rest, restBruto, autorizarPor, entrarComo, sessoesAtivasDaRede, limparSuporteDaRede,
} from './apoio/suporte'

/**
 * Dado clínico no modo suporte (decisão do Heitor: bloqueado por padrão).
 *
 * O atendente tem o token do membro na mão — o cookie é httpOnly desde
 * 2026-10-06, mas a página pede o access token a `/api/auth/token` para o
 * Realtime. Desde 18/11 (ATD-P01) o prontuário não se lê nem se grava pela
 * sessão de NINGUÉM (módulo escopável: só o servidor, que aplica o escopo); a
 * RESTRITIVA `private.suporte_sem_clinico` segue como segunda parede. A trava
 * do suporte é a da TELA (o servidor não manda o clínico à sessão de
 * suporte sem a autorização que o inclui). A prova:
 *  - sem dado clínico na autorização: a tela não mostra, e o token não lê
 *    nem grava;
 *  - com a autorização que o inclui (dada pela Admin da rede): a tela mostra
 *    (e o token continua sem ler — a leitura é do servidor).
 * O controle da recusa é o próprio membro, na tela dele.
 */

test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
const ANAMNESE = `ANAMNESE-CLINICO-${marca}`

let outra: OutraRede | null = null
const membros: MembroDeTeste[] = []
let atendente: AtendenteDeTeste | null = null
let alvo: MembroDeTeste, gestor: MembroDeTeste
let clienteComFicha = '', clienteSemFicha = ''

test.beforeAll(async () => {
  test.setTimeout(600_000)
  outra = await criarOutraRede(`sc${marca}`)
  alvo = await criarMembro(`scalvo${marca}`, {
    tenant: outra.tenantId, rotulo: 'Alvo',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  // Quem autoriza o suporte é a Admin da rede (2026-11-18).
  gestor = await criarMembro(`scgest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor', donoDaRede: true,
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  membros.push(alvo, gestor)
  atendente = await criarAtendente(`sc${marca}`, { papel: 'SUPORTE' })
  clienteComFicha = await outra.criarCliente('Paciente Clinico')
  clienteSemFicha = await outra.criarCliente('Paciente Sem Ficha')
  const { error } = await db().from('medical_records')
    .upsert({ client_id: clienteComFicha, general_anamnesis: { allergies: ANAMNESE } }, { onConflict: 'client_id' })
  expect(error).toBeNull()
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (outra) {
    falhas.push(...await limparSuporteDaRede(outra.tenantId))
    const { error } = await db().from('medical_records').delete().in('client_id', [clienteComFicha, clienteSemFicha].filter(Boolean))
    if (error) falhas.push(`prontuários: ${error.message}`)
  }
  for (const m of membros) {
    const { error } = await db().from('user_notifications').delete().eq('user_id', m.userId)
    if (error) falhas.push(`notificações: ${error.message}`)
    await m.limpar()
  }
  if (atendente) await atendente.limpar()
  if (outra) await outra.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('suporte: dado clínico', () => {
  test('sem dado clínico na autorização: não lê nem grava prontuário, nem pelo token', async ({ browser }) => {
    await autorizarPor(browser, gestor.estado, alvo.userId, { clinico: false })
    const sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo scalvo${marca}`)
    try {
      await sup.page.goto(`/admin/clients/${clienteComFicha}`)
      await expect(sup.page.getByText('Paciente Clinico').first()).toBeVisible()
      expect(await sup.page.content()).not.toContain(ANAMNESE)

      const token = (await sessaoDoNavegador(sup.ctx)).access_token
      expect(await rest(token, `medical_records?select=id&client_id=eq.${clienteComFicha}`)).toHaveLength(0)
      // A rede ele alcança — a trava é só do clínico. Desde 19/11 a sessão só
      // lê SINAIS (o Heitor, "vai na 2"): o alcance se prova pelo sinal da rede.
      expect(await leOSinalDaRede(token, outra!.tenantId), 'o token do suporte lê o sinal da rede').toBe(1)
      const gravar = await restBruto(token, 'POST', 'medical_records', { client_id: clienteSemFicha, general_anamnesis: { x: 1 } })
      expect(gravar.status, 'gravar prontuário é recusado').toBeGreaterThanOrEqual(400)
      const alterar = await restBruto(token, 'PATCH', `medical_records?client_id=eq.${clienteComFicha}`, { general_anamnesis: { x: 2 } })
      expect(Array.isArray(alterar.corpo) ? alterar.corpo : [], 'alterar não atinge linha nenhuma').toHaveLength(0)
    } finally {
      await sup.page.goto('/auth/suporte-fim')
      await sup.ctx.close()
    }
    const { data: ficha } = await db().from('medical_records').select('general_anamnesis').eq('client_id', clienteComFicha).single()
    expect(JSON.stringify(ficha!.general_anamnesis)).toContain(ANAMNESE)
    const { data: nova } = await db().from('medical_records').select('id').eq('client_id', clienteSemFicha)
    expect(nova ?? []).toHaveLength(0)
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(0)

    // Controle: o próprio membro, na TELA dele, vê a ficha de saúde (o
    // servidor lê). Pelo token, nem ele: o prontuário não se lê pela sessão.
    expect(await rest(alvo.accessToken, `medical_records?select=id&client_id=eq.${clienteComFicha}`)).toHaveLength(0)
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/admin/clients/${clienteComFicha}`)
      await expect(p.getByText('Paciente Clinico').first()).toBeVisible()
      expect(await p.content()).toContain(ANAMNESE)
    } finally { await ctx.close() }
  })

  test('com a autorização que inclui dado clínico, o suporte vê o prontuário na tela', async ({ browser }) => {
    await autorizarPor(browser, gestor.estado, alvo.userId, { clinico: true })
    const sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo scalvo${marca}`)
    try {
      // Pelo token, não: o prontuário só se lê pelo servidor (ATD-P01, 18/11).
      const token = (await sessaoDoNavegador(sup.ctx)).access_token
      expect(await rest(token, `medical_records?select=id&client_id=eq.${clienteComFicha}`)).toHaveLength(0)
      await sup.page.goto(`/admin/clients/${clienteComFicha}`)
      await expect(sup.page.getByText('Paciente Clinico').first()).toBeVisible()
      expect(await sup.page.content()).toContain(ANAMNESE)
    } finally {
      await sup.page.goto('/auth/suporte-fim')
      await sup.ctx.close()
    }
  })

  // Desde 18/11 só a Admin da rede autoriza (e ela tem o prontuário): quem
  // não é a Admin é recusado antes, com ou sem o dado clínico.
  test('quem não é a Admin da rede não autoriza, nem com o dado clínico', async ({ browser }) => {
    const semProntuario = await criarMembro(`scsem${marca}`, {
      tenant: outra!.tenantId, rotulo: 'SemProntuario', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
    })
    membros.push(semProntuario)
    const ctx = await browser.newContext({ storageState: semProntuario.estado })
    try {
      const p = await ctx.newPage()
      const r = await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'autorizarSuporte', '/admin/settings',
        [{ userId: alvo.userId, horas: 24, incluiClinico: true }])
      expect(r.texto).toContain('só da Admin da rede')
    } finally { await ctx.close() }
  })
})
