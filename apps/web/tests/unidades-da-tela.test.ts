import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  resumoDoQueFica, temOQueFicou, nomeNaTela, escolherUnidadesDeLeitura, caminhosDoQueFica, NADA_FICA, type OQueFicaNaUnidade,
} from '@/lib/unidades/o-que-fica'

/**
 * A unidade desativada (F72; H6 em `plataforma.md`, C45 em `indicadores.md`;
 * D1, D2 e A32 da 14ª simulação). A regra é UMA: o que ainda tem movimento,
 * saldo ou pendência na unidade desativada continua CONTADO nos totais e
 * ALCANÇÁVEL pelo `?unidade=`, com o selo "Unidade desativada"; só os
 * seletores para coisa NOVA seguem só as ativas. Quem decide é
 * `lib/unidades/da-tela.ts` (`unidadesParaLer` × `unidadesParaCriar`) — a
 * tela que filtra `is_active` por conta própria é a sobra de volta (os
 * Relatórios, o dashboard, a agenda, o estoque, as comissões e o fechamento
 * da rede, todos com o seu `.eq('is_active', true)`).
 */
const RAIZ = path.resolve(__dirname, '..')

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of fs.readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const cheio = path.join(dir, nome)
    if (fs.statSync(cheio).isDirectory()) arquivos(cheio, achados)
    else if (/\.tsx?$/.test(nome)) achados.push(cheio)
  }
  return achados
}

describe('as telas não decidem sozinhas quais unidades mostram', () => {
  it('nenhuma página, layout, rota ou componente lê as unidades com o próprio filtro de ativa', () => {
    const culpados: string[] = []
    for (const dir of ['app', 'components']) {
      for (const f of arquivos(path.join(RAIZ, dir))) {
        const texto = fs.readFileSync(f, 'utf8')
        for (const m of texto.matchAll(/\.from\(\s*'branches'\s*\)/g)) {
          // A cadeia da consulta: até a próxima tabela ou o fim do comando.
          const resto = texto.slice(m.index! + m[0].length)
          const fim = resto.search(/\.from\(|;\s*\n|\n\s*\n/)
          const cadeia = fim < 0 ? resto : resto.slice(0, fim)
          if (/\.eq\(\s*'is_active'/.test(cadeia)) {
            const linha = texto.slice(0, m.index).split('\n').length
            culpados.push(`${path.relative(RAIZ, f).split(path.sep).join('/')}:${linha}`)
          }
        }
      }
    }
    expect(culpados, 'use unidadesParaLer / unidadesParaCriar (lib/unidades/da-tela.ts)').toEqual([])
  })
})

const tudo = (o: Partial<OQueFicaNaUnidade>): OQueFicaNaUnidade => ({ ...NADA_FICA, ...o })

describe('o que fica na unidade', () => {
  it('a janela diz a equipe, a agenda, o estoque, o a receber e a comissão a pagar', () => {
    const texto = resumoDoQueFica('Pampulha', tudo({
      fixos: [{ id: '1', nome: 'Zélia' }, { id: '2', nome: 'Elisa' }],
      agendamentos: 3,
      estoque: { itens: 4, valor: 894.8 },
      aReceber: 330,
      atendimentosSemPagamento: { n: 1, valor: 150 },
      comissaoAPagar: 39,
    }))!.replace(/ /g, ' ')
    expect(texto).toContain('A unidade Pampulha tem')
    expect(texto).toContain('2 pessoas da equipe só nela')
    expect(texto).toContain('3 agendamentos marcados')
    expect(texto).toContain('R$ 894,80 em estoque (4 itens)')
    expect(texto).toContain('R$ 330,00 a receber')
    expect(texto).toContain('1 atendimento concluído sem pagamento')
    expect(texto).toContain('R$ 39,00 de comissão a pagar')
  })

  it('nada fica: sem resumo', () => {
    expect(resumoDoQueFica('Pampulha', NADA_FICA)).toBeNull()
    expect(temOQueFicou(NADA_FICA)).toBe(false)
  })

  it('cada pendência sozinha conta', () => {
    expect(temOQueFicou(tudo({ agendamentos: 1 }))).toBe(true)
    expect(temOQueFicou(tudo({ estoque: { itens: 1, valor: 0 } }))).toBe(true)
    expect(temOQueFicou(tudo({ aReceber: 10 }))).toBe(true)
    expect(temOQueFicou(tudo({ atendimentosSemPagamento: { n: 1, valor: 50 } }))).toBe(true)
    expect(temOQueFicou(tudo({ comissaoAPagar: 5 }))).toBe(true)
  })
})

describe('as unidades de leitura', () => {
  const ativa = { id: 'a', name: 'Savassi', ativa: true }
  const fechadaComAlgo = { id: 'b', name: 'Pampulha', ativa: false }
  const fechadaVazia = { id: 'c', name: 'Antiga', ativa: false }

  it('as ativas e as desativadas que ainda têm o que ficou', () => {
    expect(escolherUnidadesDeLeitura([ativa, fechadaComAlgo, fechadaVazia], new Set(['b'])).map(u => u.id)).toEqual(['a', 'b'])
  })

  it('a desativada leva o selo no nome da tela; a ativa, não', () => {
    expect(nomeNaTela(ativa)).toBe('Savassi')
    expect(nomeNaTela(fechadaComAlgo)).toBe('Pampulha (unidade desativada)')
  })
})

describe('os caminhos para resolver o que ficou (as telas que já existem)', () => {
  it('a agenda no dia do primeiro agendamento, o estoque, o a receber e as comissões da unidade', () => {
    const c = caminhosDoQueFica('u1', tudo({
      agendamentos: 2, diaDoPrimeiro: '2026-11-20', estoque: { itens: 3, valor: 90 }, aReceber: 10, comissaoAPagar: 5,
    }))
    expect(c.map(x => x.href)).toEqual([
      '/admin/agenda?unidade=u1&date=2026-11-20',
      '/admin/estoque?unidade=u1',
      '/admin/financeiro?unidade=u1&aberto=todos',
      '/admin/financeiro/comissoes?unidade=u1',
    ])
  })

  it('só o que ficou ganha caminho; nada ficou, nenhum', () => {
    expect(caminhosDoQueFica('u1', NADA_FICA)).toEqual([])
    expect(caminhosDoQueFica('u1', tudo({ atendimentosSemPagamento: { n: 1, valor: 80 } })).map(x => x.chave)).toEqual(['a-receber'])
  })
})
