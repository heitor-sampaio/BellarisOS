import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A8 da 38ª simulação: a conversa de caixa fora do alcance, aberta pelo `?c=`,
 * caía calada em "Selecione uma conversa". CLAUDE.md §6: o redirecionamento
 * por abrangência leva o motivo (`comAviso(…)` → `?aviso=`,
 * `lib/aviso-da-url.ts`). Quando o id existe na rede e está fora das caixas
 * do cargo, a página volta com o aviso — que não diz nada da conversa. O id de
 * outra rede (ou que não existe) segue como antes: nada a dizer.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

const aoAlcance = vi.fn<() => Promise<boolean>>()
vi.mock('@/lib/inbox/alcance', () => ({ conversaAoAlcance: () => aoAlcance() }))

function adminCom(linha: { id: string } | null) {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: () => Promise.resolve({ data: linha, error: null }),
  }
  return { from: () => cadeia } as never
}

const ctx = { tenantId: 't1' } as never
const ID = '6f1c2a9e-3b7d-4c55-9a10-2f0e8d4b7c11'

describe('A8: a conversa do endereço fora do alcance', () => {
  beforeEach(() => aoAlcance.mockReset())

  it('existe na rede e está fora das caixas do cargo: avisa', async () => {
    const { conversaDoEnderecoForaDoAlcance } = await import('@/lib/inbox/conversa-do-endereco')
    aoAlcance.mockResolvedValue(false)
    expect(await conversaDoEnderecoForaDoAlcance(adminCom({ id: ID }), ctx, ID)).toBe(true)
  })

  it('ao alcance: não avisa', async () => {
    const { conversaDoEnderecoForaDoAlcance } = await import('@/lib/inbox/conversa-do-endereco')
    aoAlcance.mockResolvedValue(true)
    expect(await conversaDoEnderecoForaDoAlcance(adminCom({ id: ID }), ctx, ID)).toBe(false)
  })

  it('não existe na rede (ou é de outra): não avisa, e não diz que existe', async () => {
    const { conversaDoEnderecoForaDoAlcance } = await import('@/lib/inbox/conversa-do-endereco')
    aoAlcance.mockResolvedValue(false)
    expect(await conversaDoEnderecoForaDoAlcance(adminCom(null), ctx, ID)).toBe(false)
  })

  it('o que não é id: não avisa nem consulta', async () => {
    const { conversaDoEnderecoForaDoAlcance } = await import('@/lib/inbox/conversa-do-endereco')
    expect(await conversaDoEnderecoForaDoAlcance(adminCom({ id: ID }), ctx, 'abc')).toBe(false)
    expect(aoAlcance).not.toHaveBeenCalled()
  })

  it('o aviso é uma chave conhecida, sem nada da conversa', async () => {
    const { textoDoAviso } = await import('@/lib/aviso-da-url')
    const texto = textoDoAviso('conversa-fora-do-alcance')
    expect(texto).toMatch(/número de WhatsApp/)
    expect(texto).toMatch(/cargo/)
  })
})

describe('A8: as duas páginas do inbox voltam com o aviso', () => {
  for (const arquivo of ['app/admin/inbox/page.tsx', 'app/[slug]/inbox/page.tsx']) {
    it(arquivo, () => {
      const pagina = fonte(arquivo)
      expect(pagina).toMatch(/conversaDoEnderecoForaDoAlcance\(/)
      expect(pagina).toMatch(/comAviso\(`[^`]*\?c=\$\{convParam\}`, 'conversa-fora-do-alcance'\)/)
      // Uma vez: com o aviso na URL, a página não volta de novo.
      expect(pagina).toMatch(/!avisoParam/)
    })
  }
})
