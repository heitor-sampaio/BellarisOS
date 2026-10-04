import { getCachedRede } from '@/lib/cached-queries'
import { redeBloqueada } from '@/lib/redes/situacao'

/**
 * A rede está bloqueada (desligada, assinatura suspensa ou cancelada)? Para o
 * que SAI para o paciente sem passar por uma tela: automações, campanhas. O
 * que CHEGA (webhook do WhatsApp) continua sendo gravado — perder a mensagem
 * de um paciente não é castigo para a clínica, é para o paciente.
 */
export async function redeEstaBloqueada(tenantId: string): Promise<boolean> {
  try {
    const rede = await getCachedRede(tenantId)
    return !!rede && redeBloqueada(rede)
  } catch (e) {
    // Na dúvida, não bloqueia: a cobrança é que decide, não uma falha de leitura.
    console.error('[rede] situação ilegível:', (e as Error).message)
    return false
  }
}
