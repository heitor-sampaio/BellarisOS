import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { validarGrafo } from '@/lib/automacoes/validar'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * D15 da 32ª simulação (princípio 4 e RX — o editor confere as referências).
 * A Rosalinda escreveu `{{first_name}}` (a variável das CAMPANHAS) no modelo
 * "Faltou"; a automação aceitou, e a mensagem da C09 saiu ", sentimos sua
 * falta hoje…", sem o nome. A validação recusa a variável que a automação não
 * conhece e diz a certa.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

const grafoCom = (texto: string): GrafoDeAutomacao => ({
  nos: [
    { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, config: { evento: 'agendamento.nao_compareceu' } },
    { id: 'm1', tipo: 'acao.mensagem', nome: 'Avisar a cliente', pos: { x: 260, y: 0 }, config: { canal: 'whatsapp', texto } },
  ],
  ligacoes: [{ id: 'l1', de: 'g1', para: 'm1' }],
} as unknown as GrafoDeAutomacao)

const erros = (texto: string) => validarGrafo(grafoCom(texto)).filter(p => p.grau === 'erro').map(p => p.mensagem)

describe('D15: a variável que a automação não conhece não liga', () => {
  it('{{first_name}} (das campanhas): recusa, e diz a variável certa', () => {
    const e = erros('{{first_name}}, sentimos sua falta hoje.')
    expect(e).toHaveLength(1)
    expect(e[0]).toBe('Em "Avisar a cliente", {{first_name}} é variável das campanhas, e a automação não a conhece: use {{cliente.nome}}.')
  })

  it('outra que não existe: recusa, e manda escolher pela lista', () => {
    const e = erros('Oi, {{paciente.nome}}!')
    expect(e).toHaveLength(1)
    expect(e[0]).toBe('Em "Avisar a cliente", a variável {{paciente.nome}} não existe nas automações: escolha uma pela lista de variáveis do campo (ex.: {{cliente.nome}}).')
  })

  it('as que existem passam: cliente, agendamento, oportunidade, conversa, o fato, os passos e as expressões', () => {
    expect(erros('Oi, {{cliente.nome}}! Seu {{agendamento.procedimento}} em {{agendamento.data}}.')).toEqual([])
    expect(erros("{{escolher(cliente.nome, lead.nome)}} {{evento.dados.procedimentoNome}} {{conversa.canal}}")).toEqual([])
    expect(erros("Oi {{cliente.nome ?? 'tudo bem'}} {{moeda(agendamento.valor)}}")).toEqual([])
  })

  it('a lista do validador é a das entidades que o contexto sabe carregar', () => {
    const contexto = fonte('lib/automacoes/contexto.ts')
    const doContexto = [...contexto.matchAll(/^\s{2}(\w+):\s+\{ entidade:/gm)].map(m => m[1]).sort()
    expect(doContexto.length).toBeGreaterThan(5)
    const validar = fonte('lib/automacoes/validar.ts')
    for (const raiz of doContexto) expect(validar, raiz!).toContain(`'${raiz}'`)
  })
})
