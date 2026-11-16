import { partsInTZ } from '@/lib/datetime'
import { rotaAtendimento, rotaCliente, rotaNoPortal } from '@/lib/rotas'
import { rotuloDaForma } from '@/lib/financeiro/formas'
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
export const COISA_DA_AUDITORIA: Record<string, string> = {
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
  // A27 da 15ª: as colunas que a auditoria já gravou e a frase não sabia dizer ("um campo", "outros campos").
  crm_stage_id: 'etapa', owner_id: 'responsável', perdido_em: 'perdida', motivo_perda_id: 'motivo da perda',
  completed_at: 'conclusão', confirmed_at: 'confirmação', client_confirmed_at: 'confirmação da cliente',
  arrived_at: 'chegada', started_at: 'início', cancelled_at: 'cancelamento', cancellation_reason: 'motivo do cancelamento',
  aconteceu_em: 'data do atendimento', client_feedback: 'avaliação da cliente', client_rating: 'nota da cliente',
  app_account_created_at: 'acesso ao app', last_app_login_at: 'última entrada no app', portal_ultima_entrada_em: 'última entrada no portal',
  rendered_at: 'geração', content: 'conteúdo', content_text: 'conteúdo', content_sha256: 'conteúdo', missing_fields: 'campos que faltam',
  verification_code: 'código de verificação', signed_at: 'assinatura', signed_pdf_path: 'PDF assinado', signed_pdf_sha256: 'PDF assinado',
  payment_snapshot: 'pagamento combinado', revoked_at: 'revogação', used_at: 'uso', expires_at: 'validade',
  grafo: 'fluxo', versao: 'versão', gatilhos: 'gatilhos', last_run_at: 'última execução', total_sent: 'enviadas',
  is_paid: 'pago', recebido_por: 'quem recebeu', data_de_referencia: 'data de referência', estorno_motivo: 'motivo do estorno',
  loyalty_discount: 'desconto em pontos', estornada_em: 'estorno', estornada_por: 'quem estornou', produto_voltou: 'produto de volta ao estoque',
  devolucao_movement_id: 'devolução ao estoque', stock_movement_id: 'baixa do estoque', custo: 'custo', cost_price: 'custo',
  inbox_visibilidade: 'quem vê as conversas', inbox_caixas: 'caixas do WhatsApp', pix_taxa_pct: 'taxa do Pix', taxas: 'taxas',
  max_vezes: 'máximo de vezes', portal_prazo_alteracao_horas: 'prazo para a cliente alterar', plano_validade_dias: 'validade do plano',
  document: 'CNPJ', onboarding_completed_at: 'configuração inicial', atende_em: 'atende em', outras_unidades: 'outras unidades',
  provides_services: 'atende', config: 'configuração', phone_e164: 'telefone', is_default: 'padrão', social_media: 'redes sociais',
  identifiers: 'identificadores', city: 'cidade', state: 'UF', zip_code: 'CEP', neighborhood: 'bairro', address_number: 'número',
  gender: 'gênero', appointment_id: 'agendamento', transaction_id: 'lançamento', evaluation_appointment_id: 'avaliação',
  professional_notes: 'anotação de quem atende', aceito_em: 'aceite', desconto: 'desconto', desconto_por: 'quem deu o desconto',
  vendido_por: 'quem vendeu', schema: 'perguntas', form_id: 'ficha', duration_min: 'duração', system_key: 'modelo de fábrica',
  cancelada_em: 'cancelamento', cancelada_motivo: 'motivo do cancelamento', product_sale_id: 'venda de produto',
  apagado_em: 'apagado', apagado_por: 'quem apagou', apagado_por_nome: 'quem apagou', general_anamnesis: 'ficha de saúde',
  respondido_em: 'resposta', respostas: 'respostas', origem: 'origem', export_json_path: 'arquivo exportado', export_pdf_path: 'arquivo exportado',
  medical_reviewed_at: 'revisão do prontuário', medical_reviewed_by: 'quem revisou', medical_status: 'revisão do prontuário',
  processadas: 'andamento', sem_mudanca: 'andamento', novas: 'andamento', iniciada_em: 'início', concluida_em: 'conclusão',
  execucao: 'andamento', erros_expiram_em: 'validade dos erros', token_cifrado: 'link', category: 'categoria', description: 'descrição',
  // A35 da 16ª: as que ainda saíam em inglês ("used sessions", "failed attempts").
  used_sessions: 'sessões usadas', total_sessions: 'total de sessões', plan_name: 'plano', plan_status: 'situação do plano',
  trial_ends_at: 'fim do teste grátis', failed_attempts: 'tentativas erradas', used_transaction_id: 'lançamento usado',
  color: 'cor', position: 'posição', outcome: 'resultado', archived_at: 'arquivamento', type: 'tipo', discount: 'desconto',
  valid_until: 'validade', session_number: 'número da sessão', package_id: 'pacote', client_id: 'cliente', user_id: 'membro',
  avatar_url: 'foto', photo_url: 'foto', sort_order: 'ordem', locked_until: 'bloqueio',
  // A26 da 17ª: "paid by", "payout id" saíam crus em "Editou a comissão".
  paid_by: 'quem pagou', payout_id: 'pagamento', estornado_at: 'estorno', estornado_por: 'quem estornou',
  estorno_transaction_id: 'estorno', released_at: 'liberação', motivo: 'motivo', kind: 'tipo',
  // A30 da 18ª: "comissao venda pct" saía cru. A trava (tests/auditoria-atritos-da-18.test.ts):
  // toda coluna de users, commissions, commission_payouts e appointments tem nome aqui.
  comissao_venda_pct: 'percentual da comissão de venda', auth_id: 'login', horario: 'horário de trabalho',
  registro_conselho: 'registro no conselho', rule_value: 'regra da comissão', period_ref: 'período',
  line_id: 'item vendido', inicio: 'início', fim: 'fim', total: 'total', source: 'origem',
  client_notes: 'observação da cliente', treatment_plan_id: 'plano de tratamento', procedure_rating: 'nota do procedimento',
  created_by_id: 'quem agendou', sem_preferencia: 'sem preferência de profissional',
  motivo_perda_obs: 'observação da perda', retornar_em: 'retorno', retornar_obs: 'o que fazer no retorno',
  contato_id: 'contato', value: 'valor', cliente_desde: 'cliente desde', ultima_visita_antes: 'última visita antes do sistema',
  points: 'pontos', min_stock: 'estoque mínimo', unit: 'medida', sku: 'código', barcode: 'código de barras',
  parcela_numero: 'parcela', parcela_total: 'total de parcelas', descricao: 'descrição', tipo: 'tipo', dia: 'dia',
  diferenca: 'diferença', preco: 'preço', observacao: 'observação', visible_on_client_app: 'agendável pelo app',
}

/** O nome de cada campo na Auditoria (a trava de A30 da 18ª lê daqui). */
export const CAMPO_DA_AUDITORIA: Readonly<Record<string, string>> = CAMPO

/**
 * Colunas que o sistema deriva de outras (A26 da 17ª: "quando aconteceu" é a
 * conta do horário e da conclusão, não um campo que a pessoa mudou): saem da
 * frase quando outra coluna mudou junto.
 */
const DERIVADAS: ReadonlySet<string> = new Set(['aconteceu_em'])

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
  // A27 da 17ª: a oportunidade e o contato (gravados como `{}`) e o produto do item da comanda, lidos agora.
  if (r.tabela === 'leads' && r.registro_id) return nomes.oportunidades?.[r.registro_id] ?? null
  if (r.tabela === 'contacts' && r.registro_id) return nomes.contatos?.[r.registro_id] ?? null
  if (r.tabela === 'comanda_itens' && r.registro_id) return nomes.itensDaComanda?.[r.registro_id] ?? null
  if (r.tabela === 'role_permissions') {
    const m = texto(r.depois.module) ?? texto(r.antes.module)
    return m ? `de ${MODULO[m] ?? m}` : null
  }
  return null
}

/** "a, b e c" */
function emLista(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

/**
 * Os campos mudados, pelo nome (A27 da 15ª: "um campo" e "outros campos" não
 * diziam o quê). A coluna fora de `CAMPO` sai pelo próprio nome, sem o "_".
 */
function camposMudados(colunas: readonly string[]): string {
  const daPessoa = colunas.filter(c => !DERIVADAS.has(c))
  const ditos = [...new Set((daPessoa.length ? daPessoa : colunas).map(c => CAMPO[c] ?? c.replace(/_/g, ' ')))]
  if (ditos.length > 4) return `${ditos.slice(0, 3).join(', ')} e mais ${ditos.length - 3} campos`
  return emLista(ditos)
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

/** "2 Protetor FPS 50": a quantidade do movimento e o produto, lido agora. */
function doProduto(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string {
  const q = Math.abs(numero(r.depois.quantity ?? r.antes.quantity) ?? 0)
  const id = texto(r.depois.product_id) ?? texto(r.antes.product_id)
  const produto = (id && nomes.produtos?.[id]) || 'produto'
  return `${q.toLocaleString('pt-BR')} ${produto}`
}

/** O movimento de estoque lido como o fato (A28 da 15ª: saía sem produto nem quantidade). */
function fraseDoMovimento(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string | null {
  if (r.operacao !== 'criou') return null
  const tipo = texto(r.depois.type)
  const p = doProduto(r, nomes)
  const unidade = r.branch_id ? nomes.unidades[r.branch_id] ?? null : null
  switch (tipo) {
    case 'PURCHASE':          return `Deu entrada em ${p}`
    case 'LOSS':              return `Registrou a perda de ${p}`
    case 'SALE':              return `Baixou ${p} na venda`
    case 'SALE_RETURN':       return `Devolveu ao estoque ${p}`
    case 'PROCEDURE_USAGE':   return `Baixou ${p} no atendimento`
    case 'MANUAL_ADJUSTMENT': return `Ajustou o estoque: ${p}`
    case 'TRANSFER_OUT':      return `Mandou ${p}${unidade ? ` de ${unidade}` : ''}`
    case 'TRANSFER_IN':       return `Recebeu ${p}${unidade ? ` em ${unidade}` : ''}`
    default:                  return null
  }
}

/** "15/11/2026" de "2026-11-15". */
const diaLegivel = (dia: string) => /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia.split('-').reverse().join('/') : dia

/**
 * A26/A27 da 17ª simulação: os registros que saíam sem o fato — os pontos sem
 * quantidade nem cliente, o item da comanda sem dizer qual, o fechamento que
 * valia também para o "Fechar de novo", a etapa da oportunidade sem de quem.
 * O que a gravação não guarda se lê agora (`nomes`).
 */
function fraseDoRegistroDa17(r: RegistroDaAuditoria, nomes: NomesDaAuditoria, cliente: string | null): string | null {
  if (r.tabela === 'loyalty_transactions' && r.operacao === 'criou') {
    const pontos = numero(r.depois.points)
    if (pontos === null || pontos === 0) return null
    const dela = (r.registro_id && nomes.clientesDosPontos?.[r.registro_id]) || cliente
    const n = Math.abs(pontos).toLocaleString('pt-BR')
    return pontos > 0 ? `Creditou ${n} pontos${dela ? ` a ${dela}` : ''}` : `Debitou ${n} pontos${dela ? ` de ${dela}` : ''}`
  }
  if (r.tabela === 'comanda_itens' && r.operacao === 'criou') {
    const q = numero(r.depois.quantidade) ?? 1
    return `Pôs ${q.toLocaleString('pt-BR')} ${nomeDoRegistro(r, nomes) ?? 'produto'} na comanda`
  }
  if (r.tabela === 'fechamentos_do_dia' && r.operacao === 'criou') {
    const dia = texto(r.depois.dia)
    const diferenca = numero(r.depois.diferenca)
    const deNovo = !!(r.registro_id && nomes.fechamentosDeNovo?.[r.registro_id])
    return `Fechou ${deNovo ? 'de novo ' : ''}${dia ? `o dia ${diaLegivel(dia)}` : 'o dia'}${diferenca ? ` (diferença de ${brl(diferenca)})` : ''}`
  }
  if (r.tabela === 'leads' && r.operacao === 'editou' && r.colunas.includes('crm_stage_id')) {
    const nome = nomeDoRegistro(r, nomes)
    const etapa = (x: Record<string, unknown>) => {
      const id = texto(x.crm_stage_id) ?? texto(x.stage_id)
      return id ? nomes.etapas?.[id] ?? null : null
    }
    const de = etapa(r.antes)
    const para = etapa(r.depois)
    const resto = camposMudados(r.colunas.filter(c => c !== 'crm_stage_id'))
    return `Mudou a etapa ${nome ? `da oportunidade ${nome}` : 'de uma oportunidade'}${de && para ? ` de ${de} para ${para}` : ''}${resto ? ` (e editou: ${resto})` : ''}`
  }
  return null
}

/** "O quê": a frase da linha, sem quem e sem quando. */
export function fraseDaAuditoria(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string {
  const cliente = r.client_id ? nomes.clientes[r.client_id] ?? null : null
  if (r.operacao === 'entrou') return 'Entrou no sistema'
  if (r.operacao === 'abriu') return cliente ? `Abriu o prontuário de ${cliente}` : 'Abriu o prontuário'
  if (r.incompleto) return `${VERBO[r.operacao] ?? 'Mudou'} ${COISA_DA_AUDITORIA[r.tabela] ?? 'um registro'} (registro incompleto)`

  // A28 da 15ª: o desativar e o reativar são o fato, não "Editou o membro (ativo)".
  if (r.tabela === 'users' && r.operacao === 'editou' && r.colunas.includes('is_active')
    && typeof r.depois.is_active === 'boolean' && r.antes.is_active !== r.depois.is_active) {
    const quem = nomeDoRegistro(r, nomes) ?? 'um membro da equipe'
    const resto = camposMudados(r.colunas.filter(c => c !== 'is_active'))
    return `${r.depois.is_active ? 'Reativou' : 'Desativou'} ${quem}${resto ? ` (e editou: ${resto})` : ''}`
  }
  if (r.tabela === 'stock_movements') {
    const movimento = fraseDoMovimento(r, nomes)
    if (movimento) return movimento
  }
  // A35 da 16ª: o lançamento criado diz o que é e quanto ("Criou o lançamento" não dizia).
  if (r.tabela === 'financial_transactions' && r.operacao === 'criou') {
    const tipo = texto(r.depois.type)
    const categoria = texto(r.depois.category)
    const valor = numero(r.depois.amount)
    const oQue = categoria === 'Estorno' ? 'o estorno' : tipo === 'EXPENSE' ? 'a despesa' : tipo === 'INCOME' ? 'a receita' : 'o lançamento'
    const nomeDele = categoria && categoria !== 'Estorno' ? ` ${categoria}` : ''
    return `Criou ${oQue}${nomeDele}${valor != null ? ` (${brl(valor)})` : ''}${cliente ? ` — ${cliente}` : ''}`
  }
  const fato = fraseDoRegistroDa17(r, nomes, cliente)
  if (fato) return fato
  // A31 da 18ª: o cancelamento é o fato ("Editou o agendamento (motivo do cancelamento, …)" não dizia).
  if (r.tabela === 'appointments' && r.operacao === 'editou' && texto(r.depois.status) === 'CANCELLED'
    && texto(r.antes.status) !== 'CANCELLED') {
    const motivo = r.registro_id ? texto(nomes.motivosDoCancelamento?.[r.registro_id]) : null
    return `Cancelou o agendamento${cliente ? ` de ${cliente}` : ''}${motivo ? ` (motivo: ${motivo})` : ''}`
  }
  // A33 da 18ª: a comissão diz de qual é (o atendimento, a venda) — no CSV, as linhas do pagamento eram iguais.
  if (r.tabela === 'commissions' && r.registro_id && nomes.comissoes?.[r.registro_id]) {
    const qual = nomes.comissoes[r.registro_id]!
    if (r.operacao === 'editou' && texto(r.depois.status) === 'PAID' && texto(r.antes.status) !== 'PAID') {
      return `Marcou como paga a comissão ${qual}`
    }
    const campos = r.operacao === 'editou' ? camposMudados(r.colunas) : ''
    return `${VERBO[r.operacao] ?? 'Mudou'} a comissão ${qual}${campos ? ` (${campos})` : ''}`
  }
  // A36 da 16ª: a resposta da ficha de saúde é o fato. Pela cliente (o link, o app) ela "respondeu"; pela equipe, "preencheu".
  if (r.tabela === 'pre_atendimentos' && r.operacao === 'editou' && r.colunas.includes('respondido_em')) {
    if (r.ator_tipo === 'sistema' || r.ator_tipo === 'cliente') return 'Respondeu a ficha de saúde'
    return `Preencheu a ficha de saúde${cliente ? ` de ${cliente}` : ''}`
  }

  let coisa = COISA_DA_AUDITORIA[r.tabela] ?? `um registro (${r.tabela})`
  let nome = r.tabela === 'clients' ? null : nomeDoRegistro(r, nomes)
  // A permissão diz o módulo e o cargo: "Criou a permissão de Agenda do cargo X".
  const cargo = r.tabela === 'role_permissions' && r.registro_id ? nomes.cargos?.[r.registro_id] : null
  if (cargo) { coisa = 'a permissão'; nome = `${nome ? `${nome} ` : ''}do cargo ${cargo}` }
  let frase = `${VERBO[r.operacao] ?? 'Mudou'} ${coisa}${nome ? ` ${nome}` : ''}`
  if (r.tabela === 'clients' && cliente) frase += ` de ${cliente}`
  else if (cliente) frase += ` — ${cliente}`
  // A35 da 16ª: com duas unidades, a sala de qual.
  if (r.tabela === 'rooms' && r.branch_id && nomes.unidades[r.branch_id]) frase += ` em ${nomes.unidades[r.branch_id]}`
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

/**
 * A36 da 16ª: o que a cliente fez pelo LINK público (responder a ficha de
 * saúde, assinar o documento, errar o código) não tem sessão, e o banco o
 * grava como "O sistema". A gravação é dela: o link é da ficha dela, e só a
 * mudança que vem de quem o abre conta — o link CRIADO (pela automação, pela
 * equipe) segue de quem o criou.
 */
function feitoPeloLink(r: RegistroDaAuditoria): boolean {
  if (r.ator_tipo !== 'sistema' || !r.client_id) return false
  switch (r.tabela) {
    case 'document_signatures': return true
    case 'pre_atendimentos': case 'pre_atendimento_links': case 'document_sign_links': case 'issued_documents':
      return r.operacao === 'editou'
    case 'medical_records': return r.operacao === 'editou' && r.colunas.includes('general_anamnesis')
    default: return false
  }
}

/** Quem agiu, como a tela o diz: a cliente, pelo link, onde o banco disse "O sistema". */
function quemAgiu(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): { quem: string; tipoDeAtor: RegistroDaAuditoria['ator_tipo'] } {
  const cliente = r.client_id ? nomes.clientes[r.client_id] ?? null : null
  if (cliente && feitoPeloLink(r)) return { quem: `${cliente}, pelo link`, tipoDeAtor: 'cliente' }
  return { quem: r.ator_nome, tipoDeAtor: r.ator_tipo }
}

export function linhaDaAuditoria(
  r: RegistroDaAuditoria, nomes: NomesDaAuditoria, pathname: string, slug: string | null, fuso?: string,
): LinhaDaAuditoria {
  return {
    id:         r.id,
    quando:     quandoDaAuditoria(r.criado_em, fuso),
    ...quemAgiu(r, nomes),
    oQue:       fraseDaAuditoria(r, nomes),
    unidade:    r.branch_id ? nomes.unidades[r.branch_id] ?? null : null,
    href:       linkDaAuditoria(r, pathname, slug),
  }
}

// ─── A gravação (A27/A28 da 15ª simulação) ──────────────────────────────────
//
// O banco grava uma linha por registro mudado; a pessoa lê o que FEZ. As
// linhas de uma mesma gravação — o mesmo `criado_em` (o `now()` da transação)
// e a mesma pessoa — viram UMA linha da tela, com as outras guardadas nela.
// Nada deixa de ser gravado, e o CSV segue uma linha por registro.

/** A tabela-filha e a do pai, para ler "Criou o cargo X (19 permissões)". */
const PAI: Record<string, string> = {
  role_permissions: 'tenant_roles', role_report_tabs: 'tenant_roles',
  procedure_products: 'procedures', procedure_professionals: 'procedures', procedure_rooms: 'procedures',
  procedure_branch_availability: 'procedures', procedure_branch_pricing: 'procedures',
  service_package_items: 'service_packages', treatment_plan_sessions: 'treatment_plans', treatment_plan_items: 'treatment_plans',
  comanda_itens: 'comandas', product_sale_items: 'product_sales',
}
/** O nome curto da filha, no plural, dentro do pai. */
const FILHAS: Record<string, string> = {
  role_permissions: 'permissões', role_report_tabs: 'abas de relatório', procedure_products: 'insumos',
  procedure_professionals: 'profissionais', procedure_rooms: 'salas', procedure_branch_availability: 'unidades',
  procedure_branch_pricing: 'preços por unidade', service_package_items: 'itens', treatment_plan_sessions: 'sessões',
  treatment_plan_items: 'itens', comanda_itens: 'itens', product_sale_items: 'itens',
}
/** O plural de cada coisa, sem o artigo. Fora daqui: "registros". */
export const PLURAL_DA_AUDITORIA: Record<string, string> = {
  role_permissions: 'permissões dos cargos', role_report_tabs: 'abas de relatório dos cargos', tenant_roles: 'cargos',
  tags: 'tags', crm_origens: 'origens', crm_motivos_perda: 'motivos de perda', crm_stages: 'etapas do funil', crm_funnels: 'funis',
  procedure_categories: 'categorias de procedimento', product_categories: 'categorias de produto', forms: 'fichas',
  maquininhas: 'maquininhas', procedure_products: 'insumos do procedimento', procedure_professionals: 'profissionais do procedimento',
  procedure_rooms: 'salas do procedimento', rooms: 'salas', stock_movements: 'movimentos de estoque',
  financial_transactions: 'lançamentos', leads: 'oportunidades', appointments: 'agendamentos', clients: 'fichas de cliente',
  contacts: 'contatos', products: 'produtos', procedures: 'procedimentos', document_templates: 'modelos de documento',
  message_templates: 'templates de mensagem', loyalty_transactions: 'lançamentos de pontos', commissions: 'comissões',
  commission_rules: 'regras de comissão', payment_fees: 'taxas de pagamento', users: 'membros da equipe', branches: 'unidades',
  treatment_plan_sessions: 'sessões do plano', treatment_plan_items: 'itens do plano', issued_documents: 'documentos',
  package_sessions: 'sessões do pacote', procedure_sale_units: 'sessões pré-pagas', comanda_itens: 'itens da comanda',
  installments: 'parcelas', service_package_items: 'itens do pacote', loyalty_rewards: 'recompensas',
  // A35 da 16ª: toda coisa da auditoria tem plural ("Criou 2 links de assinatura", não "registros (document_sign_links)").
  agenda_bloqueios: 'bloqueios da agenda', automations: 'automações', cash_registers: 'caixas', client_documents: 'documentos da cliente',
  client_packages: 'pacotes da cliente', comandas: 'comandas', commission_configs: 'regras gerais das comissões',
  commission_payouts: 'pagamentos de comissão', consent_terms: 'termos do prontuário', creditos_vendidos: 'créditos vendidos',
  document_sign_links: 'links de assinatura', document_signatures: 'assinaturas de documento', fechamentos_do_dia: 'fechamentos do dia',
  fornecedores: 'fornecedores', fundos_de_troco: 'fundos de troco', importacoes: 'importações', indicacao_premios: 'prêmios de indicação',
  injectable_applications: 'aplicações de injetável', injectable_maps: 'mapas de injetáveis', integration_configs: 'integrações',
  internal_credits: 'créditos internos', lgpd_requests: 'pedidos de LGPD', loyalty_configs: 'configurações da fidelidade',
  loyalty_vouchers: 'vouchers', marcas: 'marcas', medical_record_entries: 'evoluções do prontuário', medical_records: 'prontuários',
  notification_campaigns: 'campanhas', pre_atendimento_links: 'links da ficha de saúde', pre_atendimentos: 'fichas de saúde',
  procedure_branch_availability: 'disponibilidades do procedimento nas unidades', procedure_branch_pricing: 'preços do procedimento nas unidades',
  procedure_sales: 'vendas de procedimento', product_batches: 'lotes', product_sale_items: 'itens da venda de produto',
  product_sale_returns: 'devoluções de produto', product_sales: 'vendas de produto', prontuario_anotacoes: 'anotações do prontuário',
  service_packages: 'pacotes', support_grants: 'liberações do suporte', support_sessions: 'atendimentos do suporte',
  tenants: 'dados da rede', treatment_plans: 'planos de tratamento', whatsapp_number_users: 'pessoas nos números de WhatsApp',
  whatsapp_numbers: 'números de WhatsApp',
}
const ORDEM_DAS_OPERACOES: readonly string[] = ['criou', 'editou', 'apagou']

export interface GrupoDaAuditoria extends LinhaDaAuditoria {
  /** Cada registro da gravação, um a um (o que o banco guardou); um só quando a gravação mudou um registro. */
  detalhes: LinhaDaAuditoria[]
}

/** A chave da gravação: a transação (o `criado_em`) e quem agiu. */
const chaveDaGravacao = (r: RegistroDaAuditoria) => `${r.criado_em}|${r.ator_user_id ?? ''}|${r.ator_nome}|${r.ator_tipo}`

/** As linhas em gravações, na ordem em que chegaram (a mais nova primeiro). */
export function agruparAuditoria(registros: readonly RegistroDaAuditoria[]): RegistroDaAuditoria[][] {
  const grupos = new Map<string, RegistroDaAuditoria[]>()
  for (const r of registros) {
    // A entrada e a abertura do prontuário são fatos sozinhos.
    const chave = r.operacao === 'entrou' || r.operacao === 'abriu' ? `#${r.id}` : chaveDaGravacao(r)
    const g = grupos.get(chave)
    if (g) g.push(r)
    else grupos.set(chave, [r])
  }
  return [...grupos.values()]
}

/** "Criou 3 e apagou 1": as operações das linhas, na ordem criou, editou, apagou. */
function contagemDasOperacoes(linhas: readonly RegistroDaAuditoria[]): string {
  const partes = ORDEM_DAS_OPERACOES
    .map(op => ({ op, n: linhas.filter(l => l.operacao === op).length }))
    .filter(x => x.n > 0)
    .map(x => `${x.op} ${x.n}`)
  const frase = emLista(partes)
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

/** "19 permissões dos cargos, 8 tags" — as tabelas do grupo, da que tem mais à que tem menos. */
function resumoDasTabelas(linhas: readonly RegistroDaAuditoria[]): string {
  const porTabela = new Map<string, number>()
  for (const l of linhas) porTabela.set(l.tabela, (porTabela.get(l.tabela) ?? 0) + 1)
  const partes = [...porTabela.entries()].sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${n === 1 ? (COISA_DA_AUDITORIA[t] ?? 'registro').replace(/^(o|a|os|as) /, '') : PLURAL_DA_AUDITORIA[t] ?? 'registros'}`)
  return partes.length > 5 ? `${partes.slice(0, 5).join(', ')}…` : partes.join(', ')
}

/** O estorno lido como o fato: o que foi estornado, quanto, e o que voltou ao estoque. */
function fraseDoEstorno(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): string | null {
  const saidas = linhas.filter(l => l.tabela === 'financial_transactions' && l.operacao === 'criou' && texto(l.depois.category) === 'Estorno')
  if (!saidas.length) return null
  const valor = saidas.reduce((t, l) => t + (numero(l.depois.amount) ?? 0), 0)
  const ALVO: [string, string][] = [
    ['product_sales', 'a venda de produto'], ['procedure_sales', 'a venda de procedimento'], ['client_packages', 'o pacote'],
    ['creditos_vendidos', 'o crédito vendido'], ['treatment_plans', 'o plano de tratamento'],
  ]
  // A26 da 17ª: o lançamento estornado de um atendimento (lido agora) é "o atendimento".
  const doAtendimento = linhas.some(l => l.tabela === 'financial_transactions' && l.operacao === 'editou'
    && l.registro_id && nomes.lancamentos?.[l.registro_id]?.agendamento)
  const alvo = ALVO.find(([t]) => linhas.some(l => l.tabela === t))?.[1] ?? (doAtendimento ? 'o atendimento' : 'um pagamento')
  const voltas = linhas.filter(l => l.tabela === 'stock_movements' && texto(l.depois.type) === 'SALE_RETURN').map(l => doProduto(l, nomes))
  const volta = voltas.length ? `, e ${emLista(voltas)} ${voltas.length === 1 ? 'voltou' : 'voltaram'} ao estoque` : ''
  const clienteId = linhas.find(l => l.client_id)?.client_id
  const cliente = clienteId ? nomes.clientes[clienteId] ?? null : null
  return `Estornou ${alvo} (${brl(valor)})${volta}${cliente ? ` — ${cliente}` : ''}`
}

/** A transferência: a saída de uma unidade e a entrada na outra, na mesma gravação. */
function fraseDaTransferencia(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): string | null {
  if (!linhas.every(l => l.tabela === 'stock_movements' && l.operacao === 'criou')) return null
  const saidas = linhas.filter(l => texto(l.depois.type) === 'TRANSFER_OUT')
  const entradas = linhas.filter(l => texto(l.depois.type) === 'TRANSFER_IN')
  if (!saidas.length || !entradas.length || saidas.length + entradas.length !== linhas.length) return null
  const de = saidas[0]!.branch_id ? nomes.unidades[saidas[0]!.branch_id] ?? null : null
  const para = entradas[0]!.branch_id ? nomes.unidades[entradas[0]!.branch_id] ?? null : null
  return `Transferiu ${emLista(entradas.map(l => doProduto(l, nomes)))}${de ? ` de ${de}` : ''}${para ? ` para ${para}` : ''}`
}

/** O pai de uma gravação com tabelas-filhas (o cargo das permissões, o procedimento dos insumos). */
const paiDaGravacao = (linhas: readonly RegistroDaAuditoria[]) =>
  [...linhas].reverse().find(l => linhas.some(f => PAI[f.tabela] === l.tabela)) ?? null

// ─── O fato da gravação (D6/D7 da 16ª simulação) ────────────────────────────
//
// A gravação do recebimento, da venda e da conclusão grava a comissão, os
// pontos, o contrato e as sessões junto, e "a frase do primeiro registro" lia
// "Criou a comissão" onde a pessoa RECEBEU. O fato é o registro que a pessoa
// mexeu (o agendamento, o lançamento recebido, a venda): ele dá a frase, a
// unidade e o link da linha. Nada muda no que se grava; muda o que se lê.

interface Recebimento { linha: RegistroDaAuditoria; tipo: string | null; valor: number; forma: string | null; categoria: string | null }

/**
 * Os lançamentos que ficaram PAGOS nesta gravação: criados já pagos, ou
 * baixados (o `paid_at` saiu do nulo). O estado é o do fim da gravação — o
 * criado e o editado juntos (o voucher grava R$ 89 e baixa R$ 39) —, e o que
 * a gravação não guardou vem de `nomes.lancamentos`, lido agora.
 */
function recebimentosDaGravacao(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): Recebimento[] {
  const doLancamento = linhas.filter(l => l.tabela === 'financial_transactions' && (l.operacao === 'criou' || l.operacao === 'editou'))
  const porId = new Map<string, RegistroDaAuditoria[]>()
  doLancamento.forEach((l, i) => {
    const chave = l.registro_id ?? `#${i}`
    porId.set(chave, [...(porId.get(chave) ?? []), l])
  })
  const recebidos: Recebimento[] = []
  for (const [chave, doId] of porId) {
    const emOrdem = [...doId].reverse() // a mais antiga primeiro
    const estado: Record<string, unknown> = {}
    for (const l of emOrdem) Object.assign(estado, l.depois)
    const criou = emOrdem.find(l => l.operacao === 'criou')
    const baixou = emOrdem.some(l => l.operacao === 'editou' && 'paid_at' in l.depois && l.depois.paid_at && !l.antes.paid_at)
    const pago = baixou || (!!criou && !!criou.depois.paid_at && estado.paid_at !== null)
    if (!pago) continue
    const lido = nomes.lancamentos?.[chave]
    const valor = numero(estado.amount) ?? lido?.valor ?? null
    if (valor === null) continue
    const categoria = texto(estado.category)
    if (categoria === 'Estorno') continue
    recebidos.push({
      linha: emOrdem[emOrdem.length - 1]!, tipo: texto(estado.type) ?? lido?.tipo ?? null, valor,
      forma: texto(estado.payment_method) ?? lido?.forma ?? null, categoria,
    })
  }
  return recebidos
}

/** "(Pix)", "(Pix e Débito)": as formas dos recebimentos, sem repetir. */
const formasDe = (rs: readonly Recebimento[]) => emLista([...new Set(rs.map(x => x.forma).filter((f): f is string => !!f).map(f => rotuloDaForma(f)))])

/** " — Rita Moura": a cliente da gravação, se for uma só. */
function clienteDaGravacao(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria, preferida?: RegistroDaAuditoria): string {
  const id = preferida?.client_id ?? linhas.find(l => l.client_id)?.client_id
  const nome = id ? nomes.clientes[id] ?? null : null
  return nome ? ` — ${nome}` : ''
}

const ACONTECEU_NO_ATENDIMENTO: Record<string, string> = {
  IN_PROGRESS: 'Iniciou o atendimento', COMPLETED: 'Concluiu o atendimento',
}

/**
 * O voucher usado na gravação (A26 da 17ª: "Recebeu R$ 1.160,00" não dizia o
 * voucher de R$ 40), pelo nome que a auditoria guarda: "o Voucher R$ 40".
 */
function voucherDaGravacao(linhas: readonly RegistroDaAuditoria[]): string | null {
  const usado = linhas.find(l => l.tabela === 'loyalty_vouchers' && l.operacao === 'editou'
    && (l.colunas.includes('used_at') || texto(l.depois.status) === 'USADO'))
  const nome = usado ? texto(usado.depois.name) ?? texto(usado.antes.name) : null
  if (!nome) return null
  return /^voucher\b/i.test(nome) ? `o ${nome}` : `o voucher ${nome}`
}

/** O fato da gravação e o registro dele (a frase, a unidade e o link da linha); nulo quando não há um. */
function fatoDaGravacao(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): { frase: string; principal: RegistroDaAuditoria } | null {
  const criada = (tabela: string) => [...linhas].reverse().find(l => l.tabela === tabela && l.operacao === 'criou') ?? null
  const recebidos = recebimentosDaGravacao(linhas, nomes)
  const entradas = recebidos.filter(x => x.tipo === 'INCOME')
  const totalRecebido = entradas.reduce((t, x) => t + x.valor, 0)
  const voucher = voucherDaGravacao(linhas)
  const eRecebeu = entradas.length ? ` e recebeu ${brl(totalRecebido)}${formasDe(entradas) ? ` (${formasDe(entradas)})` : ''}${voucher ? `, com ${voucher}` : ''}` : ''

  // A venda: o pacote, o pré-pago, o crédito.
  const pacote = criada('client_packages')
  if (pacote) {
    const pk = texto(pacote.depois.package_id)
    const nome = pk ? nomes.pacotes?.[pk] : null
    const preco = numero(pacote.depois.price)
    return {
      principal: pacote,
      frase: `Vendeu ${nome ? `o pacote ${nome}` : 'um pacote'}${preco !== null ? ` (${brl(preco)})` : ''}${clienteDaGravacao(linhas, nomes, pacote)}`,
    }
  }
  const prePago = criada('procedure_sales')
  if (prePago) {
    const q = numero(prePago.depois.quantity)
    const preco = numero(prePago.depois.price)
    const sessoes = q !== null ? ` de ${q.toLocaleString('pt-BR')} ${q === 1 ? 'sessão' : 'sessões'}` : ''
    return {
      principal: prePago,
      frase: `Vendeu o pré-pago${sessoes}${preco !== null ? ` (${brl(preco)})` : ''}${clienteDaGravacao(linhas, nomes, prePago)}`,
    }
  }
  const credito = criada('creditos_vendidos')
  if (credito) {
    const valor = numero(credito.depois.valor)
    return {
      principal: credito,
      frase: `Vendeu crédito interno${valor !== null ? ` (${brl(valor)})` : ''}${clienteDaGravacao(linhas, nomes, credito)}`,
    }
  }

  // O atendimento: iniciou, concluiu (e, na mesma gravação, recebeu).
  const atendimento = [...linhas].reverse().find(l => l.tabela === 'appointments' && l.operacao === 'editou'
    && ACONTECEU_NO_ATENDIMENTO[texto(l.depois.status) ?? ''] && l.antes.status !== l.depois.status)
  if (atendimento) {
    return {
      principal: atendimento,
      frase: `${ACONTECEU_NO_ATENDIMENTO[texto(atendimento.depois.status)!]}${eRecebeu}${clienteDaGravacao(linhas, nomes, atendimento)}`,
    }
  }

  // A venda de produto avulsa (fora da comanda do atendimento): o produto e o que entrou.
  const vendaDeProduto = criada('product_sales')
  const saidas = linhas.filter(l => l.tabela === 'stock_movements' && l.operacao === 'criou' && texto(l.depois.type) === 'SALE')
  const produtos = saidas.length ? emLista(saidas.map(l => doProduto(l, nomes))) : null
  const soProduto = entradas.every(x => x.categoria === 'Venda de produto')
  if (vendaDeProduto && !linhas.some(l => l.tabela === 'comanda_itens') && soProduto) {
    return {
      principal: vendaDeProduto,
      frase: `Vendeu ${produtos ?? 'produto'}${eRecebeu}${clienteDaGravacao(linhas, nomes, vendaDeProduto)}`,
    }
  }

  // O recebimento: a comanda, a parcela, a baixa do lançamento.
  if (entradas.length) {
    const principal = entradas[0]!.linha
    const lido = principal.registro_id ? nomes.lancamentos?.[principal.registro_id] : null
    if (entradas.length === 1 && lido?.parcela) {
      const forma = formasDe(entradas)
      return {
        principal,
        frase: `Recebeu a parcela ${lido.parcela}${lido.de ? `/${lido.de}` : ''} (${brl(totalRecebido)}${forma ? `, ${forma}` : ''})${clienteDaGravacao(linhas, nomes, principal)}`,
      }
    }
    const forma = formasDe(entradas)
    return {
      principal,
      frase: `Recebeu ${brl(totalRecebido)}${forma ? ` (${forma})` : ''}${produtos ? `, com ${produtos}` : ''}${voucher ? `${produtos ? ' e' : ','} com ${voucher}` : ''}${clienteDaGravacao(linhas, nomes, principal)}`,
    }
  }
  const saidasPagas = recebidos.filter(x => x.tipo === 'EXPENSE')
  if (saidasPagas.length) {
    const forma = formasDe(saidasPagas)
    // A26 da 17ª: "Pagou R$ 497,00 (Pix)" não dizia que era a comissão, nem de quem.
    const pagamento = criada('commission_payouts')
    if (pagamento) {
      const quem = pagamento.registro_id ? nomes.pagamentosDeComissao?.[pagamento.registro_id] : null
      const total = brl(saidasPagas.reduce((t, x) => t + x.valor, 0))
      return { principal: saidasPagas[0]!.linha, frase: `Pagou a comissão${quem ? ` de ${quem}` : ''} (${total}${forma ? `, ${forma}` : ''})` }
    }
    return {
      principal: saidasPagas[0]!.linha,
      frase: `Pagou ${brl(saidasPagas.reduce((t, x) => t + x.valor, 0))}${forma ? ` (${forma})` : ''}`,
    }
  }
  return null
}

/** A frase de uma gravação inteira. */
export function fraseDoGrupo(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): string {
  // A baixa sozinha de um lançamento (D7 da 16ª): "Recebeu a parcela 1/4 (R$ 200,00, Pix)".
  if (linhas.length === 1) {
    const so = linhas[0]!
    const baixa = so.tabela === 'financial_transactions' && so.operacao === 'editou' ? fatoDaGravacao(linhas, nomes) : null
    return baixa?.frase ?? fraseDaAuditoria(so, nomes)
  }

  // A semente da rede nova: uma gravação de dezenas de registros.
  const rede = linhas.find(l => l.tabela === 'tenants' && l.operacao === 'criou')
  if (rede) {
    const nome = texto(rede.depois.name)
    return `Montou a rede nova${nome ? ` ${nome}` : ''} (${linhas.length} registros: ${resumoDasTabelas(linhas.filter(l => l !== rede))})`
  }

  const estorno = fraseDoEstorno(linhas, nomes)
  if (estorno) return estorno
  // A36 da 16ª: a resposta da ficha grava o link e o prontuário junto; o fato é a resposta.
  const resposta = linhas.find(l => l.tabela === 'pre_atendimentos' && l.operacao === 'editou' && l.colunas.includes('respondido_em'))
  if (resposta) return fraseDaAuditoria(resposta, nomes)
  const transferencia = fraseDaTransferencia(linhas, nomes)
  if (transferencia) return transferencia
  const fato = fatoDaGravacao(linhas, nomes)
  if (fato) return fato.frase

  // A27 da 17ª: o contato e a oportunidade criados juntos (o "+ Oportunidade", a importação), pelo nome lido agora.
  const oportunidade = linhas.find(l => l.tabela === 'leads' && l.operacao === 'criou')
  if (oportunidade) {
    const contato = linhas.find(l => l.tabela === 'contacts' && l.operacao === 'criou')
    const nome = nomeDoRegistro(oportunidade, nomes) ?? (contato ? nomeDoRegistro(contato, nomes) : null)
    return `Criou ${contato ? 'o contato e ' : ''}a oportunidade${nome ? ` ${nome}` : ''}`
  }

  // O pai e as filhas: "Criou o cargo X (19 permissões)".
  const pai = paiDaGravacao(linhas)
  if (pai) {
    const filhas = new Map<string, number>()
    for (const f of linhas) if (PAI[f.tabela] === pai.tabela) filhas.set(f.tabela, (filhas.get(f.tabela) ?? 0) + 1)
    const doPai = [...filhas.entries()].map(([t, n]) => `${n} ${FILHAS[t] ?? PLURAL_DA_AUDITORIA[t] ?? 'registros'}`).join(', ')
    const base = fraseDaAuditoria(pai, nomes)
    return base.endsWith(')') ? `${base.slice(0, -1)}; ${doPai})` : `${base} (${doPai})`
  }

  // Muitas linhas da mesma tabela: "Criou 3 e apagou 3 insumos do procedimento".
  const tabela = linhas[0]!.tabela
  if (linhas.every(l => l.tabela === tabela && ORDEM_DAS_OPERACOES.includes(l.operacao))) {
    let coisas = PLURAL_DA_AUDITORIA[tabela] ?? `registros (${tabela})`
    if (tabela === 'role_permissions') {
      const cargos = [...new Set(linhas.map(l => (l.registro_id && nomes.cargos?.[l.registro_id]) || null))]
      if (cargos.length === 1 && cargos[0]) coisas = `permissões do cargo ${cargos[0]}`
    }
    const clientes = [...new Set(linhas.map(l => l.client_id))]
    const cliente = clientes.length === 1 && clientes[0] ? nomes.clientes[clientes[0]] ?? null : null
    return `${contagemDasOperacoes(linhas)} ${coisas}${cliente ? ` — ${cliente}` : ''}`
  }

  // Tabelas diferentes, sem pai conhecido: a frase do primeiro registro gravado.
  return fraseDaAuditoria(linhas[linhas.length - 1]!, nomes)
}

/** As gravações prontas para a tela: a frase do todo e cada registro guardado nela. */
export function gruposDaAuditoria(
  registros: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria, pathname: string, slug: string | null, fuso?: string,
): GrupoDaAuditoria[] {
  return agruparAuditoria(registros).map(linhas => {
    const detalhes = linhas.map(l => linhaDaAuditoria(l, nomes, pathname, slug, fuso))
    if (linhas.length === 1) return { ...detalhes[0]!, oQue: fraseDoGrupo(linhas, nomes), detalhes }
    // D6 da 16ª: a unidade e o link são os do FATO (o agendamento, a venda, o
    // recebimento), não os do primeiro registro com cliente (a sessão do pacote
    // vendido em outra unidade puxava a conclusão para lá).
    const principal = principalDaGravacao(linhas, nomes)
    return { ...linhaDaAuditoria(principal, nomes, pathname, slug, fuso), id: linhas[0]!.id, oQue: fraseDoGrupo(linhas, nomes), detalhes }
  })
}

/** O registro que dá a unidade e o link de uma gravação: o do fato, o pai, o da cliente, ou o primeiro gravado. */
function principalDaGravacao(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): RegistroDaAuditoria {
  if (linhas.length === 1) return linhas[0]!
  const estorno = linhas.some(l => l.tabela === 'financial_transactions' && l.operacao === 'criou' && texto(l.depois.category) === 'Estorno')
  const fato = linhas.some(l => l.tabela === 'tenants' && l.operacao === 'criou') || estorno ? null : fatoDaGravacao(linhas, nomes)
  return fato?.principal ?? paiDaGravacao(linhas) ?? linhas.find(l => l.client_id) ?? linhas[linhas.length - 1]!
}

/**
 * O filtro por unidade pela unidade da GRAVAÇÃO (A28 da 17ª simulação): a
 * linha do grupo leva a unidade do fato, e o filtro por registro trazia, na
 * Savassi, a sessão do pacote vendido lá e usado na conclusão da Pampulha.
 * Fica a gravação inteira cuja unidade é a pedida. Recebe as gravações inteiras.
 */
export function gravacoesDaUnidade(
  registros: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria, unidade: string,
): RegistroDaAuditoria[] {
  return agruparAuditoria(registros).filter(linhas => principalDaGravacao(linhas, nomes).branch_id === unidade).flat()
}

/**
 * As linhas do CSV (A38 da 16ª): uma por registro, como a regra pede, e cada
 * uma com a frase da GRAVAÇÃO a que pertence — quem procura "Estornou" no
 * arquivo acha as linhas do estorno.
 */
export function linhasDoCsvDaAuditoria(
  registros: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria, fuso?: string,
): (LinhaDaAuditoria & { gravacao: string })[] {
  return agruparAuditoria(registros).flatMap(linhas => {
    const gravacao = fraseDoGrupo(linhas, nomes)
    return linhas.map(l => ({ ...linhaDaAuditoria(l, nomes, '/admin/auditoria', null, fuso), gravacao }))
  })
}
