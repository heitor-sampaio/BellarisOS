import { idadeEm, cpfValido, telefoneDoCadastro } from '@estetica-os/utils'

/**
 * A menor de idade e o responsável legal (decisão 2 do Heitor, 7ª simulação,
 * 2026-11-05: "concordo"). A Beatriz tinha 16 anos, e a recepção escrevia o
 * nome da mãe nas Anotações: não havia responsável na ficha, aviso na agenda
 * ou no atendimento, nem termo assinado por ele.
 *
 * Puro de propósito (a tela, o servidor e o teste dizem o mesmo). Avisar, não
 * barrar (princípio 2): sem responsável a ficha e o atendimento avisam; o
 * termo que BLOQUEIA fica INCOMPLETO (o nome e o CPF do responsável são
 * obrigatórios na menor) e já segura o início.
 */

export const MAIORIDADE = 18

/** O parentesco que a ficha oferece (texto livre gravado; "Outro" deixa escrever). */
export const PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Tutor(a) legal'] as const

export interface ResponsavelLegal {
  nome:       string
  /** Só os dígitos. */
  cpf:        string | null
  parentesco: string | null
  telefone:   string | null
}

/** Menor é quem tem menos de 18 anos HOJE (o dia de Brasília). Sem nascimento, não se sabe: não é menor. */
export function ehMenorDeIdade(nascimento: string | null | undefined, hoje: Date = new Date()): boolean {
  const idade = idadeEm(nascimento, hoje)
  return idade != null && idade < MAIORIDADE
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** O responsável gravado na ficha (as colunas `responsavel_*`). Sem o nome, não há responsável. */
export function responsavelDaFicha(c: {
  responsavel_nome?: string | null; responsavel_cpf?: string | null
  responsavel_parentesco?: string | null; responsavel_telefone?: string | null
}): ResponsavelLegal | null {
  const nome = texto(c.responsavel_nome)
  if (!nome) return null
  return {
    nome,
    cpf:        (c.responsavel_cpf ?? '').replace(/\D/g, '') || null,
    parentesco: texto(c.responsavel_parentesco),
    telefone:   texto(c.responsavel_telefone),
  }
}

/**
 * Quem assina o documento: a menor com responsável é assinada POR ELE ("Marta
 * Lima, responsável legal de Beatriz Lima", com o CPF dele); a adulta, ou a
 * menor ainda sem responsável, por ela (o documento dela fica com quem chama).
 */
export function quemAssina(
  c: { nome: string; nascimento: string | null | undefined; responsavel: ResponsavelLegal | null },
  hoje: Date = new Date(),
): { nome: string; documento: string | null; ehResponsavel: boolean } {
  if (c.responsavel && ehMenorDeIdade(c.nascimento, hoje)) {
    return { nome: `${c.responsavel.nome}, responsável legal de ${c.nome}`, documento: c.responsavel.cpf, ehResponsavel: true }
  }
  return { nome: c.nome, documento: null, ehResponsavel: false }
}

/** O aviso da menor sem responsável — na ficha, na agenda e no atendimento. Nulo quando não há o que avisar. */
export function avisoDoMenor(
  c: { nascimento: string | null | undefined; responsavel: ResponsavelLegal | null },
  hoje: Date = new Date(),
): string | null {
  if (!ehMenorDeIdade(c.nascimento, hoje) || c.responsavel) return null
  return `Menor de idade (${idadeEm(c.nascimento, hoje)} anos), sem responsável legal no cadastro. Cadastre o responsável na aba Dados: é ele quem assina o termo.`
}

export interface ColunasDoResponsavel {
  responsavel_nome: string | null; responsavel_cpf: string | null
  responsavel_parentesco: string | null; responsavel_telefone: string | null
}

/**
 * O que a tela mandou do responsável → as colunas da ficha, conferidas como o
 * cadastro confere (o CPF pelos verificadores, o telefone com DDD ou "+"). Só
 * na MENOR: a adulta não tem o que gravar (`{}` — o que já está fica).
 */
export function colunasDoResponsavel(
  e: { nome?: unknown; cpf?: unknown; parentesco?: unknown; telefone?: unknown },
  nascimento: string | null | undefined,
): { colunas: Partial<ColunasDoResponsavel> } | { error: string } {
  if (!ehMenorDeIdade(nascimento)) return { colunas: {} }
  const cpf = String(e.cpf ?? '').replace(/\D/g, '') || null
  if (cpf && !cpfValido(cpf)) return { error: 'CPF do responsável inválido: confira os números.' }
  const telDigitado = texto(e.telefone)
  const tel = telDigitado ? telefoneDoCadastro(telDigitado) : null
  if (telDigitado && !tel) return { error: 'Telefone do responsável incompleto: use o DDD e o número.' }
  return { colunas: {
    responsavel_nome:       texto(e.nome)?.slice(0, 120) ?? null,
    responsavel_cpf:        cpf,
    responsavel_parentesco: texto(e.parentesco)?.slice(0, 40) ?? null,
    responsavel_telefone:   tel?.gravar ?? null,
  } }
}

/** "Responsável: Marta Lima (Mãe) · (71) 98888-7777" — a linha da agenda e do atendimento. */
export function linhaDoResponsavel(r: ResponsavelLegal | null): string | null {
  if (!r) return null
  return [`Responsável: ${r.nome}${r.parentesco ? ` (${r.parentesco})` : ''}`, r.telefone].filter(Boolean).join(' · ')
}
