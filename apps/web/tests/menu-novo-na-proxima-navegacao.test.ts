import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { TenantContext } from '@estetica-os/types'

/**
 * LO-06: "Mudar a unidade ou o cargo de alguém que está com a sessão aberta
 * vale na próxima tela que ela abre … a próxima navegação ou o recarregar
 * desenham o menu novo." Na 43ª (A7), a Neusa e a Cirlene só viram os
 * Relatórios depois de recarregar: a navegação do Next mantém o layout, e o
 * menu (que nasce nele) ficava parado.
 *
 * O layout dá ao navegador a assinatura do que o menu mostra
 * (`assinaturaDoMenu`); a cada navegação, o `MenuEmDia` pergunta a de agora
 * (`/api/menu`) e, se mudou, redesenha (`router.refresh()`). A tela aberta não
 * se redesenha sozinha: só na navegação.
 */
const fonte = (arq: string) => readFileSync(path.join(__dirname, '..', arq), 'utf8')

const ctx = (extra: Partial<TenantContext> = {}): TenantContext => ({
  userId: 'a', internalUserId: 'u', userName: 'Neusa', roleLabel: 'Recepção',
  tenantId: 't', branchId: 'b1', unidades: ['b1'], role: 'RECEPTIONIST', roleId: 'r', clientId: null,
  permissions: { agenda: 'MANAGE', reports: 'NONE' } as TenantContext['permissions'],
  reportTabs: [], providesServices: false, atendeEm: [], comissaoDeVenda: false,
  isNetworkAdmin: false, semCargo: false, isClient: false, plano: null,
  ...extra,
} as TenantContext)

describe('a assinatura do menu', () => {
  it('é a mesma para o mesmo cargo, em qualquer ordem e em qualquer unidade do endereço', async () => {
    const { assinaturaDoMenu } = await import('@/lib/sessao/assinatura-do-menu')
    const a = assinaturaDoMenu(ctx())
    expect(assinaturaDoMenu(ctx({ permissions: { reports: 'NONE', agenda: 'MANAGE' } as TenantContext['permissions'] }))).toBe(a)
    // A pessoa de várias unidades: o endereço muda a unidade em que ela ESTÁ, não o menu.
    expect(assinaturaDoMenu(ctx({ branchId: 'b2' }))).toBe(a)
  })

  it('muda com o que o menu mostra: o nível, as abas de Relatórios, o "Atende", a rede inteira, a Admin', async () => {
    const { assinaturaDoMenu } = await import('@/lib/sessao/assinatura-do-menu')
    const a = assinaturaDoMenu(ctx())
    expect(assinaturaDoMenu(ctx({ permissions: { agenda: 'MANAGE', reports: 'VIEW' } as TenantContext['permissions'], reportTabs: ['vendas'] }))).not.toBe(a)
    expect(assinaturaDoMenu(ctx({ reportTabs: ['vendas'] }))).not.toBe(a)
    expect(assinaturaDoMenu(ctx({ providesServices: true }))).not.toBe(a)
    expect(assinaturaDoMenu(ctx({ branchId: null, unidades: null }))).not.toBe(a)
    expect(assinaturaDoMenu(ctx({ isNetworkAdmin: true }))).not.toBe(a)
    expect(assinaturaDoMenu(ctx({ roleLabel: 'Gerente' }))).not.toBe(a)
  })
})

describe('a próxima navegação desenha o menu novo', () => {
  it('os dois portais dão a assinatura ao MenuEmDia', () => {
    for (const layout of ['app/[slug]/layout.tsx', 'app/admin/layout.tsx']) {
      const f = fonte(layout)
      expect(f, layout).toMatch(/<MenuEmDia assinatura=\{assinaturaDoMenu\(ctx\)\} \/>/)
    }
  })

  // Na sessão de suporte, não: a pergunta lia a sessão já vencida antes da
  // página (que a guarda por 15 s), e o fim chegava no meio da tela sendo
  // montada — a navegação travava em vez de devolver ao painel
  // (e2e/suporte-impersonar.spec.ts, "no meio de uma navegação pelo menu").
  it('na sessão de suporte, o MenuEmDia não pergunta nada', () => {
    for (const layout of ['app/[slug]/layout.tsx', 'app/admin/layout.tsx']) {
      expect(fonte(layout), layout).toMatch(/\{!ctx\.suporte && <MenuEmDia assinatura=\{assinaturaDoMenu\(ctx\)\} \/>\}/)
    }
  })

  it('o MenuEmDia pergunta a assinatura a cada navegação e redesenha quando mudou', () => {
    const f = fonte('components/shared/menu-em-dia.tsx')
    expect(f).toMatch(/usePathname\(\)/)
    expect(f).toMatch(/fetch\(ROTA_DA_ASSINATURA_DO_MENU/)
    expect(f).toMatch(/router\.refresh\(\)/)
    expect(f).toMatch(/\[pathname, router\]/)
  })

  it('a rota se defende pela sessão e responde a assinatura de quem pergunta', () => {
    const arq = 'app/api/menu/route.ts'
    expect(existsSync(path.join(__dirname, '..', arq))).toBe(true)
    const f = fonte(arq)
    expect(f).toMatch(/getTenantContext\(\)\.catch\(\(\) => null\)/)
    expect(f).toMatch(/status: 401/)
    expect(f).toMatch(/assinatura: assinaturaDoMenu\(ctx\)/)
  })
})
