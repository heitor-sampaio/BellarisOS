import { partsInTZ } from '@/lib/datetime'
import { rotaAtendimento, rotaCliente, rotaNoPortal } from '@/lib/rotas'
import type { LinhaDaAuditoria, NomesDaAuditoria, RegistroDaAuditoria } from './tipos'

/**
 * A frase da auditoria, em português, montada na hora de ler (CF3a). O banco
 * guarda o fato (a tabela, a operação, as colunas, uns poucos valores sem dado
 * pessoal); o nome da cliente, do membro e da unidade vem de `nomes`, lido
 * agora — anonimizada pela LGPD, a cliente sai anonimizada aqui também.
 *
 * Pura: a tela e o CSV usam a mesma, e o teste a chama sem banco.
 */

/** O que é cada registro, com o artigo. Tabela fora daqui: "um registro (tabela)". */
const COISA: Record<string, string> = {
  agenda_bloqueios: 'o bloqueio da agenda',
  appointments: 'o agendamento',
  automations: 'a automação',
  branches: 'a unidade',
  cash_registers: 'o caixa',
  client_documents: 'o documento da cliente',
  client_packages: 'o pacote da cliente',
  clients: 'a ficha da cliente',
  comanda_itens: 'o item da comanda',
  comandas: 'a comanda',
  commission_configs: 'a regra geral das comissões',
  commission_payouts: 'o pagamento de comissão',
  commission_rules: 'a regra de comissão',
  commissions: 'a comissão',
  consent_terms: 'o termo do prontuário',
  contacts: 'o contato',
  creditos_vendidos: 'o crédito vendido',
  crm_funnels: 'o funil',
  crm_motivos_perda: 'o motivo de perda',
  crm_origens: 'a origem',
  crm_stages: 'a etapa do funil',
  document_sign_links: 'o link de assinatura',
  document_signatures: 'a assinatura do documento',
  document_templates: 'o modelo de documento',
  fechamentos_do_dia: 'o fechamento do dia',
  financial_transactions: 'o lançamento',
  forms: 'a ficha',
  fornecedores: 'o fornecedor',
  fundos_de_troco: 'o fundo de troco',
  importacoes: 'a importação',
  indicacao_premios: 'o prêmio de indicação',
  injectable_applications: 'a aplicação de injetável',
  injectable_maps: 'o mapa de injetáveis',
  installments: 'a parcela',
  integration_configs: 'a integração',
  internal_credits: 'o crédito interno',
  issued_documents: 'o documento',
  leads: 'a oportunidade',
  lgpd_requests: 'o pedido de LGPD',
  loyalty_configs: 'a configuração da fidelidade',
  loyalty_rewards: 'a recompensa',
  loyalty_transactions: 'o lançamento de pontos',
  loyalty_vouchers: 'o voucher',
  maquininhas: 'a maquininha',
  marcas: 'a marca',
  medical_record_entries: 'a evolução do prontuário',
  medical_records: 'o prontuário',
  message_templates: 'o template de mensagem',
  notification_campaigns: 'a campanha',
  package_sessions: 'a sessão do pacote',
  payment_fees: 'a taxa de pagamento',
  pre_atendimento_links: 'o link da ficha de saúde',
  pre_atendimentos: 'a ficha de saúde',
  procedure_branch_availability: 'a disponibilidade do procedimento na unidade',
  procedure_branch_pricing: 'o preço do procedimento na unidade',
  procedure_categories: 'a categoria de procedimento',
  procedure_products: 'o insumo do procedimento',
  procedure_professionals: 'quem faz o procedimento',
  procedure_rooms: 'a sala do procedimento',
  procedure_sale_units: 'a sessão pré-paga',
  procedure_sales: 'a venda de procedimento',
  procedures: 'o procedimento',
  product_batches: 'o lote',
  product_categories: 'a categoria de produto',
  product_sale_items: 'o item da venda de produto',
  product_sale_returns: 'a devolução de produto',
  product_sales: 'a venda de produto',
  products: 'o produto',
  prontuario_anotacoes: 'a anotação do prontuário',
  role_permissions: 'a permissão do cargo',
  role_report_tabs: 'a aba de relatório do cargo',
  rooms: 'a sala',
  service_package_items: 'o item do pacote',
  service_packages: 'o pacote',
  stock_movements: 'o movimento de estoque',
  support_grants: 'a liberação do suporte',
  support_sessions: 'o atendimento do suporte',
  tags: 'a tag',
  tenant_roles: 'o cargo',
  tenants: 'os dados da rede',
  treatment_plan_items: 'o item do plano de tratamento',
  treatment_plan_sessions: 'a sessão do plano de tratamento',
  treatment_plans: 'o plano de tratamento',
  users: 'o membro da equipe',
  whatsapp_number_users: 'quem usa o número de WhatsApp',
  whatsapp_numbers: 'o número de WhatsApp',
}

/** O nome do campo, quando dizê-lo ajuda. O que não está aqui conta como "outros campos". */
const CAMPO: Record<string, string> = {
  name: 'nome', nome: 'nome', title: 'título', label: 'nome', status: 'situação', is_active: 'ativo', ativo: 'ativo',
  price: 'preço', valor: 'valor', amount: 'valor', scheduled_at: 'horário', professional_id: 'profissional',
  room_id: 'sala', procedure_id: 'procedimento', notes: 'anotações', intercurrences: 'intercorrências',
  queixas: 'queixas', email: 'e-mail', phone: 'telefone', level: 'nível', scope: 'alcance', role_id: 'cargo',
  branch_id: 'unidade', arquivada_em: 'arquivada', due_date: 'vencimento', paid_at: 'pagamento',
  payment_method: 'forma de pagamento', taxa_pct: 'taxa', quantity: 'quantidade', quantidade: 'quantidade',
  birth_date: 'nascimento', cpf: 'CPF', address: 'endereço', tags: 'tags', stage_id: 'etapa', funnel_id: 'funil',
}

const VERBO: Record<string, string> = { criou: 'Criou', editou: 'Editou', apagou: 'Apagou' }

const MODULO: Record<string, string> = {
  agenda: 'Agenda', clients: 'Clientes', loyalty: 'Fidelidade', medical_records: 'Prontuário', documents: 'Documentos',
  procedures: 'Procedimentos e pacotes', stock: 'Estoque', financial: 'Financeiro e comissões', cashier: 'PDV',
  crm: 'CRM', marketing: 'Marketing', reports: 'Relatórios', team: 'Equipe', forms: 'Modelos de ficha e de documento',
  roles: 'Cargos e permissões', settings: 'Configurações da rede', automations: 'Automações', copilot: 'Copilot', audit: 'Auditoria',
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** O nome do registro: o que o banco guardou (o nome da sala, da tag) ou o que se lê agora. */
function nomeDoRegistro(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string | null {
  const guardado = texto(r.depois.name) ?? texto(r.depois.nome) ?? texto(r.depois.title) ?? texto(r.depois.label)
    ?? texto(r.antes.name) ?? texto(r.antes.nome) ?? texto(r.antes.title) ?? texto(r.antes.label)
  if (guardado) return guardado
  if (r.tabela === 'users' && r.registro_id) return nomes.membros[r.registro_id] ?? null
  if (r.tabela === 'branches' && r.registro_id) return nomes.unidades[r.registro_id] ?? null
  if (r.tabela === 'role_permissions') {
    const m = texto(r.depois.module) ?? texto(r.antes.module)
    return m ? `de ${MODULO[m] ?? m}` : null
  }
  return null
}

function camposMudados(colunas: readonly string[]): string {
  const ditos = [...new Set(colunas.map(c => CAMPO[c]).filter((c): c is string => !!c))]
  const outros = colunas.filter(c => !CAMPO[c]).length
  const partes = outros > 0 ? [...ditos, outros === 1 && ditos.length === 0 ? 'um campo' : 'outros campos'] : ditos
  if (!partes.length) return ''
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

/** "O quê": a frase da linha, sem quem e sem quando. */
export function fraseDaAuditoria(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string {
  const cliente = r.client_id ? nomes.clientes[r.client_id] ?? null : null
  if (r.operacao === 'entrou') return 'Entrou no sistema'
  if (r.operacao === 'abriu') return cliente ? `Abriu o prontuário de ${cliente}` : 'Abriu o prontuário'
  if (r.incompleto) return `${VERBO[r.operacao] ?? 'Mudou'} ${COISA[r.tabela] ?? 'um registro'} (registro incompleto)`

  const coisa = COISA[r.tabela] ?? `um registro (${r.tabela})`
  const nome = r.tabela === 'clients' ? null : nomeDoRegistro(r, nomes)
  let frase = `${VERBO[r.operacao] ?? 'Mudou'} ${coisa}${nome ? ` ${nome}` : ''}`
  if (r.tabela === 'clients' && cliente) frase += ` de ${cliente}`
  else if (cliente) frase += ` — ${cliente}`
  if (r.operacao === 'editou') {
    const campos = camposMudados(r.colunas)
    if (campos) frase += ` (${campos})`
  }
  return frase
}

/** O endereço do que a linha fala, no portal de quem lê (lib/rotas). Um por linha, ou nenhum. */
export function linkDaAuditoria(r: RegistroDaAuditoria, pathname: string, slug: string | null): string | null {
  if (r.operacao === 'apagou' && !r.client_id) return null
  if (r.tabela === 'appointments' && r.registro_id && r.operacao !== 'apagou') return rotaAtendimento(pathname, slug, r.registro_id)
  if (r.client_id) return rotaCliente(pathname, slug, r.client_id)
  const naTela: Record<string, string> = {
    tags: '/settings?tab=tags', tenant_roles: '/settings?tab=permissions', role_permissions: '/settings?tab=permissions',
    products: '/estoque', procedures: '/procedures', service_packages: '/pacotes', forms: '/settings?tab=fichas',
    document_templates: '/settings?tab=documentos', users: '/team', financial_transactions: '/financeiro',
  }
  const sufixo = naTela[r.tabela]
  return sufixo ? rotaNoPortal(pathname, slug, sufixo) : null
}

/** "dd/mm/aaaa hh:mm", no fuso da rede. */
export function quandoDaAuditoria(iso: string, fuso?: string): string {
  const p = partsInTZ(new Date(iso), fuso)
  const d = (n: number) => String(n).padStart(2, '0')
  return `${d(p.day)}/${d(p.month)}/${p.year} ${d(p.hour)}:${d(p.minute)}`
}

export function linhaDaAuditoria(
  r: RegistroDaAuditoria, nomes: NomesDaAuditoria, pathname: string, slug: string | null, fuso?: string,
): LinhaDaAuditoria {
  return {
    id:         r.id,
    quando:     quandoDaAuditoria(r.criado_em, fuso),
    quem:       r.ator_nome,
    tipoDeAtor: r.ator_tipo,
    oQue:       fraseDaAuditoria(r, nomes),
    unidade:    r.branch_id ? nomes.unidades[r.branch_id] ?? null : null,
    href:       linkDaAuditoria(r, pathname, slug),
  }
}
