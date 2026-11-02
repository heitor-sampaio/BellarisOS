import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O que um agendamento JÁ TEM PAGO antes do atendimento (D12 da 5ª
 * simulação): a unidade de um pré-pago, a sessão de um pacote ou a sessão de
 * um plano de tratamento. A janela da agenda e o app da cliente mostravam o
 * preço ("VALOR R$ 140,00") como se fosse cobrança pendente.
 *
 * Devolve, por agendamento, o texto que substitui o valor: "Pré-pago · 1 de
 * 2", "Pacote X · sessão 1 de 2" ou "Sessão do plano de tratamento". Quem
 * chama já conferiu a rede e o alcance dos ids (são agendamentos que a tela
 * já leu); aqui só se lê pelo cliente de serviço.
 */
export async function pagosAntes(admin: Admin, agendamentos: string[]): Promise<Map<string, string>> {
  const textos = new Map<string, string>()
  const ids = [...new Set(agendamentos.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150)
    const [unidades, sessoes, planos] = await Promise.all([
      ler(admin.from('procedure_sale_units').select('appointment_id, sale_id, numero')
        .in('appointment_id', lote).neq('status', 'CANCELADA'), 'ler os pré-pagos dos agendamentos'),
      ler(admin.from('package_sessions').select('appointment_id, session_number, client_packages(total_sessions, service_packages(name))')
        .in('appointment_id', lote), 'ler as sessões de pacote dos agendamentos'),
      ler(admin.from('appointments').select('id').in('id', lote).not('treatment_plan_id', 'is', null), 'ler os agendamentos de plano'),
    ])
    const doPrePago = (unidades ?? []) as { appointment_id: string; sale_id: string; numero: number }[]
    if (doPrePago.length) {
      const vendas = [...new Set(doPrePago.map(u => u.sale_id))]
      const todas = ((await ler(admin.from('procedure_sale_units').select('sale_id').in('sale_id', vendas), 'contar as unidades do pré-pago')) ?? []) as { sale_id: string }[]
      const total = new Map<string, number>()
      for (const u of todas) total.set(u.sale_id, (total.get(u.sale_id) ?? 0) + 1)
      for (const u of doPrePago) textos.set(u.appointment_id, `Pré-pago · ${u.numero} de ${total.get(u.sale_id) ?? u.numero}`)
    }
    for (const s of (sessoes ?? []) as unknown as {
      appointment_id: string; session_number: number
      client_packages: { total_sessions: number; service_packages: { name: string } | null } | null
    }[]) {
      const nome = s.client_packages?.service_packages?.name ?? 'Pacote'
      textos.set(s.appointment_id, `${nome} · sessão ${s.session_number} de ${s.client_packages?.total_sessions ?? s.session_number}`)
    }
    for (const a of (planos ?? []) as { id: string }[]) {
      if (!textos.has(a.id)) textos.set(a.id, 'Sessão do plano de tratamento')
    }
  }
  return textos
}
