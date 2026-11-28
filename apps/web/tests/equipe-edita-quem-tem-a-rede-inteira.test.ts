import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alcancaOMembro, mantemAAbrangencia } from '@/lib/equipe/alcance-do-membro'

/**
 * D14 da 40ª simulação (EQ-05 do catálogo de Plataforma: "Para editar um
 * membro basta alcançar ALGUMA unidade dele; para trocar o cargo, desativar e
 * reativar, é preciso alcançar TODAS"; EQ-03: duas unidades não são a rede). A
 * Gilvânia (a Equipe em Gerenciar, Lavras e Varginha) não achava ação nenhuma
 * na linha do Edivaldo ("A rede inteira", atende nas duas): a tela não dava o
 * lápis, e a action dizia "Membro não encontrado.".
 *
 * Quem tem "A rede inteira" está em todas as unidades: quem alcança alguma
 * edita o "Atende" (só as unidades dela) e o horário, com o cargo travado; a
 * abrangência dele ("A rede inteira") fica como está — só quem a tem a dá ou a
 * tira. Trocar o cargo, desativar e reativar seguem de quem alcança todas
 * (decisão do Claude, 27/11, relatório da 40ª, Time E).
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\r/g, '')

describe('D14: o alcance de quem edita sobre o membro', () => {
  const daRede = { branch_id: null, outras_unidades: [] }
  it('quem tem unidades alcança, para editar, quem tem "A rede inteira"', () => {
    expect(alcancaOMembro(['L', 'V'], daRede)).toBe(true)
    expect(alcancaOMembro(['L'], daRede)).toBe(true)
  })
  it('mas não alcança TODAS as dele: cargo, desativar e reativar, não', () => {
    expect(alcancaOMembro(['L', 'V'], daRede, true)).toBe(false)
  })
  it('o de antes segue: a rede inteira alcança todos; o membro de outra unidade, ninguém de fora', () => {
    expect(alcancaOMembro(null, daRede, true)).toBe(true)
    expect(alcancaOMembro(['L'], { branch_id: 'V', outras_unidades: [] })).toBe(false)
    expect(alcancaOMembro(['L'], { branch_id: 'V', outras_unidades: ['L'] })).toBe(true)
    expect(alcancaOMembro(['L'], { branch_id: 'V', outras_unidades: ['L'] }, true)).toBe(false)
  })
  it('a abrangência de quem tem "A rede inteira" fica, editada por quem não a tem', () => {
    expect(mantemAAbrangencia(['L', 'V'], null)).toBe(true)
    expect(mantemAAbrangencia(null, null)).toBe(false)
    expect(mantemAAbrangencia(['L', 'V'], ['L'])).toBe(false)
  })
})

describe('D14: a action e a tela seguem a regra', () => {
  it('updateTeamMember usa o alcance de lib/equipe e não mexe na abrangência de quem tem a rede inteira', () => {
    const f = fonte('actions/team.ts')
    expect(f).toContain("from '@/lib/equipe/alcance-do-membro'")
    expect(f).not.toMatch(/function alcancaOMembro\(/)
    expect(f).toMatch(/const mantemAbrangencia = mantemAAbrangencia\(unidadesDoContexto\(ctx\), unidadesAntes\)/)
  })
  it('a Equipe da unidade dá o lápis, com o cargo travado, a quem edita sem ter a rede inteira', () => {
    const f = fonte('app/[slug]/team/page.tsx')
    const daRede = f.slice(f.indexOf('{daRede.map('))
    expect(daRede).toMatch(/<TeamMemberEdit/)
    expect(daRede).toMatch(/cargoTravado=\{CARGO_DE_QUEM_TEM_OUTRA_UNIDADE\}/)
    // Sem o desativar nem o reativar: pedem todas as unidades dele.
    expect(daRede.slice(0, daRede.indexOf('</tbody>'))).not.toMatch(/<DesativarMembro|<ReativarMembro/)
  })
  it('a janela não oferece "Unidades" de quem tem a rede inteira a quem não a tem', () => {
    const f = fonte('components/admin/team-member-edit.tsx')
    expect(f).toMatch(/const mostraUnidades = [^\n]*\(canChooseScope \|\| member\.branchId !== null\)/)
  })
})
