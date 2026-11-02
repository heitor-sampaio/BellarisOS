/**
 * O login que ACABOU de nascer e ainda não tem vínculo — membro de uma rede ou
 * cliente com ficha. "Não deve ter como ter um login sem vínculo, ou é rede ou
 * é unidade" (o Heitor, 5ª simulação, 2026-11-01).
 *
 * Roda o passo que grava o vínculo (as claims e a linha em `users`, a rede
 * nova) e, se ele LANÇA ou devolve falha (`falhou`), apaga o login antes de
 * repassar: o cadastro da clínica (`registerAction`) e o "Novo membro"
 * (`createTeamMember`) deixavam o login solto quando o passo seguinte falhava.
 * Só para login NOVO — a conta que a pessoa já tinha nunca se apaga
 * (a cliente de várias clínicas tem `desfazerLogin`, lib/clients/acesso.ts).
 * O "Nova rede" do sistema e o primeiro admin da plataforma já desfaziam.
 */
type ComDeleteUser = { auth: { admin: { deleteUser: (id: string) => Promise<{ error: unknown }> } } }

export async function comLoginNovo<T>(
  admin: ComDeleteUser, authId: string, passo: () => Promise<T>, falhou: (r: T) => boolean = () => false,
): Promise<T> {
  let r: T
  try {
    r = await passo()
  } catch (e) {
    await apagar(admin, authId)
    throw e
  }
  if (falhou(r)) await apagar(admin, authId)
  return r
}

async function apagar(admin: ComDeleteUser, authId: string): Promise<void> {
  // Sem lançar: o erro que importa à tela é o do passo. A sobra vai ao log.
  const { error } = await admin.auth.admin.deleteUser(authId).catch((e: unknown) => ({ error: e }))
  if (error) console.error('[login-novo] não consegui apagar o login sem vínculo', authId, error)
}
