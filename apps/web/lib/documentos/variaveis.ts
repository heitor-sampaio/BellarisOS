import {
  analisarMarcacao, variaveisDaArvore, chavesMalFormadas, MAX_CARACTERES_DO_MODELO,
} from './marcacao'
import { variaveisDoDocumento, type DocumentoDoModelo } from './arvore'
import { converterDocumentoDoEditor } from './editor/converter'

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
  /** D6 da 12ª: QUANDO a opcional sai vazia, dito no menu do editor ("vazia sem entrada"). */
  vaziaQuando?: string
  /** O que aparece na prévia do editor. */
  exemplo:  string
}

const TODOS: readonly TipoDeModelo[] = TIPOS_DE_MODELO
const DO_PROCEDIMENTO: readonly TipoDeModelo[] = ['TERMO', 'CONTRATO']
const SO_CONTRATO: readonly TipoDeModelo[] = ['CONTRATO']
const SO_PLANO: readonly TipoDeModelo[] = ['CONTRATO_PLANO']
const COM_PAGAMENTO: readonly TipoDeModelo[] = ['CONTRATO', 'CONTRATO_PLANO']

export const VARIAVEIS_DE_DOCUMENTO = {
  'data.hoje':             { grupo: 'Data',        rotulo: 'Data de hoje, por extenso', tipos: TODOS, exemplo: '29 de setembro de 2026' },
  'data.hoje_curta':       { grupo: 'Data',        rotulo: 'Data de hoje (dd/mm/aaaa)', tipos: TODOS, exemplo: '29/09/2026' },

  'cliente.nome':          { grupo: 'Cliente',     rotulo: 'Nome',              tipos: TODOS, exemplo: 'Marina Torres' },
  'cliente.cpf':           { grupo: 'Cliente',     rotulo: 'CPF', tipos: TODOS, exemplo: '123.456.789-01' },
  'cliente.documento':     { grupo: 'Cliente',     rotulo: 'Documento, com o tipo (CPF, passaporte ou RNE)', tipos: TODOS, exemplo: 'CPF 123.456.789-01' },
  'cliente.nascimento':    { grupo: 'Cliente',     rotulo: 'Data de nascimento', tipos: TODOS, exemplo: '14/03/1990' },
  'cliente.telefone':      { grupo: 'Cliente',     rotulo: 'Telefone',          tipos: TODOS, exemplo: '(47) 99123-4567' },
  'cliente.email':         { grupo: 'Cliente',     rotulo: 'E-mail',            tipos: TODOS, exemplo: 'marina@exemplo.com', opcional: true, vaziaQuando: 'sem e-mail no cadastro' },
  'cliente.endereco':      { grupo: 'Cliente',     rotulo: 'Endereço (rua, número e bairro)', tipos: TODOS, exemplo: 'Rua das Flores, 120 — Centro' },
  'cliente.complemento':   { grupo: 'Cliente',     rotulo: 'Complemento',       tipos: TODOS, exemplo: 'Apto 302', opcional: true, vaziaQuando: 'sem complemento no cadastro' },
  'cliente.cidade':        { grupo: 'Cliente',     rotulo: 'Cidade',            tipos: TODOS, exemplo: 'Joinville' },
  'cliente.uf':            { grupo: 'Cliente',     rotulo: 'UF',                tipos: TODOS, exemplo: 'SC' },
  'cliente.cep':           { grupo: 'Cliente',     rotulo: 'CEP',               tipos: TODOS, exemplo: '89201-000' },

  // O responsável legal da menor (decisão 2 do Heitor, 2026-11-05). Opcionais
  // no catálogo — na adulta saem vazias —, mas na MENOR o nome e o CPF são
  // obrigatórios (`variavelObrigatoria`): sem eles o termo fica INCOMPLETO.
  'responsavel.nome':       { grupo: 'Responsável legal', rotulo: 'Nome do responsável (menor de idade)', tipos: TODOS, exemplo: 'Marta Lima', opcional: true, vaziaQuando: 'na cliente adulta' },
  'responsavel.cpf':        { grupo: 'Responsável legal', rotulo: 'CPF do responsável', tipos: TODOS, exemplo: '529.982.247-25', opcional: true, vaziaQuando: 'na cliente adulta' },
  'responsavel.parentesco': { grupo: 'Responsável legal', rotulo: 'Parentesco', tipos: TODOS, exemplo: 'Mãe', opcional: true, vaziaQuando: 'na cliente adulta' },
  'responsavel.telefone':   { grupo: 'Responsável legal', rotulo: 'Telefone do responsável', tipos: TODOS, exemplo: '(71) 98888-7777', opcional: true, vaziaQuando: 'na cliente adulta' },

  'rede.nome':             { grupo: 'Rede',        rotulo: 'Nome da rede',      tipos: TODOS, exemplo: 'Clínica Bellaris' },
  'rede.documento':        { grupo: 'Rede',        rotulo: 'CNPJ ou CPF da rede', tipos: TODOS, exemplo: '12.345.678/0001-90' },
  'rede.telefone':         { grupo: 'Rede',        rotulo: 'Telefone da rede',  tipos: TODOS, exemplo: '(47) 3030-1000', opcional: true, vaziaQuando: 'sem telefone no cadastro da clínica' },
  'rede.email':            { grupo: 'Rede',        rotulo: 'E-mail da rede',    tipos: TODOS, exemplo: 'contato@clinica.com', opcional: true, vaziaQuando: 'sem e-mail no cadastro da clínica' },

  'unidade.nome':          { grupo: 'Unidade',     rotulo: 'Nome da unidade',   tipos: TODOS, exemplo: 'Unidade Centro' },
  'unidade.cnpj':          { grupo: 'Unidade',     rotulo: 'CNPJ da unidade',   tipos: TODOS, exemplo: '12.345.678/0002-71' },
  'unidade.endereco':      { grupo: 'Unidade',     rotulo: 'Endereço da unidade', tipos: TODOS, exemplo: 'Av. Brasil, 500' },
  'unidade.cidade':        { grupo: 'Unidade',     rotulo: 'Cidade da unidade', tipos: TODOS, exemplo: 'Joinville' },
  'unidade.uf':            { grupo: 'Unidade',     rotulo: 'UF da unidade',     tipos: TODOS, exemplo: 'SC' },
  'unidade.telefone':      { grupo: 'Unidade',     rotulo: 'Telefone da unidade', tipos: TODOS, exemplo: '(47) 3030-1001', opcional: true, vaziaQuando: 'sem telefone no cadastro da unidade' },

  'procedimento.nome':     { grupo: 'Procedimento', rotulo: 'Nome do procedimento', tipos: DO_PROCEDIMENTO, exemplo: 'Toxina botulínica' },
  'procedimento.valor':    { grupo: 'Procedimento', rotulo: 'Valor do atendimento', tipos: SO_CONTRATO, exemplo: 'R$ 1.200,00' },
  'agendamento.data':      { grupo: 'Atendimento', rotulo: 'Data do atendimento', tipos: SO_CONTRATO, exemplo: '02/10/2026' },
  'agendamento.hora':      { grupo: 'Atendimento', rotulo: 'Hora do atendimento', tipos: SO_CONTRATO, exemplo: '14:30' },
  // No termo também (A5 da 11ª): a profissional do atendimento em que é colhido; no plano, a do plano.
  // E no contrato de plano (A14 da 12ª): a profissional do plano (`treatment_plans.professional_id`).
  'profissional.nome':     { grupo: 'Atendimento', rotulo: 'Profissional que atende', tipos: TODOS, exemplo: 'Dra. Helena Prado' },
  // A13 da 12ª (princípio 1): o registro no conselho (CRM, COREN…), opcional no cadastro da pessoa.
  'profissional.registro': { grupo: 'Atendimento', rotulo: 'Registro no conselho da profissional (CRM, COREN…)', tipos: TODOS, exemplo: 'CRM-SC 12345', opcional: true, vaziaQuando: 'sem o registro no cadastro da profissional (Equipe)' },

  'procedimentos.lista':   { grupo: 'Plano',       rotulo: 'Procedimentos do plano (sessões e valor)', tipos: SO_PLANO, exemplo: 'Toxina botulínica — 2 sessões — R$ 2.400,00' },
  'plano.total':           { grupo: 'Plano',       rotulo: 'Valor total do plano', tipos: SO_PLANO, exemplo: 'R$ 4.800,00' },
  'plano.sessoes':         { grupo: 'Plano',       rotulo: 'Número de sessões', tipos: SO_PLANO, exemplo: '4' },

  // O pagamento vale nos dois contratos (decisão do Heitor, 2026-09-30): no de
  // plano ele vem do checkout; no do procedimento, a recepção o define antes
  // de colher a assinatura (`definirPagamentoDoContrato`) — até lá o contrato
  // fica INCOMPLETO, porque `pagamento.forma` é obrigatória.
  'pagamento.forma':       { grupo: 'Pagamento',   rotulo: 'Forma de pagamento — a frase completa (já diz a entrada, as parcelas e os vencimentos)', tipos: COM_PAGAMENTO, exemplo: 'Entrada de R$ 800,00 + 4x de R$ 1.000,00 no cartão de crédito' },
  // PDV8: não existe pagamento sem forma — o crediário diz "no crediário", e o
  // a receber, "a receber". Só fica vazia quando o pagamento é no atendimento.
  'pagamento.metodo':      { grupo: 'Pagamento',   rotulo: 'Forma de pagamento — só o nome (Pix, crediário…)', tipos: COM_PAGAMENTO, exemplo: 'no cartão de crédito', opcional: true, vaziaQuando: 'quando o pagamento fica para o atendimento' },
  'pagamento.entrada':     { grupo: 'Pagamento',   rotulo: 'Valor da entrada',  tipos: COM_PAGAMENTO, exemplo: 'R$ 800,00', opcional: true, vaziaQuando: 'sem entrada (à vista, cartão em vezes, a receber)' },
  'pagamento.parcelas':    { grupo: 'Pagamento',   rotulo: 'Número de parcelas', tipos: COM_PAGAMENTO, exemplo: '4', opcional: true, vaziaQuando: 'à vista de uma vez e no a receber' },
  'pagamento.valor_parcela': { grupo: 'Pagamento', rotulo: 'Valor da parcela',  tipos: COM_PAGAMENTO, exemplo: 'R$ 1.000,00', opcional: true, vaziaQuando: 'à vista de uma vez e no a receber' },
  'pagamento.primeiro_vencimento': { grupo: 'Pagamento', rotulo: 'Primeiro vencimento', tipos: COM_PAGAMENTO, exemplo: '10/10/2026', opcional: true, vaziaQuando: 'à vista, no cartão em vezes e no a receber sem data' },
  // Desconto da venda (2026-09-30): o valor antes dele e o desconto em reais.
  // `pagamento.forma` já fala do valor com desconto e diz o desconto.
  'pagamento.subtotal':    { grupo: 'Pagamento',   rotulo: 'Valor antes do desconto', tipos: COM_PAGAMENTO, exemplo: 'R$ 4.800,00', opcional: true },
  'pagamento.desconto':    { grupo: 'Pagamento',   rotulo: 'Desconto', tipos: COM_PAGAMENTO, exemplo: 'R$ 480,00', opcional: true, vaziaQuando: 'sem desconto' },
} as const satisfies Record<string, VariavelDeDocumento>

export type NomeDeVariavel = keyof typeof VARIAVEIS_DE_DOCUMENTO

const CATALOGO: Record<string, VariavelDeDocumento> = VARIAVEIS_DE_DOCUMENTO

export function ehVariavelConhecida(nome: string): nome is NomeDeVariavel {
  return Object.hasOwn(CATALOGO, nome)
}

export function ehOpcional(nome: string): boolean {
  return !!CATALOGO[nome]?.opcional
}

/** Na MENOR de idade, o responsável assina: o nome e o CPF dele deixam de ser opcionais. */
const OBRIGATORIAS_DA_MENOR = new Set(['responsavel.nome', 'responsavel.cpf'])

/** A variável que, faltando, deixa o documento INCOMPLETO — o catálogo, mais o responsável da menor. */
export function variavelObrigatoria(nome: string, cliente: { menor: boolean }): boolean {
  if (cliente.menor && OBRIGATORIAS_DA_MENOR.has(nome)) return true
  return !ehOpcional(nome)
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

  return validarVariaveis(variaveisDaArvore(analisarMarcacao(fonte)), tipo)
}

/**
 * Confere o documento do EDITOR antes de gravar: primeiro o conversor (só o
 * que a árvore conhece, imagens da rede), depois as mesmas regras de variável
 * da marcação. Devolve a árvore do modelo quando passa.
 */
export function validarDocumentoDoEditor(
  entrada: unknown, tipo: TipoDeModelo, tenantId: string | null,
): ValidacaoDoModelo & { documento?: DocumentoDoModelo } {
  const r = converterDocumentoDoEditor(entrada, { tenantId })
  if ('erro' in r) {
    // A6 da 11ª: com chave mal escrita, o resto também se confere — a tela diz
    // TODAS de uma vez (eram uma por "Salvar").
    if (r.malFormadas?.length && r.parcial) {
      const problemas = problemasDasVariaveis(variaveisDoDocumento(r.parcial), tipo)
      return { erro: [r.erro, ...problemas].join(' '), variaveis: [], usaPagamento: false }
    }
    return { erro: r.erro, variaveis: [], usaPagamento: false }
  }
  const v = validarVariaveis(variaveisDoDocumento(r.documento), tipo)
  return v.erro ? v : { ...v, documento: r.documento }
}

function rotuloDaVariavel(v: string): string {
  const c = CATALOGO[v]
  return c ? `“${c.grupo} · ${c.rotulo}”` : `{{${v}}}`
}

/** As frases do que impede salvar: as que não existem e as de outro tipo — todas (A6 da 11ª). */
function problemasDasVariaveis(variaveis: string[], tipo: TipoDeModelo): string[] {
  const problemas: string[] = []
  const desconhecidas = [...new Set(variaveis.filter(v => !ehVariavelConhecida(v)))]
  if (desconhecidas.length) {
    problemas.push(`Variável que não existe: ${desconhecidas.map(v => `{{${v}}}`).join(', ')}.`)
  }
  const foraDoTipo = [...new Set(variaveis.filter(v => ehVariavelConhecida(v) && !CATALOGO[v]!.tipos.includes(tipo)))]
  if (foraDoTipo.length) {
    problemas.push(`${foraDoTipo.map(rotuloDaVariavel).join(', ')} não ${foraDoTipo.length > 1 ? 'servem' : 'serve'} em ${ROTULO_DO_TIPO[tipo].toLowerCase()}. ${DICA_DO_TIPO[tipo]}`)
  }
  return problemas
}

function validarVariaveis(variaveis: string[], tipo: TipoDeModelo): ValidacaoDoModelo {
  const vazio = { variaveis: [], usaPagamento: false }
  const problemas = problemasDasVariaveis(variaveis, tipo)
  if (problemas.length) return { ...vazio, erro: problemas.join(' ') }
  return { variaveis, usaPagamento: usaPagamento(variaveis) }
}

const DICA_DO_TIPO: Record<TipoDeModelo, string> = {
  TERMO:          'O termo também é assinado no fechamento de um plano, onde não há um agendamento só.',
  CONTRATO:       'O contrato do procedimento é o do atendimento avulso; o do plano é o contrato de plano.',
  CONTRATO_PLANO: 'O contrato de plano cobre vários procedimentos e sessões.',
}

/**
 * O rótulo da variável no menu "Inserir variável" (D6 da 12ª simulação): a
 * opcional diz QUANDO sai vazia — o contrato da Patrícia saiu "Entrada: , em 6
 * parcelas…, primeiro vencimento em ." porque a dona juntou a frase completa
 * (`pagamento.forma`) com as opcionais, vazias no cartão em vezes.
 */
export function rotuloNoMenu(nome: string): string {
  const v = CATALOGO[nome]
  if (!v) return nome
  return v.opcional && v.vaziaQuando ? `${v.rotulo} (vazia ${v.vaziaQuando})` : v.rotulo
}

/**
 * O aviso do checkout (D6 da 12ª): as variáveis que o modelo usa e que saem
 * VAZIAS neste documento, pelo nome do menu. Só aviso — nada se bloqueia
 * (princípio 2). Nulo sem nenhuma.
 */
export function avisoDasVazias(nomes: readonly string[]): string | null {
  const rotulos = [...new Set(nomes)].map(n => CATALOGO[n]?.rotulo ?? n)
  if (!rotulos.length) return null
  const lista = rotulos.length === 1 ? rotulos[0] : `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`
  const um = rotulos.length === 1
  return `Neste plano ${um ? 'sai vazia' : 'saem vazias'}: ${lista}. Confira se o texto do contrato fica certo sem ${um ? 'ela' : 'elas'} (a forma de pagamento já é a frase completa).`
}
