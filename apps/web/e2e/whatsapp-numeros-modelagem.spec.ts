import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'
import { criarOutraRede } from './apoio/outra-rede'

/**
 * As garantias de `whatsapp_numbers` moram no BANCO, e é lá que se confere.
 *
 * Duas delas existem para matar o mesmo defeito: a escolha silenciosa. Até
 * 2026-09-25 `getWhatsAppConfig` desempatava com `order by updated_at desc` e
 * pegava `data[0]` — com um número só ninguém via, com dois a rede passaria a
 * falar por quem tivesse sido salvo por último.
 *
 * - **Um padrão por rede**: se dois pudessem ser padrão, "por onde sai o que o
 *   sistema inicia" voltaria a ser uma pergunta sem resposta.
 * - **Um número por pessoa**: se uma pessoa pudesse ter dois, escolher por qual
 *   ela fala viraria desempate de novo. O contrário é livre — várias pessoas
 *   dividem um número (`whatsapp_number_users`, 2026-09-27).
 *
 * Garantia de app não serve aqui: ela vale enquanto todo mundo passar pela
 * action. Um `update` direto, um script de migração ou o próximo caminho de
 * escrita furam. Por isso índice único parcial, e por isso este teste fala com
 * o banco em vez de com a tela.
 */

type Linha = { id: string }

test.describe('whatsapp_numbers: o banco recusa o ambíguo', () => {
  test('duas linhas não podem ser o padrão da mesma rede', async () => {
    const db = banco()
    const tenant = await tenantId()
    const criadas: string[] = []

    try {
      const { data: a, error: erroA } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} caixa A`, is_default: false,
        })
        .select('id').single<Linha>()
      expect(erroA, 'criar uma linha comum tem de funcionar').toBeNull()
      criadas.push(a!.id)

      // Já existe um padrão na rede (a migração elegeu um). Uma segunda linha
      // reivindicando o posto tem de bater no índice, não passar.
      const { error: erroPadrao } = await db.from('whatsapp_numbers')
        .update({ is_default: true }).eq('id', a!.id)

      expect(erroPadrao?.code,
        'dois padrões na mesma rede fariam "por onde o sistema envia" voltar a ser desempate',
      ).toBe('23505')
    } finally {
      if (criadas.length) await db.from('whatsapp_numbers').delete().in('id', criadas)
    }
  })

  // Desde 2026-09-27 o vínculo mora em `whatsapp_number_users`: VÁRIAS pessoas
  // por número (um número de atendimento, três SDRs), e ainda um número por
  // pessoa. Os usuários vêm do banco sem que nenhum deles possa já estar
  // vinculado — o teste não pode depender de a rede de dev estar sem vínculos.
  async function usuariosLivres(tenant: string, quantos: number) {
    const db = banco()
    const { data: ocupados } = await db.from('whatsapp_number_users').select('user_id')
    const fora = (ocupados ?? []).map(o => o.user_id as string)
    const { data } = await db.from('users')
      .select('id').eq('tenant_id', tenant).eq('is_active', true).limit(quantos + fora.length)
    return (data ?? []).map(u => u.id as string).filter(id => !fora.includes(id)).slice(0, quantos)
  }

  test('um número aceita várias pessoas', async () => {
    const db = banco()
    const tenant = await tenantId()
    const pessoas = await usuariosLivres(tenant, 3)
    test.skip(pessoas.length < 2, 'o banco de dev não tem duas pessoas livres para vincular')

    let numero: string | null = null
    try {
      const { data: a } = await db.from('whatsapp_numbers')
        .insert({ tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} atendimento` })
        .select('id').single<Linha>()
      numero = a!.id

      const { error } = await db.rpc('definir_vinculos_do_numero', {
        p_numero: numero, p_tenant: tenant, p_label: `${PREFIXO} atendimento`,
        p_branch: null, p_usuarios: pessoas,
      })
      expect(error, 'várias pessoas no mesmo número é o caso normal').toBeNull()

      const { data: vinc } = await db.from('whatsapp_number_users')
        .select('user_id').eq('whatsapp_number_id', numero)
      expect((vinc ?? []).map(v => v.user_id).sort()).toEqual([...pessoas].sort())

      // A lista é a INTEIRA: salvar sem alguém tira essa pessoa.
      await db.rpc('definir_vinculos_do_numero', {
        p_numero: numero, p_tenant: tenant, p_label: `${PREFIXO} atendimento`,
        p_branch: null, p_usuarios: pessoas.slice(1),
      })
      const { data: depois } = await db.from('whatsapp_number_users')
        .select('user_id').eq('whatsapp_number_id', numero)
      expect((depois ?? []).map(v => v.user_id)).not.toContain(pessoas[0])
    } finally {
      if (numero) await db.from('whatsapp_numbers').delete().eq('id', numero)
    }
  })

  test('uma pessoa fala por no máximo um número — e a falha não salva metade', async () => {
    const db = banco()
    const tenant = await tenantId()
    const [pessoa] = await usuariosLivres(tenant, 1)
    test.skip(!pessoa, 'o banco de dev não tem pessoa livre para vincular')

    const criadas: string[] = []
    try {
      for (const nome of ['A', 'B']) {
        const { data } = await db.from('whatsapp_numbers')
          .insert({ tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} caixa ${nome}` })
          .select('id').single<Linha>()
        criadas.push(data!.id)
      }

      const { error: erroA } = await db.rpc('definir_vinculos_do_numero', {
        p_numero: criadas[0], p_tenant: tenant, p_label: `${PREFIXO} caixa A`,
        p_branch: null, p_usuarios: [pessoa],
      })
      expect(erroA).toBeNull()

      const { error: erroB } = await db.rpc('definir_vinculos_do_numero', {
        p_numero: criadas[1], p_tenant: tenant, p_label: `${PREFIXO} renomeada`,
        p_branch: null, p_usuarios: [pessoa],
      })
      expect(erroB?.code,
        'dois números para a mesma pessoa reintroduziriam o desempate silencioso',
      ).toBe('23505')

      // Transação: o nome novo da caixa B não pode ter ficado gravado.
      const { data: b } = await db.from('whatsapp_numbers').select('label').eq('id', criadas[1]).single()
      expect(b!.label).toBe(`${PREFIXO} caixa B`)
    } finally {
      if (criadas.length) await db.from('whatsapp_numbers').delete().in('id', criadas)
    }
  })

  // A pessoa de fora vem de uma rede `[e2e]` criada aqui. Antes o teste
  // procurava "um usuário de outra rede" no banco e pulava quando não achava —
  // e o banco só tem uma rede quando nenhum outro spec está com a sua de pé:
  // na completa, esta prova de isolamento nunca rodava.
  test('número de uma rede não aceita pessoa de outra', async () => {
    const db = banco()
    const tenant = await tenantId()
    const outra = await criarOutraRede(`wafront${Date.now().toString(36)}`)

    let numero: string | null = null
    try {
      const { data: a } = await db.from('whatsapp_numbers')
        .insert({ tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} fronteira` })
        .select('id').single<Linha>()
      numero = a!.id
      const { error } = await db.rpc('definir_vinculos_do_numero', {
        p_numero: numero, p_tenant: tenant, p_label: `${PREFIXO} fronteira`,
        p_branch: null, p_usuarios: [outra.professionalId],
      })
      expect(error?.code, 'a chave composta com tenant_id tem de recusar').toBe('23503')
    } finally {
      if (numero) await db.from('whatsapp_numbers').delete().eq('id', numero)
      await outra.limpar()
    }
  })

  test('a migração elegeu como padrão a mesma linha que o sistema já usava', async () => {
    const db = banco()
    const { data, error } = await db.from('whatsapp_numbers')
      .select('id, provider, is_active, is_default')
      .eq('tenant_id', await tenantId())
      .not('label', 'like', `${PREFIXO}%`)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
    expect(error).toBeNull()
    test.skip(!data?.length, 'a rede não tem número de WhatsApp cadastrado')

    // O desempate de `getWhatsAppConfig` era exatamente esta ordenação, e
    // `data[0]`. Se a migração tivesse elegido outra linha, no dia em que ela
    // rodou a rede teria passado a falar por um número diferente sem ninguém
    // ter pedido.
    const padroes = data!.filter(n => n.is_default)
    expect(padroes.length, 'a rede precisa de exatamente um padrão').toBe(1)
    expect(padroes[0]!.id, 'o padrão tem de ser a linha que o desempate antigo escolhia')
      .toBe(data![0]!.id)
  })
})
