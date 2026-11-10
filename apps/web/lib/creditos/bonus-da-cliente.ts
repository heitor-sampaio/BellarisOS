import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { textoDoBonus } from '@/lib/creditos/bonus'

/**
 * A20 da 11ª: as compras de crédito na clínica COM bônus, ainda de pé (não
 * estornadas), da ficha — para o app dizer "R$ 500,00 pagos + R$ 50,00 de
 * bônus" ao lado do saldo. Uma cliente tem poucas; a lista é curta.
 */
export async function bonusDosCreditosDaCliente(tenantId: string, clienteId: string): Promise<string[]> {
  const linhas = await ler(createAdminClient().from('creditos_vendidos').select('valor, bonus, created_at')
    .eq('tenant_id', tenantId).eq('client_id', clienteId).is('estornado_em', null).gt('bonus', 0)
    .order('created_at', { ascending: false }).limit(20), 'ler o bônus do crédito da cliente') as { valor: number; bonus: number; created_at: string }[] | null
  return (linhas ?? []).map(l => textoDoBonus(Number(l.valor), Number(l.bonus)))
}
