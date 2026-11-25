import { partsInTZ } from '@/lib/datetime'
import { FUSO_PADRAO, fusoValido, nomeDoFuso } from '@/lib/unidades/fuso'
import { rotaAtendimento, rotaCliente, rotaNoPortal } from '@/lib/rotas'
import { rotuloDaForma, rotuloDaFormaDoFechamento } from '@/lib/financeiro/formas'
import { quantidadeComMedida } from '@/lib/estoque/medidas'
import { REPORT_TAB_LABELS } from '@/lib/permissions'
import type { ReportTab } from '@estetica-os/types'
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
  estoque_motivos_de_perda: 'o motivo de perda do estoque',
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
  inbox_caixas: 'caixas do WhatsApp', pix_taxa_pct: 'taxa do Pix', taxas: 'taxas',
  max_vezes: 'máximo de vezes', portal_prazo_alteracao_horas: 'prazo para a cliente alterar', plano_validade_dias: 'validade do plano',
  pacote_crediario_libera: 'sessões do pacote com valor em aberto', pacote_vencido_cancela: 'cancelar o pacote vencido',
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
  execucao: 'andamento', erros_expiram_em: 'prazo da lista de erros', token_cifrado: 'link', category: 'categoria', description: 'descrição',
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
  // A32 da 19ª: "maquininha id" saía cru. A trava (tests/auditoria-atritos-da-19.test.ts):
  // toda coluna de financial_transactions tem nome aqui.
  cash_register_id: 'caixa', created_by: 'quem criou', client_package_id: 'pacote da cliente', sale_discount: 'desconto da venda',
  procedure_sale_id: 'venda de procedimento', parcela_grupo: 'grupo de parcelas', cartao_vezes: 'vezes no cartão',
  desconto_motivo: 'motivo do desconto', cartao_bandeira: 'bandeira do cartão', credito_vendido_id: 'crédito vendido',
  vencimentos_anteriores: 'vencimentos anteriores', fornecedor: 'fornecedor', nota_fiscal: 'nota fiscal',
  valor_antes_do_estorno: 'valor antes do estorno', estorno_de: 'lançamento estornado', maquininha_id: 'maquininha',
  // A34/A35 da 20ª: "closed at", "closed reason" saíam crus (o documento fechado, a entrada desfeita, o pacote cancelado).
  closed_at: 'fechamento', closed_reason: 'motivo do fechamento', closed_by: 'quem fechou',
  desfeita_em: 'desfeita', desfeita_por: 'quem desfez', desfeita_motivo: 'motivo de desfazer', desfeita_pelo: 'movimento que desfez',
  cancelado_em: 'cancelamento', cancelado_por: 'quem cancelou', cancelamento_motivo: 'motivo do cancelamento',
  valor_cancelado: 'valor do cancelamento', cancelamento: 'cancelamento', nome_arquivo: 'arquivo', destino: 'destino',
  com_erro: 'andamento', completadas: 'andamento', com_aviso: 'andamento', oportunidades: 'andamento', erro: 'erro', erros: 'erros',
  unit_cost: 'custo', reference: 'referência', balance_after: 'saldo', correcao_de_cadastro: 'correção de cadastro',
  // A18 da 25ª: a fidelidade e o acesso da cliente saíam crus ("first access bonus", "portal ligado em").
  first_access_bonus: 'bônus do primeiro acesso', birthday_bonus: 'bônus de aniversário', expiry_months: 'validade dos pontos',
  expiry_notice_days: 'aviso antes de os pontos vencerem', client_redeem: 'troca pela cliente', revoked_by_user_id: 'quem revogou',
  motivo_revogacao: 'motivo da revogação', portal_ligado_em: 'acesso ao portal',
  // "(form data)", "(consent template id)" saíam crus (princípio 3). A trava (tests/auditoria-e-grupos.test.ts):
  // toda coluna de toda tabela auditada tem nome aqui ou em CAMPO_DA_TABELA.
  aberta_em: 'abertura', accepted_text: 'texto aceito', acrescentado_em: 'quando entrou', acrescentado_por: 'quem pôs',
  address_complement: 'complemento', applied_at: 'aplicação', atraso_perdoado_ate: 'atraso perdoado até',
  audience_rules: 'público', auth_session_id: 'sessão', autor_id: 'autor', autor_nome: 'autor', avaliacao_o_que: 'o que é a avaliação',
  avisos: 'avisos', base_com_pontos: 'base com pontos', batch_number: 'lote', body: 'texto', body_text: 'texto', bonus: 'bônus',
  bonus_ref: 'bônus', buttons: 'botões', cancel_reason: 'motivo do cancelamento', cancelled_by: 'quem cancelou',
  cartao_max_vezes: 'máximo de vezes no cartão', cartao_por_bandeira: 'taxa por bandeira', cartao_prazo_dias: 'prazo do cartão',
  category_id: 'categoria', channel: 'canal', channels: 'canais', closing_balance: 'saldo no fechamento',
  cobra_por_bandeira: 'taxa por bandeira', comanda_id: 'comanda', comissao_execucao: 'comissão da execução',
  comissao_execucao_valor: 'valor da comissão da execução', comissao_responsavel_tipo: 'tipo da comissão do responsável',
  comissao_responsavel_valor: 'valor da comissão do responsável', comissao_tipo: 'tipo da comissão', comissao_valor: 'valor da comissão',
  comissao_venda_tipo: 'tipo da comissão de venda', comissao_venda_valor: 'valor da comissão de venda', concedido: 'concedido',
  conducted_by: 'quem conduziu', conferido: 'conferido', consent_template_id: 'termo de consentimento',
  consumption_unit: 'medida de consumo', contado_dinheiro: 'dinheiro contado', contract_template_id: 'contrato',
  conversation_id: 'conversa', created_by_name: 'quem criou', crediario_max_parcelas: 'máximo de parcelas no crediário',
  criada_em: 'criação', criada_por: 'quem criou', criado_em: 'criação', criado_por: 'quem criou', criado_por_nome: 'quem criou',
  ctwa_clid: 'anúncio de origem', current_version: 'versão', custo_devolvido: 'custo devolvido', de_fora: 'de antes do sistema',
  desconta_insumos: 'desconta os insumos', desconta_taxa: 'desconta a taxa', desconto_combinado_por: 'quem combinou o desconto',
  desconto_combinado_tipo: 'tipo do desconto combinado', desconto_combinado_valor: 'desconto combinado', desligada_em: 'desligamento',
  desligada_motivo: 'motivo do desligamento', devolvidas: 'devolvidas', discount_value: 'desconto',
  documentos_excluidos: 'documentos dispensados', documentos_link_pela_conversa: 'link dos documentos pela conversa',
  earn_mode: 'como ganha pontos', em_atraso_desde: 'em atraso desde', enabled: 'ligada', end_reason: 'motivo do fim', ended_at: 'fim',
  enforcement: 'exigência', enviado_em: 'envio', enviado_por: 'quem enviou', enviado_por_nome: 'quem enviou',
  error_message: 'erro', esperado_dinheiro: 'dinheiro esperado', estornado_em: 'estorno', estornado_por_nome: 'quem estornou',
  estorno: 'estorno', example_values: 'exemplos', fbclid: 'anúncio de origem', fechado_em: 'fechamento', fechado_por: 'quem fechou',
  fechado_por_nome: 'quem fechou', ficha: 'ficha', file_name: 'arquivo', file_path: 'arquivo', file_size: 'tamanho do arquivo',
  footer_text: 'rodapé', form_data: 'respostas da ficha', fornecedor_id: 'fornecedor', fundo_de_troco: 'fundo de troco', fuso: 'fuso horário',
  ganho_lembrado_em: 'lembrete do ganho', gclid: 'anúncio de origem', grant_id: 'liberação', granted_by_user_id: 'quem liberou',
  header_text: 'cabeçalho', identity_method: 'como confirmou a identidade', include_medical: 'com o prontuário',
  includes_clinical: 'com o prontuário', indicacao_pontos: 'pontos da indicação', indicacao_premio: 'prêmio da indicação',
  indicacao_recompensa_id: 'recompensa da indicação', indicada_id: 'indicada', indicada_por: 'indicada por', indicadora_id: 'quem indicou',
  informado_em: 'quando informou', informado_por: 'quem informou', informado_por_nome: 'quem informou', ip: 'IP', is_system: 'do sistema',
  issued_document_id: 'documento', item_id: 'item', key: 'chave', labor_cost: 'custo da mão de obra', language: 'idioma',
  legacy_consent_term_id: 'termo antigo', limites: 'limites', link_id: 'link', logo_url: 'logo', loyalty_account_id: 'conta de pontos',
  loyalty_points: 'pontos', loyalty_transaction_id: 'lançamento de pontos', managed: 'gerenciado', map_id: 'mapa',
  mapeamento: 'mapeamento das colunas', marca: 'marca', marca_id: 'marca', medical_record_id: 'prontuário',
  meta_template_id: 'template na Meta', metodo: 'forma de pagamento', mime_type: 'tipo do arquivo', modo: 'modo', module: 'módulo',
  moment: 'momento', momento: 'momento', motivo_da_perda: 'motivo da perda', movement_id: 'movimento de estoque',
  nao_completar: 'não completar', nao_suportado: 'não suportado', notification_type: 'tipo de aviso', number: 'número',
  numero: 'número', opened_at: 'abertura', opened_by: 'quem abriu', opening_balance: 'saldo na abertura', oportunidade: 'oportunidade',
  ordem: 'ordem', other_costs: 'outros custos', outros_documentos: 'outros documentos', parcelas: 'parcelas',
  pdf_attempts: 'tentativas do PDF', periodo: 'período', phone_number_id: 'número na Meta', plan_id: 'plano de tratamento',
  plano_pct: 'percentual do plano', points_cost: 'custo em pontos', points_per_real: 'pontos por real', pontos: 'pontos',
  pontua_venda_de_produto: 'pontua a venda de produto', por_bandeira: 'taxas por bandeira', posicao: 'posição', prazo_dias: 'prazo',
  pre_atendimento_envio: 'envio da ficha de saúde', pre_atendimento_id: 'ficha de saúde',
  pre_atendimento_validade_meses: 'validade da ficha de saúde', preco_tabela: 'preço de tabela', preco_unitario: 'preço unitário',
  preco_unitario_tabela: 'preço unitário de tabela', product_id: 'produto', products: 'produtos', products_used: 'produtos usados',
  produto_modo: 'modo da comissão de produto', produto_pct: 'percentual da comissão de produto', provider: 'provedor',
  purchased_at: 'compra', received_at: 'recebimento', redeem_max_pct: 'máximo pago com pontos', redeem_min_points: 'mínimo de pontos para trocar',
  redeem_points_value: 'valor do ponto', referred_by: 'indicada por', registrado_por: 'quem registrou', registrado_por_nome: 'quem registrou',
  rejection_reason: 'motivo da recusa', removido_em: 'remoção', replaced_by: 'substituído por', requested_at: 'pedido',
  requested_by: 'quem pediu', requested_by_name: 'quem pediu', requested_via: 'por onde pediu', respondido_por: 'quem respondeu',
  responsavel_cpf: 'CPF do responsável', responsavel_id: 'responsável', responsavel_nome: 'nome do responsável',
  responsavel_parentesco: 'parentesco do responsável', responsavel_telefone: 'telefone do responsável', resumo: 'resumo',
  retorno_avisado_em: 'aviso do retorno', retrato: 'retrato da venda', revoked_by_staff_id: 'quem revogou', reward_id: 'recompensa',
  sale_id: 'venda', sale_price: 'preço de venda', scan_path: 'documento digitalizado', scan_sha256: 'documento digitalizado',
  sem_insumo: 'sem insumo', service_package_id: 'pacote', sessions: 'sessões', signature_data: 'assinatura', signature_png: 'assinatura',
  signature_sha256: 'assinatura', signed_ip: 'IP da assinatura', signed_via: 'por onde assinou', signer_document: 'documento de quem assinou',
  signer_name: 'quem assinou', slug: 'endereço', sold_at: 'venda', sold_by: 'quem vendeu', staff_id: 'atendente do suporte',
  state_registration: 'inscrição estadual', submitted_at: 'envio', tab: 'aba', target_auth_id: 'login atendido',
  target_user_id: 'membro atendido', taxa_pct_retrato: 'taxa', taxa_pct_sem_teto: 'taxa sem teto', template_id: 'modelo',
  template_version_id: 'versão do modelo', texto: 'texto', ticket_id: 'chamado', token_hash: 'link', total_read: 'lidas',
  totals: 'totais', transfer_id: 'transferência', trigger_config: 'gatilho', trigger_type: 'gatilho',
  ultimo_disparo_agenda: 'último disparo', unidades_devolvidas: 'unidades devolvidas', unit_price: 'preço unitário',
  units_per_package: 'rendimento da embalagem', uploaded_by: 'quem anexou', usadas_antes: 'sessões usadas antes do sistema',
  used_stock_movement_id: 'baixa do estoque', user_agent: 'navegador', uso: 'uso', utm_campaign: 'campanha de origem',
  utm_medium: 'meio de origem', utm_source: 'fonte de origem', validity_days: 'validade', valor_devolvido: 'valor devolvido',
  valor_referencia: 'valor de referência', vencimento_avisado_em: 'aviso do vencimento', via: 'por onde', view: 'vista',
  voltou: 'voltou ao estoque', voucher_id: 'voucher', waba_id: 'conta do WhatsApp', website: 'site',
  whatsapp_number_id: 'número de WhatsApp',
}

/**
 * O nome do campo que muda conforme a tabela (D16 da 25ª): o `document` da
 * rede é o CNPJ; o da cliente, o CPF — "Editou a ficha (CNPJ)" dizia outra coisa.
 */
const CAMPO_DA_TABELA: Record<string, Record<string, string>> = {
  clients: { document: 'CPF', documento_tipo: 'tipo de documento', documento_numero: 'documento' },
  // A22 da 26ª: "Editou a evolução (anotações)" — na evolução, o `notes` é o texto dela.
  medical_record_entries: { notes: 'texto da evolução' },
  prontuario_anotacoes: { texto: 'texto da anotação' },
  crm_stages: { marca: 'marca da etapa' },
  commission_configs: { modo: 'modo da comissão' },
}
const nomeDoCampo = (c: string, tabela?: string) =>
  (tabela ? CAMPO_DA_TABELA[tabela]?.[c] : undefined) ?? CAMPO[c] ?? c.replace(/_/g, ' ')

/** O nome de cada campo na Auditoria (a trava de A30 da 18ª lê daqui). */
export const CAMPO_DA_AUDITORIA: Readonly<Record<string, string>> = CAMPO
/** A coluna tem nome na Auditoria (a trava de A22 da 26ª: nenhuma coluna auditada sai crua). */
export const campoTemNomeNaAuditoria = (c: string, tabela?: string): boolean =>
  !!(tabela && CAMPO_DA_TABELA[tabela]?.[c]) || c in CAMPO

/**
 * Colunas que o sistema deriva de outras (A26 da 17ª: "quando aconteceu" é a
 * conta do horário e da conclusão, não um campo que a pessoa mudou): saem da
 * frase quando outra coluna mudou junto.
 */
const DERIVADAS: ReadonlySet<string> = new Set(['aconteceu_em'])

const VERBO: Record<string, string> = { criou: 'Criou', editou: 'Editou', apagou: 'Apagou' }

const MODULO: Record<string, string> = {
  agenda: 'Agenda', clients: 'Clientes', loyalty: 'Fidelidade', medical_records: 'Prontuário', documents: 'Modelos de documento',
  procedures: 'Procedimentos e pacotes', stock: 'Estoque', financial: 'Financeiro e comissões', cashier: 'PDV',
  crm: 'CRM', marketing: 'Marketing', reports: 'Relatórios', team: 'Equipe', forms: 'Modelos de ficha',
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
  // A35 da 20ª: a importação pelo arquivo, lido agora.
  if (r.tabela === 'importacoes' && r.registro_id) return nomes.importacoes?.[r.registro_id]?.arquivo || null
  if (r.tabela === 'role_permissions') {
    const m = texto(r.depois.module) ?? texto(r.antes.module)
    return m ? `de ${MODULO[m] ?? m}` : null
  }
  // A7 da 21ª: qual aba ("Criou a aba de relatório do cargo" saía 13 vezes igual).
  if (r.tabela === 'role_report_tabs') {
    const aba = texto(r.depois.tab) ?? texto(r.antes.tab)
    return aba ? REPORT_TAB_LABELS[aba as ReportTab] ?? aba : null
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
function camposMudados(colunas: readonly string[], tabela?: string): string {
  const daPessoa = colunas.filter(c => !DERIVADAS.has(c))
  const ditos = [...new Set((daPessoa.length ? daPessoa : colunas).map(c => nomeDoCampo(c, tabela)))]
  if (ditos.length > 4) return `${ditos.slice(0, 3).join(', ')} e mais ${ditos.length - 3} campos`
  return emLista(ditos)
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

const DATAS_DO_LANCAMENTO: ReadonlySet<string> = new Set(['due_date', 'paid_at', 'data_de_referencia'])
const TIPO_DO_LANCAMENTO: Record<string, string> = { INCOME: 'receita', EXPENSE: 'despesa' }
const SITUACAO_DO_LANCAMENTO: Record<string, string> = { PENDING: 'pendente', PAID: 'pago', CANCELLED: 'cancelado', OVERDUE: 'vencido' }

/** Um valor do lançamento como a tela o diz (A33 da 24ª); nulo = não se sabe dizer. */
function valorDoLancamento(col: string, v: unknown, fuso?: string): string | null {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (col === 'amount') { const n = numero(v); return n == null ? null : brl(n) }
  if (col === 'payment_method') return texto(v) ? rotuloDaForma(texto(v)) : null
  if (col === 'type') return texto(v) ? TIPO_DO_LANCAMENTO[texto(v)!] ?? texto(v) : null
  if (col === 'status') return texto(v) ? SITUACAO_DO_LANCAMENTO[texto(v)!] ?? texto(v) : null
  if (DATAS_DO_LANCAMENTO.has(col)) {
    const s = texto(v)
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return diaLegivel(s)
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    const p = partsInTZ(d, fuso)
    return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`
  }
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  return texto(v)
}

/**
 * A33 da 24ª: o lançamento editado diz de quanto para quanto ("valor: R$ 150,00
 * → R$ 100,00; pago: não → sim") — "valor, data de referência, pago e mais 3
 * campos" não dizia. A coluna que a auditoria não guarda (o texto livre) sai
 * só pelo nome.
 */
function camposDoLancamentoEditado(r: RegistroDaAuditoria, fuso?: string): string {
  const daPessoa = r.colunas.filter(c => !DERIVADAS.has(c))
  const partes = [...new Set(daPessoa.length ? daPessoa : r.colunas)].map(c => {
    const nome = CAMPO[c] ?? c.replace(/_/g, ' ')
    if (!(c in r.antes) && !(c in r.depois)) return nome
    const de = valorDoLancamento(c, r.antes[c], fuso)
    const para = valorDoLancamento(c, r.depois[c], fuso)
    return de != null && para != null && de !== para ? `${nome}: ${de} → ${para}` : nome
  })
  const ditos = [...new Set(partes)]
  // Só nomes: "a, b e c", como os outros registros. Com valores, "; " (o valor tem vírgula).
  if (!ditos.some(d => d.includes('→'))) return camposMudados(r.colunas)
  if (ditos.length > 5) return `${ditos.slice(0, 4).join('; ')} e mais ${ditos.length - 4} campos`
  return ditos.join('; ')
}

/**
 * "2 frascos de Toxina 1 frasco": a quantidade do movimento, com a medida em
 * que ele se grava, e o produto, lidos agora (A33 da 21ª: "2 Toxina 1 frasco"
 * colava a quantidade num nome com número). Sem a medida lida, "2 Protetor".
 */
function doProduto(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string {
  const q = Math.abs(numero(r.depois.quantity ?? r.antes.quantity) ?? 0)
  const id = texto(r.depois.product_id) ?? texto(r.antes.product_id)
  const produto = (id && nomes.produtos?.[id]) || 'produto'
  const medida = id ? texto(nomes.medidasDosProdutos?.[id]) : null
  return medida ? `${quantidadeComMedida(q, medida)} de ${produto}` : `${q.toLocaleString('pt-BR')} ${produto}`
}

/** O movimento de estoque lido como o fato (A28 da 15ª: saía sem produto nem quantidade). */
function fraseDoMovimento(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string | null {
  // A10 da 24ª: o custo do lote corrigido (o da entrada) — de quanto para quanto,
  // por embalagem (o movimento grava o custo de CONSUMO; × o rendimento = a embalagem).
  if (r.operacao === 'editou' && r.colunas.includes('unit_cost')) {
    const id = texto(r.depois.product_id) ?? texto(r.antes.product_id)
    const produto = (id && nomes.produtos?.[id]) || 'produto'
    const emb = id ? nomes.embalagensDosProdutos?.[id] : undefined
    const fator = emb && emb.fator > 0 ? emb.fator : 1
    const de = numero(r.antes.unit_cost)
    const para = numero(r.depois.unit_cost)
    const valores = de != null && para != null
      ? `: de ${brl(de * fator)} para ${brl(para * fator)} por ${emb?.unidade || 'embalagem'}` : ''
    return `Corrigiu o custo do lote de ${produto}${valores}`
  }
  if (r.operacao !== 'criou') return null
  const tipo = texto(r.depois.type)
  const p = doProduto(r, nomes)
  const unidade = r.branch_id ? nomes.unidades[r.branch_id] ?? null : null
  switch (tipo) {
    case 'PURCHASE': {
      // A35 da 20ª: a entrada ao contrário (quantidade negativa) é o "Desfazer entrada"; a entrada diz o custo, lido agora.
      if ((numero(r.depois.quantity) ?? 0) < 0) return `Desfez a entrada de ${p}`
      const custo = r.registro_id ? numero(nomes.custosDasEntradas?.[r.registro_id]) : null
      return `Deu entrada em ${p}${custo ? ` (${brl(custo)})` : ''}`
    }
    case 'LOSS':              return `Registrou a perda de ${p}`
    case 'SALE':              return `Baixou ${p} na venda`
    case 'SALE_RETURN':       return `Devolveu ao estoque ${p}`
    case 'PROCEDURE_USAGE':   return `Baixou ${p} no atendimento`
    // A10 da 24ª: o ajuste da correção de cadastro diz o motivo (não é perda).
    case 'MANUAL_ADJUSTMENT': return r.depois.correcao_de_cadastro === true
      ? `Ajustou o estoque (correção de cadastro): ${p}` : `Ajustou o estoque: ${p}`
    case 'TRANSFER_OUT':      return `Mandou ${p}${unidade ? ` de ${unidade}` : ''}`
    case 'TRANSFER_IN':       return `Recebeu ${p}${unidade ? ` em ${unidade}` : ''}`
    default:                  return null
  }
}

/** "o Voucher R$ 30": o voucher pelo nome que a auditoria guarda. */
function oVoucher(nome: string | null): string {
  if (!nome) return 'o voucher'
  return /^voucher\b/i.test(nome) ? `o ${nome}` : `o voucher ${nome}`
}

/** O voucher que voltou a ativo nesta linha (o estorno do pagamento que o usou), ou nulo. */
function voucherDevolvido(r: RegistroDaAuditoria): string | null {
  if (r.tabela !== 'loyalty_vouchers' || r.operacao !== 'editou') return null
  const antes = texto(r.antes.status)
  if (texto(r.depois.status) !== 'ATIVO' || !antes || antes === 'ATIVO') return null
  return oVoucher(texto(r.depois.name) ?? texto(r.antes.name))
}

/**
 * O conferido do fechamento em texto (A33 da 19ª): "Dinheiro R$ 300,00 e Pix
 * R$ 1.200,00" — o dinheiro contado e as outras formas conferidas, como a tela.
 */
export function conferidoDoFechamento(contadoDinheiro: unknown, conferido: Record<string, unknown> | null | undefined): string {
  const partes: string[] = []
  const contado = numero(contadoDinheiro)
  if (contado !== null) partes.push(`Dinheiro ${brl(contado)}`)
  for (const [forma, valor] of Object.entries(conferido ?? {})) {
    const v = numero(valor)
    if (v === null || (forma === 'CASH' && contado !== null)) continue
    partes.push(`${rotuloDaFormaDoFechamento(forma)} ${brl(v)}`)
  }
  return emLista(partes)
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
  // A31 da 23ª: o "−/+" do produto na comanda diz o produto e a quantidade ("Editou o item da comanda" não dizia).
  if (r.tabela === 'comanda_itens' && r.operacao === 'editou' && r.colunas.includes('quantidade')) {
    const antes = numero(r.antes.quantidade)
    const depois = numero(r.depois.quantidade)
    if (antes !== null && depois !== null && antes !== depois) {
      const produto = nomeDoRegistro(r, nomes) ?? 'produto'
      const n = Math.abs(depois - antes).toLocaleString('pt-BR')
      const agora = `(agora ${depois.toLocaleString('pt-BR')})`
      const frase = depois > antes ? `Pôs mais ${n} ${produto} na comanda ${agora}` : `Tirou ${n} ${produto} da comanda ${agora}`
      return `${frase}${cliente ? ` — ${cliente}` : ''}`
    }
  }
  if (r.tabela === 'comanda_itens' && r.operacao === 'apagou') {
    return `Tirou ${nomeDoRegistro(r, nomes) ?? 'o produto'} da comanda${cliente ? ` — ${cliente}` : ''}`
  }
  if (r.tabela === 'fechamentos_do_dia' && r.operacao === 'criou') {
    const dia = texto(r.depois.dia)
    const diferenca = numero(r.depois.diferenca)
    const deNovo = !!(r.registro_id && nomes.fechamentosDeNovo?.[r.registro_id])
    // A33 da 19ª: o conferido (lido agora: a auditoria guarda só o dia e a diferença).
    const conferido = r.registro_id ? texto(nomes.conferidosDoFechamento?.[r.registro_id]) : null
    const partes = [conferido ? `conferido: ${conferido}` : null, diferenca ? `diferença de ${brl(diferenca)}` : null].filter(Boolean)
    return `Fechou ${deNovo ? 'de novo ' : ''}${dia ? `o dia ${diaLegivel(dia)}` : 'o dia'}${partes.length ? ` (${partes.join('; ')})` : ''}`
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

const FECHOU_O_DOCUMENTO: Record<string, string> = { CANCELADO: 'Cancelou', DISPENSADO: 'Dispensou', SUBSTITUIDO: 'Substituiu' }
const FEZ_NA_SESSAO: Record<string, string> = { CANCELLED: 'Cancelou', USED: 'Usou', AVAILABLE: 'Devolveu' }

/**
 * A34–A36 da 20ª simulação: o documento fechado, a sessão do pacote, a
 * importação, a entrada desfeita e o agendamento criado diziam a coluna, não
 * o fato. O que a gravação não guarda (o motivo, a sessão, o arquivo, o
 * procedimento) se lê agora (`nomes`).
 */
function fraseDoRegistroDa20(r: RegistroDaAuditoria, nomes: NomesDaAuditoria, cliente: string | null): string | null {
  const daCliente = cliente ? ` — ${cliente}` : ''
  if (r.tabela === 'issued_documents' && r.operacao === 'editou') {
    const verbo = FECHOU_O_DOCUMENTO[texto(r.depois.status) ?? '']
    if (verbo && texto(r.antes.status) !== texto(r.depois.status)) {
      const nome = nomeDoRegistro(r, nomes)
      const motivo = verbo !== 'Substituiu' && r.registro_id ? texto(nomes.motivosDoDocumento?.[r.registro_id]) : null
      return `${verbo} o documento${nome ? ` ${nome}` : ''}${motivo ? ` (motivo: ${motivo})` : ''}${daCliente}`
    }
  }
  if (r.tabela === 'package_sessions' && r.operacao === 'editou' && r.colunas.includes('status')) {
    const verbo = FEZ_NA_SESSAO[texto(r.depois.status) ?? '']
    if (verbo && texto(r.antes.status) !== texto(r.depois.status)) {
      const qual = (r.registro_id && texto(nomes.sessoesDoPacote?.[r.registro_id])) || 'a sessão do pacote'
      return `${verbo} ${qual}${daCliente}`
    }
  }
  if (r.tabela === 'importacoes') {
    const imp = r.registro_id ? nomes.importacoes?.[r.registro_id] : undefined
    const arquivo = imp?.arquivo ? ` ${imp.arquivo}` : ''
    if (r.operacao === 'criou' && imp) {
      return `Criou a importação${arquivo} (${imp.total.toLocaleString('pt-BR')} ${imp.total === 1 ? 'linha' : 'linhas'}, para ${imp.destino})`
    }
    const status = r.colunas.includes('status') ? texto(r.depois.status) : null
    if (r.operacao === 'editou' && status === 'concluida') {
      const placar = imp ? [`${imp.novas} ${imp.novas === 1 ? 'nova' : 'novas'}`, `${imp.completadas} ${imp.completadas === 1 ? 'completada' : 'completadas'}`,
        imp.comErro ? `${imp.comErro} com erro` : null].filter(Boolean).join(', ') : ''
      return `Concluiu a importação${arquivo}${placar ? ` (${placar})` : ''}`
    }
    if (r.operacao === 'editou' && status === 'falhou') return `A importação${arquivo} falhou`
    if (r.operacao === 'editou' && status === 'importando') return `Começou a importação${arquivo}`
  }
  if (r.tabela === 'stock_movements' && r.operacao === 'editou' && r.colunas.includes('desfeita_em')) return 'Marcou a entrada como desfeita'
  if (r.tabela === 'appointments' && r.operacao === 'criou') {
    const quando = texto(r.depois.scheduled_at)
    const proc = texto(r.depois.procedure_id)
    const prof = texto(r.depois.professional_id)
    const procedimento = proc ? nomes.procedimentos?.[proc] ?? null : null
    const quemAtende = prof ? nomes.membros[prof] ?? null : null
    const oQue = [procedimento, quemAtende ? `com ${quemAtende}` : null].filter(Boolean).join(', ')
    return `Agendou ${cliente ?? 'um atendimento'}${quando ? ` para ${quandoDaAuditoria(quando, fusoDoRegistro(r, nomes))}` : ''}${oQue ? ` — ${oQue}` : ''}`
  }
  return null
}

/** A24 da 26ª: o anexo da cliente pelo que ele é (a auditoria o grava clínico, sem valores; a categoria se lê agora). */
const ANEXO_DA_CATEGORIA: Record<string, string> = {
  foto_clinica: 'uma foto clínica', exame: 'um anexo clínico (exame)', laudo: 'um anexo clínico (laudo)',
  receita: 'um anexo clínico (receita)', termo_consentimento: 'um anexo clínico (termo de consentimento)',
  foto: 'uma foto', contrato: 'um contrato', anamnese: 'uma ficha de saúde',
}

const NIVEL_DA_PERMISSAO: Record<string, string> = { NONE: 'Sem acesso', VIEW: 'Ver', MANAGE: 'Gerenciar' }

/**
 * A25 da 26ª: a permissão editada diz de quanto para quanto ("nível: Ver →
 * Gerenciar"); "(nível)" quatro vezes não dizia nada. Sem o antes gravado, só o nome.
 * O alcance (`scope`) não tem antes e depois: sem o "só os meus" (2026-11-23) a
 * coluna guarda sempre `ALL`, e o registro antigo dela diz só o nome.
 */
function camposDaPermissaoEditada(r: RegistroDaAuditoria): string {
  const partes = r.colunas.map(c => {
    const nomes = c === 'level' ? NIVEL_DA_PERMISSAO : null
    const de = texto(r.antes[c])
    const para = texto(r.depois[c])
    if (!nomes || !de || !para || de === para) return nomeDoCampo(c, r.tabela)
    return `${nomeDoCampo(c, r.tabela)}: ${nomes[de] ?? de} → ${nomes[para] ?? para}`
  })
  return [...new Set(partes)].join('; ')
}

/**
 * A24 da 26ª simulação: o anexo, a liberação do prontuário na LGPD e a
 * devolução de parte da venda diziam a tabela ("Criou o documento da
 * cliente", "Editou o pedido de LGPD (conclusão…)"), não o fato.
 */
function fraseDoRegistroDa26(r: RegistroDaAuditoria, nomes: NomesDaAuditoria, cliente: string | null): string | null {
  const daCliente = cliente ? ` — ${cliente}` : ''
  if (r.tabela === 'client_documents' && r.operacao === 'criou') {
    const categoria = r.registro_id ? texto(nomes.categoriasDosAnexos?.[r.registro_id]) : null
    return `Anexou ${(categoria && ANEXO_DA_CATEGORIA[categoria]) || 'um arquivo'}${daCliente}`
  }
  if (r.tabela === 'lgpd_requests' && r.operacao === 'editou' && r.colunas.includes('medical_status')) {
    // O gatilho grava a decisão (desde a 26ª); antes dela, liberar reabria o pedido (a situação mudava) e recusar não.
    const decisao = texto(r.depois.medical_status)
    const liberou = decisao ? decisao === 'approved' : r.colunas.includes('status')
    if (decisao && decisao !== 'approved' && decisao !== 'denied') return null
    return `${liberou ? 'Liberou' : 'Recusou'} o prontuário no pedido da LGPD${cliente ? ` de ${cliente}` : ''}`
  }
  return null
}

/**
 * "em 26/11/2026, das 14:00 às 16:00" (o mesmo dia) ou "de 26/11/2026 08:00 a
 * 27/11/2026 18:00", no relógio da unidade; nulo sem as duas pontas.
 */
function periodoDoBloqueio(inicio: string | null, fim: string | null, fuso?: string): string | null {
  if (!inicio || !fim) return null
  const de = quandoDaAuditoria(inicio, fuso)
  const ate = quandoDaAuditoria(fim, fuso)
  const [diaDe, horaDe] = de.split(' ')
  const [diaAte, horaAte] = ate.split(' ')
  return diaDe === diaAte ? `em ${diaDe}, das ${horaDe} às ${horaAte}` : `de ${de} a ${ate}`
}

/**
 * A16 (plataforma:AD-13): o bloqueio da agenda pelo fato — de quem (ou de qual
 * sala), o horário e o motivo ("Criou o bloqueio da agenda" não dizia). O
 * gatilho guarda o início, o fim e o motivo; quem e a sala, desde a migration
 * `20261205400001` (o nome se lê agora). Sem eles, a frase sai sem o "de quem".
 */
function fraseDoBloqueio(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string | null {
  const fuso = fusoDoRegistro(r, nomes)
  if (r.operacao === 'editou') {
    const partes = r.colunas.map(c => {
      const nome = nomeDoCampo(c, r.tabela)
      if (!(c in r.antes) || !(c in r.depois)) return nome
      const valor = (v: unknown) => {
        const s = texto(v)
        if (!s) return '—'
        return c === 'inicio' || c === 'fim' ? quandoDaAuditoria(s, fuso) : s
      }
      return `${nome}: ${valor(r.antes[c])} → ${valor(r.depois[c])}`
    })
    return partes.length ? `Editou o bloqueio da agenda (${[...new Set(partes)].join('; ')})` : null
  }
  if (r.operacao !== 'criou' && r.operacao !== 'apagou') return null
  const x = r.operacao === 'apagou' ? r.antes : r.depois
  const prof = texto(x.professional_id)
  const sala = texto(x.room_id)
  const nomeDaSala = sala ? nomes.salas?.[sala] || null : null
  const deQuem = prof && nomes.membros[prof] ? ` de ${nomes.membros[prof]}` : ''
  const periodo = periodoDoBloqueio(texto(x.inicio), texto(x.fim), fuso)
  const motivo = texto(x.motivo)
  const resto = `${periodo ? ` ${periodo}` : ''}${motivo ? ` (motivo: ${motivo})` : ''}`
  if (r.operacao === 'criou') return `Bloqueou ${nomeDaSala ? `a sala ${nomeDaSala}` : `a agenda${deQuem}`}${resto}`
  return `Tirou o bloqueio ${nomeDaSala ? `da sala ${nomeDaSala}` : `da agenda${deQuem}`}${resto}`
}

/** As unidades pelo nome ("Batel e Savassi"; vazia, "nenhuma"); nulo quando alguma não se lê. */
function unidadesPeloNome(v: unknown, nomes: NomesDaAuditoria): string | null {
  if (!Array.isArray(v)) return v === null ? 'nenhuma' : null
  const ditas = v.map(id => (typeof id === 'string' ? nomes.unidades[id] || null : null))
  if (ditas.some(d => !d)) return null
  return ditas.length ? emLista(ditas as string[]) : 'nenhuma'
}

/** Um valor do membro como a tela o diz (o cargo, a unidade principal, as outras); nulo = não se sabe dizer. */
function valorDoMembro(c: string, v: unknown, nomes: NomesDaAuditoria): string | null {
  if (c === 'role_id') return typeof v === 'string' ? nomes.cargosDosMembros?.[v]?.nome || null : null
  if (c === 'branch_id') return v === null ? 'a rede inteira' : typeof v === 'string' ? nomes.unidades[v] || null : null
  if (c === 'outras_unidades') return unidadesPeloNome(v, nomes)
  return null
}

const NOME_DO_CAMPO_DO_MEMBRO: Record<string, string> = { role_id: 'cargo', branch_id: 'unidade principal', outras_unidades: 'outras unidades' }
const ORDEM_DO_MEMBRO: readonly string[] = ['role_id', 'branch_id', 'outras_unidades']

/**
 * A17 (plataforma:AD-13 e AD-21): o cargo e as unidades do membro dizem o de →
 * para ("cargo: Recepção → Admin da rede; unidade principal: Moinhos → a rede
 * inteira"); a promoção a Admin da rede é o fato ("Promoveu Fulana a Admin da
 * rede"). As outras unidades vão na auditoria desde a migration
 * `20261205400001`; o registro de antes diz só o nome do campo.
 */
function fraseDoMembroEditado(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string | null {
  if (r.tabela !== 'users' || r.operacao !== 'editou' || !r.colunas.some(c => ORDEM_DO_MEMBRO.includes(c))) return null
  const colunas = [...ORDEM_DO_MEMBRO.filter(c => r.colunas.includes(c)), ...r.colunas.filter(c => !ORDEM_DO_MEMBRO.includes(c) && !DERIVADAS.has(c))]
  const partes = colunas.map(c => {
    if (!ORDEM_DO_MEMBRO.includes(c) || !(c in r.antes) || !(c in r.depois)) return { nome: nomeDoCampo(c, r.tabela), dePara: false }
    const de = valorDoMembro(c, r.antes[c], nomes)
    const para = valorDoMembro(c, r.depois[c], nomes)
    if (de == null || para == null || de === para) return { nome: nomeDoCampo(c, r.tabela), dePara: false }
    return { nome: `${NOME_DO_CAMPO_DO_MEMBRO[c]}: ${de} → ${para}`, dePara: true }
  })
  const quem = nomeDoRegistro(r, nomes) ?? 'um membro da equipe'
  const campos = partes.some(p => p.dePara) ? [...new Set(partes.map(p => p.nome))].join('; ') : camposMudados(r.colunas, r.tabela)
  const cargoDe = typeof r.antes.role_id === 'string' ? nomes.cargosDosMembros?.[r.antes.role_id] : undefined
  const cargoPara = typeof r.depois.role_id === 'string' ? nomes.cargosDosMembros?.[r.depois.role_id] : undefined
  if (cargoPara?.adminDaRede && cargoDe && !cargoDe.adminDaRede) return `Promoveu ${quem} a Admin da rede (${campos})`
  return `Editou o membro da equipe ${quem}${campos ? ` (${campos})` : ''}`
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
  const doMembro = fraseDoMembroEditado(r, nomes)
  if (doMembro) return doMembro
  if (r.tabela === 'agenda_bloqueios') {
    const bloqueio = fraseDoBloqueio(r, nomes)
    if (bloqueio) return bloqueio
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
    // A7 da 28ª (princípio 3): a despesa se lê pelo que a pessoa escreveu, com a categoria ao lado.
    const descricao = tipo === 'EXPENSE' ? texto(r.depois.description) : null
    const nomeDele = descricao
      ? ` ${descricao}${categoria ? `, em ${categoria}` : ''}`
      : categoria && categoria !== 'Estorno' ? ` ${categoria}` : ''
    return `Criou ${oQue}${nomeDele}${valor != null ? ` (${brl(valor)})` : ''}${cliente ? ` — ${cliente}` : ''}`
  }
  const fato = fraseDoRegistroDa17(r, nomes, cliente)
  if (fato) return fato
  // A21 da 25ª: a falta é o fato ("Editou o agendamento (situação)" não dizia).
  if (r.tabela === 'appointments' && r.operacao === 'editou' && texto(r.depois.status) === 'NO_SHOW'
    && texto(r.antes.status) !== 'NO_SHOW') {
    return `Marcou a falta${cliente ? ` de ${cliente}` : ''}`
  }
  // A31 da 18ª: o cancelamento é o fato ("Editou o agendamento (motivo do cancelamento, …)" não dizia).
  if (r.tabela === 'appointments' && r.operacao === 'editou' && texto(r.depois.status) === 'CANCELLED'
    && texto(r.antes.status) !== 'CANCELLED') {
    const motivo = r.registro_id ? texto(nomes.motivosDoCancelamento?.[r.registro_id]) : null
    return `Cancelou o agendamento${cliente ? ` de ${cliente}` : ''}${motivo ? ` (motivo: ${motivo})` : ''}`
  }
  // A34 da 19ª: o remarcar e o repasse são o fato ("Editou o agendamento (confirmação, sala, horário…)" não dizia).
  if (r.tabela === 'appointments' && r.operacao === 'editou') {
    const novo = r.colunas.includes('scheduled_at') ? texto(r.depois.scheduled_at) : null
    const prof = r.colunas.includes('professional_id') ? texto(r.depois.professional_id) : null
    const quemAtende = prof ? nomes.membros[prof] ?? null : null
    const de = cliente ? ` de ${cliente}` : ''
    if (novo) return `Remarcou o agendamento${de} para ${quandoDaAuditoria(novo, fusoDoRegistro(r, nomes))}${quemAtende ? `, com ${quemAtende}` : ''}`
    if (prof) {
      const resto = camposMudados(r.colunas.filter(c => c !== 'professional_id'))
      return `Repassou o agendamento${de} a ${quemAtende ?? 'outra pessoa da equipe'}${resto ? ` (e editou: ${resto})` : ''}`
    }
  }
  // A33 da 19ª: o voucher devolvido (o estorno do pagamento que o usou) diz que voltou a ativo.
  const devolvido = voucherDevolvido(r)
  if (devolvido) return `Devolveu ${devolvido} (voltou a ativo)${cliente ? ` — ${cliente}` : ''}`
  // A35 da 19ª: a geração do documento é o fato ("Editou o documento (conteúdo, pagamento combinado, geração…)").
  if (r.tabela === 'issued_documents' && r.operacao === 'editou' && r.colunas.includes('rendered_at')) {
    const nome = nomeDoRegistro(r, nomes)
    return `Gerou o documento${nome ? ` ${nome}` : ''}${cliente ? ` — ${cliente}` : ''}`
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

  const da20 = fraseDoRegistroDa20(r, nomes, cliente)
  if (da20) return da20
  const da26 = fraseDoRegistroDa26(r, nomes, cliente)
  if (da26) return da26

  let coisa = COISA_DA_AUDITORIA[r.tabela] ?? `um registro (${r.tabela})`
  let nome = r.tabela === 'clients' ? null : nomeDoRegistro(r, nomes)
  // A permissão diz o módulo e o cargo: "Criou a permissão de Agenda do cargo X".
  const cargo = (r.tabela === 'role_permissions' || r.tabela === 'role_report_tabs') && r.registro_id ? nomes.cargos?.[r.registro_id] : null
  if (cargo && r.tabela === 'role_permissions') { coisa = 'a permissão'; nome = `${nome ? `${nome} ` : ''}do cargo ${cargo}` }
  else if (cargo) nome = `${nome ? `${nome} ` : ''}do cargo ${cargo}`
  if (r.tabela === 'role_report_tabs') coisa = 'a aba de relatório'
  // A35 da 19ª: "Criou a ficha de X" (era "a ficha da cliente de X").
  if (r.tabela === 'clients' && cliente) coisa = 'a ficha'
  let frase = `${VERBO[r.operacao] ?? 'Mudou'} ${coisa}${nome ? ` ${nome}` : ''}`
  if (r.tabela === 'clients' && cliente) frase += ` de ${cliente}`
  else if (cliente) frase += ` — ${cliente}`
  // A35 da 16ª: com duas unidades, a sala de qual.
  if (r.tabela === 'rooms' && r.branch_id && nomes.unidades[r.branch_id]) frase += ` em ${nomes.unidades[r.branch_id]}`
  if (r.operacao === 'editou') {
    const campos = r.tabela === 'financial_transactions'
      ? camposDoLancamentoEditado(r, fusoDoRegistro(r, nomes))
      : r.tabela === 'role_permissions' ? camposDaPermissaoEditada(r) : camposMudados(r.colunas, r.tabela)
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

/**
 * D2 da 23ª: a hora que a frase cita (o agendamento, o remarcar) é a do
 * relógio da unidade do registro; sem ela, o de Brasília.
 */
function fusoDoRegistro(r: RegistroDaAuditoria, nomes: NomesDaAuditoria): string | undefined {
  return r.branch_id ? nomes.fusos?.[r.branch_id] : undefined
}

/** "dd/mm/aaaa hh:mm", no fuso dado (a coluna "Quando": o do portal, D2 da 23ª). */
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
  // D6 da 26ª (a regra F62 em docs/regras/indicadores.md: "Todo dia e toda hora da unidade saem nele"): a
  // linha da unidade no fuso DELA; a sem unidade (a da rede), no fuso da rede.
  // `fuso` (o da leitura) fica para quem não tem o mapa. O relógio vai junto,
  // fora do de Brasília — na tela e no CSV, a mesma hora.
  const doRegistro = fusoDoRegistro(r, nomes) ?? (r.branch_id ? undefined : nomes.fusoDaRede) ?? fuso
  return {
    id:         r.id,
    quando:     quandoDaAuditoria(r.criado_em, doRegistro),
    relogio:    doRegistro && fusoValido(doRegistro) !== FUSO_PADRAO ? nomeDoFuso(doRegistro) : null,
    ...quemAgiu(r, nomes),
    oQue:       fraseDaAuditoria(r, nomes),
    // A36 da 19ª: a linha sem unidade (a oportunidade, a tag, o cargo) é da rede — o "—" não dizia por quê.
    unidade:    r.branch_id ? nomes.unidades[r.branch_id] ?? null : r.operacao === 'entrou' ? null : 'Da rede',
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
  loyalty_vouchers: 'vouchers', marcas: 'marcas', estoque_motivos_de_perda: 'motivos de perda do estoque', medical_record_entries: 'evoluções do prontuário', medical_records: 'prontuários',
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
  return comAGeracaoNaVenda([...grupos.values()])
}

/** Até quanto depois da criação a geração do documento ainda é parte da mesma gravação. */
const JANELA_DA_GERACAO_MS = 5 * 60_000
const atorDe = (r: RegistroDaAuditoria) => `${r.ator_user_id ?? ''}|${r.ator_nome}|${r.ator_tipo}`
const soGeracaoDeDocumento = (g: readonly RegistroDaAuditoria[]) =>
  g.every(l => l.tabela === 'issued_documents' && l.operacao === 'editou' && l.colunas.includes('rendered_at') && !!l.registro_id)

/**
 * A35 da 19ª simulação: a venda do pacote cria o contrato, e a montagem do
 * texto grava logo depois, noutra transação — "Editou o documento Contrato de
 * pacote (conteúdo, pagamento combinado, geração…)" ficava à parte. A geração
 * do documento que a MESMA pessoa criou há pouco entra na gravação que o
 * criou. Sem ela na mesma página, fica sozinha ("Gerou o documento X").
 */
function comAGeracaoNaVenda(grupos: RegistroDaAuditoria[][]): RegistroDaAuditoria[][] {
  const levados = new Set<RegistroDaAuditoria[]>()
  for (const g of grupos) {
    if (!soGeracaoDeDocumento(g)) continue
    const quando = Date.parse(g[0]!.criado_em)
    const dono = grupos.find(h => h !== g && !levados.has(h) && !soGeracaoDeDocumento(h) && h.some(l => {
      const depois = quando - Date.parse(l.criado_em)
      return l.tabela === 'issued_documents' && l.operacao === 'criou' && g.some(x => x.registro_id === l.registro_id)
        && atorDe(l) === atorDe(g[0]!) && depois >= 0 && depois <= JANELA_DA_GERACAO_MS
    }))
    if (!dono) continue
    dono.push(...g)
    dono.sort((a, b) => b.id - a.id)
    levados.add(g)
  }
  return levados.size ? grupos.filter(g => !levados.has(g)) : grupos
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
  // A7 da 21ª: o estorno do fechamento de comissão ("Estornou um pagamento (R$ 630,00)" não dizia de quem).
  const fechamento = linhas.find(l => l.tabela === 'commission_payouts' && l.operacao === 'editou' && l.colunas.includes('estornado_at'))
  const deQuem = fechamento?.registro_id ? nomes.pagamentosDeComissao?.[fechamento.registro_id] : null
  const alvo = fechamento ? `o fechamento da comissão${deQuem ? ` de ${deQuem}` : ''}`
    : ALVO.find(([t]) => linhas.some(l => l.tabela === t))?.[1] ?? (doAtendimento ? 'o atendimento' : 'um pagamento')
  const voltas = linhas.filter(l => l.tabela === 'stock_movements' && texto(l.depois.type) === 'SALE_RETURN').map(l => doProduto(l, nomes))
  // A24 da 26ª: a devolução de PARTE da venda (a venda segue, não foi estornada) é "Devolveu 1 de 2 Protetor".
  const devolucoes = linhas.filter(l => l.tabela === 'product_sale_returns' && l.operacao === 'criou')
  const vendaEstornada = linhas.some(l => l.tabela === 'product_sales' && l.colunas.includes('estornada_em'))
  const devolveu = devolucoes.length && !vendaEstornada && !fechamento ? oQueDevolveu(devolucoes, linhas, nomes) : null
  const volta = voltas.length ? `, e ${emLista(voltas)} ${voltas.length === 1 ? 'voltou' : 'voltaram'} ao estoque` : ''
  // A33 da 19ª: o voucher que o pagamento estornado usou volta a ativo, e a frase diz.
  const vouchers = linhas.map(voucherDevolvido).filter((v): v is string => !!v)
  const ativos = vouchers.length ? `${volta ? ' e' : ', e'} ${emLista(vouchers)} ${vouchers.length === 1 ? 'voltou' : 'voltaram'} a ativo` : ''
  const clienteId = linhas.find(l => l.client_id)?.client_id
  const cliente = clienteId ? nomes.clientes[clienteId] ?? null : null
  // A33 da 24ª: qual pagamento — a forma e a parcela do lançamento estornado (lido
  // agora; senão a forma do estorno). Com dois lançamentos estornados, só o valor.
  const estornados = linhas.filter(l => l.tabela === 'financial_transactions' && l.operacao === 'editou'
    && l.registro_id && nomes.lancamentos?.[l.registro_id])
  const original = saidas.length === 1 && estornados.length <= 1
    ? (estornados[0]?.registro_id ? nomes.lancamentos?.[estornados[0].registro_id] : undefined) : undefined
  const forma = saidas.length === 1 ? (original?.forma ?? texto(saidas[0]!.depois.payment_method)) : null
  const parcela = original?.parcela && original.de && original.de > 1 ? `parcela ${original.parcela}/${original.de}` : null
  const qual = [forma ? rotuloDaForma(forma, original?.vezes ?? null) : null, parcela].filter(Boolean).join(' · ')
  const fato = devolveu ? `Devolveu ${devolveu}` : `Estornou ${alvo}`
  return `${fato} (${brl(valor)}${qual ? ` · ${qual}` : ''})${volta}${ativos}${cliente ? ` — ${cliente}` : ''}`
}

/**
 * "1 de 2 Protetor solar": o que a devolução devolveu, do retrato lido agora
 * (`nomes.devolucoes`). Sem ele, a quantidade gravada e o produto do movimento
 * que voltou ao estoque, sem o "de 2".
 */
function oQueDevolveu(devolucoes: readonly RegistroDaAuditoria[], linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): string {
  const lidos = devolucoes.flatMap(d => (d.registro_id && nomes.devolucoes?.[d.registro_id]) || [])
  if (lidos.length) {
    return emLista(lidos.map(i => `${i.quantidade.toLocaleString('pt-BR')}${i.de && i.de > i.quantidade ? ` de ${i.de.toLocaleString('pt-BR')}` : ''} ${i.produto}`))
  }
  const voltas = linhas.filter(l => l.tabela === 'stock_movements' && texto(l.depois.type) === 'SALE_RETURN')
  if (voltas.length === devolucoes.length) return emLista(voltas.map(l => doProduto(l, nomes)))
  const q = devolucoes.reduce((t, d) => t + (numero(d.depois.quantidade) ?? 0), 0)
  return q > 0 ? `${q.toLocaleString('pt-BR')} ${q === 1 ? 'produto' : 'produtos'} da venda` : 'parte da venda de produto'
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

interface Recebimento {
  linha: RegistroDaAuditoria; tipo: string | null; valor: number; forma: string | null; categoria: string | null; vezes?: number | null
  /** A20a da 25ª: o desconto da venda (`sale_discount`) e o pago com pontos ou voucher (`loyalty_discount`). */
  desconto?: number; pontos?: number
}

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
      // A38 da 22ª: as vezes do crédito ("Crédito 8x") — a auditoria não as guarda; vêm do lançamento lido.
      vezes: numero(estado.cartao_vezes) ?? lido?.vezes ?? null,
      desconto: numero(estado.sale_discount) ?? 0, pontos: numero(estado.loyalty_discount) ?? 0,
    })
  }
  return recebidos
}

/** "(Pix)", "(Pix e Débito)": as formas dos recebimentos, sem repetir. */
const formasDe = (rs: readonly Recebimento[]) => emLista([...new Set(rs.filter(x => !!x.forma).map(x => rotuloDaForma(x.forma, x.vezes)))])

/**
 * A31 da 23ª (princípio 3): com duas formas ou mais, quanto foi em cada uma —
 * "Dinheiro R$ 50,00 e Pix R$ 100,00"; "(Dinheiro e Pix)" não dizia. Com uma
 * só, o nome dela (o total já está na frase).
 */
function formasComValor(rs: readonly Recebimento[]): string {
  const porForma = new Map<string, number>()
  for (const x of rs) {
    if (!x.forma) continue
    const rotulo = rotuloDaForma(x.forma, x.vezes)
    porForma.set(rotulo, Math.round(((porForma.get(rotulo) ?? 0) + x.valor) * 100) / 100)
  }
  if (porForma.size < 2) return formasDe(rs)
  return emLista([...porForma].map(([forma, valor]) => `${forma} ${brl(valor)}`))
}

/**
 * Como a venda foi paga, na gravação dela (A38 da 22ª simulação; princípio
 * 3): "Vendeu o pacote X (R$ 650,00)" não dizia o crediário, a entrada nem as
 * parcelas. Os lançamentos CRIADOS na gravação: os pagos (a entrada, o à
 * vista) e os em aberto (as parcelas do crediário, o a receber). A parcela vem
 * do lançamento lido (`nomes.lancamentos`): a auditoria não a guarda.
 */
function pagamentoDaVenda(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria, pagos: readonly Recebimento[]): string {
  const abertos = linhas.filter(l => l.tabela === 'financial_transactions' && l.operacao === 'criou'
    && (texto(l.depois.type) ?? (l.registro_id ? nomes.lancamentos?.[l.registro_id]?.tipo : null)) === 'INCOME'
    && !l.depois.paid_at && texto(l.depois.category) !== 'Estorno')
    .map(l => ({ valor: numero(l.depois.amount) ?? (l.registro_id ? nomes.lancamentos?.[l.registro_id]?.valor : null) ?? 0,
                 parcela: l.registro_id ? nomes.lancamentos?.[l.registro_id]?.parcela ?? null : null }))
    .filter(x => x.valor > 0)
  const pago = pagos.reduce((t, x) => t + x.valor, 0)
  const formas = formasDe(pagos)
  const pagoEmTexto = `${brl(pago)}${formas ? ` (${formas})` : ''}`
  if (!abertos.length) return '' // paga à vista: a frase do preço já basta
  const emAberto = brl(abertos.reduce((t, x) => t + x.valor, 0))
  const parcelas = abertos.filter(x => x.parcela != null).length
  if (parcelas > 0) {
    const asParcelas = `${parcelas} ${parcelas === 1 ? 'parcela' : 'parcelas'} (${emAberto})`
    return pagos.length ? `, no crediário: entrada de ${pagoEmTexto} e ${asParcelas}` : `, no crediário: ${asParcelas}`
  }
  return pagos.length ? `, recebeu ${pagoEmTexto} e ficou ${emAberto} a receber` : `, a receber (${emAberto})`
}

/**
 * ", com desconto de R$ 20,00 e R$ 30,00 em pontos" (A20a da 25ª; princípio 3):
 * "Recebeu R$ 180,00 (Pix)" calava o que abateu o preço. O voucher entra na
 * mesma lista ("com desconto de R$ 45,00, o Voucher R$ 30 e R$ 5,00 em pontos").
 */
function abatimentosDasEntradas(rs: readonly Recebimento[], voucher: VoucherDaGravacao | null, pontosDebitados: number): string {
  const soma = (f: (x: Recebimento) => number) => Math.round(rs.reduce((t, x) => t + f(x), 0) * 100) / 100
  const desconto = soma(x => x.desconto ?? 0)
  // `loyalty_discount` é o voucher MAIS os pontos pagos à parte (A7 da 28ª: a Eloá
  // pagou com o Voucher R$ 30 e 100 pontos, e os pontos sumiam). Com o valor do
  // voucher gravado, os pontos em reais são a diferença. Sem o valor em reais
  // (as gravações de antes do gatilho guardá-lo), os pontos debitados na gravação.
  const pagoEmPontos = soma(x => x.pontos ?? 0)
  const semOsReais = voucher ? voucher.valor === null : pagoEmPontos === 0
  const pontosEmReais = voucher ? (voucher.valor === null ? 0 : Math.round((pagoEmPontos - voucher.valor) * 100) / 100) : pagoEmPontos
  const pontos = pontosEmReais > 0 ? `${brl(pontosEmReais)} em pontos`
    : semOsReais && pontosDebitados > 0 ? `${pontosDebitados.toLocaleString('pt-BR')} pontos`
    : null
  const partes = [
    ...(desconto > 0 ? [`desconto de ${brl(desconto)}`] : []),
    ...(voucher ? [voucher.texto] : []),
    ...(pontos ? [pontos] : []),
  ]
  return partes.length ? `, com ${emLista(partes)}` : ''
}

/** Os pontos debitados na gravação (os pagos na comanda), em número de pontos. */
function pontosDebitadosDaGravacao(linhas: readonly RegistroDaAuditoria[]): number {
  return linhas.filter(l => l.tabela === 'loyalty_transactions' && l.operacao === 'criou')
    .reduce((t, l) => { const p = numero(l.depois.points); return p !== null && p < 0 ? t - p : t }, 0)
}

/**
 * As parcelas do crediário lançadas na gravação do recebimento (A7 da 28ª;
 * princípio 3): "Recebeu R$ 100,00 (Pix)" não dizia que ficaram 3 parcelas em
 * aberto. A parcela vem do lançamento (o gatilho a guarda) ou do lido agora.
 */
function parcelasDoCrediario(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): { n: number; total: number } | null {
  const abertas = linhas.filter(l => l.tabela === 'financial_transactions' && l.operacao === 'criou' && !l.depois.paid_at
    && (texto(l.depois.type) ?? (l.registro_id ? nomes.lancamentos?.[l.registro_id]?.tipo : null)) === 'INCOME'
    && texto(l.depois.category) !== 'Estorno'
    && (numero(l.depois.parcela_numero) ?? (l.registro_id ? nomes.lancamentos?.[l.registro_id]?.parcela ?? null : null)) !== null)
  if (!abertas.length) return null
  const total = abertas.reduce((t, l) => t + (numero(l.depois.amount) ?? (l.registro_id ? nomes.lancamentos?.[l.registro_id]?.valor ?? 0 : 0)), 0)
  return { n: abertas.length, total: Math.round(total * 100) / 100 }
}

const lancouAsParcelas = (p: { n: number; total: number }) =>
  ` e lançou ${p.n} ${p.n === 1 ? 'parcela' : 'parcelas'} no crediário (${brl(p.total)})`

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
interface VoucherDaGravacao {
  texto: string
  /** O desconto do voucher em reais (A7 da 28ª: o gatilho passa a guardá-lo); nulo nas gravações de antes. */
  valor: number | null
}

function voucherDaGravacao(linhas: readonly RegistroDaAuditoria[]): VoucherDaGravacao | null {
  const usado = linhas.find(l => l.tabela === 'loyalty_vouchers' && l.operacao === 'editou'
    && (l.colunas.includes('used_at') || texto(l.depois.status) === 'USADO'))
  const nome = usado ? texto(usado.depois.name) ?? texto(usado.antes.name) : null
  if (!usado || !nome) return null
  return {
    texto: /^voucher\b/i.test(nome) ? `o ${nome}` : `o voucher ${nome}`,
    valor: numero(usado.depois.discount_value) ?? numero(usado.antes.discount_value),
  }
}

/** O fato da gravação e o registro dele (a frase, a unidade e o link da linha); nulo quando não há um. */
function fatoDaGravacao(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): { frase: string; principal: RegistroDaAuditoria } | null {
  const criada = (tabela: string) => [...linhas].reverse().find(l => l.tabela === tabela && l.operacao === 'criou') ?? null
  const recebidos = recebimentosDaGravacao(linhas, nomes)
  const entradas = recebidos.filter(x => x.tipo === 'INCOME')
  const totalRecebido = entradas.reduce((t, x) => t + x.valor, 0)
  const voucher = voucherDaGravacao(linhas)
  const formasDaEntrada = formasComValor(entradas)
  const abatimentos = abatimentosDasEntradas(entradas, voucher, pontosDebitadosDaGravacao(linhas))
  // A7 da 28ª: o crediário da comanda (a entrada recebida e as parcelas lançadas na mesma gravação).
  const crediario = entradas.length ? parcelasDoCrediario(linhas, nomes) : null
  const eRecebeu = entradas.length
    ? ` e recebeu ${crediario ? 'a entrada de ' : ''}${brl(totalRecebido)}${formasDaEntrada ? ` (${formasDaEntrada})` : ''}${abatimentos}${crediario ? lancouAsParcelas(crediario) : ''}`
    : ''

  // A venda: o pacote, o pré-pago, o crédito.
  const pacote = criada('client_packages')
  if (pacote) {
    const pk = texto(pacote.depois.package_id)
    const nome = pk ? nomes.pacotes?.[pk] : null
    const preco = numero(pacote.depois.price)
    // A20b da 25ª: o pacote de antes do sistema é registrado, não vendido (não entrou dinheiro).
    if (pacote.depois.de_fora === true) {
      return { principal: pacote, frase: `Registrou ${nome ? `o pacote de antes ${nome}` : 'um pacote de antes do sistema'}${clienteDaGravacao(linhas, nomes, pacote)}` }
    }
    return {
      principal: pacote,
      frase: `Vendeu ${nome ? `o pacote ${nome}` : 'um pacote'}${preco !== null ? ` (${brl(preco)})` : ''}${pagamentoDaVenda(linhas, nomes, entradas)}${clienteDaGravacao(linhas, nomes, pacote)}`,
    }
  }
  const prePago = criada('procedure_sales')
  if (prePago) {
    const q = numero(prePago.depois.quantity)
    const preco = numero(prePago.depois.price)
    const sessoes = q !== null ? ` de ${q.toLocaleString('pt-BR')} ${q === 1 ? 'sessão' : 'sessões'}` : ''
    return {
      principal: prePago,
      frase: `Vendeu o pré-pago${sessoes}${preco !== null ? ` (${brl(preco)})` : ''}${pagamentoDaVenda(linhas, nomes, entradas)}${clienteDaGravacao(linhas, nomes, prePago)}`,
    }
  }
  const credito = criada('creditos_vendidos')
  if (credito) {
    const valor = numero(credito.depois.valor)
    return {
      principal: credito,
      frase: `Vendeu crédito interno${valor !== null ? ` (${brl(valor)})` : ''}${pagamentoDaVenda(linhas, nomes, entradas)}${clienteDaGravacao(linhas, nomes, credito)}`,
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
    // A31 da 23ª: a parcela recebida em duas formas vira um lançamento por forma, com a mesma parcela.
    const mesmaParcela = !!lido?.parcela && entradas.every(x => {
      const dele = x.linha.registro_id ? nomes.lancamentos?.[x.linha.registro_id] : null
      return dele?.parcela === lido.parcela && (dele?.de ?? null) === (lido.de ?? null)
    })
    if (lido?.parcela && mesmaParcela) {
      const forma = formasComValor(entradas)
      const separador = entradas.length > 1 && forma.includes(' e ') ? ': ' : ', '
      return {
        principal,
        frase: `Recebeu a parcela ${lido.parcela}${lido.de ? `/${lido.de}` : ''} (${brl(totalRecebido)}${forma ? `${separador}${forma}` : ''})${clienteDaGravacao(linhas, nomes, principal)}`,
      }
    }
    const forma = formasComValor(entradas)
    return {
      principal,
      frase: `Recebeu ${crediario ? 'a entrada de ' : ''}${brl(totalRecebido)}${forma ? ` (${forma})` : ''}${abatimentos}${produtos ? `, com ${produtos}` : ''}${crediario ? lancouAsParcelas(crediario) : ''}${clienteDaGravacao(linhas, nomes, principal)}`,
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

/** "Criou a despesa X, em Categoria, em 3 parcelas (R$ 900,00)": as parcelas de uma despesa criadas juntas; nulo se não for isso. */
function fraseDaDespesaEmParcelas(linhas: readonly RegistroDaAuditoria[]): string | null {
  if (linhas.length < 2 || !linhas.every(l => l.tabela === 'financial_transactions' && l.operacao === 'criou'
    && texto(l.depois.type) === 'EXPENSE' && numero(l.depois.parcela_numero) !== null)) return null
  const semParcela = (d: string | null) => d?.replace(/\s*—\s*parcela \d+\/\d+\s*$/i, '').trim() || null
  const descricoes = [...new Set(linhas.map(l => semParcela(texto(l.depois.description))))]
  const categorias = [...new Set(linhas.map(l => texto(l.depois.category)))]
  if (descricoes.length !== 1 || categorias.length !== 1) return null
  const [descricao] = descricoes
  const [categoria] = categorias
  const total = Math.round(linhas.reduce((t, l) => t + (numero(l.depois.amount) ?? 0), 0) * 100) / 100
  const nome = descricao ? ` ${descricao}${categoria ? `, em ${categoria}` : ''}` : categoria ? ` ${categoria}` : ''
  return `Criou a despesa${nome}, em ${linhas.length} parcelas (${brl(total)})`
}

/** A frase de uma gravação inteira. */
export function fraseDoGrupo(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): string {
  // A baixa sozinha de um lançamento (D7 da 16ª): "Recebeu a parcela 1/4 (R$ 200,00, Pix)".
  // D10 (AD-13/AD-16; decisão do Claude, 25/11): também a receita CRIADA já paga, sozinha
  // na gravação (o recebimento de quem atende sem comissão) — era "Criou a receita".
  if (linhas.length === 1) {
    const so = linhas[0]!
    const recebidaAoCriar = so.operacao === 'criou' && texto(so.depois.type) === 'INCOME' && !!so.depois.paid_at
      && texto(so.depois.category) !== 'Estorno'
    const baixa = so.tabela === 'financial_transactions' && (so.operacao === 'editou' || recebidaAoCriar) ? fatoDaGravacao(linhas, nomes) : null
    return baixa?.frase ?? fraseDaAuditoria(so, nomes)
  }

  // A semente da rede nova: uma gravação de dezenas de registros.
  const rede = linhas.find(l => l.tabela === 'tenants' && l.operacao === 'criou')
  if (rede) {
    const nome = texto(rede.depois.name)
    return `Montou a rede nova${nome ? ` ${nome}` : ''} (${linhas.length} registros: ${resumoDasTabelas(linhas.filter(l => l !== rede))})`
  }

  // A34 da 20ª: o cancelamento do pacote fecha as sessões e o contrato junto; o fato é o pacote.
  const pacoteCancelado = linhas.find(l => l.tabela === 'client_packages' && l.operacao === 'editou' && l.colunas.includes('cancelado_em')
    && l.colunas.includes('cancelamento'))
  if (pacoteCancelado) {
    const nome = pacoteCancelado.registro_id ? nomes.pacotesDaCliente?.[pacoteCancelado.registro_id] : null
    const estornado = linhas.filter(l => l.tabela === 'financial_transactions' && l.operacao === 'criou' && texto(l.depois.category) === 'Estorno')
      .reduce((t, l) => t + (numero(l.depois.amount) ?? 0), 0)
    return `Cancelou ${nome ? `o pacote ${nome}` : 'um pacote'}${estornado ? ` e estornou ${brl(estornado)}` : ''}${clienteDaGravacao(linhas, nomes, pacoteCancelado)}`
  }
  const estorno = fraseDoEstorno(linhas, nomes)
  if (estorno) return estorno
  // A35 da 20ª: a entrada e o desfazer gravam o lote e o custo do produto junto (o lote podia sair primeiro: "Editou o lote").
  const entrada = linhas.find(l => l.tabela === 'stock_movements' && l.operacao === 'criou' && texto(l.depois.type) === 'PURCHASE')
  if (entrada && linhas.every(l => ['stock_movements', 'product_batches', 'products'].includes(l.tabela))) return fraseDaAuditoria(entrada, nomes)
  // A36 da 16ª: a resposta da ficha grava o link e o prontuário junto; o fato é a resposta.
  const resposta = linhas.find(l => l.tabela === 'pre_atendimentos' && l.operacao === 'editou' && l.colunas.includes('respondido_em'))
  if (resposta) return fraseDaAuditoria(resposta, nomes)
  const transferencia = fraseDaTransferencia(linhas, nomes)
  if (transferencia) return transferencia
  const fato = fatoDaGravacao(linhas, nomes)
  if (fato) return fato.frase
  // A34 da 19ª: o remarcar, o repasse e o cancelamento gravados com outros registros.
  const doAgendamento = linhas.map(l => (l.tabela === 'appointments' && l.operacao === 'editou' ? fraseDaAuditoria(l, nomes) : null))
    .find(f => f && /^(Remarcou|Repassou|Cancelou|Marcou a falta) /.test(f))
  if (doAgendamento) return doAgendamento
  // A36 da 20ª: o agendamento criado com outros registros (o link da ficha, a oportunidade) é o fato.
  const agendou = [...linhas].reverse().find(l => l.tabela === 'appointments' && l.operacao === 'criou')
  if (agendou) return fraseDaAuditoria(agendou, nomes)

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

  // A7 da 21ª: o "Salvar acessos" grava as permissões e as abas de relatório, sem o cargo na gravação.
  const doCargo = (l: RegistroDaAuditoria) => l.tabela === 'role_permissions' || l.tabela === 'role_report_tabs'
  const cargosDaGravacao = [...new Set(linhas.map(l => (l.registro_id && nomes.cargos?.[l.registro_id]) || null))]
  const umCargo = cargosDaGravacao.length === 1 ? cargosDaGravacao[0] ?? null : null
  if (linhas.every(doCargo) && linhas.some(l => l.tabela === 'role_permissions') && linhas.some(l => l.tabela === 'role_report_tabs')) {
    const conta = (t: string, um: string, varios: string) => { const n = linhas.filter(l => l.tabela === t).length; return `${n} ${n === 1 ? um : varios}` }
    return `Mudou os acessos ${umCargo ? `do cargo ${umCargo}` : 'dos cargos'} (${conta('role_report_tabs', 'aba de relatório', 'abas de relatório')} e ${conta('role_permissions', 'permissão', 'permissões')})`
  }

  // Muitas linhas da mesma tabela: "Criou 3 e apagou 3 insumos do procedimento".
  const tabela = linhas[0]!.tabela
  // A7 da 28ª (princípio 3): a despesa lançada em parcelas é UMA despesa, pela descrição ("Criou 3 lançamentos" não dizia).
  const despesaEmParcelas = fraseDaDespesaEmParcelas(linhas)
  if (despesaEmParcelas) return despesaEmParcelas
  if (linhas.every(l => l.tabela === tabela && ORDEM_DAS_OPERACOES.includes(l.operacao))) {
    let coisas = PLURAL_DA_AUDITORIA[tabela] ?? `registros (${tabela})`
    if (tabela === 'role_permissions' && umCargo) coisas = `permissões do cargo ${umCargo}`
    if (tabela === 'role_report_tabs' && umCargo) coisas = `abas de relatório do cargo ${umCargo}`
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
    // A34 da 21ª: no detalhe, o registro clínico sem unidade leva a da gravação (como o CSV, A37 da 20ª).
    const detalhes = comAUnidadeDaGravacao(linhas, nomes).map(l => linhaDaAuditoria(l, nomes, pathname, slug, fuso))
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
  return agruparAuditoria(registros).filter(linhas => {
    const principal = principalDaGravacao(linhas, nomes)
    // A ficha é da REDE (auditoria das regras, 18/11; H16): a gravação dela não
    // tem unidade, e o filtro de unidade não a esconde.
    return principal.branch_id === unidade || ehDaFicha(principal)
  }).flat()
}

/** A linha da ficha da cliente: da rede, sem unidade (o gatilho não lê `clients.branch_id`). */
function ehDaFicha(l: RegistroDaAuditoria): boolean {
  return l.tabela === 'clients' && !l.branch_id
}

/** O registro clínico que não guarda unidade (o prontuário é da cliente, não da unidade). */
const CLINICO_SEM_UNIDADE: ReadonlySet<string> = new Set([
  'medical_records', 'medical_record_entries', 'consent_terms', 'prontuario_anotacoes', 'injectable_maps', 'injectable_applications',
])

/**
 * A37 da 20ª simulação: a evolução gravada na conclusão saía "Da rede" no CSV,
 * com a gravação na unidade do atendimento. O registro clínico sem unidade
 * leva a da gravação; o resto sem unidade (a oportunidade) segue da rede.
 */
function comAUnidadeDaGravacao(linhas: readonly RegistroDaAuditoria[], nomes: NomesDaAuditoria): RegistroDaAuditoria[] {
  if (linhas.length === 1 || !linhas.some(l => !l.branch_id && CLINICO_SEM_UNIDADE.has(l.tabela))) return [...linhas]
  const unidade = principalDaGravacao(linhas, nomes).branch_id
  if (!unidade) return [...linhas]
  return linhas.map(l => (!l.branch_id && CLINICO_SEM_UNIDADE.has(l.tabela) ? { ...l, branch_id: unidade } : l))
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
    // A7 da 21ª: a gravação de um registro só diz no "O quê" a frase da tela, e a
    // "Gravação" fica vazia; na de vários, a linha que já é a frase dela não a repete.
    if (linhas.length === 1) return [{ ...linhaDaAuditoria(linhas[0]!, nomes, '/admin/auditoria', null, fuso), oQue: gravacao, gravacao: '' }]
    return comAUnidadeDaGravacao(linhas, nomes).map(l => {
      const linha = linhaDaAuditoria(l, nomes, '/admin/auditoria', null, fuso)
      return { ...linha, gravacao: linha.oQue === gravacao ? '' : gravacao }
    })
  })
}
