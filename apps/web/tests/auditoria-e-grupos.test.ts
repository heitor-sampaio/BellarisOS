import { describe, it, expect } from 'vitest'
import { fraseDaAuditoria, linkDaAuditoria } from '@/lib/auditoria/frase'
import type { RegistroDaAuditoria } from '@/lib/auditoria/tipos'
import type { NomesDaAuditoria } from '@/lib/auditoria/tipos'
import fs from 'node:fs'
import path from 'node:path'
import { ABAS_DE_CONFIGURACAO, GRUPOS_DE_ABAS, abasEmGrupos } from '@/lib/configuracoes/abas'

const base: RegistroDaAuditoria = {
  id: 1, criado_em: '2026-11-16T12:00:00Z', branch_id: null, client_id: null, tabela: 'tags', operacao: 'criou',
  registro_id: '00000000-0000-0000-0000-000000000001', colunas: [], antes: {}, depois: { nome: 'VIP' },
  ator_user_id: null, ator_nome: 'Ana', ator_tipo: 'membro', incompleto: false,
}
const nomes = { clientes: { c1: 'Bia' }, membros: {}, unidades: {} }

describe('a frase da auditoria (CF3a)', () => {
  it('diz o que foi feito, com o nome guardado', () => {
    expect(fraseDaAuditoria(base, nomes)).toBe('Criou a tag VIP')
  })

  it('a abertura do prontuário diz de quem, com o nome lido agora', () => {
    expect(fraseDaAuditoria({ ...base, tabela: 'prontuario_acessos', operacao: 'abriu', client_id: 'c1', depois: {} }, nomes))
      .toBe('Abriu o prontuário de Bia')
  })

  it('a edição da evolução diz o campo, não o texto', () => {
    const f = fraseDaAuditoria({ ...base, tabela: 'medical_record_entries', operacao: 'editou', client_id: 'c1', colunas: ['notes'], depois: {} }, nomes)
    // A coluna notes da evolução é o texto dela (era "anotações"; princípio 3, plataforma.md).
    expect(f).toBe('Editou a evolução do prontuário — Bia (texto da evolução)')
  })

  it('o link vai à ficha da cliente no portal de quem lê', () => {
    const r = { ...base, client_id: 'c1' }
    expect(linkDaAuditoria(r, '/admin/auditoria', null)).toBe('/admin/clients/c1')
    expect(linkDaAuditoria(r, '/centro/auditoria', 'centro')).toBe('/centro/clients/c1')
  })
})

describe('as abas de Configurações em grupos (CF1)', () => {
  it('toda aba está em exatamente um grupo, e o Eventos saiu', () => {
    const nosGrupos = GRUPOS_DE_ABAS.flatMap(g => g.abas)
    expect([...nosGrupos].sort()).toEqual(ABAS_DE_CONFIGURACAO.map(a => a.key).sort())
    expect(new Set(nosGrupos).size).toBe(nosGrupos.length)
    expect(ABAS_DE_CONFIGURACAO.map(a => a.key as string)).not.toContain('eventos')
  })

  it('o grupo sem aba visível some', () => {
    expect(abasEmGrupos([{ key: 'tags' }, { key: 'importacoes' }]).map(g => g.label)).toEqual(['Clientes'])
  })
})

// ─── Toda coluna auditada tem nome; o fato, não a tabela; a permissão diz o módulo ───
// (Princípios 3 e 7 — docs/regras/plataforma.md, Auditoria.)
const RAIZ_DO_REPO = path.resolve(__dirname, '../../..')
const MIGRATIONS_DO_REPO = path.join(RAIZ_DO_REPO, 'supabase/migrations')
const semNbsp = (s: string) => s.replace(/[  ]/g, ' ')

/**
 * As colunas de cada tabela com o gatilho `private.auditar` (lidas da produção
 * em 18/11), sem id, tenant_id, created_at e as que o gatilho ignora. Coluna
 * nova numa tabela auditada entra aqui e no `CAMPO`. Fora: o
 * `tenants.inbox_visibilidade` — nada o grava desde que o "só os meus" saiu
 * (o Heitor, 2026-11-23; `tests/sem-so-os-meus.test.ts` trava o nome).
 */
const COLUNAS_AUDITADAS: Record<string, string> = {
  agenda_bloqueios: 'branch_id professional_id room_id inicio fim motivo criado_por criado_por_nome criado_em',
  appointments: 'branch_id client_id procedure_id professional_id room_id status source scheduled_at duration_min price notes client_notes cancellation_reason cancelled_at confirmed_at started_at completed_at treatment_plan_id client_rating client_confirmed_at procedure_rating client_feedback created_by_id arrived_at aconteceu_em sem_preferencia',
  automations: 'nome descricao status grafo gatilhos limites versao criado_por ultimo_disparo_agenda',
  branches: 'name slug document email phone address city state zip_code logo_url is_active state_registration horario fuso',
  cash_registers: 'branch_id opened_by closed_by opened_at closed_at opening_balance closing_balance notes',
  client_documents: 'client_id branch_id name category file_path file_name file_size mime_type uploaded_by appointment_id apagado_em apagado_por apagado_por_nome enviado_em enviado_por enviado_por_nome momento',
  client_packages: 'client_id package_id branch_id purchased_at expires_at total_sessions used_sessions price sold_by preco_tabela desconto comissao_venda_tipo comissao_venda_valor comissao_execucao comissao_execucao_valor cancelado_em cancelado_por cancelamento_motivo valor_cancelado cancelamento responsavel_id comissao_responsavel_tipo comissao_responsavel_valor registrado_por de_fora valor_referencia usadas_antes',
  clients: 'branch_id auth_id name document email phone birth_date gender avatar_url address city state zip_code referred_by tags notes is_active app_account_created_at address_number address_complement neighborhood ctwa_clid portal_ligado_em documento_tipo documento_numero responsavel_nome responsavel_cpf responsavel_parentesco responsavel_telefone cliente_desde ultima_visita_antes indicada_por',
  comanda_itens: 'branch_id comanda_id product_id quantidade acrescentado_por acrescentado_em product_sale_id',
  comandas: 'branch_id client_id numero origem appointment_id treatment_plan_id aberta_em cancelada_em cancelada_motivo client_package_id procedure_sale_id product_sale_id credito_vendido_id',
  commission_configs: 'modo desconta_insumos desconta_taxa base_com_pontos periodo produto_pct produto_modo plano_pct',
  commission_payouts: 'branch_id professional_id inicio fim total transaction_id paid_at paid_by estornado_at estornado_por estorno_motivo estorno_transaction_id',
  commission_rules: 'professional_id procedure_id type value is_active',
  commissions: 'branch_id professional_id appointment_id amount type rule_value status period_ref paid_at paid_by line_id kind motivo released_at transaction_id payout_id',
  consent_terms: 'medical_record_id procedure_id title content status signed_at signed_ip signed_via signature_data treatment_plan_id',
  contacts: 'name phone identifiers tags email social_media',
  creditos_vendidos: 'branch_id client_id valor registrado_por registrado_por_nome estornado_em estornado_por estornado_por_nome estorno_motivo valor_devolvido estorno bonus',
  crm_funnels: 'name is_default position archived_at',
  crm_motivos_perda: 'nome ativo posicao',
  crm_origens: 'nome ativo posicao',
  crm_stages: 'name color position funnel_id outcome marca',
  document_sign_links: 'issued_document_id token_hash expires_at used_at revoked_at failed_attempts created_by',
  document_signatures: 'issued_document_id channel identity_method signer_name signer_document signature_png signature_sha256 ip user_agent content_sha256 conducted_by link_id scan_path scan_sha256 accepted_text signed_at',
  document_templates: 'name kind source enforcement is_active current_version system_key created_by',
  fechamentos_do_dia: 'branch_id dia resumo esperado_dinheiro contado_dinheiro diferenca observacao fechado_por fechado_por_nome fechado_em fundo_de_troco conferido',
  financial_transactions: 'branch_id cash_register_id appointment_id type category description amount payment_method due_date paid_at is_paid notes created_by client_id treatment_plan_id loyalty_discount client_package_id sale_discount procedure_sale_id parcela_numero parcela_total parcela_grupo data_de_referencia cartao_vezes estorno_motivo product_sale_id desconto_motivo cartao_bandeira credito_vendido_id vencimentos_anteriores fornecedor nota_fiscal valor_antes_do_estorno recebido_por estorno_de maquininha_id taxa_pct_retrato',
  forms: 'name schema is_active tipo',
  fornecedores: 'nome created_by',
  fundos_de_troco: 'branch_id dia valor informado_por informado_por_nome informado_em',
  importacoes: 'branch_id criada_por destino nome_arquivo mapeamento oportunidade status total processadas novas completadas sem_mudanca com_erro oportunidades erros erro criada_em iniciada_em concluida_em erros_expiram_em execucao nao_completar juntar avisos com_aviso',
  indicacao_premios: 'indicada_id indicadora_id branch_id transaction_id tipo pontos loyalty_transaction_id voucher_id estornado_em',
  injectable_applications: 'client_id appointment_id professional_id applied_at view points totals notes map_id',
  injectable_maps: 'client_id branch_id view points name',
  installments: 'transaction_id number total amount due_date paid_at is_paid',
  integration_configs: 'provider config is_active',
  internal_credits: 'client_id branch_id amount description transaction_id credito_vendido_id concedido',
  issued_documents: 'branch_id client_id template_id template_version_id appointment_id treatment_plan_id procedure_id kind source title moment enforcement status content content_text content_sha256 missing_fields payment_snapshot verification_code rendered_at signed_at signed_pdf_path signed_pdf_sha256 pdf_attempts replaced_by closed_reason closed_by closed_at legacy_consent_term_id client_package_id service_package_id',
  leads: 'branch_id name phone email social_media source notes client_id crm_stage_id owner_id fbclid gclid utm_source utm_medium utm_campaign tags ctwa_clid conversation_id value contato_id motivo_perda_id motivo_perda_obs perdido_em retornar_em retornar_obs retorno_avisado_em ganho_lembrado_em',
  lgpd_requests: 'client_id type status requested_at completed_at requested_via include_medical medical_status medical_reviewed_by medical_reviewed_at export_json_path export_pdf_path expires_at error_message requested_by requested_by_name',
  loyalty_configs: 'points_per_real redeem_points_value enabled earn_mode redeem_min_points redeem_max_pct expiry_months birthday_bonus first_access_bonus client_redeem expiry_notice_days pontua_venda_de_produto indicacao_premio indicacao_pontos indicacao_recompensa_id',
  loyalty_rewards: 'name description type points_cost procedure_id product_id discount_value validity_days is_active',
  loyalty_transactions: 'loyalty_account_id points description appointment_id branch_id kind transaction_id voucher_id treatment_plan_id expires_at created_by bonus_ref',
  loyalty_vouchers: 'client_id branch_id reward_id type name procedure_id product_id discount_value points_cost status expires_at used_at used_transaction_id used_stock_movement_id cancel_reason cancelled_by created_by',
  maquininhas: 'nome ordem taxas max_vezes prazo_dias cobra_por_bandeira por_bandeira arquivada_em',
  marcas: 'nome created_by',
  medical_record_entries: 'medical_record_id appointment_id professional_id notes products_used intercurrences form_data queixas',
  medical_records: 'client_id general_anamnesis',
  message_templates: 'name category language header_text body_text footer_text buttons example_values status meta_template_id rejection_reason created_by submitted_at waba_id nao_suportado',
  notification_campaigns: 'name description status type title body notification_type scheduled_at trigger_type trigger_config audience_rules channels total_sent total_read created_by last_run_at',
  package_sessions: 'client_package_id appointment_id status used_at session_number procedure_id preco',
  payment_fees: 'metodo parcelas taxa_pct taxa_pct_sem_teto',
  pre_atendimento_links: 'pre_atendimento_id token_hash expires_at used_at revoked_at failed_attempts created_by token_cifrado',
  pre_atendimentos: 'client_id appointment_id status modo ficha respostas respondido_em origem respondido_por',
  procedure_branch_availability: 'procedure_id branch_id',
  procedure_branch_pricing: 'procedure_id branch_id price labor_cost',
  procedure_categories: 'nome arquivada_em criada_em',
  procedure_products: 'procedure_id product_id quantity unit_cost',
  procedure_professionals: 'procedure_id user_id',
  procedure_rooms: 'procedure_id room_id',
  procedure_sale_units: 'sale_id numero preco status appointment_id used_at cancelled_at cancelled_by cancel_reason cancelamento',
  procedure_sales: 'branch_id client_id procedure_id quantity preco_unitario_tabela preco_tabela desconto price expires_at sold_by sold_at registrado_por',
  procedures: 'branch_id name category description duration_min price is_active visible_on_client_app labor_cost other_costs form_id loyalty_points consent_template_id contract_template_id outros_documentos sem_insumo',
  product_batches: 'product_id batch_number expires_at quantity received_at branch_id vencimento_avisado_em',
  product_categories: 'name',
  product_sale_items: 'sale_id product_id sort_order quantity preco_unitario preco_tabela custo stock_movement_id devolucao_movement_id devolvidas valor_devolvido custo_devolvido',
  product_sale_returns: 'sale_id item_id quantidade valor custo voltou movement_id motivo retrato created_by created_by_name',
  product_sales: 'branch_id client_id product_id quantity preco_unitario preco_tabela desconto price custo stock_movement_id sold_by sold_at estornada_em estornada_por estorno_motivo produto_voltou devolucao_movement_id descricao registrado_por valor_devolvido custo_devolvido unidades_devolvidas',
  products: 'branch_id name sku category unit cost_price sale_price is_active min_stock category_id consumption_unit units_per_package barcode uso comissao_tipo comissao_valor',
  prontuario_anotacoes: 'client_id appointment_id texto autor_id autor_nome criada_em',
  role_permissions: 'module role_id level scope',
  role_report_tabs: 'role_id tab',
  rooms: 'branch_id name is_active',
  service_package_items: 'package_id procedure_id quantity sort_order',
  service_packages: 'branch_id procedure_id name total_sessions price validity_days is_active comissao_venda_tipo comissao_venda_valor comissao_execucao comissao_execucao_valor comissao_responsavel_tipo comissao_responsavel_valor de_fora documentos_excluidos',
  stock_movements: 'branch_id product_id type quantity balance_after appointment_id transfer_id notes created_by unit_cost reference motivo_da_perda fornecedor nota_fiscal desfeita_em desfeita_por desfeita_motivo desfeita_pelo fornecedor_id marca_id marca correcao_de_cadastro',
  support_grants: 'target_user_id granted_by_user_id via ticket_id includes_clinical expires_at revoked_at revoked_by_user_id revoked_by_staff_id motivo_revogacao',
  support_sessions: 'grant_id target_user_id target_auth_id staff_id ticket_id motivo includes_clinical auth_session_id status started_at expires_at ended_at end_reason ip user_agent',
  tags: 'nome arquivada_em criada_em',
  tenant_roles: 'key label is_system inbox_caixas',
  tenants: 'name slug document email phone logo_url is_active plan_name plan_status trial_ends_at onboarding_completed_at website documentos_link_pela_conversa em_atraso_desde desligada_motivo desligada_em atraso_perdoado_ate pre_atendimento_envio pre_atendimento_validade_meses portal_prazo_alteracao_horas plano_validade_dias cartao_max_vezes cartao_prazo_dias cartao_por_bandeira avaliacao_o_que crediario_max_parcelas pix_taxa_pct pacote_crediario_libera pacote_vencido_cancela',
  treatment_plan_items: 'plan_id procedure_id service_package_id sessions unit_price sort_order products',
  treatment_plan_sessions: 'plan_id sort_order notes appointment_id',
  treatment_plans: 'client_id branch_id professional_id evaluation_appointment_id status professional_notes name desconto desconto_por aceito_em vendido_por cancelado_em cancelado_por cancelamento_motivo valor_cancelado cancelamento documentos_excluidos desconto_combinado_tipo desconto_combinado_valor desconto_combinado_por',
  users: 'branch_id auth_id name email phone avatar_url is_active role_id provides_services horario atende_em comissao_venda_pct registro_conselho outras_unidades',
  whatsapp_number_users: 'whatsapp_number_id user_id',
  whatsapp_numbers: 'provider label phone_e164 phone_number_id waba_id config is_active is_default managed branch_id removido_em',
}

/** As de controle não entram na frase: o gatilho as ignora. */
const DE_CONTROLE = ['last_app_login_at', 'portal_ultima_entrada_em', 'portal_ultima_unidade']

let proximoId = 26_000
const registro = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: proximoId--, criado_em: '2026-11-18T17:00:00.000Z', branch_id: 'bP', client_id: null, tabela: 'clients', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Helena', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomesDaLaura: NomesDaAuditoria = {
  clientes: { cL: 'Laura Mendes' }, membros: {}, unidades: { bP: 'Pajuçara' },
  cargos: { rp1: 'Só copilot' }, produtos: { pr1: 'Protetor solar' },
}

describe('toda coluna auditada tem nome na frase', () => {
  it('nenhuma coluna de tabela auditada sai crua (coluna nova numa tabela auditada entra na lista e no CAMPO)', async () => {
    const { campoTemNomeNaAuditoria } = await import('@/lib/auditoria/frase')
    const sem = Object.entries(COLUNAS_AUDITADAS).flatMap(([t, cs]) =>
      cs.split(' ').filter(c => !campoTemNomeNaAuditoria(c, t)).map(c => `${t}.${c}`))
    expect(sem).toEqual([])
  })
  it('o termo de consentimento do procedimento e as respostas e o texto da evolução, por extenso', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(registro({ tabela: 'procedures', colunas: ['consent_template_id'], depois: { name: 'Peeling' } }), nomesDaLaura))
      .toBe('Editou o procedimento Peeling (termo de consentimento)')
    expect(fraseDaAuditoria(registro({ tabela: 'medical_record_entries', client_id: 'cL', colunas: ['form_data', 'notes'] }), nomesDaLaura))
      .toBe('Editou a evolução do prontuário — Laura Mendes (respostas da ficha e texto da evolução)')
  })
})

describe('as colunas de controle (a entrada no app, a unidade do portal) não geram linha', () => {
  it('a migration mais nova que mexe na lista que o gatilho ignora tem as três', () => {
    const comLista = fs.readdirSync(MIGRATIONS_DO_REPO).filter(n => n.endsWith('.sql')).sort()
      .filter(n => /v_ignorar/.test(fs.readFileSync(path.join(MIGRATIONS_DO_REPO, n), 'utf8')))
    const ultima = fs.readFileSync(path.join(MIGRATIONS_DO_REPO, comLista[comLista.length - 1]!), 'utf8')
    for (const c of DE_CONTROLE) expect(ultima, c).toContain(`'${c}'`)
    // O ajuste do plano genérico segue (tests/auditoria-plano-generico.test.ts).
    expect(ultima).toMatch(/plan_cache_mode\s*=\s*force_generic_plan/i)
    // O helper do pg_temp nasce com create or replace (o db reset aplica tudo numa sessão só).
    expect(ultima).not.toMatch(/create\s+function\s+pg_temp\./i)
  })
})

describe('a frase diz o fato, não a tabela', () => {
  it('a foto clínica e o anexo clínico', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const comCategoria = { ...nomesDaLaura, categoriasDosAnexos: { d1: 'foto_clinica', d2: 'exame', d3: 'outro' } }
    expect(fraseDaAuditoria(registro({ tabela: 'client_documents', operacao: 'criou', registro_id: 'd1', client_id: 'cL' }), comCategoria))
      .toBe('Anexou uma foto clínica — Laura Mendes')
    expect(fraseDaAuditoria(registro({ tabela: 'client_documents', operacao: 'criou', registro_id: 'd2', client_id: 'cL' }), comCategoria))
      .toBe('Anexou um anexo clínico (exame) — Laura Mendes')
    expect(fraseDaAuditoria(registro({ tabela: 'client_documents', operacao: 'criou', registro_id: 'd3', client_id: 'cL' }), comCategoria))
      .toBe('Anexou um arquivo — Laura Mendes')
    // Sem a categoria lida, o fato sem o tipo — nunca "Criou o documento".
    expect(fraseDaAuditoria(registro({ tabela: 'client_documents', operacao: 'criou', registro_id: 'd9', client_id: 'cL' }), nomesDaLaura))
      .toBe('Anexou um arquivo — Laura Mendes')
  })
  it('a liberação do prontuário no pedido da LGPD', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(registro({ tabela: 'lgpd_requests', client_id: 'cL',
      colunas: ['completed_at', 'export_json_path', 'export_pdf_path', 'medical_reviewed_at', 'medical_reviewed_by', 'medical_status', 'status'],
      antes: { status: 'completed' }, depois: { status: 'pending' } }), nomesDaLaura))
      .toBe('Liberou o prontuário no pedido da LGPD de Laura Mendes')
    expect(fraseDaAuditoria(registro({ tabela: 'lgpd_requests', client_id: 'cL',
      colunas: ['medical_reviewed_at', 'medical_reviewed_by', 'medical_status'], antes: { medical_status: 'pending' }, depois: { medical_status: 'denied' } }), nomesDaLaura))
      .toBe('Recusou o prontuário no pedido da LGPD de Laura Mendes')
    expect(fraseDaAuditoria(registro({ tabela: 'lgpd_requests', client_id: 'cL',
      colunas: ['medical_reviewed_at', 'medical_reviewed_by', 'medical_status'], depois: { medical_status: 'approved' } }), nomesDaLaura))
      .toBe('Liberou o prontuário no pedido da LGPD de Laura Mendes')
  })
  it('a devolução de parte da venda', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      registro({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'ft2', client_id: 'cL', depois: { type: 'EXPENSE', amount: 95, category: 'Estorno', payment_method: 'CASH' } }),
      registro({ tabela: 'product_sale_returns', operacao: 'criou', registro_id: 'ret1', depois: { quantidade: 1, valor: 95 } }),
      registro({ tabela: 'product_sales', registro_id: 'ps1', client_id: 'cL', colunas: ['custo_devolvido', 'unidades_devolvidas', 'valor_devolvido'] }),
      registro({ tabela: 'stock_movements', operacao: 'criou', registro_id: 'sm1', depois: { type: 'SALE_RETURN', quantity: 1, product_id: 'pr1' } }),
    ]
    const comDevolucao = { ...nomesDaLaura, devolucoes: { ret1: [{ produto: 'Protetor solar', quantidade: 1, de: 2 }] } }
    expect(semNbsp(fraseDoGrupo(linhas, comDevolucao)))
      .toBe('Devolveu 1 de 2 Protetor solar (R$ 95,00 · Dinheiro), e 1 Protetor solar voltou ao estoque — Laura Mendes')
    // Sem o retrato lido, sem o "de 2".
    expect(semNbsp(fraseDoGrupo(linhas, nomesDaLaura))).toMatch(/^Devolveu 1 Protetor solar \(R\$ 95,00/)
  })
  it('a devolução de tudo segue "Estornou a venda de produto"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      registro({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'ft3', client_id: 'cL', depois: { type: 'EXPENSE', amount: 190, category: 'Estorno', payment_method: 'CASH' } }),
      registro({ tabela: 'product_sales', registro_id: 'ps2', client_id: 'cL', colunas: ['estornada_em', 'estornada_por', 'estorno_motivo'] }),
    ]
    expect(semNbsp(fraseDoGrupo(linhas, nomesDaLaura))).toMatch(/^Estornou a venda de produto \(R\$ 190,00/)
  })
  it('o retrato da devolução, lido agora: o produto, quantas e de quantas', async () => {
    const { itensDoRetrato } = await import('@/lib/auditoria/nomes-dos-anexos-e-devolucoes')
    expect(itensDoRetrato({ itens: [{ de: 2, item: 'x', custo: 35, valor: 95, produto: 'Protetor solar', quantidade: 1 }] }))
      .toEqual([{ produto: 'Protetor solar', quantidade: 1, de: 2 }])
    expect(itensDoRetrato(null)).toEqual([])
    expect(itensDoRetrato({ itens: [{ produto: '', quantidade: 1 }] })).toEqual([])
  })
})

describe('a permissão do cargo diz o módulo e o nível de antes e de depois', () => {
  it('"Editou a permissão de Copilot do cargo X (nível: Ver → Gerenciar)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(registro({ tabela: 'role_permissions', registro_id: 'rp1', colunas: ['level'],
      antes: { level: 'VIEW' }, depois: { module: 'copilot', level: 'MANAGE' } }), nomesDaLaura))
      .toBe('Editou a permissão de Copilot do cargo Só copilot (nível: Ver → Gerenciar)')
  })
  it('o gatilho grava o módulo em toda linha (o rótulo), e o nível como valor', () => {
    const comPermissoes = fs.readdirSync(MIGRATIONS_DO_REPO).filter(n => n.endsWith('.sql')).sort()
      .filter(n => /auditoria_upd after update on public\.role_permissions/.test(fs.readFileSync(path.join(MIGRATIONS_DO_REPO, n), 'utf8')))
    expect(comPermissoes.length).toBeGreaterThan(0)
    const ultima = fs.readFileSync(path.join(MIGRATIONS_DO_REPO, comPermissoes[comPermissoes.length - 1]!), 'utf8')
    expect(ultima).toMatch(/private\.auditar\('normal', 'module', 'level'/)
  })
})
