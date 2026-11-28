import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileSignature, Sparkles } from 'lucide-react'
import { formatBRL, formatDate, formatDia } from '@estetica-os/utils'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { fusoValido } from '@/lib/unidades/fuso'
import { getFinanceiroDoPlano } from '@/lib/metrics/plano'
import { documentosDoPlanoNoPortal } from '@/lib/documentos/leitura'
import { situacaoDaSessaoNoApp, rotaDoAgendarDaSessaoNoApp } from '@/lib/plano-de-tratamento/sessao-no-app'
import { nomeDaSessao, nomeDoPlanoNoApp, descontoDoPlanoNoApp } from '@/lib/plano-de-tratamento/nome'
import { combinadoDoPlano, totalComOCombinado } from '@/lib/plano-de-tratamento/desconto-combinado'
import { propostaVencida, validoAteDaProposta, avisoDaPropostaVencida } from '@/lib/plano-de-tratamento/validade'
import { quemMarcaAsSessoes } from '@/lib/plano-de-tratamento/textos'
import { falaDaRedeDoPortal } from '@/lib/clientes/nome-da-rede'
import { redeTemContratoDePlano } from '@/lib/documentos/plano'
import { avisoDoContratoDoPlanoNoApp, textoDoPlanoAceitoNoApp, textoDaSessaoAAgendarNoApp } from '@/lib/clientes/textos-do-app'
import { AceitarPlano } from '@/components/client-portal/aceitar-plano'

type Sessao = {
  id: string
  sort_order: number | null
  appointments: { status: string; scheduled_at: string; completed_at: string | null } | null
  treatment_plan_session_procedures: { price: number | string | null; sort_order: number | null; procedures: { id: string; name: string; is_active: boolean } | null }[]
}

/**
 * Portal da cliente → o plano de tratamento (PT1b e PT3, a revisão do Heitor
 * de 2026-11-13). O PROPOSTO ela analisa e aceita ("A cliente recebe o plano
 * no app, analisa e aceita"); o ACEITO ela acompanha por inteiro — as sessões
 * (feitas, agendadas, a agendar, com o "Agendar" da que está em aberto), os
 * pagamentos e os documentos.
 *
 * Só o plano DELA (a ficha da rede do endereço, `ctx.clientId`); o de outra
 * cliente, o rascunho e o cancelado são "não encontrado". Nada clínico: a
 * anotação da profissional não sai do servidor.
 */
export default async function PlanoDaClientePage({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ aceito?: string }>
}) {
  const [{ slug, id }, { aceito }] = await Promise.all([params, searchParams])
  idOu404(id)
  const ctx = await getTenantContext()
  assertClient(ctx)
  const admin = createAdminClient()

  const cliente = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).maybeSingle(),
    'buscar o cadastro') as { tenant_id: string } | null
  if (!cliente) notFound()

  const plano = await ler(admin.from('treatment_plans')
    .select('id, status, name, desconto, desconto_combinado_tipo, desconto_combinado_valor, created_at, branches!inner(tenant_id, slug, is_active), treatment_plan_sessions(id, sort_order, appointments!treatment_plan_sessions_appointment_id_fkey(status, scheduled_at, completed_at), treatment_plan_session_procedures(price, sort_order, procedures(id, name, is_active)))')
    .eq('id', id).eq('client_id', ctx.clientId!).eq('branches.tenant_id', cliente.tenant_id)
    .in('status', ['PROPOSED', 'ACCEPTED', 'COMPLETED'])
    .maybeSingle(), 'buscar o plano') as {
      id: string; status: 'PROPOSED' | 'ACCEPTED' | 'COMPLETED'; name: string | null; desconto: number | null; created_at: string
      desconto_combinado_tipo: string | null; desconto_combinado_valor: number | string | null
      /** D6 da 42ª: a unidade DO plano — o "Agendar" da sessão abre nela. */
      branches: { tenant_id: string; slug: string; is_active: boolean } | null
      treatment_plan_sessions: Sessao[]
    } | null
  if (!plano) notFound()

  const unidade = await ler(admin.from('branches').select('fuso').eq('slug', slug).maybeSingle(),
    'buscar o fuso da unidade') as { fuso: string | null } | null
  const fuso = fusoValido(unidade?.fuso)

  const sessoes = [...(plano.treatment_plan_sessions ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const procsDa = (s: Sessao) => [...(s.treatment_plan_session_procedures ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const precoDa = (s: Sessao) => procsDa(s).reduce((t, p) => t + Math.round(Number(p.price ?? 0) * 100), 0) / 100
  const proposto = plano.status === 'PROPOSED'

  const [validade, financeiro, documentos, redeTemContrato] = await Promise.all([
    proposto
      ? ler(admin.from('tenants').select('plano_validade_dias').eq('id', cliente.tenant_id).maybeSingle(), 'ler a validade do plano proposto')
          .then(t => Number((t as { plano_validade_dias?: number | null } | null)?.plano_validade_dias ?? 30))
      : Promise.resolve(30),
    proposto ? Promise.resolve(null) : getFinanceiroDoPlano(cliente.tenant_id, plano.id),
    proposto ? Promise.resolve([]) : documentosDoPlanoNoPortal(cliente.tenant_id, ctx.clientId!, plano.id),
    proposto ? Promise.resolve(false) : redeTemContratoDePlano(cliente.tenant_id),
  ])
  // A35 da 21ª: o contrato de plano nasce no PDV, com o pagamento (PT1c) — a cliente fica sabendo.
  const avisoDoContrato = avisoDoContratoDoPlanoNoApp({
    status: plano.status, tipos: documentos.map(d => d.tipo), recebido: (financeiro?.lancamentos.length ?? 0) > 0, redeTemContrato,
  })
  const valor = sessoes.reduce((t, s) => t + Math.round(precoDa(s) * 100), 0) / 100
  // 22ª A20 (princípio 3): o desconto do plano combinado com a equipe — a
  // cliente aceita vendo o total com ele. Aceito, ele já está nos preços
  // (`plano_aceitar` o aplica), e o desconto dito é o aplicado (`plano.desconto`).
  const combinado = proposto ? totalComOCombinado(valor, combinadoDoPlano(plano)) : { reais: 0, total: valor }
  const vencido = proposto && propostaVencida(plano.created_at, validade)
  const diaDaValidade = validoAteDaProposta(plano.created_at, validade).toLocaleDateString('pt-BR', { timeZone: fuso })
  // CA1: o aviso do vencido diz o nome da rede.
  const fala = await falaDaRedeDoPortal(slug)

  // PT3: a sessão em aberto do plano aceito se agenda pelo app, mesmo de
  // procedimento fora do "Permitir auto agendamento" (`agendavelPeloApp`);
  // só o procedimento inativo fica com a equipe.
  const linhas = sessoes.map((s, i) => {
    const sit = situacaoDaSessaoNoApp(s.appointments, fuso)
    const principal = procsDa(s)[0]?.procedures ?? null
    const peloApp = plano.status === 'ACCEPTED' && sit.aAgendar && !!principal?.is_active
    return { s, numero: i + 1, sit, principal, peloApp }
  })
  const quemMarca = plano.status === 'ACCEPTED'
    ? quemMarcaAsSessoes(linhas.filter(l => l.sit.aAgendar && !l.peloApp).map(l => ({ numero: l.numero, peloApp: false })))
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link href={`/${slug}/cliente/home`} prefetch={false}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
        <ChevronLeft size={15} aria-hidden="true" /> Início
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Sparkles size={18} color="var(--brand)" aria-hidden="true" style={{ marginTop: 6, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.025em', overflowWrap: 'anywhere' }}>
            {nomeDoPlanoNoApp(plano.name)}
          </h1>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            {proposto ? 'Proposto' : plano.status === 'COMPLETED' ? 'Concluído' : 'Aceito'} · {sessoes.length} {sessoes.length === 1 ? 'sessão' : 'sessões'} · {formatBRL(combinado.total)}
            {descontoDoPlanoNoApp(combinado.reais || plano.desconto) ? ` · ${descontoDoPlanoNoApp(combinado.reais || plano.desconto)}` : ''}
          </p>
        </div>
      </div>

      {aceito === '1' && plano.status === 'ACCEPTED' && (
        <div data-plano-aceito-no-app className="card-brand" style={{ padding: '14px 18px', borderRadius: 'var(--radius-card-token)', display: 'flex', gap: 10 }}>
          <CheckCircle2 size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 'var(--weight-extrabold)' }}>Plano aceito!</p>
            <p style={{ fontSize: 'var(--text-sm-sz)', marginTop: 2 }}>
              {/* A39 da 22ª: o mesmo que o cartão do contrato, logo abaixo. */}
              {textoDoPlanoAceitoNoApp({ contratoNoPagamento: !!avisoDoContrato, temDocumentos: documentos.length > 0 })}
            </p>
          </div>
        </div>
      )}

      <section aria-label="Sessões" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="overline">Sessões</p>
        <ol className="card" style={{ listStyle: 'none', margin: 0, padding: '6px 18px' }}>
          {linhas.map(({ s, numero, sit, principal, peloApp }) => (
            <li key={s.id} data-sessao-do-plano={numero}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: numero > 1 ? '1px solid var(--hairline)' : undefined }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', overflowWrap: 'anywhere' }}>
                  <b style={{ color: 'var(--text-faint)' }}>Sessão {numero}</b>{' '}
                  {nomeDaSessao(s.treatment_plan_session_procedures) ?? '—'}
                </span>
                <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: proposto ? 'var(--text-muted)' : sit.cor }}>
                  {/* PO-11 (D19 da 31ª): a sessão a agendar diz quem marca, como no cartão do início. */}
                  {proposto ? formatBRL(precoDa(s)) : plano.status === 'ACCEPTED' && sit.aAgendar ? textoDaSessaoAAgendarNoApp(peloApp) : sit.texto}
                </span>
              </div>
              {peloApp && principal && (
                <Link href={rotaDoAgendarDaSessaoNoApp(slug, plano.branches, principal.id)} prefetch={false} className="btn-secondary"
                  style={{ flexShrink: 0 }}>
                  <CalendarDays size={14} aria-hidden="true" /> Agendar
                </Link>
              )}
            </li>
          ))}
        </ol>
        {quemMarca.length > 0 && (
          <div data-quem-marca-a-sessao style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            {quemMarca.map(l => <p key={l}>{l}</p>)}
          </div>
        )}
      </section>

      {proposto && (
        <section aria-label="Aceitar" className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Valor do plano</span>
            <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>{formatBRL(combinado.total)}</span>
          </div>
          {combinado.reais > 0 && (
            <p data-desconto-combinado style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: -6 }}>
              {formatBRL(valor)} com desconto de {formatBRL(combinado.reais)}
            </p>
          )}
          {/* A validade é só informação (princípio 2, 2026-11-18): o vencido avisa e se aceita. */}
          {vencido ? (
            <p data-proposta-vencida style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>
              {avisoDaPropostaVencida(diaDaValidade, fala)}
            </p>
          ) : (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Válido até {diaDaValidade}.</p>
          )}
          <AceitarPlano slug={slug} planId={plano.id} />
        </section>
      )}

      {financeiro && (
        <section aria-label="Pagamentos" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="overline">Pagamentos</p>
          <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* A35 da 15ª (princípio 3): sem nada combinado, "Pago R$ 0,00 / A pagar R$ 0,00"
                num plano de R$ 3.490 dizia que não havia o que pagar — diz o valor, a combinar. */}
            {financeiro.lancamentos.length === 0 ? (
              <p data-plano-a-combinar style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
                {formatBRL(combinado.total)}{combinado.reais > 0 ? ` (com desconto de ${formatBRL(combinado.reais)})` : ''}, a combinar na unidade
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
                <span style={{ color: 'var(--text)' }}>Pago {formatBRL(financeiro.recebido)}</span>
                <span style={{ color: financeiro.aReceber > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>A pagar {formatBRL(financeiro.aReceber)}</span>
              </div>
            )}
            {financeiro.lancamentos.length === 0 ? null : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                {financeiro.lancamentos.map((l, i) => (
                  <li key={l.id} data-pagamento-do-plano
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--hairline)' : undefined, fontSize: 'var(--text-sm-sz)' }}>
                    <span style={{ color: 'var(--text-soft)', minWidth: 0, overflowWrap: 'anywhere' }}>
                      {l.parcelaNumero && l.parcelaTotal ? `Parcela ${l.parcelaNumero} de ${l.parcelaTotal}` : (l.descricao ?? 'Pagamento')}
                      <span style={{ display: 'block', fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: l.pago ? 'var(--success)' : 'var(--text-muted)' }}>
                        {l.pago
                          ? `Pago${l.pagoEm ? ` em ${formatDate(l.pagoEm, fuso)}` : ''}`
                          : `A pagar${l.vencimento ? ` · vence em ${formatDia(l.vencimento)}` : ''}`}
                      </span>
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{formatBRL(l.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {!proposto && (
        <section aria-label="Documentos" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="overline">Documentos</p>
          {avisoDoContrato && (
            <div className="card" data-contrato-no-pagamento style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileSignature size={17} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>{avisoDoContrato}</p>
            </div>
          )}
          {documentos.length === 0 ? (avisoDoContrato ? null : (
            <div className="card" style={{ padding: '14px 18px' }}>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum documento neste plano.</p>
            </div>
          )) : documentos.map(d => (
            <Link key={d.id} href={`/${slug}/cliente/documentos/${d.id}`} prefetch={false} data-documento-do-plano className="card"
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
              <FileSignature size={17} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)', fontSize: 'var(--text-sm-sz)', overflowWrap: 'anywhere' }}>{d.titulo}</p>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: d.status === 'ASSINADO' ? 'var(--success)' : 'var(--brand)' }}>
                  {d.status === 'ASSINADO'
                    ? `Assinado${d.assinadoEm ? ` em ${formatDate(d.assinadoEm, fuso)}` : ''}`
                    : d.status === 'INCOMPLETO' ? 'Em preparação pela equipe' : 'Para assinar quando quiser'}
                </p>
              </div>
              <ChevronRight size={16} color="var(--text-faint)" aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
