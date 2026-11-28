import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linhasDoRodapeDoDesativar, quemMudaOCargoDaPropriaAdmin } from '@/lib/equipe/textos-do-cadastro'

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\r/g, '')

/**
 * A8 da 40ª simulação (EQ-11; princípio 3): escolher o cargo de Admin da rede
 * sumia com o campo "Unidades", e a tela não dizia que a abrangência vira "A
 * rede inteira". O campo fica, travado em "A rede inteira" (o que vale), em vez
 * de sumir — sem frase nova.
 */
describe('A8: o cargo de Admin da rede mostra "A rede inteira" travada', () => {
  it('o campo "Unidades" tem a forma travada', () => {
    const f = fonte('components/shared/unidades-do-membro.tsx')
    expect(f).toMatch(/export function UnidadesTravadasNaRede\(/)
    expect(f).toMatch(/data-unidades-travadas[\s\S]{0,400}disabled/)
  })
  it('o "Adicionar membro" da rede a mostra com o cargo de Admin', () => {
    const f = fonte('components/admin/team-form.tsx')
    expect(f).toMatch(/ehAdmin \? \(\s*<UnidadesTravadasNaRede/)
  })
  it('a edição a mostra com o cargo de Admin (escolhido ou o da própria Admin)', () => {
    const f = fonte('components/admin/team-member-edit.tsx')
    expect(f).toMatch(/\(paraAdmin \|\| cargoFixo\) && <UnidadesTravadasNaRede/)
  })
})

/**
 * A9 da 40ª simulação (princípio 7): o rodapé do Desativar somava os
 * agendamentos e as oportunidades ("4 para repassar"). Cada um na sua linha.
 */
describe('A9: o rodapé do Desativar separa agendamentos e oportunidades', () => {
  it('cada contagem com o que é', () => {
    expect(linhasDoRodapeDoDesativar({ agendamentosRepassados: 2, agendamentosCancelados: 1, oportunidadesRepassadas: 3 }))
      .toEqual(['2 agendamentos para repassar', '1 agendamento para cancelar', '3 oportunidades para repassar'])
    expect(linhasDoRodapeDoDesativar({ agendamentosRepassados: 1, agendamentosCancelados: 0, oportunidadesRepassadas: 1 }))
      .toEqual(['1 agendamento para repassar', '1 oportunidade para repassar'])
    expect(linhasDoRodapeDoDesativar({ agendamentosRepassados: 0, agendamentosCancelados: 0, oportunidadesRepassadas: 0 })).toEqual([])
  })
  it('a janela usa as linhas, uma embaixo da outra', () => {
    const f = fonte('components/admin/desativar-membro.tsx')
    expect(f).toContain('linhasDoRodapeDoDesativar(')
    expect(f).not.toMatch(/para repassar` : ''/)
  })
})

/**
 * A11 da 40ª simulação (EQ-13: a última Admin ativa não pode ser rebaixada nem
 * desativada): à dona que é a ÚLTIMA Admin, a Equipe dizia "outra Admin da rede
 * muda." — não há outra.
 */
describe('A11: a própria Admin, quando é a última', () => {
  it('o texto diz o que vale', () => {
    expect(quemMudaOCargoDaPropriaAdmin(false)).toBe('outra Admin da rede muda.')
    expect(quemMudaOCargoDaPropriaAdmin(true)).toBe('ninguém muda enquanto você for a única Admin da rede ativa.')
  })
  it('a janela e a página passam a marca', () => {
    expect(fonte('components/admin/team-member-edit.tsx')).toMatch(/\{fala\(quemMudaOCargoDaPropriaAdmin\(!!cargoFixo\.ultimaAdmin\)\)\}/)
    expect(fonte('app/admin/team/page.tsx')).toMatch(/ultimaAdmin: souAUltimaAdmin/)
  })
})
