import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * A18 da 32ª simulação (NC-06; princípio 7). A lista de Notificações dizia
 * "Enviadas 0" sem a explicação que o detalhe tem (a cliente sem aparelho
 * fica com o aviso guardado no sino e não conta como enviada). A mesma dica,
 * da mesma fonte, nos dois lugares.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

describe('A18: "Enviadas" com a mesma dica na lista e no detalhe', () => {
  it('a frase mora num lugar só', async () => {
    const { DICA_DOS_ENVIOS } = await import('@/lib/notifications/dica-dos-envios')
    expect(DICA_DOS_ENVIOS).toBe('Guardada no sino: a cliente não tem aparelho com os avisos ligados; o aviso fica no sino do app e não conta como enviada.')
  })
  it('a lista e o detalhe importam a frase (nenhum a copia)', () => {
    const lista = fonte('components/admin/notification-campaigns-list.tsx')
    const detalhe = fonte('app/admin/notificacoes/[id]/page.tsx')
    for (const f of [lista, detalhe]) {
      expect(f).toMatch(/DICA_DOS_ENVIOS/)
      expect(f).not.toMatch(/aparelho com os avisos ligados/)
    }
    expect(lista).toMatch(/data-dica-das-enviadas/)
  })
})
