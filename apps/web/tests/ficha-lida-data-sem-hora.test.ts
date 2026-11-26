import { describe, it, expect, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000 })
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * D9 da 34ª (CLAUDE.md §14: "Exibir data SEM hora (…) com formatDate/new Date"
 * — é formatDia): a ficha LIDA (o atendimento concluído, a aba do prontuário)
 * mostrava o campo de data cru, "2026-06-10". A ficha de saúde lida também.
 */
vi.mock('@/actions/anamnesis', () => ({
  salvarFichaDoProcedimento: async () => ({ ok: true }),
  uploadAnamnesisPhoto: async () => ({}),
  signAnamnesisPhotos: async () => ({}),
}))
vi.mock('@/actions/pre-atendimento', () => ({ salvarAnamneseGeral: async () => ({ ok: true }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => '/x' }))

const rows = [{ id: 'r1', fields: [{ id: 'ultimo', type: 'date', label: 'Último procedimento' }] }]

describe('o campo de data na ficha lida é o dia, dd/mm/aaaa', () => {
  it('a ficha de atendimento', async () => {
    const { AnamnesisFormRenderer } = await import('@/components/branch/anamnesis-form-renderer')
    const html = renderToStaticMarkup(createElement(AnamnesisFormRenderer, {
      appointmentId: 'a', slug: 's', formName: 'Ficha facial', rows: rows as never, initial: { ultimo: '2026-06-10' }, canEdit: false,
    }))
    expect(html).toContain('10/06/2026')
    expect(html).not.toContain('2026-06-10')
  })
  it('a ficha de saúde', async () => {
    const { RespostasDaAnamnese } = await import('@/components/branch/anamnese-geral')
    const html = renderToStaticMarkup(createElement(RespostasDaAnamnese, { rows: rows as never, respostas: { ultimo: '2026-06-10' } }))
    expect(html).toContain('10/06/2026')
    expect(html).not.toContain('2026-06-10')
  })
})
