import {
  analisarMarcacao, variaveisDaArvore, chavesMalFormadas, MAX_CARACTERES_DO_MODELO,
} from './marcacao'

/**
 * O catálogo FECHADO das variáveis de termo e contrato.
 *
 * Fechado de propósito: o documento é assinado, e uma variável que ninguém
 * sabe preencher sairia em branco num contrato. Cada variável declara em que
 * TIPO de modelo ela vale, porque o mesmo termo serve ao atendimento avulso e
 * ao plano — e no plano não existe "o agendamento":
 *
 *  - TERMO: o termo de consentimento ligado ao procedimento. Vale no avulso e
 *    no plano, então só usa o que existe nos dois (cliente, rede, unidade,
 *    procedimento, data).
 *  - CONTRATO: o contrato ligado ao procedimento, assinado no atendimento
 *    avulso — conhece o agendamento, o profissional e o valor.
 *  - CONTRATO_PLANO: o contrato de plano da rede — lista os procedimentos, as
 *    sessões, o total e a forma de pagamento.
 *
 * Não há variável de prontuário nem de anamnese: o documento não carrega dado
 * clínico, e assim a permissão e o export não precisam do cuidado do
 * prontuário.
 */

export type TipoDeModelo = 'TERMO' | 'CONTRATO' | 'CONTRATO_PLANO'

export const TIPOS_DE_MODELO: readonly TipoDeModelo[] = ['TERMO', 'CONTRATO', 'CONTRATO_PLANO']

export const ROTULO_DO_TIPO: Record<TipoDeModelo, string> = {
  TERMO:          'Termo de consentimento',
  CONTRATO:       'Contrato do procedimento',
  CONTRATO_PLANO: 'Contrato de plano',
}

export interface VariavelDeDocumento {
  rotulo:   string
  grupo:    string
  tipos:    readonly TipoDeModelo[]
  /** Sem valor, sai vazia em vez de impedir o documento. */
  opcional?: true
  /** O que aparece na prévia do editor. */
  exemplo:  string
}

const TODOS: readonly TipoDeModelo[] = TIPOS_DE_MODELO
const DO_PROCEDIMENTO: readonly TipoDeModelo[] = ['TERMO', 'CONTRATO']
const SO_CONTRATO: readonly TipoDeModelo[] = ['CONTRATO']
const SO_PLANO: readonly TipoDeModelo[] = ['CONTRATO_PLANO']

export const VARIAVEIS_DE_DOCUMENTO = {
  'data.hoje':             { grupo: 'Data',        rotulo: 'Data de hoje, por extenso', tipos: TODOS, exemplo: '29 de setembro de 2026' },
  'data.hoje_curta':       { grupo: 'Data',        rotulo: 'Data de hoje (dd/mm/aaaa)', tipos: TODOS, exemplo: '29/09/2026' },

  'cliente.nome':          { grupo: 'Cliente',     rotulo: 'Nome',              tipos: TODOS, exemplo: 'Marina Torres' },
  'cliente.cpf':           { grupo: 'Cliente',     rotulo: 'CPF',               tipos: TODOS, exemplo: '123.456.789-01' },
  'cliente.nascimento':    { grupo: 'Cliente',     rotulo: 'Data de nascimento', tipos: TODOS, exemplo: '14/03/1990' },
  'cliente.telefone':      { grupo: 'Cliente',     rotulo: 'Telefone',          tipos: TODOS, exemplo: '(47) 99123-4567' },
  'cliente.email':         { grupo: 'Cliente',     rotulo: 'E-mail',            tipos: TODOS, exemplo: 'marina@exemplo.com', opcional: true },
  'cliente.endereco':      { grupo: 'Cliente',     rotulo: 'Endereço (rua, número e bairro)', tipos: TODOS, exemplo: 'Rua das Flores, 120 — Centro' },
  'cliente.complemento':   { grupo: 'Cliente',     rotulo: 'Complemento',       tipos: TODOS, exemplo: 'Apto 302', opcional: true },
  'cliente.cidade':        { grupo: 'Cliente',     rotulo: 'Cidade',            tipos: TODOS, exemplo: 'Joinville' },
  'cliente.uf':            { grupo: 'Cliente',     rotulo: 'UF',                tipos: TODOS, exemplo: 'SC' },
  'cliente.cep':           { grupo: 'Cliente',     rotulo: 'CEP',               tipos: TODOS, exemplo: '89201-000' },

  'rede.nome':             { grupo: 'Rede',        rotulo: 'Nome da rede',      tipos: TODOS, exemplo: 'Clínica Bellaris' },
  'rede.documento':        { grupo: 'Rede',        rotulo: 'CNPJ ou CPF da rede', tipos: TODOS, exemplo: '12.345.678/0001-90' },
  'rede.telefone':         { grupo: 'Rede',        rotulo: 'Telefone da rede',  tipos: TODOS, exemplo: '(47) 3030-1000', opcional: true },
  'rede.email':            { grupo: 'Rede',        rotulo: 'E-mail da rede',    tipos: TODOS, exemplo: 'contato@clinica.com', opcional: true },

  'unidade.nome':          { grupo: 'Unidade',     rotulo: 'Nome da unidade',   tipos: TODOS, exemplo: 'Unidade Centro' },
  'unidade.cnpj':          { grupo: 'Unidade',     rotulo: 'CNPJ da unidade',   tipos: TODOS, exemplo: '12.345.678/0002-71' },
  'unidade.endereco':      { grupo: 'Unidade',     rotulo: 'Endereço da unidade', tipos: TODOS, exemplo: 'Av. Brasil, 500' },
  'unidade.cidade':        { grupo: 'Unidade',     rotulo: 'Cidade da unidade', tipos: TODOS, exemplo: 'Joinville' },
  'unidade.uf':            { grupo: 'Unidade',     rotulo: 'UF da unidade',     tipos: TODOS, exemplo: 'SC' },
  'unidade.telefone':      { grupo: 'Unidade',     rotulo: 'Telefone da unidade', tipos: TODOS, exemplo: '(47) 3030-1001', opcional: true },

  'procedimento.nome':     { grupo: 'Procedimento', rotulo: 'Nome do procedimento', tipos: DO_PROCEDIMENTO, exemplo: 'Toxina botulínica' },
  'procedimento.valor':    { grupo: 'Procedimento', rotulo: 'Valor do atendimento', tipos: SO_CONTRATO, exemplo: 'R$ 1.200,00' },
  'agendamento.data':      { grupo: 'Atendimento', rotulo: 'Data do atendimento', tipos: SO_CONTRATO, exemplo: '02/10/2026' },
  'agendamento.hora':      { grupo: 'Atendimento', rotulo: 'Hora do atendimento', tipos: SO_CONTRATO, exemplo: '14:30' },
  'profissional.nome':     { grupo: 'Atendimento', rotulo: 'Profissional',      tipos: SO_CONTRATO, exemplo: 'Dra. Helena Prado' },

  'procedimentos.lista':   { grupo: 'Plano',       rotulo: 'Procedimentos do plano (sessões e valor)', tipos: SO_PLANO, exemplo: 'Toxina botulínica — 2 sessões — R$ 2.400,00' },
  'plano.total':           { grupo: 'Plano',       rotulo: 'Valor total do plano', tipos: SO_PLANO, exemplo: 'R$ 4.800,00' },
  'plano.sessoes':         { grupo: 'Plano',       rotulo: 'Número de sessões', tipos: SO_PLANO, exemplo: '4' },

  'pagamento.forma':       { grupo: 'Pagamento',   rotulo: 'Forma de pagamento (frase completa)', tipos: SO_PLANO, exemplo: 'Entrada de R$ 800,00 + 4x de R$ 1.000,00 no cartão de crédito' },
  'pagamento.entrada':     { grupo: 'Pagamento',   rotulo: 'Valor da entrada',  tipos: SO_PLANO, exemplo: 'R$ 800,00', opcional: true },
  'pagamento.parcelas':    { grupo: 'Pagamento',   rotulo: 'Número de parcelas', tipos: SO_PLANO, exemplo: '4', opcional: true },
  'pagamento.valor_parcela': { grupo: 'Pagamento', rotulo: 'Valor da parcela',  tipos: SO_PLANO, exemplo: 'R$ 1.000,00', opcional: true },
  'pagamento.primeiro_vencimento': { grupo: 'Pagamento', rotulo: 'Primeiro vencimento', tipos: SO_PLANO, exemplo: '10/10/2026', opcional: true },
} as const satisfies Record<string, VariavelDeDocumento>

export type NomeDeVariavel = keyof typeof VARIAVEIS_DE_DOCUMENTO

const CATALOGO: Record<string, VariavelDeDocumento> = VARIAVEIS_DE_DOCUMENTO

export function ehVariavelConhecida(nome: string): nome is NomeDeVariavel {
  return Object.hasOwn(CATALOGO, nome)
}

export function ehOpcional(nome: string): boolean {
  return !!CATALOGO[nome]?.opcional
}

/** As variáveis que um tipo de modelo pode usar, na ordem do catálogo. */
export function variaveisDoTipo(tipo: TipoDeModelo): { nome: string; variavel: VariavelDeDocumento }[] {
  return Object.entries(CATALOGO)
    .filter(([, v]) => v.tipos.includes(tipo))
    .map(([nome, variavel]) => ({ nome, variavel }))
}

/** O modelo usa algum dado do pagamento? — o contrato assinado fica preso a ele. */
export function usaPagamento(variaveis: readonly string[]): boolean {
  return variaveis.some(v => v.startsWith('pagamento.'))
}

export interface ValidacaoDoModelo {
  erro?:        string
  variaveis:    string[]
  usaPagamento: boolean
}

/**
 * Confere o texto de um modelo do editor antes de gravar.
 *
 * Recusa variável desconhecida, variável que não vale neste tipo (o
 * agendamento num termo, que também serve ao plano) e chaves mal escritas —
 * cada uma delas sairia em branco, ou com chaves, num documento assinado.
 */
export function validarModelo(fonte: string, tipo: TipoDeModelo): ValidacaoDoModelo {
  const vazio = { variaveis: [], usaPagamento: false }
  const texto = fonte.trim()
  if (!texto) return { ...vazio, erro: 'Escreva o texto do documento.' }
  if (fonte.length > MAX_CARACTERES_DO_MODELO) {
    return { ...vazio, erro: `O texto passou de ${MAX_CARACTERES_DO_MODELO.toLocaleString('pt-BR')} caracteres.` }
  }

  const ruins = chavesMalFormadas(fonte)
  if (ruins.length) {
    return { ...vazio, erro: `Variável mal escrita: ${ruins.join(', ')}. Use o botão "Inserir variável".` }
  }

  const variaveis = variaveisDaArvore(analisarMarcacao(fonte))
  const desconhecidas = variaveis.filter(v => !ehVariavelConhecida(v))
  if (desconhecidas.length) {
    return { ...vazio, erro: `Variável que não existe: ${desconhecidas.map(v => `{{${v}}}`).join(', ')}.` }
  }

  const foraDoTipo = variaveis.filter(v => !CATALOGO[v]!.tipos.includes(tipo))
  if (foraDoTipo.length) {
    return {
      ...vazio,
      erro: `${foraDoTipo.map(v => `{{${v}}}`).join(', ')} não ${foraDoTipo.length > 1 ? 'servem' : 'serve'} em ${ROTULO_DO_TIPO[tipo].toLowerCase()}. ${DICA_DO_TIPO[tipo]}`,
    }
  }

  return { variaveis, usaPagamento: usaPagamento(variaveis) }
}

const DICA_DO_TIPO: Record<TipoDeModelo, string> = {
  TERMO:          'O termo também é assinado no fechamento de um plano, onde não há um agendamento só.',
  CONTRATO:       'O contrato do procedimento é o do atendimento avulso; o do plano é o contrato de plano.',
  CONTRATO_PLANO: 'O contrato de plano cobre vários procedimentos e sessões.',
}
