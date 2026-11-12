import { describe, it, expect } from 'vitest'
import { fichasQueJaExistem } from '@/lib/clients/ja-existe'

/**
 * C29 do levantamento das regras (F70): a ficha rápida (o Copilot, com o CPF)
 * com o CPF de uma ficha ARQUIVADA. A pergunta só procurava o CPF nas ativas
 * — a arquivada passava, o insert batia na unique do CPF e a tela mostrava o
 * erro cru do banco. Nos caminhos rápidos (`comArquivadas`), a arquivada do
 * CPF entra na pergunta, com o "Reativar".
 */

const ARQUIVADA = { id: '11111111-1111-4111-8111-111111111111', name: 'Valdir', is_active: false }

/** Um cliente de mentira: a tabela `clients` tem só a ficha arquivada; o telefone não acha nada. */
function adminFalso() {
  const consulta = (filtros: Record<string, unknown>) => {
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros[c] = v; return q },
      in: () => q, ilike: () => q, order: () => q, limit: () => q,
      then: (ok: (r: { data: unknown; error: null }) => unknown) => {
        const linhas = filtros.document === '52998224725' && (filtros.is_active === undefined || filtros.is_active === ARQUIVADA.is_active)
          ? [ARQUIVADA] : []
        return Promise.resolve({ data: linhas, error: null }).then(ok)
      },
    }
    return q
  }
  return {
    from: () => consulta({}),
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as Parameters<typeof fichasQueJaExistem>[0]
}

describe('C29: o CPF de uma ficha arquivada', () => {
  it('nos caminhos rápidos, entra na pergunta como ARQUIVADA (o "Reativar")', async () => {
    const achadas = await fichasQueJaExistem(adminFalso(), 't', { cpf: '52998224725' }, { comArquivadas: true })
    expect(achadas).toHaveLength(1)
    expect(achadas[0]).toMatchObject({ id: ARQUIVADA.id, motivo: 'CPF', arquivada: true, podeCadastrarMesmoAssim: false })
  })

  it('no formulário (sem comArquivadas), continua só a ativa — ele tem a pergunta própria da arquivada', async () => {
    const achadas = await fichasQueJaExistem(adminFalso(), 't', { cpf: '52998224725' })
    expect(achadas).toHaveLength(0)
  })
})
