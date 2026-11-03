/**
 * A parte PURA da pergunta "Já existe a ficha de X" (r2-cli-01): os tipos, o
 * texto e a leitura da resposta — a tela e o servidor dividem. A busca e a
 * gravação moram em `lib/clients/ja-existe.ts` (só servidor).
 */

export type MotivoDaFicha = 'CPF' | 'TELEFONE' | 'NOME_E_NASCIMENTO'

export interface FichaQueJaExiste {
  id:     string
  nome:   string
  motivo: MotivoDaFicha
  /** "Cadastrar mesmo assim" vale? Pelo CPF, não: o CPF é único na clínica. */
  podeCadastrarMesmoAssim: boolean
  /**
   * A ficha é ARQUIVADA (só nos caminhos rápidos — o "+ Agendar", o CRM, o
   * Copilot —, que não têm a pergunta própria da arquivada do formulário):
   * "Atualizar" a reativa antes (r2-cli-02: a arquivada continua com "Reativar").
   */
  arquivada?: boolean
}

/** "Já existe a ficha de Valdir com este telefone." */
export function textoDaFichaQueJaExiste(f: Pick<FichaQueJaExiste, 'nome' | 'motivo' | 'arquivada'>): string {
  const porque = f.motivo === 'CPF' ? 'com este CPF'
    : f.motivo === 'TELEFONE' ? 'com este telefone'
    : 'com este nome e esta data de nascimento'
  return `Já existe a ficha${f.arquivada ? ' ARQUIVADA' : ''} de ${f.nome} ${porque}.`
}

/** O botão que usa a ficha que existe: "Atualizar a ficha de X" — ou, na arquivada, "Reativar a ficha de X". */
export function rotuloDoAtualizar(f: Pick<FichaQueJaExiste, 'nome' | 'arquivada'>): string {
  return `${f.arquivada ? 'Reativar' : 'Atualizar'} a ficha de ${f.nome}`
}

/**
 * A resposta da pessoa, no campo `_jaExiste` do formulário (ou na escolha do
 * cartão do Copilot): "cadastrar:<id>" — uma por ficha, separadas por espaço,
 * acumulam (cada uma vale para AQUELA ficha) — ou "atualizar:<id>".
 */
export function respostaDoJaExiste(texto: string | null | undefined): { cadastrar: Set<string>; atualizar: string | null } {
  const cadastrar = new Set<string>()
  let atualizar: string | null = null
  for (const parte of String(texto ?? '').split(/\s+/)) {
    const m = /^(cadastrar|atualizar):([0-9a-f-]{36})$/i.exec(parte)
    if (!m) continue
    if (m[1]!.toLowerCase() === 'cadastrar') cadastrar.add(m[2]!.toLowerCase())
    else atualizar = m[2]!.toLowerCase()
  }
  return { cadastrar, atualizar }
}

/** A PRÓXIMA ficha que ainda pede a pergunta (nenhuma resposta para ela), ou nula. */
export function proximaSemResposta(fichas: FichaQueJaExiste[], cadastrar: Set<string>): FichaQueJaExiste | null {
  return fichas.find(f => !(f.podeCadastrarMesmoAssim && cadastrar.has(f.id.toLowerCase()))) ?? null
}
