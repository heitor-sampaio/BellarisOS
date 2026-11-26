import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { creditosDoCliente } from '@/lib/creditos/credito'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * PA-14 (vendas-financeiro.md; princípio 2): "A tela diz o que falta pagar: na
 * ficha (...) e ao agendar a sessão, 'R$ 300,00 deste pacote ainda em aberto
 * (3 parcelas do crediário)', com a frase da opção da rede, e o botão 'Receber
 * no PDV' (...). Só quem recebe vê." E PA-13: na rede que libera "só depois de
 * pago", a sessão não se agenda nem se usa até o pacote estar pago, em todo
 * caminho. D15 da 31ª: o agendar da AGENDA ("Usar o que já está incluído",
 * `creditosParaAgendar`) oferecia a sessão do pacote da C02 (R$ 400 em aberto,
 * rede em "só depois de pago") sem o em aberto e sem dizer que ela não se
 * agenda — a recusa só vinha ao salvar.
 */
function adminFalso(dados: { tenants: unknown; emAberto: { client_package_id: string; em_aberto: number; parcelas: number }[] }) {
  const tabelas: Record<string, unknown> = {
    procedure_sales: [],
    treatment_plans: [],
    client_packages: [{
      id: 'cp1', branch_id: 'b1', expires_at: null, price: 621, total_sessions: 2, purchased_at: '2026-11-25T12:00:00Z',
      service_packages: { name: 'Pele e corpo', procedure_id: 'p1' },
      package_sessions: [
        { id: 's1', session_number: 1, procedure_id: 'p1', preco: 124.2, status: 'AVAILABLE', appointment_id: null, procedures: { name: 'Limpeza de pele' } },
        { id: 's2', session_number: 2, procedure_id: 'p1', preco: 124.2, status: 'AVAILABLE', appointment_id: null, procedures: { name: 'Limpeza de pele' } },
      ],
    }],
    tenants: dados.tenants,
  }
  const consulta = (tabela: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'in', 'is', 'not', 'or', 'limit', 'range']) q[m] = () => q
    q.maybeSingle = () => q
    q.then = (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: tabelas[tabela], error: null }).then(ok)
    return q
  }
  return {
    from: consulta,
    rpc: async (nome: string) => ({ data: nome === 'metrics_em_aberto_dos_pacotes' ? dados.emAberto : [], error: null }),
  } as unknown as Parameters<typeof creditosDoCliente>[0]
}

const emAberto = [{ client_package_id: 'cp1', em_aberto: 400, parcelas: 2 }]

describe('o agendar da sessão do pacote diz o que está em aberto (PA-13, PA-14)', () => {
  it('a rede que libera: a sessão se oferece, e quem recebe vê o em aberto', async () => {
    const [c] = await creditosDoCliente(adminFalso({ tenants: { pacote_crediario_libera: true, pacote_vencido_cancela: false }, emAberto }), 't1', 'c1', { veOEmAberto: true })
    expect(c?.tipo).toBe('PACOTE')
    expect(c?.emAberto).toEqual({ valor: 400, parcelas: 2, unidadeId: 'b1', liberaAsSessoes: true })
    expect(c?.recusa ?? null).toBeNull()
  })
  it('quem não recebe não vê o em aberto', async () => {
    const [c] = await creditosDoCliente(adminFalso({ tenants: { pacote_crediario_libera: true, pacote_vencido_cancela: false }, emAberto }), 't1', 'c1')
    expect(c?.emAberto ?? null).toBeNull()
  })
  it('a rede que libera só depois de pago: a sessão vem com o porquê de não se agendar', async () => {
    const [c] = await creditosDoCliente(adminFalso({ tenants: { pacote_crediario_libera: false, pacote_vencido_cancela: false }, emAberto }), 't1', 'c1', { veOEmAberto: true })
    expect(c?.emAberto).toEqual({ valor: 400, parcelas: 2, unidadeId: 'b1', liberaAsSessoes: false })
    expect((c?.recusa ?? '').replace(/ /g, ' ')).toContain('Este pacote ainda tem R$ 400,00 em aberto')
  })
  it('pago: nada a dizer', async () => {
    const [c] = await creditosDoCliente(adminFalso({ tenants: { pacote_crediario_libera: false, pacote_vencido_cancela: false }, emAberto: [] }), 't1', 'c1', { veOEmAberto: true })
    expect(c?.emAberto ?? null).toBeNull()
    expect(c?.recusa ?? null).toBeNull()
  })
})

describe('a janela de agendar da agenda mostra o em aberto e a recusa da sessão escolhida (PA-13, PA-14)', () => {
  const modal = ler('components/branch/appointment-modal.tsx')
  it('a opção com o em aberto mostra o aviso do pacote, com a regra da rede', () => {
    expect(modal).toContain("import { AvisoDoPacoteEmAberto } from '@/components/shared/aviso-do-pacote-em-aberto'")
    expect(modal).toMatch(/credito\?\.emAberto && <AvisoDoPacoteEmAberto valor=\{credito\.emAberto\.valor\} parcelas=\{credito\.emAberto\.parcelas\}[^>]*liberaAsSessoes=\{credito\.emAberto\.liberaAsSessoes\}/)
  })
  it('a opção recusada diz por quê, em alerta, e o salvar fica desligado', () => {
    expect(modal).toMatch(/credito\?\.recusa && \(\s*<p data-recusa-da-sessao role="alert"/)
    expect(modal).toMatch(/disabled=\{[^}]*!!credito\?\.recusa/)
  })
})
