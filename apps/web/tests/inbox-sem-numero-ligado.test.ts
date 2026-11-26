import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A1 da 32ª simulação (IN-15, o Heitor, 2026-11-13: "o resto fica como está";
 * princípio 7). O cargo com "só os números ligados à pessoa", sem número
 * ligado a ela, não vê WhatsApp nenhum — e a tela dizia só "Nenhuma conversa
 * ainda". A tela diz por quê: sem número ligado, aparecem só as conversas sem
 * número (Instagram, Messenger), e quem liga a pessoa a um número é quem muda
 * as integrações (a Admin da rede: a integração é configuração da rede toda,
 * CLAUDE.md §11). A régua é `caixasDoAlcance` (a lista vazia de caixas).
 */

const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('o inbox sem número ligado diz por quê', async () => {
  const mod = await import('@/lib/inbox/aviso-sem-numero').catch(() => null)

  it('o módulo existe', () => {
    expect(mod, 'lib/inbox/aviso-sem-numero.ts').not.toBeNull()
  })

  it('só a lista VAZIA de caixas (o cargo "minhas" sem número) avisa; todas (null) ou alguma, não', () => {
    expect(mod!.semNumeroLigado([])).toBe(true)
    expect(mod!.semNumeroLigado(null)).toBe(false)
    expect(mod!.semNumeroLigado(['n1'])).toBe(false)
  })

  it('o texto diz o que aparece e quem liga (pela permissão, sem nome de cargo da rede)', () => {
    const t = mod!.AVISO_SEM_NUMERO_LIGADO
    expect(t).toContain('números de WhatsApp ligados a você')
    expect(t).toContain('Instagram')
    expect(t).toContain('Admin da rede')
    expect(t).toContain('Configurações → Integrações')
  })

  it('as duas páginas do inbox leem caixasDoAlcance e passam o aviso ao inbox, que o mostra', () => {
    for (const pagina of ['app/admin/inbox/page.tsx', 'app/[slug]/inbox/page.tsx']) {
      const p = fonte(pagina)
      expect(p, pagina).toMatch(/caixasDoAlcance\(/)
      expect(p, pagina).toMatch(/semNumeroLigado=\{/)
    }
    const inbox = fonte('components/admin/crm-inbox.tsx')
    expect(inbox).toMatch(/data-inbox-sem-numero/)
    expect(inbox).toMatch(/AVISO_SEM_NUMERO_LIGADO/)
  })
})
