import { banco, PREFIXO } from './banco'
import { apagarConversas } from './banco'

/**
 * Limpeza do que a suíte cria, e a VARREDURA de sobras antes de cada rodada.
 *
 * Por que existe: o E2E roda contra o banco da produção (decisão do Heitor,
 * 2026-09-27), isolado só pelo prefixo `[e2e]` e pela limpeza no `finally` de
 * cada spec. Isso falha de dois jeitos, e os dois aconteceram:
 *
 * - **o teste estoura o tempo** e o `finally` não roda inteiro;
 * - **a limpeza falha calada**: o `fase2-agenda` fazia `delete` no cliente sem
 *   olhar o erro, e a conta de fidelidade que nasce junto travava a exclusão
 *   pela chave estrangeira. Eram 78 clientes `[e2e]` acumulados desde 18/09 — e
 *   366 notificações falando deles no sino da equipe de verdade.
 *
 * Por isso a exclusão de cada coisa mora AQUI, na ordem das chaves
 * estrangeiras (conferida no banco), e a varredura roda no `global-setup`.
 *
 * ⚠️ A varredura só toca as categorias listadas em `varrerSobras`. Nada de
 * `automations`: já houve automação `[e2e]` deixada de propósito no banco, e
 * apagar isso é decisão do Heitor.
 */

type Falha = { o_que: string; erro: string }

/** Roda uma exclusão e ANOTA a falha em vez de engolir. */
async function passo(falhas: Falha[], o_que: string, q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q
  if (error) falhas.push({ o_que, erro: error.message })
}

async function ids(q: PromiseLike<{ data: { id: string }[] | null }>): Promise<string[]> {
  const { data } = await q
  return (data ?? []).map(r => r.id)
}

/** Agendamentos e o que pende deles. Dado de TESTE: aqui se apaga até lançamento. */
/**
 * Termos e contratos emitidos, com a assinatura e a digitalização do papel.
 *
 * A assinatura NÃO sai em cascata de propósito (documento assinado não se
 * apaga, nem levado pelo agendamento): no teste, ela sai primeiro, à mão.
 */
export async function apagarDocumentosEmitidos(docs: string[], falhas: Falha[] = []): Promise<Falha[]> {
  if (docs.length === 0) return falhas
  const db = banco()
  const { data: scans } = await db.from('document_signatures').select('scan_path').in('issued_document_id', docs)
  const { data: pdfs } = await db.from('issued_documents').select('signed_pdf_path').in('id', docs)
  // A digitalização do papel e o PDF final assinado (fase 4): os dois no mesmo bucket.
  const caminhos = [
    ...(scans ?? []).map(s => s.scan_path as string | null),
    ...(pdfs ?? []).map(p => p.signed_pdf_path as string | null),
  ].filter((p): p is string => !!p)
  if (caminhos.length) {
    const { error } = await db.storage.from('documentos-assinados').remove(caminhos)
    if (error) falhas.push({ o_que: 'digitalizações dos documentos', erro: error.message })
  }
  await passo(falhas, 'assinaturas', db.from('document_signatures').delete().in('issued_document_id', docs))
  await passo(falhas, 'eventos dos documentos', db.from('domain_events').delete().in('entidade_id', docs))
  await passo(falhas, 'documentos emitidos', db.from('issued_documents').delete().in('id', docs))
  return falhas
}

export async function apagarAgendamentos(agendamentos: string[], falhas: Falha[] = []): Promise<Falha[]> {
  if (agendamentos.length === 0) return falhas
  const db = banco()

  await apagarDocumentosEmitidos(await ids(db.from('issued_documents').select('id').in('appointment_id', agendamentos)), falhas)

  const entradas = await ids(db.from('medical_record_entries').select('id').in('appointment_id', agendamentos))
  if (entradas.length) {
    await passo(falhas, 'fotos do atendimento', db.from('record_photos').delete().in('entry_id', entradas))
    await passo(falhas, 'fichas do atendimento', db.from('anamnesis_data').delete().in('entry_id', entradas))
    await passo(falhas, 'entradas do prontuário', db.from('medical_record_entries').delete().in('id', entradas))
  }

  const lancamentos = await ids(db.from('financial_transactions').select('id').in('appointment_id', agendamentos))
  if (lancamentos.length) {
    // O `pagamento.recebido` do gatilho aponta a TRANSAÇÃO, não o agendamento.
    await passo(falhas, 'eventos do pagamento', db.from('domain_events').delete().in('entidade_id', lancamentos))
    await passo(falhas, 'uso de crédito do pagamento', db.from('internal_credits').delete().in('transaction_id', lancamentos))
    await passo(falhas, 'parcelas', db.from('installments').delete().in('transaction_id', lancamentos))
    await passo(falhas, 'lançamentos do atendimento', db.from('financial_transactions').delete().in('id', lancamentos))
  }

  await passo(falhas, 'sessões de pacote', db.from('package_sessions').delete().in('appointment_id', agendamentos))
  await passo(falhas, 'avaliação do plano', db.from('treatment_plans')
    .update({ evaluation_appointment_id: null }).in('evaluation_appointment_id', agendamentos))
  // `appointment_history` sai em cascata. (`appointment_status_history`, que o
  // fase2-agenda apagava, não existe — o erro era descartado.)
  await passo(falhas, 'eventos do agendamento', db.from('domain_events').delete().in('entidade_id', agendamentos))
  // O aviso de "novo agendamento" vai para o sino de gente de VERDADE (o
  // profissional e a gerência): sem isto, cada rodada deixava uns doze lá.
  await passo(falhas, 'notificações do agendamento', db.from('user_notifications').delete()
    .in('data->>appointment_id', agendamentos))
  await passo(falhas, 'agendamentos', db.from('appointments').delete().in('id', agendamentos))
  return falhas
}

/** Clientes e tudo que só existe por causa deles. */
export async function apagarClientes(clientes: string[], falhas: Falha[] = []): Promise<Falha[]> {
  if (clientes.length === 0) return falhas
  const db = banco()

  await apagarDocumentosEmitidos(await ids(db.from('issued_documents').select('id').in('client_id', clientes)), falhas)

  // Fidelidade PRIMEIRO: o extrato aponta o lançamento (transaction_id), o
  // agendamento e o plano — apagado depois, travaria a saída de todos eles.
  // A conta nasce junto com o cliente.
  const contas = await ids(db.from('loyalty_accounts').select('id').in('client_id', clientes))
  if (contas.length) {
    await passo(falhas, 'pontos', db.from('loyalty_transactions').delete().in('loyalty_account_id', contas))
    await passo(falhas, 'contas de fidelidade', db.from('loyalty_accounts').delete().in('id', contas))
  }
  // Os vouchers apontam o cliente (e o lançamento em que foram usados).
  await passo(falhas, 'vouchers', db.from('loyalty_vouchers').delete().in('client_id', clientes))

  // Lançamentos do cliente SEM agendamento — os do checkout de plano, do crédito
  // usado, de lançamento manual. Com o cliente apagado eles ficariam órfãos
  // (`client_id` vira nulo) e sem o prefixo `[e2e]` na descrição: a varredura
  // nunca mais os acharia, e eles contariam no faturamento de verdade.
  const lancamentos = await ids(db.from('financial_transactions').select('id').in('client_id', clientes).is('appointment_id', null))
  if (lancamentos.length) {
    await passo(falhas, 'eventos dos lançamentos do cliente', db.from('domain_events').delete().in('entidade_id', lancamentos))
    await passo(falhas, 'crédito ligado a lançamento', db.from('internal_credits').delete().in('transaction_id', lancamentos))
    await passo(falhas, 'parcelas do cliente', db.from('installments').delete().in('transaction_id', lancamentos))
    await passo(falhas, 'lançamentos do cliente', db.from('financial_transactions').delete().in('id', lancamentos))
  }

  // Planos: os termos apontam o plano (e o prontuário), e os eventos do plano
  // usam o id DELE. As sessões saem em cascata com o plano.
  const planos = await ids(db.from('treatment_plans').select('id').in('client_id', clientes))
  if (planos.length) {
    await passo(falhas, 'termos dos planos', db.from('consent_terms').delete().in('treatment_plan_id', planos))
    await passo(falhas, 'eventos dos planos', db.from('domain_events').delete().in('entidade_id', planos))
  }

  await apagarAgendamentos(await ids(db.from('appointments').select('id').in('client_id', clientes)), falhas)
  if (planos.length) await passo(falhas, 'planos', db.from('treatment_plans').delete().in('id', planos))

  const prontuarios = await ids(db.from('medical_records').select('id').in('client_id', clientes))
  if (prontuarios.length) {
    const entradas = await ids(db.from('medical_record_entries').select('id').in('medical_record_id', prontuarios))
    if (entradas.length) {
      await passo(falhas, 'fotos', db.from('record_photos').delete().in('entry_id', entradas))
      await passo(falhas, 'fichas', db.from('anamnesis_data').delete().in('entry_id', entradas))
      await passo(falhas, 'entradas', db.from('medical_record_entries').delete().in('id', entradas))
    }
    await passo(falhas, 'termos', db.from('consent_terms').delete().in('medical_record_id', prontuarios))
    await passo(falhas, 'prontuários', db.from('medical_records').delete().in('id', prontuarios))
  }

  await passo(falhas, 'créditos internos', db.from('internal_credits').delete().in('client_id', clientes))

  // Arquivos no Storage: a linha some em cascata (documento) ou aqui (LGPD),
  // mas o ARQUIVO ficaria — dado pessoal de teste esquecido num bucket.
  const { data: docs } = await db.from('client_documents').select('file_path').in('client_id', clientes)
  const caminhosDocs = (docs ?? []).map(d => d.file_path as string).filter(Boolean)
  if (caminhosDocs.length) {
    const { error } = await db.storage.from('client-documents').remove(caminhosDocs)
    if (error) falhas.push({ o_que: 'arquivos de documentos', erro: error.message })
  }
  await passo(falhas, 'documentos', db.from('client_documents').delete().in('client_id', clientes))
  const { data: pedidos } = await db.from('lgpd_requests').select('export_json_path, export_pdf_path').in('client_id', clientes)
  const caminhosLgpd = (pedidos ?? []).flatMap(p => [p.export_json_path, p.export_pdf_path]).filter(Boolean) as string[]
  if (caminhosLgpd.length) {
    const { error } = await db.storage.from('lgpd-exports').remove(caminhosLgpd)
    if (error) falhas.push({ o_que: 'arquivos de LGPD', erro: error.message })
  }
  await passo(falhas, 'pedidos de LGPD', db.from('lgpd_requests').delete().in('client_id', clientes))
  // As sessões ainda não usadas não têm agendamento: saem pelo pacote. (A
  // venda cria todas de uma vez, desde 2026-09-30.)
  const pacotesDoCliente = await ids(db.from('client_packages').select('id').in('client_id', clientes))
  if (pacotesDoCliente.length) {
    await passo(falhas, 'sessões dos pacotes', db.from('package_sessions').delete().in('client_package_id', pacotesDoCliente))
  }
  await passo(falhas, 'pacotes', db.from('client_packages').delete().in('client_id', clientes))
  // Procedimentos pré-pagos: as unidades saem em cascata; lançamento e linha de
  // comissão perdem o vínculo (set null) e saem com o resto do cliente.
  await passo(falhas, 'procedimentos pré-pagos', db.from('procedure_sales').delete().in('client_id', clientes))
  // A oportunidade é da PESSOA, não do cliente: perde o vínculo, não some.
  await passo(falhas, 'vínculo da oportunidade', db.from('leads').update({ client_id: null }).in('client_id', clientes))
  await passo(falhas, 'eventos do cliente', db.from('domain_events').delete().in('entidade_id', clientes))
  await passo(falhas, 'clientes', db.from('clients').delete().in('id', clientes))
  return falhas
}

/**
 * Apaga as sobras `[e2e]` de rodadas anteriores. Roda no `global-setup`.
 *
 * Devolve o que apagou e o que NÃO conseguiu — quem chama imprime. Não lança:
 * é higiene, e uma sobra teimosa não pode impedir a suíte de rodar. Mas também
 * não se cala.
 */
export async function varrerSobras(): Promise<{ apagou: Record<string, number>; falhas: Falha[] }> {
  const db = banco()
  const falhas: Falha[] = []
  const apagou: Record<string, number> = {}
  const like = `${PREFIXO}%`

  // 1. Notificações da equipe que falam de dado de teste: aparecem no sino de
  //    gente de verdade.
  const notifs = await ids(db.from('user_notifications').select('id')
    .or(`title.like.*${PREFIXO}*,body.like.*${PREFIXO}*`))
  if (notifs.length) {
    await passo(falhas, 'notificações da equipe', db.from('user_notifications').delete().in('id', notifs))
    apagou.notificacoes = notifs.length
  }

  // 2. Oportunidades (antes das conversas: a pessoa com card não se apaga).
  const leads = await ids(db.from('leads').select('id').like('name', like))
  if (leads.length) {
    await passo(falhas, 'oportunidades', db.from('leads').delete().in('id', leads))
    apagou.oportunidades = leads.length
  }

  // 3. Conversas, com mensagens, eventos e a pessoa que o gatilho criou.
  const convs = await ids(db.from('conversations').select('id').like('contact_name', like))
  if (convs.length) { await apagarConversas(convs); apagou.conversas = convs.length }

  // 4. Clientes.
  const clientes = await ids(db.from('clients').select('id').like('name', like))
  if (clientes.length) { await apagarClientes(clientes, falhas); apagou.clientes = clientes.length }

  // 5. Caixas de WhatsApp de teste (os vínculos saem em cascata).
  const caixas = await ids(db.from('whatsapp_numbers').select('id').like('label', like))
  if (caixas.length) {
    await passo(falhas, 'caixas de WhatsApp', db.from('whatsapp_numbers').delete().in('id', caixas))
    apagou.caixas = caixas.length
  }

  // 5b. Procedimentos de teste em qualquer rede (os criados pela tela ficam na
  //     rede real; um teste que estoura o tempo não chega ao afterAll — foram
  //     33 acumulados até 2026-09-28). Só os sem agendamento: com agendamento,
  //     quem limpa é a varredura dos agendamentos, na próxima rodada.
  const procs = await ids(db.from('procedures').select('id').like('name', like))
  if (procs.length) {
    const { data: usados } = await db.from('appointments').select('procedure_id').in('procedure_id', procs)
    const presos = new Set(((usados ?? []) as { procedure_id: string }[]).map(u => u.procedure_id))
    const livres = procs.filter(id => !presos.has(id))
    if (livres.length) {
      await passo(falhas, 'eventos dos procedimentos de teste', db.from('domain_events').delete().in('entidade_id', livres))
      await passo(falhas, 'histórico de preço de teste', db.from('procedure_price_history').delete().in('procedure_id', livres))
      await passo(falhas, 'unidades dos procedimentos de teste', db.from('procedure_branch_availability').delete().in('procedure_id', livres))
      await passo(falhas, 'insumos dos procedimentos de teste', db.from('procedure_products').delete().in('procedure_id', livres))
      await passo(falhas, 'preços por unidade de teste', db.from('procedure_branch_pricing').delete().in('procedure_id', livres))
      await passo(falhas, 'procedimentos de teste', db.from('procedures').delete().in('id', livres))
      apagou.procedimentos = livres.length
    }
  }

  // 6. Membros e cargos de teste, e os logins deles.
  const { data: membros } = await db.from('users').select('id, auth_id').like('name', like)
  for (const m of (membros ?? []) as { id: string; auth_id: string | null }[]) {
    await passo(falhas, 'membro', db.from('users').delete().eq('id', m.id))
    if (m.auth_id) {
      const { error } = await db.auth.admin.deleteUser(m.auth_id)
      if (error) falhas.push({ o_que: 'login do membro', erro: error.message })
    }
  }
  if (membros?.length) apagou.membros = membros.length
  const cargos = await ids(db.from('tenant_roles').select('id').like('label', like))
  if (cargos.length) {
    await passo(falhas, 'cargos', db.from('tenant_roles').delete().in('id', cargos))
    apagou.cargos = cargos.length
  }

  // 7. Redes inteiras de teste (a "outra rede" do teste de RLS).
  const redes = await ids(db.from('tenants').select('id').like('name', like))
  for (const rede of redes) {
    // O que prende a unidade e não sai com os clientes: mapas de injetáveis e
    // lançamentos sem cliente (a contra-transação do estorno nasce sem ele).
    await passo(falhas, 'mapas da rede de teste', db.from('injectable_maps').delete().eq('tenant_id', rede))
    const produtos = await ids(db.from('products').select('id').eq('tenant_id', rede))
    if (produtos.length) {
      await passo(falhas, 'lotes da rede de teste', db.from('product_batches').delete().in('product_id', produtos))
      await passo(falhas, 'movimentos da rede de teste', db.from('stock_movements').delete().in('product_id', produtos))
      await passo(falhas, 'saldos da rede de teste', db.from('branch_product_stock').delete().in('product_id', produtos))
      await passo(falhas, 'produtos da rede de teste', db.from('products').delete().in('id', produtos))
    }
    const unidades = await ids(db.from('branches').select('id').eq('tenant_id', rede))
    if (unidades.length) {
      await passo(falhas, 'lançamentos da rede de teste', db.from('financial_transactions').delete().in('branch_id', unidades))
    }
    // Recompensas apontam procedimento e produto: saem antes deles.
    await passo(falhas, 'vouchers da rede de teste', db.from('loyalty_vouchers').delete().eq('tenant_id', rede))
    await passo(falhas, 'recompensas da rede de teste', db.from('loyalty_rewards').delete().eq('tenant_id', rede))
    await passo(falhas, 'procedimentos da rede de teste', db.from('procedures').delete().eq('tenant_id', rede))
    await apagarDocumentosEmitidos(await ids(db.from('issued_documents').select('id').eq('tenant_id', rede)), falhas)
    // Modelos de documento: o procedimento aponta para eles, então saem depois.
    await passo(falhas, 'versões de modelo da rede de teste', db.from('document_template_versions').delete().eq('tenant_id', rede))
    await passo(falhas, 'modelos de documento da rede de teste', db.from('document_templates').delete().eq('tenant_id', rede))
    await passo(falhas, 'unidades da rede de teste', db.from('branches').delete().eq('tenant_id', rede))
    // Membro que o limpar() do teste não levou (rodada interrompida): ele prende a rede.
    await passo(falhas, 'membros da rede de teste', db.from('users').delete().eq('tenant_id', rede))
    await passo(falhas, 'cargos da rede de teste', db.from('tenant_roles').delete().eq('tenant_id', rede))
    await passo(falhas, 'eventos da rede de teste', db.from('domain_events').delete().eq('tenant_id', rede))
    await passo(falhas, 'fidelidade da rede de teste', db.from('loyalty_configs').delete().eq('tenant_id', rede))
    // Oportunidades em lotes até esvaziar (um select só para em 1000), e depois
    // as pessoas, que elas prendem (`on delete restrict`).
    for (let volta = 0; volta < 20; volta++) {
      const lote = await ids(db.from('leads').select('id').eq('tenant_id', rede).limit(300))
      if (lote.length === 0) break
      await passo(falhas, 'histórico da rede de teste', db.from('lead_events').delete().in('lead_id', lote))
      await passo(falhas, 'oportunidades da rede de teste', db.from('leads').delete().in('id', lote))
    }
    await passo(falhas, 'pessoas da rede de teste', db.from('contacts').delete().eq('tenant_id', rede))
    await passo(falhas, 'rede de teste', db.from('tenants').delete().eq('id', rede))
  }
  if (redes.length) apagou.redes = redes.length

  // 8. Logins de teste que sobraram sem dono (o do cliente final não passa por
  //    `users`, e o de um membro cujo `limpar()` não rodou fica aqui também).
  //    Critério estreito: e-mail `e2e-…@bellaris.invalid` — domínio que não
  //    existe, então nunca é de gente de verdade.
  let logins = 0
  for (let pagina = 1; pagina < 50; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) { falhas.push({ o_que: 'listar logins', erro: error.message }); break }
    const deTeste = data.users.filter(u => /^e2e-.*@bellaris\.invalid$/.test(u.email ?? ''))
    for (const u of deTeste) {
      const { error: e } = await db.auth.admin.deleteUser(u.id)
      if (e) falhas.push({ o_que: `login ${u.email}`, erro: e.message })
      else logins++
    }
    if (data.users.length < 200) break
  }
  if (logins) apagou.logins = logins

  return { apagou, falhas }
}
