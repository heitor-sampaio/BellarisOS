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

/**
 * O que arquivar diz dos agendamentos que ela ainda tem (A19 da 5ª
 * simulação): arquivar não os cancela, e a confirmação não os citava — o
 * horário continuava "Agendado" na agenda. Só os MARCADOS (agendado ou
 * confirmado) daqui para a frente; o próximo com dia e hora em Brasília.
 */
export function avisoDosAgendamentosAoArquivar(
  agendamentos: { scheduledAt: string; status: string }[], agora: Date = new Date(),
): string | null {
  const marcados = agendamentos
    .filter(a => (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') && new Date(a.scheduledAt) >= agora)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  if (!marcados.length) return null
  const quando = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(marcados[0]!.scheduledAt)).replace(', ', ' às ')
  const n = marcados.length
  return n === 1
    ? `Ela tem 1 agendamento marcado (${quando}), que continua na agenda: arquivar não o cancela. Se ela não vem mais, cancele na agenda.`
    : `Ela tem ${n} agendamentos marcados (o próximo em ${quando}), que continuam na agenda: arquivar não os cancela. Se ela não vem mais, cancele na agenda.`
}
