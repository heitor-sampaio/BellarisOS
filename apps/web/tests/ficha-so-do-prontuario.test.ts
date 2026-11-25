import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { abreAFicha, fichaSoDoProntuario, soOProntuarioDaFicha } from '@/lib/clientes/ficha-so-do-prontuario'
import { tiposPermitidos } from '@/lib/busca/tipos'
import { semOCadastro } from '@/lib/busca/formatar'
import type { ClientProfileProps } from '@/components/branch/client-profile'

/**
 * O clínico é do Prontuário, sem precisar do Clientes (CLAUDE.md §11: "o
 * clínico (ficha de saúde, evolução, fotos) é do Prontuário em Gerenciar, sem
 * precisar atender"; "cada passo do atendimento, um módulo", o Heitor,
 * 2026-11-23). Quem tem o Prontuário e não tem o Clientes abre a ficha da
 * cliente só na aba Prontuário: o nome, e nada do cadastro nem do financeiro.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

function ctx(perm: Partial<TenantContext['permissions']>): TenantContext {
  return {
    userId: 'auth-1', internalUserId: 'user-1', userName: 'Fulana', roleLabel: 'Cargo',
    tenantId: 'tenant-1', branchId: null, role: 'BRANCH_ADMIN', roleId: 'role-1', clientId: null,
    permissions: { ...NO_PERMISSIONS, ...perm }, reportTabs: [], providesServices: false,
    isNetworkAdmin: false, isClient: false,
  }
}

describe('quem abre a ficha da cliente', () => {
  it('o Clientes em Ver, ou o Prontuário em Ver', () => {
    expect(abreAFicha(ctx({ clients: 'VIEW' }))).toBe(true)
    expect(abreAFicha(ctx({ medical_records: 'VIEW' }))).toBe(true)
    expect(abreAFicha(ctx({ medical_records: 'MANAGE' }))).toBe(true)
    expect(abreAFicha(ctx({ agenda: 'MANAGE', crm: 'MANAGE' }))).toBe(false)
  })
  it('só o Prontuário: a ficha é só a do prontuário; com o Clientes, a ficha inteira', () => {
    expect(fichaSoDoProntuario(ctx({ medical_records: 'MANAGE' }))).toBe(true)
    expect(fichaSoDoProntuario(ctx({ medical_records: 'MANAGE', clients: 'VIEW' }))).toBe(false)
    expect(fichaSoDoProntuario(ctx({ clients: 'VIEW' }))).toBe(false)
  })
})

describe('a ficha só do prontuário leva o nome e o clínico, e mais nada', () => {
  const cheia = {
    client: {
      id: 'c1', name: 'Paciente', phone: '11999990000', email: 'p@x.com', document: '12345678900',
      documentoTipo: null, documentoNumero: null, birthDate: '1990-01-01', gender: 'F', tags: ['VIP'],
      notes: 'nota do cadastro', isActive: true, createdAt: '2026-01-01', clienteDesde: null,
      zipCode: '01000-000', address: 'Rua A', addressNumber: '1', addressComplement: null,
      neighborhood: 'Centro', city: 'SP', state: 'SP', temAcesso: true, responsavel: null, indicacao: null,
    },
    branchId: 'b1', slug: 'unidade', currentBranchId: 'b1', isNetworkWide: false,
    stats: { totalSessions: 3, totalInvested: 900, mediaPorAtendimento: 300, age: 36 },
    upcomingAppointments: [{ id: 'a1', scheduledAt: '2026-12-01', price: 300, status: 'SCHEDULED', procedureName: 'X', professionalName: 'Y' }],
    recentAppointments: [], allAppointments: [], fidelidade: { saldo: 10 }, activePackage: null,
    transactions: [{ id: 't1' }], internalCredits: [{ id: 'k1' }], documents: [{ id: 'd1' }],
    canGrantCredit: true, branches: [{ id: 'b1', name: 'Unidade' }], canManageProcedures: true,
    clientHistory: [{ id: 'h1' }], prePagos: [{ id: 'p1' }], veFinanceiro: true,
    aReceber: { itens: [{ id: 'r1' }], total: { n: 1, valor: 300 } }, pagoComCredito: 50,
    termos: { itens: [], podeDispensar: true }, opportunities: [{ id: 'o1' }], veOportunidades: true,
    podeAgendar: true, podeEditarCadastro: true, podeVerPlanos: true, podeReceber: true,
    recordForms: [{ appointmentId: 'a0' }], podeVerProntuario: true, generalAnamnesis: { ficha: null },
    alergias: 'dipirona', anexosClinicos: [{ id: 'x1' }], podeAnexarClinico: true, podeAnotar: true,
    podeEditarFichaDeSaude: true, acessosAoProntuario: null, lotesDosAtendimentos: { a0: [] },
    anotacoesEVersoes: { anotacoes: {}, versoes: {} }, planejamentosQueAbrem: ['m1'], abreOAtendimento: true,
    portalNoPlano: true,
  } as unknown as ClientProfileProps
  const so = soOProntuarioDaFicha(cheia)

  it('o nome fica; o cadastro sai (telefone, e-mail, documento, nascimento, endereço, tags, notas)', () => {
    expect(so.client.name).toBe('Paciente')
    expect(so.client.id).toBe('c1')
    const texto = JSON.stringify(so)
    for (const dado of ['11999990000', 'p@x.com', '12345678900', '1990-01-01', 'Rua A', '01000-000', 'VIP', 'nota do cadastro', 'Centro']) {
      expect(texto, dado).not.toContain(dado)
    }
    expect(so.client.temAcesso).toBe(false)
  })
  it('nada do financeiro nem das outras abas', () => {
    expect(so.stats.totalInvested).toBe(0)
    expect(so.transactions).toEqual([])
    expect(so.internalCredits).toEqual([])
    expect(so.documents).toEqual([])
    expect(so.upcomingAppointments).toEqual([])
    expect(so.clientHistory).toEqual([])
    expect(so.prePagos ?? []).toEqual([])
    expect(so.fidelidade).toBeNull()
    expect(so.veFinanceiro).toBe(false)
    expect(so.termos ?? null).toBeNull()
    expect(so.opportunities ?? []).toEqual([])
    expect(so.aReceber?.itens ?? []).toEqual([])
    expect(so.podeAgendar).toBe(false)
    expect(so.podeEditarCadastro).toBe(false)
    expect(so.podeReceber).toBe(false)
  })
  it('o clínico fica como veio', () => {
    expect(so.soProntuario).toBe(true)
    expect(so.recordForms).toBe(cheia.recordForms)
    expect(so.generalAnamnesis).toBe(cheia.generalAnamnesis)
    expect(so.alergias).toBe('dipirona')
    expect(so.anexosClinicos).toBe(cheia.anexosClinicos)
    expect(so.podeAnexarClinico).toBe(true)
    expect(so.podeAnotar).toBe(true)
    expect(so.podeEditarFichaDeSaude).toBe(true)
    expect(so.podeVerProntuario).toBe(true)
  })
})

describe('as abas da ficha', () => {
  it('só o prontuário: a aba Prontuário, e só ela; e a ficha abre nela', () => {
    const tela = fonte('components/branch/client-profile.tsx')
    expect(tela).toMatch(/const visibleTabs = soProntuario \? TABS\.filter\(t => t\.key === 'fichas'\)/)
    expect(tela).toMatch(/soProntuario \? 'fichas' : 'visao'/)
  })
  it('só o prontuário: sem a volta à lista, sem o cadastro do topo, sem os números e as comandas', () => {
    const tela = fonte('components/branch/client-profile.tsx')
    expect(tela).toMatch(/\{!soProntuario && \(\s*<a\s+href=\{rotaClientes\(/)
    expect(tela).toMatch(/\{!soProntuario && \(\s*<div[^>]*>\s*\{client\.phone && \(/)
    expect(tela).toMatch(/\{!soProntuario && \(<>\s*<div className="kpi-grid"/)
  })
})

describe('as duas fichas abrem com o Prontuário e, sem o Clientes, mandam só o prontuário', () => {
  for (const p of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
    it(p, () => {
      const f = fonte(p)
      expect(f).not.toMatch(/assertPermission\(ctx, 'clients', 'VIEW'\)/)
      expect(f).toMatch(/assertAbreAFicha\(ctx\)/)
      expect(f).toMatch(/fichaSoDoProntuario\(ctx\)/)
      // A ficha inteira não chega a ser desenhada: o elemento vira o só do prontuário (lista do que fica).
      expect(f).toMatch(/soProntuario \? <ClientProfile \{\.\.\.soOProntuarioDaFicha\(ficha\.props[^)]*\)\} \/> : ficha/)
      // O que a tela mostra é a aba do Prontuário: é ela que o servidor monta (e registra o acesso).
      expect(f).toMatch(/soProntuario \? 'fichas' : abaDaFicha\(/)
    })
  }
})

describe('o caminho até a cliente: a busca universal', () => {
  it('acha a cliente com o Prontuário em Ver, sem o Clientes', () => {
    expect(tiposPermitidos({ ...NO_PERMISSIONS, medical_records: 'VIEW' })).toEqual(['cliente'])
  })
  it('sem o Clientes, a linha da cliente leva só o nome (nem telefone, nem e-mail)', () => {
    const r = { tipo: 'cliente' as const, id: 'c1', titulo: 'Paciente', subtitulo: '(11) 99999-0000 · p@x.com' }
    expect(semOCadastro(r)).toEqual({ ...r, subtitulo: null })
    expect(semOCadastro({ ...r, arquivada: true })).toEqual({ ...r, arquivada: true, subtitulo: 'Arquivada' })
  })
  it('buscarTudo tira o cadastro de quem não tem o Clientes', () => {
    expect(fonte('actions/busca.ts')).toMatch(/can\(ctx, 'clients', 'VIEW'\)[\s\S]{0,120}semOCadastro/)
  })
})
