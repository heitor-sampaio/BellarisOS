import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  REGRAS_DO_PACOTE_PADRAO, lerRegrasDoPacote, recusaDaSessaoNaoLiberada, textoDoPacoteEmAberto,
  pacoteVencidoParaCancelar,
} from '@/lib/pacotes/regras'
import { conferirCredito } from '@/lib/creditos/credito'

/**
 * Itens 8 e 9 da auditoria das regras (2026-11-18; decisões do Claude pelo
 * princípio 1 — "a rede decide" —, a partir da resposta do Heitor de 18/11:
 * "pacote vencido = configuração da rede (princípio 1)"):
 * - o pacote no crediário LIBERAR as sessões antes de quitado vira
 *   configuração da rede (padrão: libera e avisa, como era);
 * - CANCELAR o pacote vencido vira configuração da rede (padrão: não se
 *   cancela, como era); ligada, o vencido se cancela pela conta de sempre.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null

describe('as regras do pacote da rede', () => {
  it('o padrão é o de antes: libera as sessões no crediário e não cancela o vencido', () => {
    expect(REGRAS_DO_PACOTE_PADRAO).toEqual({ crediarioLibera: true, vencidoCancela: false })
    expect(lerRegrasDoPacote(null)).toEqual(REGRAS_DO_PACOTE_PADRAO)
    expect(lerRegrasDoPacote({ pacote_crediario_libera: false, pacote_vencido_cancela: true }))
      .toEqual({ crediarioLibera: false, vencidoCancela: true })
  })
})

describe('item 8: liberar as sessões do pacote no crediário é da rede', () => {
  it('liberando (o padrão), nada se recusa; sem liberar, a sessão espera o pago e diz por quê', () => {
    expect(recusaDaSessaoNaoLiberada({ crediarioLibera: true, vencidoCancela: false }, 300)).toBeNull()
    expect(recusaDaSessaoNaoLiberada({ crediarioLibera: false, vencidoCancela: false }, 0)).toBeNull()
    expect(sp(recusaDaSessaoNaoLiberada({ crediarioLibera: false, vencidoCancela: false }, 300)))
      .toBe('Este pacote ainda tem R$ 300,00 em aberto, e a rede libera as sessões do pacote no crediário só depois de pago. O que falta se recebe no PDV.')
  })
  it('o aviso do em aberto diz a regra da rede', () => {
    expect(textoDoPacoteEmAberto(true)).toBe('As sessões seguem liberadas; o que falta se recebe no PDV.')
    expect(textoDoPacoteEmAberto(false)).toBe('As sessões se liberam quando ele estiver pago; o que falta se recebe no PDV.')
  })

  // O banco de mentira de conferirCredito: a sessão, a rede e o em aberto.
  function adminDeMentira(regra: { pacote_crediario_libera: boolean }, emAberto: number) {
    const sessao = {
      status: 'AVAILABLE', appointment_id: null, procedure_id: 'p1', preco: 100, client_package_id: 'cp1',
      client_packages: { client_id: 'cli', price: 600, total_sessions: 6, expires_at: null, branches: { tenant_id: 'rede' }, service_packages: null },
    }
    const resposta = (tabela: string) => tabela === 'package_sessions' ? sessao : tabela === 'tenants' ? regra : null
    const construtor = (tabela: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'maybeSingle', 'single']) b[op] = () => b
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: resposta(tabela), error: null }).then(ok)
      return b
    }
    return {
      from: construtor,
      rpc: async () => ({ data: emAberto > 0 ? [{ client_package_id: 'cp1', em_aberto: emAberto, parcelas: 3 }] : [], error: null }),
    } as unknown as Parameters<typeof conferirCredito>[0]
  }

  it('todo caminho que agenda a sessão (a equipe, o app, o Copilot, o "Abater do pacote") passa por conferirCredito, que recusa', async () => {
    const recusado = await conferirCredito(adminDeMentira({ pacote_crediario_libera: false }, 300), 'rede', 'cli', { tipo: 'PACOTE', id: '11111111-1111-4111-8111-111111111111' })
    expect('error' in recusado && sp(recusado.error)).toContain('ainda tem R$ 300,00 em aberto')
    const liberado = await conferirCredito(adminDeMentira({ pacote_crediario_libera: true }, 300), 'rede', 'cli', { tipo: 'PACOTE', id: '11111111-1111-4111-8111-111111111111' })
    expect(liberado).toEqual({ procedureId: 'p1', preco: 100 })
    const pago = await conferirCredito(adminDeMentira({ pacote_crediario_libera: false }, 0), 'rede', 'cli', { tipo: 'PACOTE', id: '11111111-1111-4111-8111-111111111111' })
    expect(pago).toEqual({ procedureId: 'p1', preco: 100 })
  })
})

describe('item 9: cancelar o pacote vencido é da rede', () => {
  const ontem = new Date(Date.now() - 86_400_000).toISOString()
  const amanha = new Date(Date.now() + 86_400_000).toISOString()
  const vencido = { id: 'v', cancelado_em: null, expires_at: ontem, package_sessions: [{ status: 'AVAILABLE' }, { status: 'USED' }] }
  it('ligada, a ficha oferece cancelar o vencido com sessão que sobrou; desligada (o padrão), não', () => {
    expect(pacoteVencidoParaCancelar([vencido], { crediarioLibera: true, vencidoCancela: true })?.id).toBe('v')
    expect(pacoteVencidoParaCancelar([vencido], REGRAS_DO_PACOTE_PADRAO)).toBeNull()
  })
  it('o cancelado, o que não venceu e o sem sessão que sobrou não entram', () => {
    const regras = { crediarioLibera: true, vencidoCancela: true }
    expect(pacoteVencidoParaCancelar([{ ...vencido, cancelado_em: ontem }], regras)).toBeNull()
    expect(pacoteVencidoParaCancelar([{ ...vencido, expires_at: amanha }], regras)).toBeNull()
    expect(pacoteVencidoParaCancelar([{ ...vencido, package_sessions: [{ status: 'USED' }] }], regras)).toBeNull()
  })
})

describe('o banco e as telas', () => {
  const migration = (() => {
    const pasta = join(RAIZ, 'supabase', 'migrations')
    const nome = readdirSync(pasta).find(n => n.startsWith('20261124000301'))
    return nome ? readFileSync(join(pasta, nome), 'utf8') : ''
  })()
  it('a migration cria as duas opções com o padrão de antes, a trava da sessão e o vencido pela opção', () => {
    expect(migration).toMatch(/pacote_crediario_libera\s+boolean\s+not null\s+default true/i)
    expect(migration).toMatch(/pacote_vencido_cancela\s+boolean\s+not null\s+default false/i)
    expect(migration).toContain('before update of appointment_id on public.package_sessions')
    expect(migration).toContain('pacote_vencido_cancela')
    expect(migration.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('Configurações → Geral mostra e grava as duas opções', () => {
    const tela = ler('components/admin/settings-geral.tsx')
    expect(tela).toContain('name="pacote_crediario_libera"')
    expect(tela).toContain('name="pacote_vencido_cancela"')
    const action = ler('actions/rede.ts')
    expect(action).toContain('pacote_crediario_libera:')
    expect(action).toContain('pacote_vencido_cancela:')
  })
  it('a ficha oferece o cancelar do vencido e o aviso do em aberto diz a regra', () => {
    expect(ler('components/branch/client-profile.tsx')).toContain('data-pacote-vencido')
    expect(ler('components/shared/aviso-do-pacote-em-aberto.tsx')).toContain('textoDoPacoteEmAberto')
  })
})
