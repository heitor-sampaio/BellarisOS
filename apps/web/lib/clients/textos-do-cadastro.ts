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
export function avisoDoAcessoCriado({ contaLigada, email, documento }: {
  contaLigada: boolean; email: string
  /**
   * O documento que virou a senha inicial (decisão 1 do Heitor, 2026-11-05):
   * sem CPF, o número do passaporte ou do RNE da ficha. Sem ele, o CPF.
   */
  documento?: { tipo: 'CPF' | 'PASSAPORTE' | 'RNE'; numero: string } | null
}): { titulo: string; descricao: string } {
  const login = email.trim() ? ` (${email.trim().toLowerCase()})` : ''
  // O passaporte e o RNE se digitam como estão na ficha, em maiúsculas: a
  // senha diferencia, e a recepção dita o número.
  const senha = documento && documento.tipo !== 'CPF'
    ? `o número do ${documento.tipo === 'RNE' ? 'RNE' : 'passaporte'}, ${documento.numero} (em maiúsculas)`
    : 'o CPF'
  // Neutro (A20 da 6ª simulação: dizia "a cliente" e "Ela" para o Bruno): o
  // que a CLÍNICA diz não decide pelo sexo da ficha.
  return contaLigada
    ? {
        titulo: 'Ficha ligada à conta que já existe',
        descricao: `Este e-mail já usa o app em outra clínica: o login continua o e-mail${login}, e a senha continua a mesma. Esta clínica passa a aparecer no app.`,
      }
    : {
        titulo: 'Acesso ao app criado',
        descricao: `O login é o e-mail${login} e a senha inicial é ${senha}, trocada no primeiro acesso.`,
      }
}

/**
 * "Cadastrar" com uma pergunta do telefone sem resposta (A22 da 7ª simulação,
 * 2026-11-05): o clique não fazia nada nem dizia por quê. A frase vai junto do
 * botão e diz qual pergunta responder e onde ela está.
 */
export function oQueFaltaResponder(p: { tipo: 'lead' | 'jaExiste' | 'arquivada'; nome: string; ehLead?: boolean }): string {
  if (p.tipo === 'lead') return `Responda antes de cadastrar: é a mesma pessoa do ${p.ehLead === false ? 'contato' : 'lead'} ${p.nome}? (Sim ou Não, logo abaixo do telefone)`
  if (p.tipo === 'jaExiste') return `Responda antes de cadastrar: já existe a ficha de ${p.nome} — “Cadastrar mesmo assim” ou “Unificar com a ficha”, logo abaixo do telefone.`
  return `Responda antes de cadastrar: o telefone é da ficha arquivada de ${p.nome} — “Reativar” ou “É outra pessoa”, logo abaixo do telefone.`
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
