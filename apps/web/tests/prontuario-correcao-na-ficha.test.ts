import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildRecordForms } from '@/lib/record-forms'

/**
 * PT-11 e CLAUDE.md §11 ("o clínico (ficha de saúde, evolução, fotos) é do
 * Prontuário em Gerenciar, sem precisar atender"; o Heitor, 23/11: corrigir o
 * concluído é só do Prontuário em Gerenciar, "3 - ok"). O "Editar registro"
 * só existia na tela do atendimento, que abre com o Atendimento — quem tinha o
 * Prontuário em Gerenciar sem o Atendimento lia o registro na ficha e não o
 * corrigia (D4 da 31ª simulação). A correção mora também onde ela lê o
 * registro: a aba Prontuário da ficha, no atendimento concluído.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/actions/appointments', () => ({ saveDraftNotes: async () => ({ success: true }) }))
vi.mock('@/components/branch/anamnesis-form-renderer', () => ({ AnamnesisFormRenderer: () => null }))

const ler = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('a correção do registro na aba Prontuário da ficha', () => {
  it('cada registro diz se o atendimento foi concluído (só o concluído se corrige)', () => {
    const r = buildRecordForms([
      { appointment_id: 'feito', notes: 'Evolução', intercurrences: null, form_data: null, created_at: '2026-11-25T10:00:00Z' },
      { appointment_id: 'aberto', notes: 'Rascunho', intercurrences: null, form_data: null, created_at: '2026-11-25T11:00:00Z' },
    ], new Map(), new Map(), new Set(['feito']))
    expect(Object.fromEntries(r.map(e => [e.appointmentId, (e as { concluido?: boolean }).concluido]))).toEqual({ feito: true, aberto: false })
  })

  it('o cartão da correção oferece "Corrigir o registro"', async () => {
    const { CorrecaoDoRegistro } = await import('@/components/branch/correcao-do-registro')
    const html = renderToStaticMarkup(createElement(CorrecaoDoRegistro, {
      appointmentId: 'feito', slug: 'unidade', evolucao: 'Evolução', intercorrencias: null, ficha: null,
    }))
    expect(html).toContain('Corrigir o registro')
    expect(html).toContain('data-corrigir-registro')
  })

  it('a ficha mostra a correção a quem anota no prontuário (o Prontuário em Gerenciar), só no concluído', () => {
    const fonte = ler('components/branch/client-profile.tsx')
    const aba = fonte.slice(fonte.indexOf("{tab === 'fichas' && ("))
    expect(aba).toMatch(/podeAnotar && entry\.concluido[\s\S]{0,80}<CorrecaoDoRegistro/)
  })

  it('as actions da correção pedem o Prontuário em Gerenciar, e não o Atendimento', () => {
    const corpo = (arquivo: string, funcao: string) => {
      const f = ler(arquivo)
      const i = f.indexOf(`async function ${funcao}`)
      return f.slice(i, f.indexOf('\n}\n', i))
    }
    for (const [arquivo, funcao] of [['actions/appointments.ts', 'saveDraftNotesInterno'], ['actions/anamnesis.ts', 'salvarFichaDoProcedimento']] as const) {
      const c = corpo(arquivo, funcao)
      expect(c, funcao).toMatch(/'medical_records', 'MANAGE'/)
      expect(c, funcao).not.toMatch(/'atendimento'/)
    }
    expect(ler('components/branch/correcao-do-registro.tsx')).toMatch(/saveDraftNotes/)
  })
})
