import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { paraAnamneseGeral } from '@/lib/anamnese-geral'
import { preAtendimentoPendente } from '@/lib/pre-atendimento/ficha'
import { PreAtendimentoDaCliente } from '@/components/client-portal/pre-atendimento'

/**
 * O pré-atendimento da cliente (2026-10-20): a ficha que a clínica mandou ao
 * agendar. Só o DELA (ctx.clientId, a ficha da clínica do endereço).
 */
export default async function PreAtendimentoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, ctx.clientId!)
  const voltar = `/${slug}/cliente/home`

  if (!pendente) {
    return (
      <div className="card pre-atendimento-cliente-fim">
        <CheckCircle2 size={28} color="var(--success)" aria-hidden="true" />
        <p className="pre-atendimento-cliente-titulo">Nada para responder agora</p>
        <p className="pre-atendimento-cliente-texto">Quando a clínica precisar de alguma informação antes do seu horário, ela aparece aqui.</p>
        <Link href={voltar} className="btn-secondary">Voltar ao início</Link>
      </div>
    )
  }

  const registro = await ler(admin.from('medical_records').select('general_anamnesis')
    .eq('client_id', ctx.clientId!).maybeSingle(), 'buscar a anamnese')
  const atual = paraAnamneseGeral(registro?.general_anamnesis ?? null, pendente.ficha)

  return (
    <PreAtendimentoDaCliente
      // Sem resposta anterior, "nada mudou" não tem o que confirmar: a ficha inteira.
      modo={pendente.modo === 'CONFIRMAR' && atual ? 'CONFIRMAR' : 'COMPLETO'}
      ficha={pendente.ficha}
      respostasAnteriores={atual?.respostas ?? {}}
      voltar={voltar}
    />
  )
}
