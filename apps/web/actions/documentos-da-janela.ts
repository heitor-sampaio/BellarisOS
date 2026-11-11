'use server'

import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade, ownerFilter, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { documentosDoAgendamento, rotuloDoQueFalta } from '@/lib/documentos/leitura'
import { valoresDoDocumento, type DadosDoDocumento } from '@/lib/documentos/valores'
import { variavelObrigatoria } from '@/lib/documentos/variaveis'
import { ehMenorDeIdade } from '@/lib/clients/menor'

/**
 * Os termos e contratos de um agendamento, para a JANELA da agenda (A34 da 6ª
 * simulação, 2026-11-04): a janela não dizia se o termo que bloqueia o início
 * estava assinado — só a sessão dizia. Só o título, a situação e se bloqueia
 * (nada do conteúdo); o agendamento da rede, ao alcance da unidade e, com a
 * agenda "só os meus", dela.
 */
export interface DocumentoDaJanela {
  id: string; titulo: string; situacao: string; bloqueia: boolean; assinado: boolean
  /**
   * Quem tem os Termos em Gerenciar colhe daqui (A23 da 9ª simulação: o termo
   * que bloqueia não tinha caminho na janela — era Clientes → Documentos →
   * Colher assinatura). Só no que falta assinar, com o documento pronto.
   */
  podeColher: boolean
  /** A8 da 11ª: o link de assinatura também daqui (o documento pronto, PENDENTE). */
  podeEnviarLink: boolean
  /** Há um link valendo, até quando. */
  linkAte: string | null
  /**
   * A9 da 11ª: o que falta no cadastro, dito na janela ("Faltam dados do
   * cadastro: CPF") — só se via na tela do atendimento. Sem "Cliente · ".
   */
  faltando: string[]
  /** A ficha da cliente, para "Completar o cadastro" (quem edita Clientes). */
  clienteId: string | null
  podeCompletar: boolean
}

/** "Cliente · CPF" → "CPF"; "Pagamento · …" → "o pagamento do contrato" (uma vez). */
function oQueFalta(faltando: string[]): string[] {
  const saida: string[] = []
  for (const f of faltando) {
    const t = f.startsWith('Pagamento ·') ? 'o pagamento do contrato' : f.replace(/^Cliente · /, '')
    if (!saida.includes(t)) saida.push(t)
  }
  return saida
}

const SITUACAO: Record<string, string> = {
  ASSINADO: 'Assinado', DISPENSADO: 'Dispensado', PENDENTE: 'Falta assinar', INCOMPLETO: 'Faltam dados do cadastro', A_GERAR: 'Em preparação',
}

export async function documentosDaJanela(appointmentId: string): Promise<DocumentoDaJanela[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  if (!z.string().uuid().safeParse(appointmentId).success) return []
  const ap = await ler(createAdminClient().from('appointments').select('id, branch_id, client_id, professional_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as
    { id: string; branch_id: string; client_id: string | null; professional_id: string | null } | null
  if (!ap || !alcancaUnidade(ctx, ap.branch_id)) return []
  const dono = ownerFilter(ctx, 'agenda')
  if (dono && ap.professional_id !== dono) return []
  const docs = await documentosDoAgendamento(ctx.tenantId!, ap.id)
  const colhe = can(ctx, 'documents', 'MANAGE')
  const completa = can(ctx, 'clients', 'MANAGE')
  return docs.map(d => {
    const faltando = d.status === 'INCOMPLETO' ? oQueFalta(d.faltando) : []
    return {
      id: d.id, titulo: d.titulo,
      situacao: faltando.length ? `Faltam dados: ${faltando.join(', ')}` : (SITUACAO[d.status] ?? d.status),
      bloqueia: d.exigencia === 'BLOQUEIA', assinado: d.status === 'ASSINADO' || d.status === 'DISPENSADO',
      podeColher: colhe && (d.status === 'PENDENTE' || d.status === 'A_GERAR'),
      podeEnviarLink: colhe && d.status === 'PENDENTE',
      linkAte: d.linkAte,
      faltando,
      clienteId: ap.client_id,
      podeCompletar: completa && faltando.some(f => f !== 'o pagamento do contrato'),
    }
  })
}

export interface FaltaNoCadastroDoTermo {
  titulo:   string
  bloqueia: boolean
  /** "Data de nascimento", "CPF" — sem "Cliente · ". */
  faltando: string[]
}

/**
 * A17 da 12ª simulação (2026-11-11; princípio 3): o termo do Peeling só dizia
 * "Faltam dados: Data de nascimento" DEPOIS de agendado — a F55 (A9 da 11ª)
 * levou o aviso à janela do agendamento, não ao Agendar. Aqui, antes de agendar:
 * os modelos ligados ao procedimento (o termo e o contrato), as variáveis do
 * CADASTRO (cliente e responsável) obrigatórias que a ficha não tem — a mesma
 * régua da montagem (`variavelObrigatoria`, `valoresDoDocumento`). Só avisa
 * (princípio 2): o agendamento segue. Acessório: falhou, sem aviso.
 */
export async function faltaNoCadastroAoAgendar(clientId: string, procedureId: string): Promise<{
  termos: FaltaNoCadastroDoTermo[]; podeCompletar: boolean
} | null> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    if (!z.string().uuid().safeParse(clientId).success || !z.string().uuid().safeParse(procedureId).success) return null
    const admin = createAdminClient()
    const [proc, cli] = await Promise.all([
      ler(admin.from('procedures').select('consent_template_id, contract_template_id')
        .eq('id', procedureId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar os modelos do procedimento') as
        Promise<{ consent_template_id: string | null; contract_template_id: string | null } | null>,
      ler(admin.from('clients')
        .select('name, document, documento_tipo, documento_numero, birth_date, phone, email, zip_code, address, address_number, address_complement, neighborhood, city, state, gender, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone')
        .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cadastro da cliente'),
    ])
    const ids = [proc?.consent_template_id, proc?.contract_template_id].filter((x): x is string => !!x)
    if (!cli || !ids.length) return null
    const [modelos, versoes] = await Promise.all([
      ler(admin.from('document_templates').select('id, name, enforcement, current_version')
        .in('id', ids).eq('tenant_id', ctx.tenantId!).eq('is_active', true), 'buscar os modelos') as
        Promise<{ id: string; name: string; enforcement: string; current_version: number }[] | null>,
      ler(admin.from('document_template_versions').select('template_id, version, variables')
        .in('template_id', ids).eq('tenant_id', ctx.tenantId!), 'buscar as versões dos modelos') as
        Promise<{ template_id: string; version: number; variables: string[] | null }[] | null>,
    ])
    const valores = valoresDoDocumento({
      agora: new Date(), cliente: cli as DadosDoDocumento['cliente'],
      rede: { name: null, document: null, phone: null, email: null }, unidade: null, procedimento: null, agendamento: null, pagamento: null,
    } as DadosDoDocumento)
    const menor = ehMenorDeIdade((cli as { birth_date: string | null }).birth_date)
    const termos: FaltaNoCadastroDoTermo[] = []
    for (const m of modelos ?? []) {
      const versao = (versoes ?? []).find(v => v.template_id === m.id && v.version === m.current_version)
      const faltam = (versao?.variables ?? [])
        .filter(v => /^(cliente|responsavel)\./.test(v) && variavelObrigatoria(v, { menor }) && !valores[v])
      if (faltam.length) termos.push({ titulo: m.name, bloqueia: m.enforcement === 'BLOQUEIA', faltando: oQueFalta(faltam.map(rotuloDoQueFalta)) })
    }
    return termos.length ? { termos, podeCompletar: can(ctx, 'clients', 'MANAGE') } : null
  } catch (e) {
    console.error('[agenda] o que falta no cadastro para os termos:', e instanceof Error ? e.message : e)
    return null
  }
}
