import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A entrada no sistema, na auditoria (CF3b): chamada pelo login (a tela e
 * `/api/auth/session`) logo depois de a sessão abrir, com o login que entrou.
 * Só membro — a função do banco não acha a cliente. Acessório: falhar aqui
 * não impede a entrada (fica no log).
 */
export async function registrarEntradaNaAuditoria(authId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('auditoria_registrar_entrada', { p_auth: authId })
    if (error) console.error('[auditoria] a entrada não ficou registrada:', error.message)
  } catch (e) {
    console.error('[auditoria] a entrada não ficou registrada:', e)
  }
}
