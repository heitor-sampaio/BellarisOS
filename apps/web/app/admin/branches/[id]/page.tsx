import { notFound } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import Link from 'next/link'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { toggleBranchStatus } from '@/actions/branches'
import type { ComponentProps } from 'react'
import { BranchEditForm } from '@/components/admin/branch-edit-form'
import { SalasDaUnidade, type SalaDaUnidade } from '@/components/admin/salas-da-unidade'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArrowLeft, Power, PowerOff, Users } from 'lucide-react'
import { ler } from '@/lib/db'
import { DesativarUnidade } from '@/components/admin/desativar-unidade'
import { oQueFicaNaUnidade, resumoDoQueFica } from '@/lib/unidades/desativar'
import { origemDoApp, enderecoDoAppDaCliente } from '@/lib/unidades/app-da-cliente'

interface Props {
  params: Promise<{ id: string }>
}

export default async function BranchDetailPage({ params }: Props) {
  const { id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const supabase = await createClient()

  const branch = await ler(supabase
    .from('branches')
    .select(`
      id, name, slug, document, state_registration,
      email, phone, address, city, state, zip_code, horario, fuso,
      is_active, created_at,
      users(id, name, is_active)
    `)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'carregar a unidade')
  // `users.role` saía no embed acima e a coluna não existe desde os cargos
  // dinâmicos: o PostgREST respondia 42703, o `ler` parava e esta tela quebrava
  // para toda unidade. Ninguém aqui lia o cargo — saiu do select (2026-09-27).

  if (!branch) notFound()

  // As salas da unidade (D5, 2026-10-30): as ativas e as desativadas.
  const salas = ((await ler(createAdminClient().from('rooms').select('id, name, is_active')
    .eq('branch_id', id).order('name'), 'carregar as salas')) ?? []) as SalaDaUnidade[]

  // O que fica para trás se ela sair do ar (C67, F70) e para onde a equipe pode ir.
  const oQueFica = branch.is_active ? await oQueFicaNaUnidade(createAdminClient(), ctx.tenantId!, id) : null
  const outrasAtivas = branch.is_active
    ? (((await ler(createAdminClient().from('branches').select('id, name')
        .eq('tenant_id', ctx.tenantId!).eq('is_active', true).neq('id', id).order('name'), 'carregar as outras unidades')) ?? []) as { id: string; name: string }[])
        .map(b => ({ id: b.id, nome: b.name }))
    : []

  const members = (Array.isArray(branch.users) ? branch.users : []) as { id: string; name: string; is_active: boolean }[]
  const activeMembers = members.filter(u => u.is_active).length

  return (
    <div style={{ maxWidth: 760 }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/settings?tab=unidades"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={13} /> Configurações · Unidades
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{
              fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
              letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', margin: 0,
            }}>
              {branch.name}
            </h1>
            <span className={branch.is_active ? 'chip chip-success' : 'chip chip-muted'}>
              {branch.is_active ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          {/* O endereço cru ("/jardins") não dizia nada (C61, F70): o que se usa é o app da cliente. */}
          {branch.is_active && (
            <p data-app-da-cliente-da-unidade style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
              App da cliente: <b style={{ color: 'var(--text)' }}>{enderecoDoAppDaCliente(await origemDoApp(), branch.slug)}</b>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Desativar pede confirmação e diz o que fica para trás (C61/C67, F70); reativar é um clique. */}
          {branch.is_active && oQueFica ? (
            <DesativarUnidade
              branchId={id} nome={branch.name} resumo={resumoDoQueFica(branch.name, oQueFica)}
              fixos={oQueFica.fixos} agendamentos={oQueFica.agendamentos} outras={outrasAtivas}
              className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}
            >
              <PowerOff size={13} /> Desativar
            </DesativarUnidade>
          ) : (
            <form action={async () => {
              'use server'
              await toggleBranchStatus(id, true)
            }}>
              <button type="submit" className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-xs-sz)', color: 'var(--success)' }}>
                <Power size={13} /> Reativar
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Equipe da unidade — resumo rápido */}
      <div className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, padding: '12px 18px' }}>
        <Users size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
          <strong style={{ fontWeight: 'var(--weight-extrabold)' }}>{activeMembers}</strong>
          <span style={{ color: 'var(--text-muted)' }}>
            {' '}membro{activeMembers !== 1 ? 's' : ''} ativo{activeMembers !== 1 ? 's' : ''}
            {members.length > activeMembers ? ` · ${members.length - activeMembers} inativo${members.length - activeMembers !== 1 ? 's' : ''}` : ''}
          </span>
        </span>
      </div>

      {/* Formulário de edição */}
      <BranchEditForm branch={branch as unknown as ComponentProps<typeof BranchEditForm>['branch']} />

      <SalasDaUnidade branchId={id} salas={salas} />

    </div>
  )
}
