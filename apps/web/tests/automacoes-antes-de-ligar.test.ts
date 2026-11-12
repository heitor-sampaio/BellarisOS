import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canaisParaACliente, textoAntesDeLigar, explicacaoAntesDeLigar } from '@/lib/automacoes/antes-de-ligar'

// A10 da 14ª simulação (F71; H1 do levantamento): a janela "Ligar a
// automação?" vale para todo fluxo que chega à cliente, push incluído — a
// regra num lugar só (lib/automacoes/antes-de-ligar.ts).

const no = (tipo: string, config: Record<string, unknown> = {}) => ({ id: tipo + Math.random(), tipo, pos: { x: 0, y: 0 }, config })

describe('canaisParaACliente', () => {
  it('o passo "Mandar mensagem" chega à cliente por qualquer canal', () => {
    expect(canaisParaACliente({ nos: [no('acao.mensagem', { canal: 'push' })] } as never)).toEqual(['push'])
    expect(canaisParaACliente({ nos: [no('acao.mensagem', { canal: 'whatsapp' }), no('acao.mensagem', { canal: 'push' })] } as never))
      .toEqual(['whatsapp', 'push'])
    expect(canaisParaACliente({ nos: [no('acao.mensagem', { canal: 'instagram' })] } as never)).toEqual(['instagram'])
  })
  it('avisar a equipe, marcar tag e anotar não chegam à cliente', () => {
    expect(canaisParaACliente({ nos: [no('gatilho.evento'), no('acao.notificar_equipe'), no('acao.tag_cliente'), no('acao.anotar')] } as never)).toEqual([])
  })
})

describe('textoAntesDeLigar', () => {
  it('WhatsApp: quantas têm conversa aberta (o texto do C65)', () => {
    expect(textoAntesDeLigar({ porBusca: true, quantas: 4, truncado: false, comConversa: 2 }))
      .toBe('Hoje a busca acharia 4 clientes, e 2 têm conversa aberta no WhatsApp.')
  })
  it('push: quantas vão receber o aviso no celular', () => {
    expect(textoAntesDeLigar({ porBusca: true, quantas: 3, truncado: false, comAparelho: 1 }))
      .toBe('Hoje a busca acharia 3 clientes, e 1 vai receber o aviso no celular.')
  })
  it('os dois canais no mesmo fluxo dizem as duas contas', () => {
    expect(textoAntesDeLigar({ porBusca: false, quantas: 10, truncado: false, comConversa: 4, comAparelho: 6 }))
      .toBe('Hoje a clínica tem 10 clientes ativas, e 4 têm conversa aberta no WhatsApp, e 6 vão receber o aviso no celular.')
  })
})

describe('explicacaoAntesDeLigar', () => {
  it('diz por onde chega, canal por canal', () => {
    expect(explicacaoAntesDeLigar(['whatsapp'])).toContain('não abre conversa nova')
    expect(explicacaoAntesDeLigar(['push'])).toContain('só chega a quem tem o app da clínica ou os avisos ligados no navegador')
    expect(explicacaoAntesDeLigar(['instagram'])).toContain('o Instagram')
  })
})

describe('o editor e a action seguem a regra única', () => {
  const editor = fs.readFileSync(path.resolve(__dirname, '../components/admin/automacoes/editor.tsx'), 'utf8')
  const acao = fs.readFileSync(path.resolve(__dirname, '../actions/automacoes.ts'), 'utf8')
  it('o editor decide pela canaisParaACliente, não pelo canal à mão', () => {
    expect(editor).toContain("from '@/lib/automacoes/antes-de-ligar'")
    expect(editor).toContain('canaisParaACliente(')
    expect(editor).not.toMatch(/canal\s*===\s*'whatsapp'/)
  })
  it('a conta antes de ligar conta o push pela régua do disparo (publico_com_aparelho)', () => {
    expect(acao).toMatch(/contarAntesDeLigar[\s\S]*contarPublicoComAparelho/)
  })
})
