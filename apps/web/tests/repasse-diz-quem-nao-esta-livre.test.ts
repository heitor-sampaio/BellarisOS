import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * No repasse do Desativar, a linha sem ninguém livre dizia só "Ninguém livre
 * que atenda nesta unidade…" — a Glória, que atende ali e tinha atendimento no
 * mesmo horário em Teresópolis, não aparecia nem era citada (A9 da 43ª;
 * princípio 7, a tela fica óbvia dizendo quem está ocupado).
 *
 * A lista de quem recebe segue só com quem está livre (o Heitor, 26/11, R14:
 * "Horarios, salas e pessoas não disponíveis não devem aparecer nas listas"):
 * é a linha que diz quem atende ali e não está livre, e por quê (decisão do
 * Claude, 28/11).
 */
const pessoa = (id: string, nome: string) => ({ id, nome })

describe('quem atende na unidade e não está livre no horário, dito na linha', () => {
  it('a ocupada, a bloqueada e a fora do horário, cada uma com o motivo', async () => {
    const { quemNaoEstaLivre } = await import('@/lib/equipe/textos-do-cadastro')
    expect(quemNaoEstaLivre({ ocupadas: [pessoa('g', 'Glória')], bloqueadas: [], foraDoHorario: [] }))
      .toBe('Glória tem atendimento nesse horário')
    expect(quemNaoEstaLivre({
      ocupadas: [pessoa('g', 'Glória')], bloqueadas: [pessoa('a', 'Ana')], foraDoHorario: [pessoa('b', 'Bia')],
    })).toBe('Glória tem atendimento nesse horário; Ana está com o horário bloqueado; Bia está fora do horário de atendimento')
  })

  it('ninguém que atenda ali: nada', async () => {
    const { quemNaoEstaLivre } = await import('@/lib/equipe/textos-do-cadastro')
    expect(quemNaoEstaLivre({ ocupadas: [], bloqueadas: [], foraDoHorario: undefined })).toBeNull()
  })

  it('a linha do repasse diz quem não está livre', () => {
    const tela = readFileSync(path.join(__dirname, '..', 'components/admin/desativar-membro.tsx'), 'utf8')
    expect(tela).toMatch(/const naoLivres = quemNaoEstaLivre\(a\)/)
    expect(tela).toMatch(/data-quem-nao-esta-livre/)
  })
})
