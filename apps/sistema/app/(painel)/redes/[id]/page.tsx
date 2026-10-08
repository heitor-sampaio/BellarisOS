import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { registrarVisitaDaRede, ROTULO_DO_REGISTRO, type TipoDeRegistroDaPlataforma } from '@estetica-os/nucleo/lib/plataforma/auditoria'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { lerAssinatura } from '@estetica-os/nucleo/lib/redes/assinatura'
import { usoDoCopilot, descreverUsoDoCopilot } from '@estetica-os/nucleo/lib/planos/uso-do-copilot'
import { configDoAsaas } from '@/lib/asaas/cliente'
import { SituacaoDaRede } from '@/components/sistema/situacao-da-rede'
import { BlocosDaRede } from '@/components/sistema/blocos-da-rede'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * Uma rede, para ADMINISTRAR: os dados, a assinatura (plano, valor, teste,
 * cobrança no Asaas, faturas), o acesso (desligar/religar) e a equipe. Abrir
 * fica registrado, como no suporte.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const quando = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  : '—'

export default async function RedeDoSistemaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformContext({ verSistema: true })
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const a = await lerAssinatura(id)
  if (!a) notFound()

  const admin = createAdminClient()
  const [planos, membros, cargos, registros, copilot] = await Promise.all([
    ler(admin.from('platform_plans').select('id, nome, valor_centavos, ativo').order('ordem').order('nome'), 'carregar os planos'),
    ler(admin.from('users').select('id, name, email, is_active, branch_id, role_id').eq('tenant_id', id).order('name'), 'carregar a equipe da rede'),
    ler(admin.from('tenant_roles').select('id, label').eq('tenant_id', id), 'carregar os cargos'),
    ler(admin.from('platform_audit_log').select('id, kind, at, platform_staff(name)').eq('tenant_id', id)
      .order('at', { ascending: false }).limit(15), 'carregar o registro da rede'),
    // O consumo do Copilot no mês (só quando o plano o inclui).
    a.assinatura?.recursos && (a.assinatura.recursos.funcionalidades.includes('copilot') || a.assinatura.adicionais.copilot)
      ? usoDoCopilot(admin, id, a.assinatura.recursos).then(descreverUsoDoCopilot)
      : Promise.resolve(null),
  ])
  await registrarVisitaDaRede(ctx, id)
  const nomeDoCargo = new Map(((cargos ?? []) as { id: string; label: string }[]).map(c => [c.id, c.label]))
  const asaas = configDoAsaas()
  const listaDePlanos = ((planos ?? []) as { id: string; nome: string; valor_centavos: number; ativo: boolean }[])
    .map(p => ({ id: p.id, nome: p.nome, valorCentavos: p.valor_centavos, ativo: p.ativo }))

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <Link href="/redes" className="suporte-voltar">← Redes</Link>
          <h1 className="suporte-titulo">{a.rede.nome}</h1>
          <p className="suporte-sub">desde {quando(a.rede.createdAt)}{ctx.podeEditar && <> · <a href={`${urlDoHost('suporte')}/redes/${id}`} className="suporte-voltar">ver no suporte (diagnóstico, membros, entrar como)</a></>}</p>
        </div>
        <SituacaoDaRede ativa={a.rede.ativa} planStatus={a.rede.planStatus} />
      </div>

      {/* Em blocos de leitura; cada um abre o modal do que edita (2026-10-07). O Gerente vê travado. */}
      <fieldset className="sistema-leitura" disabled={!ctx.podeEditar}>
        <BlocosDaRede
          tenantId={id}
          rede={{
            planStatus: a.rede.planStatus, trialEndsAt: a.rede.trialEndsAt, emAtrasoDesde: a.rede.emAtrasoDesde,
            temDocumento: !!a.rede.documento, ativa: a.rede.ativa, desligadaMotivo: a.rede.desligadaMotivo,
          }}
          dados={{ nome: a.rede.nome, documento: a.rede.documento ?? '', email: a.rede.email, telefone: a.rede.telefone ?? '' }}
          assinatura={a.assinatura}
          nomeDoPlano={a.assinatura?.planoId ? (listaDePlanos.find(p => p.id === a.assinatura!.planoId)?.nome ?? a.rede.planName) : null}
          faturas={a.faturas}
          planos={listaDePlanos}
          asaasPronto={asaas.temChave}
          copilot={copilot}
        />
      </fieldset>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 className="overline suporte-secao-titulo">Equipe ({(membros ?? []).length})</h2>
        <table className="cards-mobile suporte-tabela">
          <thead><tr><th>Membro</th><th>Cargo</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {((membros ?? []) as { id: string; name: string; email: string; is_active: boolean; branch_id: string | null; role_id: string | null }[]).map(m => (
              <tr key={m.id}>
                <td data-label=""><span className="suporte-link-forte">{m.name}</span><span className="suporte-texto-fraco"> · {m.email}</span></td>
                <td data-label="Cargo" data-par>{(m.role_id && nomeDoCargo.get(m.role_id)) || '—'}{m.branch_id ? '' : ' · rede'}</td>
                <td data-label="Situação" data-par>{m.is_active ? 'Ativo' : 'Desativado'}</td>
                {/* Reenviar acesso e reativar são atendimento: moram no suporte (link acima). */}
                <td data-label=""></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card suporte-secao">
        <h2 className="overline">Registro</h2>
        {(registros ?? []).length === 0 ? <p className="suporte-texto-fraco">Nada registrado.</p> : (
          <ul className="suporte-lista suporte-lista-densa">
            {((registros ?? []) as unknown as { id: string; kind: TipoDeRegistroDaPlataforma; at: string; platform_staff: { name: string } | null }[]).map(r => (
              <li key={r.id}>{ROTULO_DO_REGISTRO[r.kind] ?? r.kind}
                <span className="suporte-texto-fraco"> · {quando(r.at)} · {r.platform_staff?.name ?? 'automático'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
