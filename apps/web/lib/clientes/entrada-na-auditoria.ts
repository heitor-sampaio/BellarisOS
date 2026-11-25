import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { entradaDaCliente } from '@/lib/clientes/destino'

/**
 * A entrada da cliente no portal e no app fica na Auditoria (AD-04 do
 * catálogo da Plataforma; o CF3 aprovado diz "entradas no sistema (login)", sem
 * recorte — era só a do membro).
 *
 * Decisão do Claude (catálogo de 24/11; "cada rede só vê a sua", CLAUDE.md
 * §5): a entrada fica na REDE em que ela entra — a ficha do destino do login.
 * Com o seletor, ainda não é de rede nenhuma: fica para a escolha
 * (`entrarNaRede` → `registrarEntradaNaAuditoriaDaFicha`). Quem agiu é a
 * cliente (`ator_tipo = 'cliente'`). Acessória, como a do membro: nunca
 * impede a entrada.
 */
export async function registrarEntradaDaClienteNaAuditoria(authId: string): Promise<void> {
  try {
    const entrada = await entradaDaCliente(authId)
    if (entrada?.tipo === 'portal') await registrarEntradaNaAuditoriaDaFicha(entrada.ficha.clientId)
  } catch (e) {
    console.error('[auditoria] a entrada da cliente não ficou registrada:', e)
  }
}

/** A entrada da cliente na rede DESTA ficha. */
export async function registrarEntradaNaAuditoriaDaFicha(clientId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('auditoria_registrar_entrada_da_cliente', { p_client: clientId })
    if (error) console.error('[auditoria] a entrada da cliente não ficou registrada:', error.message)
  } catch (e) {
    console.error('[auditoria] a entrada da cliente não ficou registrada:', e)
  }
}
