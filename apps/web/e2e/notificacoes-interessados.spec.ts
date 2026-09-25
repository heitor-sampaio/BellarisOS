import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * Todo mundo com interesse no fato recebe a notificação.
 *
 * Pedido do Heitor em 2026-09-25: "todos que forem partes interessadas no
 * evento devem receber a notificação". Antes só o PROFISSIONAL do agendamento
 * era avisado, e o sino de quem gerencia ficava permanentemente vazio — no
 * banco de desenvolvimento, as 108 notificações de equipe eram todas de uma
 * única profissional.
 *
 * O caminho escolhido para provar a regra é o **estoque abaixo do mínimo**, e
 * não o agendamento, por dois motivos: ele exercita `interessadosNoFato` de
 * ponta a ponta por HTTP (sem importar módulo `server-only`, que não carrega
 * fora do Next), e ele é o alerta que o CLAUDE.md §9.8 prometia e **nunca
 * chegava a ninguém** — o evento era emitido por gatilho no banco desde
 * 2026-09-23 e morria ali.
 *
 * O que se prova:
 *  - quem responde pelo módulo na unidade recebe;
 *  - quem só tem VIEW não recebe — ver não é responder pelo que acontece;
 *  - quem alcança a rede inteira (`branch_id` nulo) recebe;
 *  - quem é de outra unidade não recebe;
 *  - rodar o job duas vezes não avisa duas vezes.
 */

const criados: { tabela: string; id: string }[] = []

test.afterAll(async () => {
  const db = banco()
  for (const { tabela, id } of [...criados].reverse()) {
    await db.from(tabela).delete().eq('id', id)
  }
})

/** Cria um cargo com um nível num módulo, e devolve o id. */
async function cargoCom(tenant: string, modulo: string, nivel: string, nome: string) {
  const db = banco()
  const { data, error } = await db.from('tenant_roles')
    .insert({
      tenant_id: tenant,
      key:   nomeDeTeste(nome).replace(/\W+/g, '_').toLowerCase(),
      label: nomeDeTeste(nome),
      is_system: false,
    })
    .select('id').single()
  if (error) throw new Error(`não criei o cargo ${nome}: ${error.message}`)
  criados.push({ tabela: 'tenant_roles', id: data!.id as string })

  const { error: pErr } = await db.from('role_permissions')
    .insert({ tenant_id: tenant, role_id: data!.id, module: modulo, level: nivel })
  if (pErr) throw new Error(`não dei ${nivel} em ${modulo}: ${pErr.message}`)
  return data!.id as string
}

/** Cria um membro com cargo e abrangência, e devolve o id. */
async function membro(tenant: string, roleId: string, branchId: string | null, nome: string) {
  const db = banco()
  const { data, error } = await db.from('users')
    .insert({
      tenant_id: tenant, branch_id: branchId, role_id: roleId,
      name:  nomeDeTeste(nome),
      email: `${nomeDeTeste(nome).replace(/\W+/g, '.').toLowerCase()}@e2e.local`,
      // NOT NULL e sem chave estrangeira para `auth.users`: um uuid novo basta
      // e não deixa conta pendurada no Auth.
      auth_id: crypto.randomUUID(),
      is_active: true,
    })
    .select('id').single()
  if (error) throw new Error(`não criei ${nome}: ${error.message}`)
  criados.push({ tabela: 'users', id: data!.id as string })
  return data!.id as string
}

test('o aviso vai para quem responde pelo módulo na unidade, e só para ele', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'CRON_SECRET não está no .env.local')

  const db      = banco()
  const tenant  = await tenantId()
  const filiais = await filiaisAtivas()
  const unidade = filiais[0]!
  const outra   = filiais[1]

  const cargoGerente = await cargoCom(tenant, 'stock', 'MANAGE', 'gerente de estoque')
  const cargoOlheiro = await cargoCom(tenant, 'stock', 'VIEW',   'olheiro de estoque')

  const gerenteDaUnidade = await membro(tenant, cargoGerente, unidade.id, 'gerente da unidade')
  const gerenteDaRede    = await membro(tenant, cargoGerente, null,       'gerente da rede')
  const olheiro          = await membro(tenant, cargoOlheiro, unidade.id, 'olheiro')
  const deOutraUnidade   = outra ? await membro(tenant, cargoGerente, outra.id, 'gerente de outra') : null

  // -- O fato: um produto cruzou o mínimo nesta unidade ---------------------
  const produto = nomeDeTeste('produto no mínimo')
  const { data: evento, error: evErr } = await db.from('domain_events')
    .insert({
      tenant_id: tenant, branch_id: unidade.id,
      nome: 'estoque.abaixo_do_minimo', entidade: 'estoque',
      dados: { produtoNome: produto, saldo: 1, minimo: 10, unidade: 'un' },
      ator_tipo: 'sistema', origem: 'banco', ocorrido_em: new Date().toISOString(),
    })
    .select('id').single()
  if (evErr) throw new Error(`não criei o evento: ${evErr.message}`)
  criados.push({ tabela: 'domain_events', id: evento!.id as string })

  // -- O job roda ------------------------------------------------------------
  const r = await request.get('/api/cron/estoque-minimo', {
    headers: { authorization: `Bearer ${segredo}` },
  })
  expect(r.ok(), await r.text()).toBe(true)

  const avisados = await quemFoiAvisado(evento!.id as string)

  expect(avisados, 'quem gerencia o estoque da unidade tem de receber').toContain(gerenteDaUnidade)
  expect(avisados, 'quem alcança a rede inteira também responde pela unidade').toContain(gerenteDaRede)
  expect(avisados, 'quem só consulta o estoque não é interrompido').not.toContain(olheiro)
  if (deOutraUnidade) {
    expect(avisados, 'o estoque de outra unidade não é assunto dele').not.toContain(deOutraUnidade)
  }

  // -- E rodar de novo não avisa de novo -------------------------------------
  // A janela do job tem folga de propósito (90 min para um ritmo de 60), então
  // o mesmo evento reaparece na execução seguinte. Quem evita a repetição é a
  // pergunta "já avisei deste?", e é isso que está sob teste.
  const r2 = await request.get('/api/cron/estoque-minimo', {
    headers: { authorization: `Bearer ${segredo}` },
  })
  expect(r2.ok()).toBe(true)
  expect((await r2.json()).repetidos, 'a segunda passada tinha de pular este evento').toBeGreaterThan(0)

  const depois = await quemFoiAvisado(evento!.id as string)
  expect(depois.length, 'ninguém pode ser avisado duas vezes do mesmo fato').toBe(avisados.length)
})

/** Ids de quem recebeu notificação daquele evento. */
async function quemFoiAvisado(eventoId: string): Promise<string[]> {
  const db = banco()
  const { data } = await db
    .from('user_notifications')
    .select('id, user_id')
    .eq('type', 'stock_below_minimum')
    .filter('data->>evento_id', 'eq', eventoId)

  for (const n of data ?? []) criados.push({ tabela: 'user_notifications', id: n.id as string })
  return (data ?? []).map(n => n.user_id as string)
}
