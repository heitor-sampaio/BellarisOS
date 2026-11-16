import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D7, A17 e A18 da 18ª simulação (2026-11-16), o CRM.
 *
 * D7 [regra das Tags, H7]: a Júlia (duas unidades) digitou "Laser quente" +
 * Enter na nova oportunidade, e a tag nasceu no vocabulário da rede — o card
 * tinha uma entrada livre, e o gatilho `trg_registrar_tags` põe no vocabulário
 * toda tag gravada. A oportunidade escolhe pelo vocabulário (o TagPicker), e a
 * action não grava tag nova.
 * A17 [3]: o card na coluna de perda não dizia o motivo.
 * A18 [3]: quem não tem "A rede inteira" não achava explicação no quadro para
 * os funis.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('D7: a oportunidade escolhe a tag pelo vocabulário', () => {
  it('o card usa o TagPicker, sem a entrada livre', () => {
    const f = fonte('components/branch/crm-lead-modal.tsx')
    expect(f).toContain("from '@/components/shared/tag-picker'")
    expect(f).toMatch(/<TagPicker/)
    expect(f).not.toContain('Digite uma tag')
  })

  it('a action guarda só o que está no vocabulário (com o nome dele) e o que o registro já tinha', async () => {
    const { tagsDoVocabulario } = await import('@/lib/tags/escolha')
    expect(tagsDoVocabulario(['vip', 'Laser quente'], ['VIP', 'Retorno'], [])).toEqual(['VIP'])
    // A arquivada (ou a de antes do vocabulário) que o registro já tinha não se perde.
    expect(tagsDoVocabulario(['VIP', 'evento-maio'], ['VIP'], ['evento-maio'])).toEqual(['VIP', 'evento-maio'])
    expect(tagsDoVocabulario(['VIP', 'vip '], ['VIP'], [])).toEqual(['VIP'])
  })

  it('criar e editar a oportunidade, e as tags do contato no inbox, passam pelo vocabulário', () => {
    expect(fonte('actions/leads.ts').match(/tagsDoVocabulario\(/g)?.length).toBeGreaterThanOrEqual(2)
    expect(fonte('actions/inbox.ts')).toMatch(/tagsDoVocabulario\(/)
  })
})

describe('A17: o card perdido diz o motivo', () => {
  it('na etapa de perda, "Perdida: <motivo>"; fora dela, nada', async () => {
    const { perdaNoCard } = await import('@/lib/crm/perda-no-card')
    const etapas = [{ id: 'sN', outcome: 'OPEN' as const }, { id: 'sP', outcome: 'LOST' as const }]
    expect(perdaNoCard({ crm_stage_id: 'sP', crm_motivos_perda: { nome: 'Preço' }, motivo_perda_obs: 'achou caro' }, etapas))
      .toEqual({ texto: 'Perdida: Preço', obs: 'achou caro' })
    expect(perdaNoCard({ crm_stage_id: 'sP', crm_motivos_perda: null }, etapas)).toEqual({ texto: 'Perdida: sem motivo informado', obs: null })
    expect(perdaNoCard({ crm_stage_id: 'sN', crm_motivos_perda: { nome: 'Preço' } }, etapas)).toBeNull()
  })
  it('o quadro mostra', () => {
    expect(fonte('components/branch/crm-board.tsx')).toMatch(/perdaNoCard\(/)
  })
})

describe('A18: no quadro, os funis dizem de quem são', () => {
  it('quem não tem "A rede inteira" lê a frase, pela abrangência e pela permissão', async () => {
    const { avisoDosFunis } = await import('@/lib/configuracao-da-rede')
    expect(avisoDosFunis({ branchId: 'b1' }, true)).toBe('Funis e etapas são da rede toda: quem muda é quem tem “A rede inteira”.')
    expect(avisoDosFunis({ branchId: 'b1' }, false)).toBe('Funis e etapas são da rede toda: quem muda é quem tem “A rede inteira” e Configurações em Gerenciar.')
    expect(avisoDosFunis({ branchId: null }, true)).toBeNull()
  })
  it('o quadro da unidade mostra a frase', () => {
    expect(fonte('app/[slug]/oportunidades/page.tsx')).toMatch(/avisoDosFunis\(/)
  })
})
