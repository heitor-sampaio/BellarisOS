import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { registrarVisitaDaRede } from '@estetica-os/nucleo/lib/plataforma/auditoria'
import { diagnosticoDaRede } from '@/lib/plataforma/diagnostico'
import { rotuloDaRede } from '@estetica-os/nucleo/lib/redes/situacao'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { AcoesDoMembro } from '@/components/suporte/acoes-do-membro'
import { EntrarComo } from '@/components/suporte/entrar-como'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * Uma rede, vista pelo suporte: a equipe (com o último uso e as ações que não
 * pedem entrar na conta de ninguém), o plano e o diagnóstico.
 *
 * Abrir esta tela fica registrado — e aparece para a clínica em Configurações
 * → Suporte. Uma vez a cada meia hora por pessoa, para o registro dizer "quem
 * olhou" sem virar um por clique.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const quando = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  : '—'

export default async function RedePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const ctx = await getPlatformContext()
  const { id } = await params
  const { erro } = await searchParams
  if (!UUID.test(id)) notFound()

  const admin = createAdminClient()
  const rede = await ler(admin.from('tenants')
    .select('id, name, slug, email, phone, document, plan_name, plan_status, trial_ends_at, is_active, created_at, onboarding_completed_at')
    .eq('id', id).maybeSingle(), 'buscar a rede') as {
      id: string; name: string; slug: string; email: string | null; phone: string | null; document: string | null
      plan_name: string | null; plan_status: string | null; trial_ends_at: string | null; is_active: boolean
      created_at: string; onboarding_completed_at: string | null
    } | null
  if (!rede) notFound()

  const [unidades, membros, usos, cargos, diagnostico, autorizacoes] = await Promise.all([
    ler(admin.from('branches').select('id, name, slug, is_active').eq('tenant_id', id).order('name'), 'carregar as unidades'),
    ler(admin.from('users').select('id, name, email, is_active, branch_id, role_id, provides_services')
      .eq('tenant_id', id).order('name'), 'carregar a equipe da rede'),
    ler(admin.rpc('suporte_ultimo_uso', { p_tenant: id }), 'carregar o último uso'),
    ler(admin.from('tenant_roles').select('id, label').eq('tenant_id', id), 'carregar os cargos'),
    diagnosticoDaRede(id),
    // As autorizações VIGENTES da clínica: sem uma, ninguém entra na conta.
    ler(admin.from('support_grants').select('target_user_id, expires_at, includes_clinical')
      .eq('tenant_id', id).is('revoked_at', null).gt('expires_at', new Date().toISOString()), 'carregar as autorizações'),
  ])
  const autorizacao = new Map(((autorizacoes ?? []) as { target_user_id: string; expires_at: string; includes_clinical: boolean }[])
    .map(a => [a.target_user_id, a]))
  await registrarVisitaDaRede(ctx, id)

  const nomeDaUnidade = new Map(((unidades ?? []) as { id: string; name: string }[]).map(u => [u.id, u.name]))
  const nomeDoCargo   = new Map(((cargos ?? []) as { id: string; label: string }[]).map(c => [c.id, c.label]))
  const ultimoUso     = new Map(((usos ?? []) as { user_id: string; ultimo_uso: string | null }[]).map(u => [u.user_id, u.ultimo_uso]))
  const equipe = (membros ?? []) as {
    id: string; name: string; email: string; is_active: boolean; branch_id: string | null; role_id: string | null; provides_services: boolean
  }[]

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <Link href="/redes" className="suporte-voltar">← Redes</Link>
          <h1 className="suporte-titulo">{rede.name}</h1>
          <p className="suporte-sub">
            {rede.slug}{rede.email ? ` · ${rede.email}` : ''}{rede.phone ? ` · ${rede.phone}` : ''}
            {' · '}desde {quando(rede.created_at)}
            {!rede.onboarding_completed_at && ' · cadastro inicial não concluído'}
          </p>
        </div>
        <span className="chip suporte-chip">{rotuloDaRede({ ativa: rede.is_active, planStatus: rede.plan_status })}</span>
      </div>

      {erro && <p className="suporte-erro" role="alert">{erro}</p>}

      {/* A assinatura se administra no sistema (outro host); aqui, só para saber. */}
      <section className="card suporte-secao">
        <h2 className="overline">Assinatura</h2>
        <p className="suporte-texto">
          {rotuloDaRede({ ativa: rede.is_active, planStatus: rede.plan_status })}
          {rede.plan_name ? ` · ${rede.plan_name}` : ''}
          {rede.trial_ends_at ? ` · teste até ${quando(rede.trial_ends_at)}` : ''}
        </p>
        {ctx.ehAdmin && <a href={`${urlDoHost('sistema')}/redes/${rede.id}`} className="suporte-voltar">Administrar no Sistema →</a>}
      </section>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 className="overline suporte-secao-titulo">Equipe ({equipe.length})</h2>
        <table className="cards-mobile suporte-tabela">
          <thead>
            <tr><th>Membro</th><th>Cargo</th><th>Unidade</th><th>Situação</th><th>Último uso</th><th></th></tr>
          </thead>
          <tbody>
            {equipe.map(m => (
              <tr key={m.id}>
                <td data-label="">
                  <span className="suporte-link-forte">{m.name}</span>
                  <span className="suporte-texto-fraco"> · {m.email}</span>
                </td>
                <td data-label="Cargo" data-par>{(m.role_id && nomeDoCargo.get(m.role_id)) || '—'}</td>
                <td data-label="Unidade" data-par>{m.branch_id ? (nomeDaUnidade.get(m.branch_id) ?? '—') : 'Rede inteira'}</td>
                <td data-label="Situação" data-par>{m.is_active ? 'Ativo' : 'Desativado'}</td>
                <td data-label="Último uso" data-par>{quando(ultimoUso.get(m.id) ?? null)}</td>
                <td data-label="">
                  <div className="suporte-pilha">
                    {m.is_active && autorizacao.get(m.id) ? (
                      <EntrarComo
                        tenantId={rede.id} userId={m.id} nome={m.name}
                        expiraEm={autorizacao.get(m.id)!.expires_at} clinico={autorizacao.get(m.id)!.includes_clinical}
                      />
                    ) : m.is_active && (
                      <span className="suporte-texto-fraco">Sem autorização da clínica para entrar</span>
                    )}
                    <AcoesDoMembro tenantId={rede.id} userId={m.id} ativo={m.is_active} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card suporte-secao">
        <h2 className="overline">Unidades</h2>
        <ul className="suporte-lista">
          {((unidades ?? []) as { id: string; name: string; slug: string; is_active: boolean }[]).map(u => (
            <li key={u.id}>{u.name} <span className="suporte-texto-fraco">· {u.slug}{u.is_active ? '' : ' · desativada'}</span></li>
          ))}
        </ul>
      </section>

      <section className="card suporte-secao">
        <h2 className="overline">Diagnóstico</h2>
        <div className="suporte-grade">
          <div>
            <h3 className="suporte-subtitulo">Caixas de WhatsApp</h3>
            {diagnostico.caixas.length === 0 ? <p className="suporte-texto-fraco">Nenhuma caixa.</p> : (
              <ul className="suporte-lista">
                {diagnostico.caixas.map(c => (
                  <li key={c.id}>
                    <strong>{c.label}</strong> · {c.provider}{c.isDefault ? ' · padrão' : ''}
                    {' · '}<span className={c.isActive ? 'suporte-ok' : 'suporte-alerta'}>{c.isActive ? 'ativa' : 'inativa'}</span>
                    {c.phone && <span className="suporte-texto-fraco"> · {c.phone}</span>}
                    {Object.entries(c.estado).map(([k, v]) => (
                      <span key={k} className="suporte-texto-fraco"> · {k}: {v}</span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="suporte-subtitulo">Integrações</h3>
            {diagnostico.integracoes.length === 0 ? <p className="suporte-texto-fraco">Nenhuma integração.</p> : (
              <ul className="suporte-lista">
                {diagnostico.integracoes.map(i => (
                  <li key={i.provider}>
                    <strong>{i.provider}</strong> · <span className={i.isActive ? 'suporte-ok' : 'suporte-alerta'}>{i.isActive ? 'ativa' : 'inativa'}</span>
                    <span className="suporte-texto-fraco"> · atualizada {quando(i.atualizadaEm)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="suporte-subtitulo">Automações com falha</h3>
            {diagnostico.falhas.length === 0 ? <p className="suporte-texto-fraco">Nenhuma falha.</p> : (
              <ul className="suporte-lista">
                {diagnostico.falhas.map(f => (
                  <li key={f.id}>
                    <strong>{f.automacao}</strong> <span className="suporte-texto-fraco">· {quando(f.em)} · {f.tentativas} tentativa(s)</span>
                    {f.erro && <div className="suporte-alerta">{f.erro}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="suporte-subtitulo">Pedidos de LGPD</h3>
            {diagnostico.lgpd.length === 0 ? <p className="suporte-texto-fraco">Nenhum pedido.</p> : (
              <ul className="suporte-lista">
                {diagnostico.lgpd.map(l => <li key={l.status}>{l.status}: <strong>{l.quantos}</strong></li>)}
              </ul>
            )}
          </div>
        </div>
        <h3 className="suporte-subtitulo">Eventos recentes</h3>
        {diagnostico.eventos.length === 0 ? <p className="suporte-texto-fraco">Nenhum evento nos últimos 30 dias.</p> : (
          <ul className="suporte-lista suporte-lista-densa">
            {diagnostico.eventos.map((e, i) => (
              <li key={i}>
                <code>{e.nome}</code>
                <span className="suporte-texto-fraco"> · {quando(e.em)} · {e.atorNome ?? e.origem}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
