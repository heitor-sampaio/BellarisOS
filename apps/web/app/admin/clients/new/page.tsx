import Link from 'next/link'
import { unidadesParaCriar } from '@/lib/unidades/da-tela'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { ClientForm } from '@/components/branch/client-form'
import { prefillDaBusca } from '@/lib/busca/acoes'

/**
 * Cadastro de cliente pelo portal da rede.
 *
 * Só existia por unidade, e a lista da rede escondia o botão — quem opera a
 * rede tinha de entrar no portal de uma filial para cadastrar alguém. Aqui não
 * há unidade corrente, então a unidade de cadastro é escolhida no formulário:
 * é ela que vira a tag `Unidade: X`, por onde a lista de cada filial filtra.
 */
export default async function AdminNewClientPage({ searchParams }: { searchParams: Promise<{ nome?: string; telefone?: string }> }) {
  // A busca universal manda o termo que não achou ninguém (`?nome=` ou `?telefone=`).
  const prefill = prefillDaBusca(await searchParams)
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  // A ficha nova nasce numa unidade ATIVA (lib/unidades/da-tela).
  const branches = (await unidadesParaCriar(ctx.tenantId!)).map(({ id, name }) => ({ id, name }))

  return (
    <div style={{ maxWidth: 620 }}>
      <Link
        href="/admin/clients"
        className="btn-ghost"
        style={{ padding: '4px 0', marginBottom: 20, display: 'inline-flex', color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={15} /> Voltar para Clientes
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
          Novo cliente
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {/* A clínica de uma unidade não fala "rede" nem pede a unidade (F8). */}
          {branches.length === 1 ? branches[0]!.name : 'Rede · escolha a unidade de cadastro'}
        </p>
      </div>

      {branches.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
          Nenhuma unidade ativa cadastrada. Cadastre uma unidade antes de criar clientes.
        </div>
      ) : (
        <div className="card">
          <ClientForm branchId="" slug="" branches={branches} prefill={prefill} />
        </div>
      )}
    </div>
  )
}
