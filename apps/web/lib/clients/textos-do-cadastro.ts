/**
 * Os textos do cadastro da cliente — puros, para a tela e o teste dizerem o
 * mesmo (2026-10-30).
 */

/**
 * O aviso depois de criar o acesso ao app (J-22). O login NOVO tem a senha
 * inicial = o CPF; a conta que ela já tinha (outra clínica, o mesmo e-mail e
 * CPF — `login_de_cliente_para_ligar`) ganha a ficha desta clínica, e a senha
 * continua a que ela já usa (CLAUDE.md §5). O aviso dizia sempre o primeiro.
 */
export function avisoDoAcessoCriado({ contaLigada, email }: { contaLigada: boolean; email: string }): { titulo: string; descricao: string } {
  const login = email.trim() ? ` (${email.trim().toLowerCase()})` : ''
  return contaLigada
    ? {
        titulo: 'Ficha ligada à conta que ela já tem',
        descricao: `Ela já usa o app em outra clínica: o login continua o e-mail${login}, e a senha continua a dela. Esta clínica aparece no app dela.`,
      }
    : {
        titulo: 'Acesso ao app criado',
        descricao: `O login é o e-mail${login} e a senha inicial é o CPF; a cliente a troca no primeiro acesso.`,
      }
}

/**
 * A explicação ao lado da unidade de cadastro (J-24). "O cliente pode ser
 * atendido em qualquer unidade" enganava: a lista de Clientes de cada unidade
 * mostra só as cadastradas nela — as outras unidades a acham pela busca do
 * Agendar. Numa clínica de uma unidade só não há outra (D-19): nada a dizer.
 */
export function avisoDaUnidadeDeCadastro(variasUnidades: boolean): string | null {
  return variasUnidades
    ? 'Ela aparece na lista de Clientes desta unidade. As outras unidades a acham pela busca do Agendar e a atendem normalmente.'
    : null
}
