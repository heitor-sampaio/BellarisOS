import type { ChaveDeCampo, Destino } from './campos'
import { camposDoDestino } from './campos'

/**
 * Cada valor do CSV no formato que o sistema grava, e a linha validada
 * (2026-10-13). Puro: a prévia (navegador) e a importação (servidor) usam o
 * MESMO código — o servidor valida de novo, não confia na prévia.
 *
 * Campo vazio não é erro (só o obrigatório). Campo preenchido e ilegível É:
 * sumir com o dado em silêncio seria pior que recusar a linha, e importar de
 * novo depois de corrigir é seguro (repetido só completa o vazio).
 */

const soDigitos = (v: string) => v.replace(/\D/g, '')

/**
 * Telefone no formato do WhatsApp — só dígitos, 55 + DDD + número —, que é o
 * que a pessoa do CRM guarda e o webhook manda. Com "+", é internacional e
 * fica como veio. Sem DDD, não se adivinha a cidade: null. (Para ACHAR a
 * pessoa, ver `variantesDoTelefone`: o WhatsApp guarda muito celular sem o
 * nono dígito.)
 */
export function normalizarTelefone(bruto: string): string | null {
  const v = bruto.trim()
  if (!v) return null
  const d = soDigitos(v)
  if (v.startsWith('+')) return d.length >= 10 && d.length <= 15 ? d : null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return null
}

/**
 * As formas em que o mesmo celular brasileiro aparece: com e sem o nono
 * dígito. O WhatsApp entrega muitos números SEM ele (12 dígitos), e a planilha
 * os traz COM (13) — procurar só um deixaria a pessoa em dobro. Só celular
 * (o número depois do DDD começa com 6 a 9); fixo e estrangeiro, uma forma só.
 */
export function variantesDoTelefone(fone: string): string[] {
  if (fone.startsWith('55') && fone.length === 13 && fone[4] === '9') return [fone, fone.slice(0, 4) + fone.slice(5)]
  if (fone.startsWith('55') && fone.length === 12 && /[6-9]/.test(fone[4] ?? '')) return [fone, `${fone.slice(0, 4)}9${fone.slice(4)}`]
  return [fone]
}

/** CPF: 11 dígitos, com os verificadores conferidos. */
export function normalizarCpf(bruto: string): string | null {
  const c = soDigitos(bruto)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return null
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]) ? c : null
}

/** dd/mm/aaaa, dd/mm/aa ou aaaa-mm-dd → aaaa-mm-dd (a data existe de verdade). */
export function normalizarData(bruto: string): string | null {
  const v = bruto.trim()
  let a: number, m: number, d: number
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v)
  if (r) {
    d = Number(r[1]); m = Number(r[2]); a = Number(r[3])
    // Ano de dois dígitos: até o ano corrente é deste século; acima, do passado.
    if (r[3]!.length === 2) a += a <= new Date().getFullYear() % 100 ? 2000 : 1900
  } else if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) {
    a = Number(r[1]); m = Number(r[2]); d = Number(r[3])
  } else return null
  const data = new Date(Date.UTC(a, m - 1, d))
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null
  if (a < 1900 || data.getTime() > Date.now()) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const GENEROS: Record<string, 'F' | 'M' | 'O' | 'N'> = {
  f: 'F', feminino: 'F', mulher: 'F', fem: 'F',
  m: 'M', masculino: 'M', homem: 'M', masc: 'M',
  o: 'O', outro: 'O', outros: 'O',
  n: 'N', 'nao informado': 'N', 'prefiro nao informar': 'N',
}
export function normalizarGenero(bruto: string): 'F' | 'M' | 'O' | 'N' | null {
  const k = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return GENEROS[k] ?? null
}

/** "vip; botox, retorno" → ['vip', 'botox', 'retorno']. */
export function separarTags(bruto: string): string[] {
  return [...new Set(bruto.split(/[;,|]/).map(t => t.trim()).filter(Boolean))]
}

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * A origem do lead no vocabulário do sistema (LEAD_SOURCES, em
 * `@estetica-os/utils`). O que não se reconhece vira "Outro" — não é erro: a
 * planilha de evento traz "Feira de noivas", e recusar a linha por isso
 * perderia o lead.
 */
const ORIGENS: Record<string, string> = {
  'meta ads': 'Meta Ads', meta: 'Meta Ads', facebook: 'Meta Ads', 'facebook ads': 'Meta Ads', fb: 'Meta Ads',
  'instagram ads': 'Meta Ads', 'anuncio meta': 'Meta Ads', 'trafego pago': 'Meta Ads',
  'google ads': 'Google Ads', google: 'Google Ads', adwords: 'Google Ads',
  organico: 'Orgânico',
  instagram: 'Instagram', insta: 'Instagram', ig: 'Instagram',
  indicacao: 'Indicação', indicado: 'Indicação', indicada: 'Indicação',
  whatsapp: 'WhatsApp', whats: 'WhatsApp', zap: 'WhatsApp',
  site: 'Site', website: 'Site', 'landing page': 'Site', lp: 'Site',
  evento: 'Evento', eventos: 'Evento', feira: 'Evento',
  outro: 'Outro', outros: 'Outro',
}
export function normalizarOrigem(bruto: string): string {
  return ORIGENS[semAcento(bruto)] ?? 'Outro'
}

/**
 * Valor em reais como a planilha traz: "R$ 1.500,00", "1500,5", "1.500",
 * "2300.90", "1,234.56". O último separador com 1 ou 2 casas depois é o
 * decimal; os outros são de milhar.
 */
export function normalizarValor(bruto: string): number | null {
  let v = bruto.replace(/r\$|\s/gi, '')
  if (!/^\d[\d.,]*$/.test(v)) return null
  const ultimo = Math.max(v.lastIndexOf(','), v.lastIndexOf('.'))
  if (ultimo >= 0 && v.length - ultimo - 1 <= 2) {
    v = v.slice(0, ultimo).replace(/[.,]/g, '') + '.' + v.slice(ultimo + 1)
  } else {
    v = v.replace(/[.,]/g, '')
  }
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null
}

const ATIVOS: Record<string, boolean> = {
  ativo: true, ativa: true, sim: true, s: true, '1': true, true: true, verdadeiro: true, x: true,
  inativo: false, inativa: false, nao: false, n: false, '0': false, false: false, falso: false,
}
/** A situação do cliente: ativo / inativo (sim, não, 1, 0…). */
export function normalizarAtivo(bruto: string): boolean | null {
  return ATIVOS[semAcento(bruto)] ?? null
}

/**
 * O que a linha cita por NOME e o sistema grava por id: a unidade, a etapa do
 * funil escolhido, a pessoa da equipe e o procedimento. A tela recebe as
 * listas da rede; o servidor monta as dele (não confia nas da tela).
 */
export interface Referencias {
  unidades?:      { id: string; nome: string }[]
  /** As etapas do funil da etapa escolhida (a linha não muda de funil). */
  etapas?:        { id: string; nome: string }[]
  /** A equipe ATIVA: pelo nome ou pelo e-mail. */
  membros?:       { id: string; nome: string; email: string | null }[]
  procedimentos?: { id: string; nome: string }[]
}

/** O id pelo nome (sem acento nem caixa); `ambiguo` se dois têm o mesmo. */
function acharPeloNome<T extends { id: string; nome: string }>(lista: T[] | undefined, nome: string): string | 'ambiguo' | null {
  const k = semAcento(nome)
  const achados = (lista ?? []).filter(x => semAcento(x.nome) === k)
  if (achados.length > 1) return 'ambiguo'
  return achados[0]?.id ?? null
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type DadosDaLinha = Partial<Record<ChaveDeCampo, string | string[]>>
export interface LinhaValidada { numero: number; dados: DadosDaLinha; erros: string[] }

/** Até onde vai cada texto livre (a ficha tem os seus limites de tela). */
const MAX_TEXTO = 500
/** As observações (da ficha e do card) são texto longo. */
const MAX_OBSERVACAO = 2000

/**
 * A linha do CSV (os valores na ordem das colunas) segundo o mapeamento (o
 * campo de cada coluna, ou null para não importar).
 */
export function validarLinha(
  destino: Destino,
  mapa: (ChaveDeCampo | null)[],
  valores: string[],
  refs: Referencias = {},
): { dados: DadosDaLinha; erros: string[] } {
  const bruto = new Map<ChaveDeCampo, string>()
  mapa.forEach((campo, i) => {
    if (!campo) return
    const v = (valores[i] ?? '').trim()
    if (v && !bruto.has(campo)) bruto.set(campo, v)
  })

  const dados: DadosDaLinha = {}
  const erros: string[] = []
  // Todos os campos que o destino pode ter: o mapeamento já foi conferido
  // contra as opções desta importação (a tela e a action).
  for (const campo of camposDoDestino(destino, { oportunidade: true, unidadePorLinha: true })) {
    const v = bruto.get(campo.chave)
    if (!v) {
      if (campo.obrigatorio) erros.push(`${campo.rotulo} vazio.`)
      continue
    }
    switch (campo.chave) {
      case 'phone': {
        const t = normalizarTelefone(v)
        if (t) dados.phone = t; else erros.push(`Telefone sem DDD ou inválido: "${v}".`)
        break
      }
      case 'document': {
        const c = normalizarCpf(v)
        if (c) dados.document = c; else erros.push(`CPF inválido: "${v}".`)
        break
      }
      case 'email': {
        const e = v.toLowerCase()
        if (EMAIL.test(e)) dados.email = e; else erros.push(`E-mail inválido: "${v}".`)
        break
      }
      case 'birth_date': {
        const d = normalizarData(v)
        if (d) dados.birth_date = d; else erros.push(`Data de nascimento ilegível: "${v}" (use dd/mm/aaaa).`)
        break
      }
      case 'gender': {
        const g = normalizarGenero(v)
        if (g) dados.gender = g; else erros.push(`Gênero não reconhecido: "${v}" (use F, M, Outro).`)
        break
      }
      case 'zip_code': {
        const c = soDigitos(v)
        if (c.length === 8) dados.zip_code = c; else erros.push(`CEP inválido: "${v}".`)
        break
      }
      case 'state': {
        const uf = v.toUpperCase()
        if (UFS.has(uf)) dados.state = uf; else erros.push(`UF inválida: "${v}" (use a sigla, como SC).`)
        break
      }
      case 'tags':
      case 'op_tags':
        dados[campo.chave] = separarTags(v).map(t => t.slice(0, 60))
        break
      case 'notes':
      case 'op_observacoes':
        dados[campo.chave] = v.slice(0, MAX_OBSERVACAO)
        break
      case 'social_media':
      case 'op_utm_source':
      case 'op_utm_medium':
      case 'op_utm_campaign':
        dados[campo.chave] = v.slice(0, 200)
        break
      case 'ativo': {
        const a = normalizarAtivo(v)
        if (a !== null) dados.ativo = String(a); else erros.push(`Situação não reconhecida: "${v}" (use Ativo ou Inativo).`)
        break
      }
      case 'op_origem':
        dados.op_origem = normalizarOrigem(v)
        break
      case 'op_valor': {
        const n = normalizarValor(v)
        if (n !== null) dados.op_valor = String(n); else erros.push(`Valor ilegível: "${v}".`)
        break
      }
      case 'op_procedimentos': {
        const ids: string[] = []
        for (const nome of separarTags(v)) {
          const id = acharPeloNome(refs.procedimentos, nome)
          if (id === 'ambiguo') erros.push(`Há mais de um procedimento chamado "${nome}".`)
          else if (id) { if (!ids.includes(id)) ids.push(id) }
          else erros.push(`Procedimento não encontrado: "${nome}".`)
        }
        dados.op_procedimentos = ids
        break
      }
      case 'op_etapa': {
        const id = acharPeloNome(refs.etapas, v)
        if (id && id !== 'ambiguo') dados.op_etapa = id
        else erros.push(`Etapa não encontrada no funil escolhido: "${v}".`)
        break
      }
      case 'op_responsavel': {
        const email = v.toLowerCase()
        const porEmail = (refs.membros ?? []).find(m => m.email?.toLowerCase() === email)
        const id = porEmail?.id ?? acharPeloNome(refs.membros, v)
        if (id === 'ambiguo') erros.push(`Mais de uma pessoa da equipe se chama "${v}" — use o e-mail.`)
        else if (id) dados.op_responsavel = id
        else erros.push(`Responsável não encontrado na equipe: "${v}".`)
        break
      }
      case 'unidade': {
        const id = acharPeloNome(refs.unidades, v)
        if (id && id !== 'ambiguo') dados.unidade = id
        else erros.push(`Unidade não encontrada: "${v}".`)
        break
      }
      default:
        dados[campo.chave] = v.slice(0, MAX_TEXTO)
    }
  }
  return { dados, erros }
}

/**
 * A mesma pessoa duas vezes na planilha: a segunda é recusada (seria um
 * "completar" de si mesma). Cliente: pelo CPF; sem CPF, pelo telefone — com
 * CPF diferente, o mesmo telefone é outra pessoa (mãe e filha). Contato: pelo
 * telefone.
 */
/** Quem é "a mesma pessoa" dentro da planilha (a regra de marcarRepetidas). */
export function chaveDaPessoa(destino: Destino, dados: DadosDaLinha): string {
  const cpf = dados.document as string | undefined
  return destino === 'clientes' && cpf ? `cpf:${cpf}` : `fone:${dados.phone as string}`
}

export function marcarRepetidas(destino: Destino, linhas: LinhaValidada[]): LinhaValidada[] {
  const vistas = new Map<string, number>()
  return linhas.map(l => {
    if (l.erros.length) return l
    const chave = chaveDaPessoa(destino, l.dados)
    const primeira = vistas.get(chave)
    if (primeira !== undefined) return { ...l, erros: [`Repetida na planilha (igual à linha ${primeira}).`] }
    vistas.set(chave, l.numero)
    return l
  })
}
