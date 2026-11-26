import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { opcoesDoFiltroDeTags } from '@/lib/tags/escolha'

/**
 * A tag ARQUIVADA como filtro (A6 e Decisão D da 33ª simulação; CLAUDE.md §1,
 * Tags: "onde tiver for passível de filtro, um dos filtros que ela pode usar
 * são as tags"; TG-08: arquivar tira das opções de MARCAR, e quem a tem
 * continua com ela). Arquivada a "Noiva 2027", ela seguia no filtro de
 * Clientes e do Inbox (de quem a tem) e sumia do filtro da Agenda, do Quadro,
 * do Financeiro e dos Relatórios — que liam só as ativas (`tagsAtivasDaRede`).
 * Como FILTRO, ela segue oferecida em toda tela enquanto alguém a tiver, por
 * uma fonte só (`comAsArquivadasEmUso`, `lib/tags/vocabulario.ts`).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('as opções do filtro de tags', () => {
  const uso = [
    { nome: 'VIP', arquivada_em: null, clientes: 5, contatos: 0 },
    { nome: 'Noiva 2027', arquivada_em: '2026-11-26T10:00:00Z', clientes: 3, contatos: 0 },
    { nome: 'Só contato', arquivada_em: '2026-11-26T10:00:00Z', clientes: 0, contatos: '2' },
    { nome: 'Ninguém tem', arquivada_em: '2026-11-26T10:00:00Z', clientes: 0, contatos: 0 },
  ]

  it('a arquivada que alguém tem entra; a que ninguém tem, não', () => {
    expect(opcoesDoFiltroDeTags(['Indicação', 'VIP'], uso)).toEqual(['Indicação', 'Noiva 2027', 'Só contato', 'VIP'])
  })

  it('sem arquivada em uso, são as ativas, como antes', () => {
    expect(opcoesDoFiltroDeTags(['VIP'], [{ nome: 'Velha', arquivada_em: '2026-01-01T00:00:00Z', clientes: 0, contatos: 0 }])).toEqual(['VIP'])
  })

  it('não repete o nome que já está entre as ativas (sem caixa)', () => {
    expect(opcoesDoFiltroDeTags(['vip'], [{ nome: 'VIP', arquivada_em: '2026-01-01T00:00:00Z', clientes: 1, contatos: 0 }])).toEqual(['vip'])
  })
})

describe('toda tela que filtra por tag lê as opções da mesma fonte', () => {
  const TELAS = [
    'app/admin/agenda/page.tsx', 'app/[slug]/agenda/page.tsx',
    'app/admin/financeiro/page.tsx', 'app/[slug]/financeiro/page.tsx',
    'app/admin/oportunidades/page.tsx', 'app/[slug]/oportunidades/page.tsx',
    'app/_shared/comissoes-da-equipe.tsx', 'app/_shared/documentos-emitidos.tsx',
    'components/admin/reports-bi-section.tsx',
  ]
  for (const tela of TELAS) {
    it(tela, () => {
      expect(fonte(tela)).toMatch(/comAsArquivadasEmUso\(/)
    })
  }
  it('a fonte junta as ativas e as arquivadas em uso, e só lê o uso quando há arquivada', () => {
    const v = fonte('lib/tags/vocabulario.ts')
    expect(v).toMatch(/export async function comAsArquivadasEmUso\(/)
    expect(v).toMatch(/opcoesDoFiltroDeTags\(/)
    expect(v).toMatch(/tags_da_rede/)
  })
})
