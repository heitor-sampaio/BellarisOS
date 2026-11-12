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
   * "Unificar" a reativa antes (r2-cli-02: a arquivada continua com "Reativar").
   */
  arquivada?: boolean
  /**
   * O e-mail e o telefone que a ficha JÁ tem (A17 da 6ª simulação): a
   * pergunta mostra, antes de unificar, como ela fica — o nome dela, e o
   * e-mail e o telefone digitados no lugar dos dela (ou os dela, sem nada).
   */
  naFicha?: { email: string | null; telefone: string | null }
  /**
   * Quem pergunta pode "Unificar" / "Reativar"? (C66, H4 = b, o Heitor,
   * 2026-11-11): mexer na ficha que existe pede Clientes em Gerenciar. Sem
   * ele (`false`), a pergunta oferece agendar para a ficha COMO ESTÁ ("usar")
   * ou cadastrar mesmo assim. Ausente = pode (o cadastro, que já pede o módulo).
   */
  podeUnificar?: boolean
}

/** "Já existe a ficha de Valdir com este telefone." */
export function textoDaFichaQueJaExiste(f: Pick<FichaQueJaExiste, 'nome' | 'motivo' | 'arquivada'>): string {
  const porque = f.motivo === 'CPF' ? 'com este CPF'
    : f.motivo === 'TELEFONE' ? 'com este telefone'
    : 'com este nome e esta data de nascimento'
  return `Já existe a ficha${f.arquivada ? ' ARQUIVADA' : ''} de ${f.nome} ${porque}.`
}

/**
 * O botão que usa a ficha que existe: "Unificar com a ficha de X" (r3-f14-02,
 * o Heitor: "Vamos nomear esse procedimento de 'mesclar' ou 'unificar', assim
 * fica mais claro o que vai acontecer"; era "Atualizar a ficha de X") — ou, na
 * arquivada, "Reativar a ficha de X".
 */
export function rotuloDoAtualizar(f: Pick<FichaQueJaExiste, 'nome' | 'arquivada'>): string {
  return f.arquivada ? `Reativar a ficha de ${f.nome}` : `Unificar com a ficha de ${f.nome}`
}

/** "Agendar para a ficha de X" — sem Clientes em Gerenciar, a ficha que existe é usada como está (C66). */
export function rotuloDoUsar(f: Pick<FichaQueJaExiste, 'nome'>): string {
  return `Agendar para a ficha de ${f.nome}`
}

/** A recusa de unificar/reativar sem Clientes em Gerenciar (C66). */
export const RECUSA_DE_UNIFICAR_SEM_CLIENTES =
  'Unificar ou reativar a ficha que já existe pede Clientes em Gerenciar. Agende para a ficha como está, ou cadastre mesmo assim.'

/**
 * A resposta da pessoa, no campo `_jaExiste` do formulário (ou na escolha do
 * cartão do Copilot): "cadastrar:<id>" — uma por ficha, separadas por espaço,
 * acumulam (cada uma vale para AQUELA ficha) —, "atualizar:<id>" (unificar /
 * reativar) ou "usar:<id>" (a ficha como está, sem mexer nela — C66).
 */
export function respostaDoJaExiste(texto: string | null | undefined): { cadastrar: Set<string>; atualizar: string | null; usar: string | null } {
  const cadastrar = new Set<string>()
  let atualizar: string | null = null
  let usar: string | null = null
  for (const parte of String(texto ?? '').split(/\s+/)) {
    const m = /^(cadastrar|atualizar|usar):([0-9a-f-]{36})$/i.exec(parte)
    if (!m) continue
    const tipo = m[1]!.toLowerCase(), id = m[2]!.toLowerCase()
    if (tipo === 'cadastrar') cadastrar.add(id)
    else if (tipo === 'usar') usar = id
    else atualizar = id
  }
  return { cadastrar, atualizar, usar }
}

/** A PRÓXIMA ficha que ainda pede a pergunta (nenhuma resposta para ela), ou nula. */
export function proximaSemResposta(fichas: FichaQueJaExiste[], cadastrar: Set<string>): FichaQueJaExiste | null {
  return fichas.find(f => !(f.podeCadastrarMesmoAssim && cadastrar.has(f.id.toLowerCase()))) ?? null
}
