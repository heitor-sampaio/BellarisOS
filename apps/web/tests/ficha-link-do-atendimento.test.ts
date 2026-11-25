import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linkDoAtendimento } from '@/lib/clients/historico-do-agendamento'

/**
 * Abrir a tela do atendimento é do Atendimento em Ver (UM1, o Heitor,
 * 23/11: "concordo"; CLAUDE.md §11, "Cada passo do atendimento, um módulo").
 * A ficha da cliente levava o histórico e o anexo do atendimento a
 * `/agenda/<id>` também para quem tem Clientes em Ver sem o Atendimento — a
 * agenda já escondia o "Retomar atendimento" (`abreOAtendimento`). Sem o
 * módulo, o texto fica e o link sai.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('a ficha só leva à tela do atendimento quem tem o Atendimento em Ver', () => {
  it('sem o Atendimento em Ver, o evento do histórico fica sem link', () => {
    expect(linkDoAtendimento(true, '/centro', 'a1')).toBe('/centro/agenda/a1')
    expect(linkDoAtendimento(false, '/centro', 'a1')).toBeNull()
  })
  for (const [pagina, base] of [['app/[slug]/clients/[id]/page.tsx', '`/${slug}`'], ['app/admin/clients/[id]/page.tsx', "'/admin'"]] as const) {
    it(pagina, () => {
      const t = fonte(pagina)
      expect(t, 'nenhum link à mão para a tela do atendimento').not.toMatch(/\/agenda\/\$\{a\.id\}`/)
      expect(t).toMatch(/can\(ctx, 'atendimento', 'VIEW'\)/)
      expect(t).toContain(`linkDoAtendimento(abreOAtendimento, ${base}, a.id)`)
      expect(t).toMatch(/abreOAtendimento=\{abreOAtendimento\}/)
    })
  }
  it('o anexo do atendimento (aba Documentos) só vira link com o módulo', () => {
    const aba = fonte('components/branch/client-documents-tab.tsx')
    expect(aba).toMatch(/doc\.atendimento && abreOAtendimento \?/)
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/<ClientDocumentsTab[\s\S]*?abreOAtendimento=\{abreOAtendimento\}/)
  })
})
