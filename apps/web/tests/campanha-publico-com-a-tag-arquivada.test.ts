import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O público da campanha por tag é FILTRO (a regra das Tags do Heitor, CLAUDE.md
 * §1, 2026-11-13: "onde tiver for passível de filtro, um dos filtros que ela
 * pode usar são as tags"; TG-14, a Decisão D da 33ª simulação). Desde o A6 da
 * 33ª a tag arquivada que alguém tem segue no filtro de nove telas
 * (`comAsArquivadasEmUso`), mas a campanha só oferecia as ativas: a "Noiva
 * 2027" arquivada, com três clientes marcadas, não se escolhia como público.
 * O que MARCA a tag (a ficha, o cadastro, o card, a ação "Pôr a tag" da
 * automação) segue só com as ativas (TG-08). Decisão do Claude, 26/11 (a TG-07,
 * que dizia "as campanhas oferecem as tags ativas", é decisão do Claude).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o público da campanha oferece a tag arquivada em uso', () => {
  it('o servidor tem a lista do FILTRO, pela mesma regra das outras telas', () => {
    const s = fonte('actions/tags.ts')
    expect(s).toMatch(/export async function listarTagsDoFiltro\(\)/)
    expect(s).toMatch(/comAsArquivadasEmUso\(ctx\.tenantId!, tagsAtivasDaRede\(ctx\.tenantId!\)\)/)
  })

  it('a campanha pede a lista do filtro; quem marca segue com as ativas', () => {
    expect(fonte('components/shared/use-tags-da-rede.ts')).toMatch(/listarTagsDoFiltro/)
    expect(fonte('components/admin/notification-campaign-form.tsx')).toMatch(/useTagsDaRede\(true, 'filtro'\)/)
    for (const arquivo of ['components/branch/client-form.tsx', 'components/branch/client-profile.tsx', 'components/branch/crm-lead-modal.tsx']) {
      expect(fonte(arquivo), arquivo).not.toMatch(/useTagsDaRede\([^)]*'filtro'/)
    }
  })
})
