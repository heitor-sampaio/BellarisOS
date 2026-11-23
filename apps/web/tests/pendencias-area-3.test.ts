import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

vi.setConfig({ testTimeout: 30_000 })
vi.mock('@/actions/busca', () => ({ buscarTudo: async () => ({ grupos: [] }) }))

/**
 * As pendências das simulações 15ª–23ª, Área 3 (CRM, Copilot, cadastros,
 * configuração), 2026-11-17 — "defeitos e atritos todos precisam ser
 * corrigidos, sempre" (o Heitor).
 */

const RAIZ = join(__dirname, '..')
const fonte = (arq: string) => readFileSync(join(RAIZ, arq), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const doc = (arq: string) => readFileSync(join(RAIZ, '..', '..', 'docs', 'regras', arq), 'utf8')
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

describe('22ª A29 = 23ª A39: o Novo cliente tem o endereço (opcional)', () => {
  it('o formulário vira as colunas do endereço: CEP só dígitos, UF maiúscula, vazio é nulo', async () => {
    const { enderecoDoFormulario } = await import('@/lib/clients/endereco-do-cadastro')
    const fd = new FormData()
    fd.set('zip_code', '30.140-071'); fd.set('address', ' Rua da Bahia '); fd.set('address_number', '100')
    fd.set('address_complement', ''); fd.set('neighborhood', 'Centro'); fd.set('city', 'Belo Horizonte'); fd.set('state', 'mg')
    expect(enderecoDoFormulario(fd)).toEqual({
      zip_code: '30140071', address: 'Rua da Bahia', address_number: '100', address_complement: null,
      neighborhood: 'Centro', city: 'Belo Horizonte', state: 'MG',
    })
    expect(enderecoDoFormulario(new FormData())).toEqual({
      zip_code: null, address: null, address_number: null, address_complement: null, neighborhood: null, city: null, state: null,
    })
  })
  it('o Novo cliente e a aba Dados usam o MESMO componente de CEP, e o cadastro grava o endereço', () => {
    const form = fonte('components/branch/client-form.tsx')
    expect(form).toContain('Endereço (opcional)')
    expect(form).toContain('<CamposDeEndereco')
    expect(fonte('components/branch/client-profile.tsx')).toContain('<CamposDeEndereco')
    expect(fonte('actions/clients.ts')).toMatch(/enderecoDoFormulario\(formData\)/)
  })
})

describe('22ª A35: "Mover as N para [etapa]", perguntando das automações', () => {
  it('os textos: o botão e a pergunta com os nomes das automações', async () => {
    const { textoDoMoverDaEtapa, perguntaDasAutomacoes } = await import('@/lib/crm/mover-da-etapa')
    expect(textoDoMoverDaEtapa(3)).toBe('Mover as 3 para')
    expect(textoDoMoverDaEtapa(1)).toBe('Mover a oportunidade para')
    expect(perguntaDasAutomacoes(['Boas-vindas'])).toBe('Mover dispara a automação “Boas-vindas”. Disparar?')
    expect(perguntaDasAutomacoes(['A', 'B'])).toBe('Mover dispara as automações “A” e “B”. Disparar?')
  })
  it('a action move pelo núcleo (moverEtapaCore), com o "não disparar" levado ao evento', () => {
    const acoes = fonte('actions/leads.ts')
    expect(acoes).toMatch(/export async function moverOportunidadesDaEtapa/)
    expect(acoes).toMatch(/export async function automacoesDoMovimento/)
    expect(acoes).toMatch(/recusaDaConfigDaRede/)
    expect(acoes).toMatch(/semDespachar: !disparar/)
    expect(fonte('lib/crm/oportunidade.ts')).toMatch(/semDespachar/)
    const emitir = fonte('lib/events/emitir.ts')
    expect(emitir).toMatch(/semDespachar/)
  })
  it('a tela oferece o mover e a pergunta Sim/Não; a regra está em crm-inbox.md', () => {
    const tela = fonte('components/branch/crm-stage-settings.tsx')
    expect(tela).toContain('moverOportunidadesDaEtapa')
    expect(tela).toContain('automacoesDoMovimento')
    expect(tela).toContain('data-mover-da-etapa')
    expect(doc('crm-inbox.md')).toMatch(/Mover as N para/)
  })
})

describe('15ª A15: "Duplicar" o cargo', () => {
  it('o nome da cópia não repete um que existe', async () => {
    const { nomeDaCopia } = await import('@/lib/cargos/duplicar')
    expect(nomeDaCopia('Recepção', ['Recepção'])).toBe('Cópia de Recepção')
    expect(nomeDaCopia('Recepção', ['Recepção', 'Cópia de Recepção'])).toBe('Cópia de Recepção (2)')
    expect(nomeDaCopia('Recepção', ['cópia de recepção', 'Cópia de Recepção (2)'])).toBe('Cópia de Recepção (3)')
  })
  it('a action confere a rede toda, o suporte e o cargo acima, e copia a matriz e as abas', () => {
    const acoes = fonte('actions/roles.ts')
    const corpo = acoes.slice(acoes.indexOf('export async function duplicarCargo'))
    expect(corpo.length).toBeGreaterThan(40)
    expect(corpo).toMatch(/assertPermission\(ctx, 'roles', 'MANAGE'\)/)
    expect(corpo).toMatch(/recusaDaConfigDaRede/)
    expect(corpo).toMatch(/bloqueioDoSuporte/)
    expect(corpo).toMatch(/cargosAcimaDoMeu/)
    expect(corpo).toMatch(/salvar_matriz_do_cargo/)
    expect(corpo).toMatch(/role_report_tabs/)
    expect(fonte('components/admin/roles-editor.tsx')).toMatch(/duplicarCargo/)
  })
})

describe('15ª A16: o selo "Fora do plano" no botão do Copilot', () => {
  it('o selo está à vista, e o estilo mora no globals do núcleo', () => {
    const f = fonte('components/copilot/copilot-fora-do-plano.tsx')
    expect(f).toMatch(/className="copilot-botao-selo"[^>]*>Fora do plano</)
    const css = readFileSync(join(RAIZ, '..', '..', 'packages', 'nucleo', 'src', 'estilos', 'globals.css'), 'utf8')
    expect(css).toMatch(/\.copilot-botao-selo\s*\{/)
  })
})

describe('15ª A23 = 18ª A14 = 19ª A17: o aviso da URL é uma faixa dispensável, não um toast', () => {
  it('o componente desenha a faixa com o fechar, sem toast', () => {
    const f = fonte('components/shared/aviso-da-url.tsx')
    expect(f).not.toMatch(/toast/)
    expect(f).toContain('data-aviso-da-url')
    expect(f).toMatch(/aria-label="Fechar o aviso"/)
  })
  it('nos dois layouts, a faixa mora dentro do <main>, antes da tela', () => {
    // Lido cru: o "/*" dentro de um texto do layout de [slug] confundiria o tira-comentários.
    for (const arq of ['app/admin/layout.tsx', 'app/[slug]/layout.tsx']) {
      const f = readFileSync(join(RAIZ, arq), 'utf8')
      const main = f.indexOf('<main')
      expect(main).toBeGreaterThan(-1)
      expect(f.indexOf('<AvisoDaUrl /></Suspense>')).toBeGreaterThan(main)
      expect(f.indexOf('<AvisoDaUrl /></Suspense>')).toBeLessThan(f.indexOf('{children}', main))
    }
  })
})

describe('15ª A37: a campanha para clientes específicas', () => {
  it('as fichas escolhidas chegam ao público (só uuid)', async () => {
    const { filtrosDaCampanha } = await import('@/lib/notifications/filtros-da-campanha')
    expect(filtrosDaCampanha({ client_ids: [UUID_A, 'x', UUID_B] }).client_ids).toEqual([UUID_A, UUID_B])
    expect(filtrosDaCampanha({}).client_ids).toBeUndefined()
  })
  it('o resumo diz quem são', async () => {
    const { filtrosDoPublico } = await import('@/lib/notifications/resumo-do-publico')
    expect(filtrosDoPublico({ client_ids: [UUID_A, UUID_B] }, { clientes: [{ id: UUID_A, name: 'Ana' }, { id: UUID_B, name: 'Bia' }] }))
      .toContain('Clientes: Ana, Bia')
  })
  it('a tela tem o filtro "Clientes específicas"', () => {
    expect(fonte('components/admin/notification-campaign-form.tsx')).toContain('Clientes específicas')
  })
})

describe('16ª A21: marcar a mesma tag em várias clientes', () => {
  it('só quem ainda não tem a tag muda; a tag é a do vocabulário', async () => {
    const { marcacoesDaTag } = await import('@/lib/tags/marcar-em-varias')
    const fichas = [{ id: 'a', tags: ['VIP'] }, { id: 'b', tags: null }, { id: 'c', tags: ['Botox'] }]
    expect(marcacoesDaTag(fichas, 'vip', ['VIP', 'Botox'])).toEqual({
      tag: 'VIP', mudar: [{ id: 'b', tags: ['VIP'] }, { id: 'c', tags: ['Botox', 'VIP'] }],
    })
    expect(marcacoesDaTag(fichas, 'Inexistente', ['VIP'])).toEqual({ tag: null, mudar: [] })
  })
  it('a action pede Clientes em Gerenciar e grava pelo núcleo do cadastro; a lista tem o "Marcar tag"', () => {
    const acoes = fonte('actions/clients.ts')
    const corpo = acoes.slice(acoes.indexOf('export async function marcarTagEmClientes'))
    expect(corpo.length).toBeGreaterThan(40)
    expect(corpo).toMatch(/can\(ctx, 'clients', 'MANAGE'\)/)
    expect(corpo).toMatch(/marcacoesDaTag/)
    expect(corpo).toMatch(/atualizarClienteCore/)
    expect(fonte('components/branch/clients-sidebar.tsx')).toContain('Marcar tag')
  })
})

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Tânia', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: 'b1', role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', ...permissions } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}
const extras = { rede: 'Camélia', unidade: 'Savassi', pagina: '/savassi/agenda', slugDoPortal: 'savassi', fuso: 'America/Sao_Paulo' }

describe('17ª A24: a recusa da comissão diz QUEM muda', () => {
  // Desde 18/11 a configuração das comissões é só da Admin da rede ("só pela
  // conta admin"): quem muda são as Admins ativas.
  it('quem-desfaz exporta quemMudaAsComissoes (as Admins da rede)', () => {
    expect(fonte('lib/equipe/quem-desfaz.ts')).toMatch(/export async function quemMudaAsComissoes\(tenantId: string\)[^{]*\{[^}]*return adminsAtivasDaRede\(tenantId\)/)
  })
  it('o prompt põe os nomes na recusa, e a rota os lê para quem não muda', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx({ financial: 'VIEW' }), { ...extras, quemMudaAsComissoes: ['Ana Lima', 'Bruno'] })
    expect(texto).toMatch(/comissões[^\n]*Ana Lima, Bruno/)
    expect(fonte('app/api/copilot/route.ts')).toMatch(/quemMudaAsComissoes/)
  })
})

describe('CP1: as leituras do Copilot — comandas abertas, plano, e na ficha os planos e o em aberto', () => {
  it('as duas ferramentas novas estão no catálogo, e são de LEITURA', () => {
    const idx = fonte('lib/copilot/ferramentas/index.ts')
    expect(idx).toMatch(/comandasAbertas/)
    expect(idx).toMatch(/\bplano\b/)
    const f = fonte('lib/copilot/ferramentas/vendas.ts')
    expect(f).toMatch(/nome: 'comandas_abertas'/)
    expect(f).toMatch(/nome: 'plano'/)
    expect(f).not.toMatch(/tipo: 'escrita'/)
    // Nada clínico: a anotação do plano não sai.
    expect(f).not.toMatch(/professional_notes/)
    // O valor só a quem vê o valor.
    expect(f).toMatch(/mostraOValor/)
  })
  it('a ficha traz os planos e o em aberto das vendas, o valor só a quem vê o valor', () => {
    const f = fonte('lib/copilot/ferramentas/clientes.ts')
    expect(f).toMatch(/getEmAbertoDasVendas/)
    expect(f).toMatch(/planosDeTratamento/)
    expect(f).toMatch(/mostraOValor/)
  })
  it('a regra do Copilot diz as leituras novas', () => {
    const r = doc('copilot.md')
    expect(r).toMatch(/comandas_abertas/)
    expect(r).not.toMatch(/Dizer o NOME de quem tem seria uma leitura nova da equipe/)
  })
})
