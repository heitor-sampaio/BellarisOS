import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'

/**
 * O catálogo de templates é de uma WABA, não da rede.
 *
 * Com um número oficial por rede, "os templates da rede" e "os templates da
 * WABA" eram a mesma coisa. Com dois números em contas de negócio diferentes
 * deixam de ser — e oferecer na conversa um template que não existe na conta
 * que vai enviar dá **404 na Meta, no clique**, sem explicar nada. Lista vazia
 * é melhor resposta que erro no clique.
 *
 * O filtro é por WABA e não por número porque dois números podem compartilhar a
 * mesma conta: escopar por número duplicaria o catálogo aqui e faria submeter o
 * mesmo nome duas vezes à Meta, que recusa por colisão.
 *
 * Este teste confere a regra no BANCO (o índice único passou a incluir a WABA)
 * e na CONSULTA que a conversa faz. Não fala com a Meta.
 */

const marca = Date.now().toString(36)

type Linha = { id: string }

test('o mesmo nome de template convive em duas WABAs', async () => {
  const db     = banco()
  const tenant = await tenantId()
  const nome   = `e2e_lembrete_${marca}`
  const criados: string[] = []

  try {
    for (const waba of [`e2e-waba-A-${marca}`, `e2e-waba-B-${marca}`]) {
      const { data, error } = await db.from('message_templates')
        .insert({
          tenant_id: tenant, name: nome, language: 'pt_BR',
          category: 'UTILITY', status: 'APPROVED',
          body_text: `${PREFIXO} corpo`, waba_id: waba,
        })
        .select('id').single<Linha>()
      expect(error, `o nome se repete entre WABAs — a colisão é DENTRO de uma`)
        .toBeNull()
      criados.push(data!.id)
    }
    expect(criados.length).toBe(2)

    // Dentro da MESMA WABA, o nome continua único: é a Meta que indexa o
    // template por ele, e dois iguais fariam a segunda submissão ser recusada.
    const { error: erroDuplicado } = await db.from('message_templates')
      .insert({
        tenant_id: tenant, name: nome, language: 'pt_BR',
        category: 'UTILITY', status: 'APPROVED',
        body_text: `${PREFIXO} corpo`, waba_id: `e2e-waba-A-${marca}`,
      })
    expect(erroDuplicado?.code, 'o nome segue único dentro de uma WABA').toBe('23505')
  } finally {
    if (criados.length) await db.from('message_templates').delete().in('id', criados)
  }
})

test('a conversa só enxerga o catálogo da WABA que vai enviar', async () => {
  const db     = banco()
  const tenant = await tenantId()
  const wabaA  = `e2e-waba-A-${marca}b`
  const wabaB  = `e2e-waba-B-${marca}b`
  const criados: string[] = []

  try {
    for (const [waba, sufixo] of [[wabaA, 'a'], [wabaB, 'b']] as const) {
      const { data } = await db.from('message_templates')
        .insert({
          tenant_id: tenant, name: `e2e_so_da_${sufixo}_${marca}`, language: 'pt_BR',
          category: 'UTILITY', status: 'APPROVED',
          body_text: `${PREFIXO} corpo`, waba_id: waba,
        })
        .select('id').single<Linha>()
      if (data) criados.push(data.id)
    }

    // A consulta que `getTemplatesParaConversa` faz, com a WABA da caixa de
    // saída. Antes ela filtrava só por tenant, e devolveria os dois.
    const { data: daA } = await db.from('message_templates')
      .select('name').eq('tenant_id', tenant).eq('waba_id', wabaA).eq('status', 'APPROVED')

    const nomes = (daA ?? []).map(t => t.name as string)
    expect(nomes, 'só o da WABA A').toEqual([`e2e_so_da_a_${marca}`])
  } finally {
    if (criados.length) await db.from('message_templates').delete().in('id', criados)
  }
})
