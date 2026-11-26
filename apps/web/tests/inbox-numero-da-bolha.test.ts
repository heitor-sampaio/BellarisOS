import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comNumeroDeSaida, redeTemVariosNumeros, textoDoNumeroDeSaida } from '@/lib/inbox/numero-da-bolha'

/**
 * A2 da 32ª simulação (WL-06, decisão do Claude: "O histórico mostra por qual
 * número cada mensagem saiu"; a Decisão A da 32ª: a "Não enviada" diz o número
 * por onde tentou sair). Só quando a rede tem mais de um número.
 */

const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

const NUMEROS = [
  { id: 'n1', label: 'Atendimento' },
  { id: 'n2', label: 'Comercial' },
]

describe('a bolha enviada diz por qual número saiu', () => {
  it('com dois números, a que saiu (ou tentou) diz o dela; a recebida, não', () => {
    const r = comNumeroDeSaida([
      { id: 'a', direction: 'outbound', whatsapp_number_id: 'n2' },
      { id: 'b', direction: 'inbound',  whatsapp_number_id: 'n1' },
      { id: 'c', direction: 'outbound', whatsapp_number_id: null },
    ], NUMEROS)
    expect(r.map(m => m.saiu_por)).toEqual(['Comercial', null, null])
  })

  it('com um número só (o removido não conta), nada', () => {
    const um = [{ id: 'n1', label: 'Atendimento' }, { id: 'n2', label: 'Antigo', removido_em: '2026-11-01' }]
    expect(redeTemVariosNumeros(um)).toBe(false)
    expect(comNumeroDeSaida([{ id: 'a', direction: 'outbound', whatsapp_number_id: 'n1' }], um)[0]!.saiu_por).toBeNull()
  })

  it('o removido segue com o nome no histórico, quando a rede tem outros dois', () => {
    const tres = [...NUMEROS, { id: 'n3', label: 'Antigo', removido_em: '2026-11-01' }]
    expect(comNumeroDeSaida([{ id: 'a', direction: 'outbound', whatsapp_number_id: 'n3' }], tres)[0]!.saiu_por).toBe('Antigo')
  })

  it('o texto', () => {
    expect(textoDoNumeroDeSaida('Comercial')).toBe('pelo número Comercial')
  })

  it('getMessages lê a caixa da mensagem e os números da rede (sem a credencial), e a bolha mostra', () => {
    const acoes = fonte('actions/inbox.ts')
    const get = acoes.slice(acoes.indexOf('export async function getMessages('), acoes.indexOf('function plataformaDoLink('))
    expect(get).toMatch(/whatsapp_number_id/)
    expect(get).toMatch(/from\('whatsapp_numbers'\)\s*\.select\('id, label, removido_em'\)/)
    expect(get).toMatch(/comNumeroDeSaida\(/)
    const inbox = fonte('components/admin/crm-inbox.tsx')
    expect(inbox).toMatch(/data-numero-de-saida/)
    expect(inbox).toMatch(/textoDoNumeroDeSaida\(msg\.saiu_por\)/)
  })
})
