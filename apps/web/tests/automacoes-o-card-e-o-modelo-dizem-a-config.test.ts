import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'
import { caminhoDoFluxo } from '@/lib/automacoes/caminho-do-fluxo'
import { interpolarTexto } from '@/lib/automacoes/variaveis'
import { validarGrafo } from '@/lib/automacoes/validar'
import { CAMPOS_DAS_ENTIDADES } from '@/lib/automacoes/disponiveis'

/**
 * D7 da 38ª: o card do "Parabéns no aniversário" na lista dizia "Todo dia às
 * 9h" com o fluxo rodando às 11:15 — o card mostrava o NOME do nó gatilho, que
 * nasce fixo no modelo. Princípio 3 e automacoes:ED-08 ("o relógio diz o
 * dia"): o card diz o gatilho pela configuração dele, também nas automações já
 * criadas do modelo (o nome gravado fica como está).
 *
 * A15 da 38ª: o texto do modelo "Retorno depois do atendimento" trazia a
 * variável técnica `{{evento.dados.procedimentoNome}}`, quando os outros
 * modelos usam `{{agendamento.procedimento}}` (ED-08: "os campos aparecem pelo
 * nome"). O de quem já criou o modelo continua resolvendo.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const modelo = (chave: string) => MODELOS_DE_AUTOMACAO.find(m => m.chave === chave)!.grafo()

const aniversarioAs = (hora: string): GrafoDeAutomacao => {
  const g = modelo('aniversario')
  return { ...g, nos: g.nos.map(n => (n.tipo === NODES.GATILHO_AGENDA ? { ...n, config: { ...n.config, hora } } : n)) }
}

describe('D7: o card da lista diz o horário gravado do gatilho', () => {
  it('o aniversário às 11:15 diz "Todo dia às 11:15", não o nome do modelo', () => {
    const caminho = caminhoDoFluxo(aniversarioAs('11:15'))
    expect(caminho[0]).toBe('Todo dia às 11:15')
    expect(caminho).not.toContain('Todo dia às 9h')
  })

  it('o mensal diz o dia e a hora gravados', () => {
    const g = modelo('reativacao')
    const com = { ...g, nos: g.nos.map(n => (n.tipo === NODES.GATILHO_AGENDA ? { ...n, config: { frequencia: 'mensal', diaDoMes: 15, hora: '10:30' } } : n)) }
    expect(caminhoDoFluxo(com as GrafoDeAutomacao)[0]).toBe('Todo mês, dia 15, às 10:30')
  })

  it('fora de Brasília, diz o relógio da rede, como o editor', () => {
    expect(caminhoDoFluxo(aniversarioAs('11:15'), 'America/Rio_Branco')[0]).toBe('Todo dia às 11:15 (horário de Rio Branco)')
  })

  it('a lista passa o fuso da rede ao caminho do fluxo', () => {
    expect(fonte('actions/automacoes.ts')).toMatch(/caminhoDoFluxo\(a\.grafo as GrafoDeAutomacao \| null, fuso\)/)
  })
})

describe('A15: o modelo de retorno usa a variável pelo nome', () => {
  const textoDoRetorno = () => {
    const msg = modelo('retorno-depois-do-atendimento').nos.find(n => n.tipo === NODES.ACAO_MENSAGEM)!
    return String((msg.config as { texto?: string }).texto)
  }

  it('o texto usa {{agendamento.procedimento}}, como os outros modelos', () => {
    expect(textoDoRetorno()).toContain('{{agendamento.procedimento}}')
    expect(textoDoRetorno()).not.toContain('evento.dados')
  })

  it('é a variável que o editor oferece como "Procedimento"', () => {
    const itens = CAMPOS_DAS_ENTIDADES.flatMap(g => g.itens)
    expect(itens.find(i => i.caminho === 'agendamento.procedimento')?.rotulo).toBe('Procedimento')
  })

  it('o texto antigo (das redes que já criaram o modelo) continua resolvendo e ligando', () => {
    const antigo = 'Oi, {{cliente.nome}}! Já faz um mês do seu {{evento.dados.procedimentoNome}}.'
    expect(interpolarTexto(antigo, { cliente: { nome: 'Iraneide' }, evento: { dados: { procedimentoNome: 'Limpeza de pele' } } }))
      .toBe('Oi, Iraneide! Já faz um mês do seu Limpeza de pele.')
    const g = modelo('retorno-depois-do-atendimento')
    const comAntigo = { ...g, nos: g.nos.map(n => (n.tipo === NODES.ACAO_MENSAGEM ? { ...n, config: { ...n.config, texto: antigo } } : n)) }
    expect(validarGrafo(comAntigo).filter(p => p.grau === 'erro').map(p => p.mensagem).join(' ')).not.toMatch(/procedimentoNome/)
  })
})
