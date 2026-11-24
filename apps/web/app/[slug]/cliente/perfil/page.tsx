import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDia } from '@estetica-os/utils'
import { BotaoSairDoPortal } from '@/components/client-portal/botao-sair'
import { EditProfileForm } from '@/components/client-portal/edit-profile-form'
import { DataRequestCard } from '@/components/client-portal/data-request-card'
import { Dica } from '@/components/shared/dica'
import { getMyDataRequests } from '@/actions/lgpd'
import { ler } from '@/lib/db'
import { iniciaisDoNome } from '@estetica-os/utils'
import { KeyRound } from 'lucide-react'
import { documentoDoPerfil } from '@/lib/clientes/textos-do-app'
import Link from 'next/link'

export default async function ClientProfilePage() {
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  const data = await ler(admin
    .from('clients')
    .select('name, email, phone, document, documento_tipo, documento_numero, birth_date, gender, zip_code, address, address_number, address_complement, neighborhood, city, state')
    .eq('id', ctx.clientId!)
    .single(), 'buscar o cliente')

  type ClientRow = {
    name:               string
    email:              string | null
    phone:              string | null
    document:           string | null
    documento_tipo:     string | null
    documento_numero:   string | null
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

  // A36 da 26ª: sem CPF, o passaporte ou o RNE (CLAUDE.md §5).
  const documento = documentoDoPerfil(client)
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
          {iniciaisDoNome(client.name, 1)}
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
          display:       'flex',
          alignItems:    'center',
          gap:           6,
        }}>
          <span>Dados pessoais</span>
          {/* Quem altera estes dados mora na dica (docs/regras/design.md). */}
          <Dica rotulo="Como alterar estes dados">Para alterar esses dados, fale com a equipe.</Dica>
        </p>
        <div className="card" style={{ padding: '4px 22px' }}>
          <StaticRow label={documento.rotulo} value={documento.valor} />
          {client.birth_date && (
            <StaticRow
              label="Data de nascimento"
              value={formatDia(client.birth_date) ?? ''}
            />
          )}
          {client.gender && (
            <StaticRow label="Sexo" value={genderMap[client.gender] ?? client.gender} />
          )}
        </div>
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

      {/* -- Senha (2026-10-21): a inicial é o CPF, e ela troca quando quiser -- */}
      <section>
        <Link href="/update-password" className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
          <KeyRound size={14} aria-hidden="true" /> Trocar senha
        </Link>
      </section>

      {/* -- Logout ------------------------------------------------ */}
      <section style={{ paddingTop: 8 }}>
        {/* Sair também para as notificações deste navegador. */}
        <BotaoSairDoPortal />
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
