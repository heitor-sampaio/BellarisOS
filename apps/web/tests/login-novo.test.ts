import { describe, it, expect, vi } from 'vitest'
import { comLoginNovo } from '@/lib/login-novo'

/**
 * "Não deve ter como ter um login sem vínculo" (o Heitor, 2026-11-01): o login
 * criado para um membro ou para a rede nova é apagado quando o vínculo não
 * grava. O cadastro da clínica (registerAction) e o "Novo membro"
 * (createTeamMember) deixavam o login solto quando o passo seguinte falhava.
 */
const adminFalso = () => {
  const deleteUser = vi.fn(async (id: string) => ({ error: id ? null : null }))
  return { admin: { auth: { admin: { deleteUser } } }, deleteUser }
}

describe('comLoginNovo — o login novo some se o vínculo não grava', () => {
  it('o passo que LANÇA apaga o login e repassa o erro', async () => {
    const { admin, deleteUser } = adminFalso()
    await expect(comLoginNovo(admin, 'auth-1', async () => { throw new Error('claims') })).rejects.toThrow('claims')
    expect(deleteUser).toHaveBeenCalledWith('auth-1')
  })

  it('o passo que devolve FALHA apaga o login e devolve o resultado', async () => {
    const { admin, deleteUser } = adminFalso()
    const r = await comLoginNovo(admin, 'auth-2', async () => ({ ok: false as const }), x => !x.ok)
    expect(r).toEqual({ ok: false })
    expect(deleteUser).toHaveBeenCalledWith('auth-2')
  })

  it('o passo que dá certo deixa o login', async () => {
    const { admin, deleteUser } = adminFalso()
    const r = await comLoginNovo(admin, 'auth-3', async () => ({ ok: true as const }), x => !x.ok)
    expect(r).toEqual({ ok: true })
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
