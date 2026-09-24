import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logoutAction } from '@/actions/auth'
import { EditProfileForm } from '@/components/client-portal/edit-profile-form'
import { DataRequestCard } from '@/components/client-portal/data-request-card'
import { getMyDataRequests } from '@/actions/lgpd'
import { LogOut } from 'lucide-react'
import { ler } from '@/lib/db'

function maskCpf(cpf: string | null) {
  if (!cpf) return '—'
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

export default async function ClientProfilePage({ params: _params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  const data = await ler(admin
    .from('clients')
    .select('name, email, phone, document, birth_date, gender, zip_code, address, address_number, address_complement, neighborhood, city, state')
    .eq('id', ctx.clientId!)
    .single(), 'buscar o cliente')

  type ClientRow = {
    name:               string
    email:              string | null
    phone:              string | null
    document:           string | null
    birth_date:         string | null
    gender:             string | null
    zip_code:           string | null
    address:            string | null
    address_number:     string | null
    address_complement: string | null
    neighborhood:       string | null
    city:               string | null
    state:              string | null
  }

  const client = data as ClientRow | null
  if (!client) return null

  const dataRequests = await getMyDataRequests()

  const genderMap: Record<string, string> = { M: 'Masculino', F: 'Feminino', O: 'Outro' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* -- Avatar + nome ------------------------------------------ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width:          56,
          height:         56,
          borderRadius:   '50%',
          background:     'var(--brand-soft)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize: 'var(--text-name)',
          fontWeight:     800,
          color:          'var(--brand)',
          flexShrink:     0,
        }}>
          {client.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {client.name}
          </h1>
          {client.email && (
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginTop: 1 }}>{client.email}</p>
          )}
        </div>
      </div>

      {/* -- Dados imutáveis (staff-only) --------------------------- */}
      <section>
        <p style={{
          fontSize: 'var(--text-2xs)',
          fontWeight:    700,
          color:         'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom:  12,
        }}>
          Dados pessoais
        </p>
        <div className="card" style={{ padding: '4px 22px' }}>
          <StaticRow label="CPF"              value={maskCpf(client.document)} />
          {client.birth_date && (
            <StaticRow
              label="Data de nascimento"
              value={new Date(client.birth_date).toLocaleDateString('pt-BR')}
            />
          )}
          {client.gender && (
            <StaticRow label="Sexo" value={genderMap[client.gender] ?? client.gender} />
          )}
        </div>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 8, paddingLeft: 4 }}>
          Para alterar esses dados, fale com a recepção.
        </p>
      </section>

      {/* -- Contato + endereço (editável) ------------------------- */}
      <section>
        <EditProfileForm client={{
          phone:              client.phone,
          email:              client.email,
          zip_code:           client.zip_code,
          address:            client.address,
          address_number:     client.address_number,
          address_complement: client.address_complement,
          neighborhood:       client.neighborhood,
          city:               client.city,
          state:              client.state,
        }} />
      </section>

      {/* -- Dados pessoais (LGPD) --------------------------------- */}
      <section>
        <DataRequestCard requests={dataRequests} />
      </section>

      {/* -- Logout ------------------------------------------------ */}
      <section style={{ paddingTop: 8 }}>
        <form action={logoutAction}>
          <button
            type="submit"
            style={{
              width:          '100%',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            8,
              padding:        '13px 16px',
              borderRadius:   12,
              border:         '1px solid var(--border)',
              background:     'var(--surface)',
              color:          'var(--danger)',
              fontWeight:     700,
              fontSize: 'var(--text-base-sz)',
              cursor:         'pointer',
            }}
          >
            <LogOut size={15} />
            Sair da conta
          </button>
        </form>
      </section>

    </div>
  )
}

function StaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      padding:       '13px 0',
      borderBottom:  '1px solid var(--hairline)',
    }}>
      <span style={{
        fontSize: 'var(--text-overline)',
        fontWeight:    700,
        color:         'var(--text-muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom:  3,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 600, color: 'var(--text)' }}>{value || '—'}</span>
    </div>
  )
}
