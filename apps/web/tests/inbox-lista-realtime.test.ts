import { describe, it, expect } from 'vitest'
import { destinoDoEvento } from '@/lib/inbox/lista'

/**
 * O defeito que isto guarda: **conversa nova não aparecia no inbox** sem
 * recarregar a página — só mensagem nova em conversa já aberta atualizava
 * sozinha.
 *
 * A causa não estava no banco (a publicação e as policies entregam o INSERT
 * normalmente): estava na ordem dos fatos. A conversa é criada muda, e
 * `getConversations` descarta quem não tem `last_message_at`; quando o trigger
 * `on_new_message` finalmente preenche o campo, o evento que chega é um
 * UPDATE, e o handler só sabia mesclar o que já estava na lista.
 */

const muda   = { id: 'c1', last_message_at: null }
const falou  = { id: 'c1', last_message_at: '2026-09-23T12:00:00Z' }

describe('destinoDoEvento', () => {
  it('o UPDATE que dá a primeira mensagem a quem não está na lista manda recarregar', () => {
    // O caso que motivou a correção.
    expect(destinoDoEvento(falou, false)).toBe('recarregar')
  })

  it('conversa que já está na lista é mesclada, não recarregada', () => {
    // Mensagem em conversa conhecida é o caminho comum: uma consulta a cada
    // mensagem trocada seria caro à toa.
    expect(destinoDoEvento(falou, true)).toBe('atualizar')
    expect(destinoDoEvento(muda,  true)).toBe('atualizar')
  })

  it('conversa ainda muda fora da lista é ignorada', () => {
    // É o INSERT do contato. Mostrá-la seria um card sem última mensagem que
    // sumiria no recarregamento seguinte.
    expect(destinoDoEvento(muda, false)).toBe('ignorar')
  })

  it('não insiste em quem o servidor já se recusou a devolver', () => {
    // Conversa de outro dono, com o escopo "só os meus" do CRM: o Realtime
    // entrega o evento (a RLS é por rede), mas a lista não a recebe. Sem esta
    // marca, cada mensagem trocada nela pediria a lista inteira de novo.
    expect(destinoDoEvento(falou, false, new Set(['c1']))).toBe('ignorar')
    expect(destinoDoEvento(falou, false, new Set(['outra']))).toBe('recarregar')
  })
})
