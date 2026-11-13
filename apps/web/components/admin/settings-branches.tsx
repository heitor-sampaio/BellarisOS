import { createClient } from '@/lib/supabase/server'
import { DesativarUnidade } from '@/components/admin/desativar-unidade'
import { oQueFicaNaUnidade, resumoDoQueFica, temOQueFicou, NADA_FICA, type OQueFicaNaUnidade } from '@/lib/unidades/desativar'
import { CaminhosDoQueFicou } from '@/components/admin/o-que-ficou'
import { getTenantContext } from '@/lib/auth'
import { BranchForm } from '@/components/admin/branch-form'
import { toggleBranchStatus } from '@/actions/branches'
import { origemDoApp, enderecoDoAppDaCliente } from '@/lib/unidades/app-da-cliente'
import { MapPin, Mail, Phone, Power, PowerOff, ChevronRight } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import Link from 'next/link'
import { ler } from '@/lib/db'
import { maskPhone } from '@estetica-os/utils'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
import { createAdminClient } from '@/lib/supabase/admin'
import { SalasDaUnidade, type SalaDaUnidade } from '@/components/admin/salas-da-unidade'

export async function SettingsBranches() {
  const ctx = await getTenantContext()
  const supabase = await createClient()
  // Quantos atendem em cada unidade (o "Atende" por unidade, decisão 2 da 8ª):
  // a unidade nova nasce sem ninguém marcado (princípio 6), e o cartão diz.
  // Em paralelo com o resto: a página não pode demorar mais (o #salas do link).
  const lendoOndeAtendem = ler(createAdminClient().from('users').select('atende_em')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true).eq('provides_services', true), 'carregar onde a equipe atende')

  const branches = await ler(supabase
    .from('branches')
    .select(`
      id, name, slug, email, phone, city, state, is_active, created_at,
      users(id)
    `)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: true }), 'carregar as unidades')

  // O endereço do app da cliente de cada unidade (A4): é este que se dá a ela.
  const origem = await origemDoApp()

  const total    = branches?.length ?? 0
  const active   = branches?.filter(b => b.is_active).length ?? 0
  const inactive = total - active

  // A clínica de UMA unidade tem as salas aqui mesmo, a um clique do menu (A3
  // da 5ª simulação: o caminho era Ver detalhes → o fim da página). Com duas ou
  // mais, as salas são de cada unidade, no "Ver detalhes" dela.
  const umaUnidade = await redeTemUmaUnidade(ctx.tenantId!)
  const ondeAtendem = ((await lendoOndeAtendem) ?? []).flatMap(u => (u.atende_em as string[] | null) ?? [])
  const quantosAtendem = (id: string) => ondeAtendem.filter(u => u === id).length
  const unica = umaUnidade ? (branches ?? []).find(b => b.is_active) ?? null : null
  // O que fica para trás em cada unidade (C67, F70; F72): a janela de desativar
  // diz, e o cartão da desativada continua dizendo, com os caminhos.
  const ativas = (branches ?? []).filter(b => b.is_active)
  const oQueFica = new Map<string, OQueFicaNaUnidade>(await Promise.all(
    (branches ?? []).map(async b => [b.id, await oQueFicaNaUnidade(createAdminClient(), ctx.tenantId!, b.id)] as const)))
  const salasDaUnica = unica
    ? ((await ler(createAdminClient().from('rooms').select('id, name, is_active')
        .eq('branch_id', unica.id).order('name'), 'carregar as salas')) ?? []) as SalaDaUnidade[]
    : null

  return (
    <div>
      <RealtimeRefresher tables={['branches']} />

      {/* Header da seção */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{
            fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
            color: 'var(--text)',
          }}>
            Unidades
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
            {/* A clínica de uma unidade não fala "rede" (F8). */}
            {umaUnidade ? 'A unidade da clínica e as salas dela' : 'Gerencie as unidades da rede'}
          </p>
        </div>
        <BranchForm />
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total',    value: total,    chip: 'chip chip-muted'    },
          { label: 'Ativas',   value: active,   chip: 'chip chip-success'  },
          { label: 'Inativas', value: inactive, chip: 'chip chip-muted'    },
        ].map(k => (
          <div key={k.label} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
            <span style={{ fontSize: 'var(--text-kpi)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)' }}>
              {k.value}
            </span>
            <span className={k.chip}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* Cards */}
      {!branches?.length ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhuma unidade cadastrada. Crie a primeira unidade da clínica.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {branches.map(branch => {
            const location = [branch.city, branch.state].filter(Boolean).join(' · ')

            return (
              <div
                key={branch.id}
                data-unidade-card={branch.id}
                className="card"
                // F72: a desativada com o que ficou não esmaece — ainda tem o que resolver.
                style={{ opacity: branch.is_active || temOQueFicou(oQueFica.get(branch.id) ?? NADA_FICA) ? 1 : 0.6, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
                      color: 'var(--text)', letterSpacing: 'var(--tracking-tight)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {branch.name}
                    </p>
                    <code style={{
                      fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
                      background: 'var(--bg-app)', padding: '1px 6px',
                      borderRadius: 6, marginTop: 4, display: 'inline-block',
                      border: '1px solid var(--border)',
                    }}>
                      /{branch.slug}
                    </code>
                    {branch.is_active && (
                      <p data-app-da-cliente-da-unidade style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 4, overflowWrap: "anywhere" }}>
                        App da cliente: <b style={{ color: "var(--text)" }}>{enderecoDoAppDaCliente(origem, branch.slug)}</b>
                      </p>
                    )}
                  </div>
                  <span className={branch.is_active ? 'chip chip-success' : 'chip chip-muted'} style={{ flexShrink: 0, marginLeft: 10 }}>
                    {branch.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                {/* Detalhes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {branch.is_active && (quantosAtendem(branch.id) === 0 ? (
                    <Link href="/admin/team" data-quem-atende-na-unidade style={{
                      fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)', textDecoration: 'none',
                    }}>
                      Ninguém atende nesta unidade ainda: marque-a no “Atende” de quem atende, em Equipe.
                    </Link>
                  ) : (
                    <span data-quem-atende-na-unidade style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      {quantosAtendem(branch.id) === 1 ? '1 pessoa atende aqui' : `${quantosAtendem(branch.id)} pessoas atendem aqui`}
                    </span>
                  ))}
                  {location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      <MapPin size={12} style={{ flexShrink: 0 }} /> {location}
                    </span>
                  )}
                  {branch.email && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      <Mail size={12} style={{ flexShrink: 0 }} /> {branch.email}
                    </span>
                  )}
                  {branch.phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      <Phone size={12} style={{ flexShrink: 0 }} /> {maskPhone(branch.phone)}
                    </span>
                  )}
                </div>

                {/* F72 (D2 da 14ª): depois do clique em Desativar, o que ficou e os caminhos continuam aqui. */}
                {!branch.is_active && temOQueFicou(oQueFica.get(branch.id) ?? NADA_FICA) && (
                  <div data-o-que-ficou style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600, lineHeight: 1.5 }}>
                      {resumoDoQueFica(branch.name, { ...(oQueFica.get(branch.id) ?? NADA_FICA), fixos: [] })}
                    </p>
                    <CaminhosDoQueFicou branchId={branch.id} oQueFica={oQueFica.get(branch.id) ?? NADA_FICA} />
                  </div>
                )}

                {/* Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: 14, borderTop: '1px solid var(--hairline)',
                }}>
                  {branch.is_active ? (
                    <DesativarUnidade
                      branchId={branch.id} nome={branch.name}
                      oQueFica={oQueFica.get(branch.id) ?? NADA_FICA}
                      outras={ativas.filter(b => b.id !== branch.id).map(b => ({ id: b.id, nome: b.name }))}
                      style={{ fontSize: 'var(--text-xs-sz)', gap: 5, color: 'var(--text-faint)' }}
                    >
                      <PowerOff size={13} /> Desativar
                    </DesativarUnidade>
                  ) : (
                    <form action={async () => {
                      'use server'
                      await toggleBranchStatus(branch.id, true)
                    }}>
                      <button
                        type="submit"
                        className="btn-ghost"
                        style={{ fontSize: 'var(--text-xs-sz)', gap: 5, color: 'var(--success)' }}
                      >
                        <Power size={13} /> Reativar
                      </button>
                    </form>
                  )}

                  <Link
                    href={`/admin/branches/${branch.id}`}
                    className="btn-ghost"
                    style={{ fontSize: 'var(--text-xs-sz)', gap: 4, color: 'var(--brand)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                  >
                    Ver detalhes <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {unica && salasDaUnica && <SalasDaUnidade branchId={unica.id} salas={salasDaUnica} />}
    </div>
  )
}
