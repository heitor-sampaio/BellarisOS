import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_PERMISSIONS, NO_PERMISSIONS } from '@/lib/permissions'
import type { ResolvedPermissions } from '@/lib/permissions'
import { menuDaUnidadeFor } from '@/lib/menu'
import { paginasDaBusca, termoEhDeUmaPagina } from '@/lib/busca/paginas'
import { seloDaComanda, emAbertoDaComanda, detalheDaComanda, type ComandaDoPdv } from '@/lib/pdv/situacoes'
import { textoDoCreditoNoApp } from '@/lib/creditos/texto-do-pago'
import { textoDaDicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { fraseDaAuditoria, gruposDaAuditoria } from '@/lib/auditoria/frase'
import { OPERACOES, type RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * Os atritos da 15ª simulação (2026-11-15) que se provam sem tela: o texto,
 * a regra pura de leitura e o menu. Os de tela estão nos specs
 * `*-atritos-da-15.spec.ts`.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null) => s?.replace(/\s/g, ' ') ?? null
const com = (p: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...p })

const comanda = (c: Partial<ComandaDoPdv> = {}): ComandaDoPdv => ({
  id: 'c1', numero: 1, origem: 'VENDA', abertaEm: '2026-11-15T12:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl1', cliente: 'Breno', agendamentoId: null, procedimento: 'Pacote 4 lasers', profissional: 'Lia',
  agendadoPara: null, atendimento: null, valor: 2100, paga: true, pagaEm: '2026-11-15T12:00:00Z', recebido: 300,
  forma: 'CREDIARIO', estornada: false, planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 0, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...c,
})
const hora = (iso: string | null) => (iso ? '07:30' : '')
const FUSO = 'America/Sao_Paulo'

describe('A1/A17: a comanda do crediário diz o que está em aberto', () => {
  const crediario = comanda({ emAberto: 1800, parcelasEmAberto: 3, proximaParcela: '2026-12-15T15:00:00Z' })

  it('o em aberto diz o valor, as parcelas e a primeira', () => {
    expect(sp(emAbertoDaComanda(crediario, FUSO))).toBe('R$ 1.800,00 em aberto (3 parcelas, a 1ª em 15/12)')
    expect(sp(emAbertoDaComanda(comanda({ emAberto: 600, parcelasEmAberto: 1, proximaParcela: '2026-12-15T15:00:00Z' }), FUSO)))
      .toBe('R$ 600,00 em aberto (1 parcela, em 15/12)')
    // O "A receber" sem parcelas: o vencimento.
    expect(sp(emAbertoDaComanda(comanda({ forma: 'A_RECEBER', emAberto: 200, proximaParcela: '2026-12-15T15:00:00Z' }), FUSO)))
      .toBe('R$ 200,00 em aberto, vence em 15/12')
    expect(emAbertoDaComanda(comanda(), FUSO)).toBeNull()
  })

  it('o selo não diz "Paga" com dinheiro em aberto', () => {
    expect(seloDaComanda(crediario)).toEqual({ texto: 'A receber', tom: 'warn' })
    expect(seloDaComanda(comanda({ emAberto: 0 }))).toEqual({ texto: 'Paga', tom: 'ok' })
  })

  it('a linha da lista diz a forma e o em aberto', () => {
    expect(sp(detalheDaComanda(crediario, hora))).toBe('Pacote 4 lasers · Crediário · R$ 1.800,00 em aberto')
  })
})

describe('A3: a linha da comanda do atendimento diz o produto que ela leva', () => {
  it('"Limpeza de pele + 1 produto"', () => {
    const c = comanda({ origem: 'ATENDIMENTO', procedimento: 'Limpeza de pele', agendadoPara: '2026-11-15T10:30:00Z',
      forma: 'CREDIT_CARD', produtos: 1, recebido: 369 })
    expect(detalheDaComanda(c, hora)).toBe('Limpeza de pele + 1 produto · 07:30 · Crédito')
    expect(detalheDaComanda({ ...c, produtos: 2 }, hora)).toBe('Limpeza de pele + 2 produtos · 07:30 · Crédito')
    expect(detalheDaComanda({ ...c, produtos: 0, paga: false }, hora)).toBe('Limpeza de pele · 07:30 · Lia')
  })
})

describe('A4: a forma da entrada tem o nome da lista principal, e a dica cabe', () => {
  it('a entrada do crediário diz "Débito" e "Crédito", como as formas ao lado', () => {
    expect(ler('components/shared/campos-do-pagamento.tsx')).not.toContain('rotuloDaForma(m, null, { longo: true })')
  })
  it('a dica à vista é curta', () => {
    expect(textoDaDicaDasVezes(6, 1, null)).toBe('À vista · até 6x no crédito')
    expect(textoDaDicaDasVezes(6, 3, '3x de R$ 100,00')).toBe('Até 6x no crédito · 3x de R$ 100,00')
  })
})

describe('A6: palavra que acha uma página não oferece o cadastro', () => {
  const paginas = paginasDaBusca('centro', ALL_PERMISSIONS)
  it('"PDV" é o nome de uma página', () => {
    expect(termoEhDeUmaPagina(paginas, 'PDV')).toBe(true)
    expect(termoEhDeUmaPagina(paginas, 'pdv ')).toBe(true)
    expect(termoEhDeUmaPagina(paginas, 'agenda')).toBe(true)
  })
  it('um nome de pessoa não é', () => {
    expect(termoEhDeUmaPagina(paginas, 'Maria Souza')).toBe(false)
    expect(termoEhDeUmaPagina(paginas, 'Ag')).toBe(false)
  })
  it('a busca usa a regra antes do "Cadastrar"', () => {
    expect(ler('components/shared/busca-universal.tsx')).toContain('termoEhDeUmaPagina(')
  })
})

describe('A10/A17: o app não diz "Já pago" no que é do pacote', () => {
  it('"Incluído no pacote X (sessão 1 de 4)"', () => {
    expect(textoDoCreditoNoApp({ tipo: 'PACOTE', origem: '4 lasers', procedimento: 'Laser', numero: 1, total: 4 }))
      .toBe('Incluído no pacote 4 lasers (sessão 1 de 4)')
    expect(textoDoCreditoNoApp({ tipo: 'PRE_PAGO', origem: 'Pré-pago', procedimento: 'Limpeza', numero: 2, total: 3 }))
      // A6 da 25ª: a "unidade" do pré-pago é a sessão (a unidade é a da rede).
      .toBe('Incluído no pré-pago de Limpeza (sessão 2 de 3)')
  })
  it('o passo do procedimento no app diz "Incluído", não "Já pago"', () => {
    const wizard = ler('components/client-portal/new-appointment-wizard.tsx')
    expect(wizard).not.toContain("'Já pago'")
    expect(ler('lib/creditos/texto-do-pago.ts')).not.toMatch(/`Já pago/)
  })
})

// Desde 18/11 (o Heitor: "Configuração da rede toda só pela conta admin") quem vê é a Admin da rede, não
// quem tem "A rede inteira" (A-CONF1 da 25ª; o resto em tests/config-da-rede-sobras-da-25.test.ts).
describe('A26: "Tags e importações" sai do menu de quem só leria as duas abas', () => {
  const temConfiguracoes = (p: ResolvedPermissions, daRede: boolean, adminDaRede = false) =>
    menuDaUnidadeFor(p, null, undefined, { base: '/centro', daRede, adminDaRede }).flatMap(s => s.entries).some(e => e.key === 'settings')

  // Desde a revisão de 24/11 (Q09), Clientes em Gerenciar abre a aba LGPD (quem responde): não "só
  // leria" as duas abas, e vê o item. Quem só leria as duas é quem chega pelo CRM.
  it('quem tem unidades e só chega pelo CRM não vê o item; Clientes em Gerenciar vê (a LGPD, Q09)', () => {
    expect(temConfiguracoes(com({ clients: 'MANAGE' }), false)).toBe(true)
    expect(temConfiguracoes(com({ crm: 'MANAGE' }), false)).toBe(false)
  })
  it('quem tem "A rede inteira" sem ser a Admin também não; a Admin da rede vê, e quem tem as Configurações também', () => {
    expect(temConfiguracoes(com({ crm: 'MANAGE' }), true)).toBe(false)
    expect(temConfiguracoes(com({ crm: 'MANAGE' }), true, true)).toBe(true)
    expect(temConfiguracoes(com({ settings: 'MANAGE' }), false)).toBe(true)
  })
  it('a busca também não oferece a tela nem as duas abas', () => {
    const keys = paginasDaBusca('centro', com({ crm: 'MANAGE' }), null, { daRede: false }).map(p => p.key)
    expect(keys).not.toContain('settings')
    expect(keys).not.toContain('settings:tags')
    expect(keys).not.toContain('settings:importacoes')
    expect(paginasDaBusca('centro', com({ crm: 'MANAGE' }), null, { daRede: true }).map(p => p.key)).not.toContain('settings')
    const admin = paginasDaBusca('centro', com({ crm: 'MANAGE' }), null, { daRede: true, adminDaRede: true }).map(p => p.key)
    expect(admin).toContain('settings')
    // Clientes em Gerenciar acha a LGPD (Q09).
    expect(paginasDaBusca('centro', com({ clients: 'MANAGE' }), null, { daRede: false }).map(p => p.key)).toContain('settings:lgpd')
  })
})

describe('A27/A28: a auditoria agrupa a gravação e lê o fato', () => {
  let id = 1000
  const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
    id: id--, criado_em: '2026-11-15T12:00:00.123Z', branch_id: null, client_id: null, tabela: 'tags', operacao: 'criou',
    registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Marina', ator_tipo: 'membro',
    incompleto: false, ...x,
  })
  const nomes = {
    clientes: { c1: 'Breno' }, membros: { m1: 'Téo Barros' }, unidades: { b1: 'Batel', b2: 'Água Verde' },
    produtos: { p1: 'Protetor FPS 50', p2: 'Sérum C' },
    cargos: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`rp${i}`, 'Balcão Íris'])),
  }
  const grupos = (rs: RegistroDaAuditoria[]) => gruposDaAuditoria(rs, nomes, '/admin/auditoria', null)

  it('a semente da rede nova vira uma linha, com o resto guardado nela', () => {
    const semente = [
      r({ tabela: 'tenants', depois: { name: 'Rede Orquídea' }, ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' }),
      ...Array.from({ length: 19 }, () => r({ tabela: 'role_permissions', depois: { module: 'agenda' }, ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' })),
      ...Array.from({ length: 8 }, () => r({ tabela: 'tags', depois: { nome: 'VIP' }, ator_user_id: null, ator_nome: 'O sistema', ator_tipo: 'sistema' })),
    ]
    const g = grupos(semente)
    expect(g).toHaveLength(1)
    expect(g[0]!.oQue).toBe('Montou a rede nova Rede Orquídea (28 registros: 19 permissões dos cargos, 8 tags)')
    expect(g[0]!.detalhes).toHaveLength(28)
  })

  it('o cargo novo e as permissões dele são uma linha', () => {
    const g = grupos([
      r({ tabela: 'tenant_roles', depois: { label: 'Balcão Íris' } }),
      ...Array.from({ length: 19 }, () => r({ tabela: 'role_permissions', depois: { module: 'agenda' } })),
    ])
    expect(g).toHaveLength(1)
    expect(g[0]!.oQue).toBe('Criou o cargo Balcão Íris (19 permissões)')
  })

  it('as permissões salvas juntas dizem de qual cargo (o nome lido agora)', () => {
    const g = grupos([
      ...Array.from({ length: 18 }, (_, i) => r({ tabela: 'role_permissions', registro_id: `rp${i}`, depois: { module: 'agenda' } })),
      r({ tabela: 'role_permissions', operacao: 'editou', registro_id: 'rp1', colunas: ['level'] }),
    ])
    expect(g).toHaveLength(1)
    // R39, o Heitor, 27/11: "'Mudou os acessos do cargo X (N permissões)' (a proposta)".
    expect(g[0]!.oQue).toBe('Mudou os acessos do cargo Balcão Íris (19 permissões)')
  })

  it('os insumos salvos juntos são uma linha', () => {
    const g = grupos([
      ...Array.from({ length: 3 }, () => r({ tabela: 'procedure_products', operacao: 'criou' })),
      ...Array.from({ length: 3 }, () => r({ tabela: 'procedure_products', operacao: 'apagou' })),
    ])
    expect(g).toHaveLength(1)
    // R40, o Heitor, 27/11: "Cada parte com o seu plural (a proposta)".
    expect(g[0]!.oQue).toBe('Criou 3 insumos e apagou 3 insumos do procedimento')
  })

  it('gravações de quem ou de quando diferentes não se juntam', () => {
    expect(grupos([r({}), r({ criado_em: '2026-11-15T12:00:01Z' }), r({ ator_user_id: 'u2', ator_nome: 'Lia' })])).toHaveLength(3)
  })

  it('o estorno diz o que foi estornado e quanto', () => {
    const g = grupos([
      r({ tabela: 'financial_transactions', client_id: 'c1', branch_id: 'b1', depois: { type: 'EXPENSE', amount: 139, category: 'Estorno' } }),
      r({ tabela: 'financial_transactions', client_id: 'c1', branch_id: 'b1', operacao: 'editou', colunas: ['estorno_motivo', 'notes'] }),
      r({ tabela: 'stock_movements', branch_id: 'b1', depois: { type: 'SALE_RETURN', quantity: 1, product_id: 'p2' } }),
      r({ tabela: 'product_sale_items', operacao: 'editou', colunas: ['devolucao_movement_id'] }),
      r({ tabela: 'product_sales', client_id: 'c1', branch_id: 'b1', operacao: 'editou', colunas: ['estornada_em', 'estorno_motivo'] }),
    ])
    expect(g).toHaveLength(1)
    expect(sp(g[0]!.oQue)).toBe('Estornou a venda de produto (R$ 139,00), e 1 Sérum C voltou ao estoque — Breno')
    expect(g[0]!.detalhes).toHaveLength(5)
  })

  it('desativar e reativar dizem o fato', () => {
    expect(fraseDaAuditoria(r({ tabela: 'users', operacao: 'editou', registro_id: 'm1', colunas: ['is_active'], antes: { is_active: true }, depois: { is_active: false } }), nomes))
      .toBe('Desativou Téo Barros')
    expect(fraseDaAuditoria(r({ tabela: 'users', operacao: 'editou', registro_id: 'm1', colunas: ['is_active'], antes: { is_active: false }, depois: { is_active: true } }), nomes))
      .toBe('Reativou Téo Barros')
  })

  it('o movimento de estoque diz o produto e a quantidade; a transferência, de onde para onde', () => {
    const g = grupos([
      r({ tabela: 'stock_movements', branch_id: 'b1', depois: { type: 'TRANSFER_OUT', quantity: -2, product_id: 'p1' } }),
      r({ tabela: 'stock_movements', branch_id: 'b2', depois: { type: 'TRANSFER_IN', quantity: 2, product_id: 'p1' } }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0]!.oQue).toBe('Transferiu 2 Protetor FPS 50 de Batel para Água Verde')
    expect(fraseDaAuditoria(r({ tabela: 'stock_movements', branch_id: 'b1', depois: { type: 'PURCHASE', quantity: 5, product_id: 'p2' } }), nomes))
      .toBe('Deu entrada em 5 Sérum C')
    expect(fraseDaAuditoria(r({ tabela: 'stock_movements', branch_id: 'b1', depois: { type: 'LOSS', quantity: -1, product_id: 'p2' } }), nomes))
      .toBe('Registrou a perda de 1 Sérum C')
  })

  it('o campo se nomeia — nada de "um campo" ou "outros campos"', () => {
    const taxa = fraseDaAuditoria(r({ tabela: 'tenants', operacao: 'editou', colunas: ['pix_taxa_pct'], depois: { name: 'Íris' } }), nomes)
    expect(taxa).toBe('Editou os dados da rede Íris (taxa do Pix)')
    const responsavel = fraseDaAuditoria(r({ tabela: 'leads', operacao: 'editou', colunas: ['owner_id'] }), nomes)
    expect(responsavel).toBe('Editou a oportunidade (responsável)')
    const desconhecida = fraseDaAuditoria(r({ tabela: 'tags', operacao: 'editou', colunas: ['coluna_nova'], depois: { nome: 'VIP' } }), nomes)
    expect(desconhecida).toBe('Editou a tag VIP (coluna nova)')
    expect(desconhecida).not.toMatch(/um campo|outros campos/)
  })

  // A regra mudou em 2026-11-16 (o Heitor: "Auditoria é só admin"): quem lê é a
  // Admin da rede, que vê tudo — o filtro "Abriu o prontuário" não sai mais de ninguém.
  it('o filtro "Abriu o prontuário" está sempre na lista (a Auditoria é só da Admin da rede)', () => {
    expect(OPERACOES.map(o => o.key)).toContain('abriu')
  })
})

// ─── Os BAIXA de texto (a frase da tela, sem regra nova) ────────────────────

describe('os BAIXA da 15ª: o texto diz o que vale', () => {
  // O nome do link: "Completar o cadastro" (o Heitor, 25/11: "Completar cadastro").
  it('A5: o documento travado pelo cadastro leva à ficha ("Completar o cadastro")', () => {
    expect(ler('components/branch/checkout-wizard.tsx')).not.toContain('>Completar a ficha<')
    expect(ler('components/branch/checkout-wizard.tsx')).toMatch(/Falta no cadastro:[\s\S]{0,300}>Completar o cadastro<\/Link>/)
  })
  it('A9: um gênero só, neutro onde dá ("de quem atende")', () => {
    expect(ler('components/branch/appointment-session.tsx')).not.toContain('relatadas pelo cliente')
    expect(ler('components/branch/appointment-session.tsx')).not.toMatch(/>Dores do cliente</)
    expect(ler('components/branch/attendance-record-card.tsx')).not.toContain('label="Dores do cliente"')
    expect(ler('components/branch/treatment-plan-editor.tsx')).not.toContain('OBSERVAÇÕES DA PROFISSIONAL')
    expect(ler('components/branch/treatment-plan-editor.tsx')).toContain('Observações de quem atende')
  })
  it('A11: quem não tem CPF lê o que completar (o nascimento)', () => {
    const f = ler('components/branch/pre-atendimento-do-agendamento.tsx')
    expect(f).not.toContain('Complete o CPF ou a data de nascimento')
    expect(f).toContain('Para quem não tem CPF, complete a data de nascimento')
  })
  it('A12: o botão do estoque é "Movimentar", e o destino diz que vale qualquer unidade da rede', () => {
    expect(ler('components/admin/admin-stock-view.tsx')).toMatch(/\/> Movimentar\n/)
    expect(ler('components/admin/admin-stock-manage-modal.tsx')).toContain('Pode mandar para qualquer unidade da rede')
  })
  it('A18/A22: os avisos citam o rótulo que a tela mostra ("Atende clientes") e quem pode marcar', () => {
    expect(ler('app/admin/team/page.tsx')).not.toContain('“Atende clientes em” de quem atende lá')
    for (const f of ['components/branch/agenda-day-view.tsx', 'components/branch/agenda-week-view.tsx']) {
      expect(ler(f)).not.toContain('Nenhum profissional cadastrado nesta unidade')
      expect(ler(f)).toContain('quem tem a Equipe em Gerenciar marca o “Atende clientes”')
    }
  })
  // A regra mudou em 2026-11-16 (o Heitor): "Abrimos a sua unidade" lia-se como criação — o aviso diz onde a pessoa está.
  it('A23: quem pede a rede sem "A rede inteira" lê por quê', async () => {
    const { AVISOS_DA_URL } = await import('@/lib/aviso-da-url')
    expect(AVISOS_DA_URL['portal-da-rede']).toBe('O portal da rede é de quem tem “A rede inteira”. Você está na sua unidade.')
  })
  it('A24: o procedimento numa unidade diz o nome dela; em várias, "3 de 4"', () => {
    const f = ler('app/_shared/catalogo-de-procedimentos.tsx')
    expect(f).not.toContain("`${branchCount} ${branchCount === 1 ? 'unidade' : 'unidades'}`")
    expect(f).toContain('de ${branchList.length}')
  })
  it('A31: "O que já aconteceu" mostra o rótulo do evento, não o nome técnico', () => {
    const f = ler('components/admin/settings-eventos.tsx')
    expect(f).toContain('rotuloDoEvento(')
    expect(f).not.toMatch(/>\{l\.nome\}<|^\s*\{(l|ev)\.nome\}\r?$/m)
  })
  it('A34: o quadro vazio diz onde achar o contato sem oportunidade', () => {
    expect(ler('components/branch/crm-board.tsx')).toContain('procure pelo nome na busca (Ctrl K)')
  })
  it('A35: o plano aceito sem pagamento diz o valor "a combinar na unidade"', () => {
    expect(ler('app/[slug]/cliente/planos/[id]/page.tsx')).toContain('a combinar na unidade')
  })
  it('A36: o termo e o contrato escolhidos saem de "Outros documentos"', () => {
    // A20 da 20ª: a regra foi para outrosDocumentosOferecidos (e o termo fica fora até um ser escolhido).
    expect(ler('components/admin/procedure-form.tsx')).toContain('outrosDocumentosOferecidos(modelos?.outros ?? [], { termo: termoEscolhido, contrato: contratoEscolhido')
  })
  it('A37: a variável fora do overline, o "aviso no celular ligado" e um rótulo só no "Fez"', async () => {
    const f = ler('components/admin/notification-campaign-form.tsx')
    expect(f).not.toMatch(/<SectionLabel>Título <span/)
    expect(f).toContain('p.category !== p.name')
    expect(ler('components/admin/audience-preview.tsx')).toContain('nenhuma tem o aviso no celular ligado')
    expect(ler('lib/notifications/gatilho-de-hoje.ts')).toContain('nenhuma tem o aviso no celular ligado')
  })
  it('A16: a matriz diz o que está fora do plano da rede', () => {
    expect(ler('components/admin/roles-editor.tsx')).toContain('data-fora-do-plano')
  })
})

describe('A13 da 15ª: o insumo novo nasce sem quantidade (princípio 4)', () => {
  it('a quantidade em branco, que a pessoa preenche — e o campo é obrigatório', () => {
    const f = ler('components/admin/procedure-form.tsx')
    expect(f).toMatch(/product_id: first\.id, quantity: null/)
    expect(f).toContain("value={ins.quantity ?? ''}")
  })
})
