import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'

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
 * - **Um número por usuário**: se um usuário pudesse ter dois, escolher por qual
 *   ele fala viraria desempate de novo.
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

  test('um usuário fala por no máximo uma linha', async () => {
    const db = banco()
    const tenant = await tenantId()

    const { data: usuario } = await db.from('users')
      .select('id').eq('is_active', true).limit(1).maybeSingle<Linha>()
    test.skip(!usuario, 'o banco de dev não tem usuário ativo para vincular')

    const criadas: string[] = []
    try {
      const { data: a, error: erroA } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'uazapi',
          label: `${PREFIXO} do usuário`, user_id: usuario!.id,
        })
        .select('id').single<Linha>()
      expect(erroA, 'a primeira linha do usuário tem de entrar').toBeNull()
      criadas.push(a!.id)

      const { data: b, error: erroB } = await db.from('whatsapp_numbers')
        .insert({
          tenant_id: tenant, provider: 'official',
          label: `${PREFIXO} do usuário de novo`, user_id: usuario!.id,
        })
        .select('id').maybeSingle<Linha>()
      if (b?.id) criadas.push(b.id)

      expect(erroB?.code,
        'dois números para o mesmo usuário reintroduziriam o desempate silencioso',
      ).toBe('23505')
    } finally {
      if (criadas.length) await db.from('whatsapp_numbers').delete().in('id', criadas)
    }
  })

  test('a migração elegeu como padrão a mesma linha que o sistema já usava', async () => {
    const db = banco()
    const { data, error } = await db.from('whatsapp_numbers')
      .select('id, provider, is_active, is_default')
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
