import type { ChaveDeCampo, Destino } from './campos'
import { camposDoDestino } from './campos'
import { cpfValido, maskPhone, telefoneInternacional, telefoneDoCadastro, idadeEm } from '@estetica-os/utils'
import { ehMenorDeIdade } from '@/lib/clients/menor'

/**
 * Cada valor do CSV no formato que o sistema grava, e a linha validada
 * (2026-10-13). Puro: a prévia (navegador) e a importação (servidor) usam o
 * MESMO código — o servidor valida de novo, não confia na prévia.
 *
 * Campo vazio não é erro (só o obrigatório). Campo opcional preenchido e
 * ilegível é AVISO (D2 da 8ª simulação, 2026-11-06; decidido pelo princípio 2
 * — só se recusa o impossível): a linha entra sem ele e diz por quê ("CPF
 * inválido…: importada sem o CPF"). Até ali ele recusava a linha inteira, e a
 * Isabela, com nome, telefone e nascimento bons, sumia por um CPF errado. Só
 * o impossível recusa: sem nome, a ficha sem telefone (clients.phone é NOT
 * NULL), o contato sem telefone nem e-mail, e a linha repetida.
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
  // O de outro país segue a regra do cadastro (`telefoneInternacional`: 8 a 15
  // dígitos — cli-06, revisão do Heitor de 2026-11-02); o "+55" é o Brasil.
  if (v.startsWith('+') && !d.startsWith('55')) return telefoneInternacional(v) ? d : null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return null
}

/**
 * O telefone que a FICHA guarda, a partir do formato do WhatsApp da linha: o
 * brasileiro com a máscara, como o cadastro grava (`(48) 99999-0000`); o de
 * outro país com o "+" (cli-06) — sem ele, a ficha mostrava só os dígitos e o
 * número passava por nacional.
 */
export function telefoneDaFichaImportada(fone: string): string {
  if (fone.startsWith('55') && (fone.length === 12 || fone.length === 13)) return maskPhone(fone)
  return `+${fone}`
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

/**
 * As formas com que a PESSOA pode estar gravada (A16 da 6ª simulação): as do
 * WhatsApp (`variantesDoTelefone`) e, do celular brasileiro, as mesmas SEM o
 * 55 — o gatilho do lead gravava assim o telefone digitado no quadro até
 * 2026-11-04 (migration 20261104002301), e essa pessoa continua existindo.
 */
export function formasParaAcharAPessoa(fone: string): string[] {
  const whats = variantesDoTelefone(fone)
  const semDdi = whats.filter(f => f.startsWith('55') && (f.length === 12 || f.length === 13)).map(f => f.slice(2))
  return [...whats, ...semDdi]
}

/** CPF: 11 dígitos, com os verificadores conferidos (a conta é UMA, `cpfValido`). */
export function normalizarCpf(bruto: string): string | null {
  const c = soDigitos(bruto)
  return cpfValido(c) ? c : null
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

/**
 * "Cliente desde" (F35): a planilha de outro sistema costuma trazer só o mês
 * ou o ano — "03/2021" é 01/03/2021, "2019" é 01/01/2019. Do passado, como a
 * data de nascimento.
 */
export function normalizarDesde(bruto: string): string | null {
  const v = bruto.trim()
  let r = /^(\d{1,2})[/.-](\d{4})$/.exec(v)
  if (r) return normalizarData(`01/${r[1]}/${r[2]}`)
  if ((r = /^(\d{4})$/.exec(v))) return normalizarData(`01/01/${r[1]}`)
  return normalizarData(v)
}

/** A validade do pacote trazido: uma data de verdade, do passado ou do futuro (dd/mm/aaaa ou aaaa-mm-dd). */
export function normalizarValidade(bruto: string): string | null {
  const v = bruto.trim()
  let a: number, m: number, d: number
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v)
  if (r) { d = Number(r[1]); m = Number(r[2]); a = Number(r[3]) }
  else if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) { a = Number(r[1]); m = Number(r[2]); d = Number(r[3]) }
  else return null
  const data = new Date(Date.UTC(a, m - 1, d))
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d || a < 2000 || a > 2100) return null
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
export function normalizarOrigem(bruto: string, daClinica: string[] = []): string {
  // A origem que a clínica cadastrou (A14 da 7ª: "Feira de noivas") vale como está.
  const k = semAcento(bruto)
  const cadastrada = daClinica.find(o => semAcento(o) === k)
  if (cadastrada) return cadastrada
  return ORIGENS[k] ?? 'Outro'
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
  /** As origens do lead da CLÍNICA (A14 da 7ª): a da planilha casa com elas primeiro. */
  origens?:       string[]
}

/** O id pelo nome (sem acento nem caixa); `ambiguo` se dois têm o mesmo. */
function acharPeloNome<T extends { id: string; nome: string }>(lista: T[] | undefined, nome: string): string | 'ambiguo' | null {
  const k = semAcento(nome)
  const achados = (lista ?? []).filter(x => semAcento(x.nome) === k)
  if (achados.length > 1) return 'ambiguo'
  return achados[0]?.id ?? null
}

/**
 * O pacote trazido de fora, como a planilha o escreve (decisão 1 c do Heitor,
 * 2026-11-06): "procedimento; total; usadas" e, opcionais, o valor de
 * referência e a validade, em qualquer ordem depois das três ("Limpeza de
 * pele; 10; 7; R$ 1.500,00; 31/12/2027"). Mais de um na mesma célula, com "|".
 * O que não se entende fica de fora com o motivo — a ficha entra igual (D2).
 */
export interface PacoteDaPlanilha {
  procedimentoId: string; total: number; usadas: number
  /** O valor de referência do pacote inteiro (opcional: sem ele, a sessão trazida não gera comissão nem receita de execução). */
  valor: number | null
  /** aaaa-mm-dd. */
  validade: string | null
}

const ilegivelDoPacote = (v: string) => `Pacote de antes ilegível ("${v}", use procedimento; total; usadas): importada sem esse pacote.`

export function lerPacotesDaPlanilha(bruto: string, refs: Referencias = {}): { pacotes: PacoteDaPlanilha[]; avisos: string[] } {
  const pacotes: PacoteDaPlanilha[] = []
  const avisos: string[] = []
  for (const trecho of bruto.split(/[|\n]/).map(t => t.trim()).filter(Boolean)) {
    const partes = trecho.split(';').map(t => t.trim())
    const [nome, totalTxt, usadasTxt, ...extras] = partes
    const inteiro = (t: string | undefined) => (t && /^\d{1,3}$/.test(t) ? Number(t) : null)
    const total = inteiro(totalTxt)
    const usadas = inteiro(usadasTxt)
    if (!nome || total === null || usadas === null || total < 1 || total > 200 || extras.length > 2) { avisos.push(ilegivelDoPacote(trecho)); continue }
    if (usadas >= total) { avisos.push(`Pacote de antes sem sessão restante ("${trecho}"): importada sem esse pacote.`); continue }
    let valor: number | null = null
    let validade: string | null = null
    let ruim = false
    for (const extra of extras.filter(Boolean)) {
      const data = normalizarValidade(extra)
      if (data && !validade) { validade = data; continue }
      const n = normalizarValor(extra)
      if (n !== null && valor === null) { valor = n; continue }
      ruim = true
    }
    if (ruim) { avisos.push(ilegivelDoPacote(trecho)); continue }
    const id = acharPeloNome(refs.procedimentos, nome)
    if (id === 'ambiguo') { avisos.push(`Pacote de antes: há mais de um procedimento chamado "${nome}": importada sem esse pacote.`); continue }
    if (!id) { avisos.push(`Pacote de antes: procedimento não encontrado ("${nome}"): importada sem esse pacote.`); continue }
    pacotes.push({ procedimentoId: id, total, usadas, valor, validade })
  }
  return { pacotes, avisos }
}

/** A linha guarda cada pacote num texto ("id|total|usadas|valor|validade"); o servidor o lê de volta. */
const pacoteParaTexto = (p: PacoteDaPlanilha) => [p.procedimentoId, p.total, p.usadas, p.valor ?? '', p.validade ?? ''].join('|')

export function pacotesDaLinha(dados: DadosDaLinha): PacoteDaPlanilha[] {
  const lista = dados.pacote
  if (!Array.isArray(lista)) return []
  return lista.map(t => {
    const [procedimentoId, total, usadas, valor, validade] = t.split('|')
    return {
      procedimentoId: procedimentoId!, total: Number(total), usadas: Number(usadas),
      valor: valor ? Number(valor) : null, validade: validade || null,
    }
  }).filter(p => p.procedimentoId && Number.isInteger(p.total) && Number.isInteger(p.usadas))
}

/**
 * A menor da planilha sem o responsável legal (A5): a prévia avisa; o
 * resultado da importação confere a ficha como ficou (a que já existia pode
 * ter o responsável). Avisar, não barrar (princípio 2).
 */
export function avisoDaMenorNaPlanilha(dados: DadosDaLinha, hoje: Date = new Date()): string | null {
  const nascimento = dados.birth_date as string | undefined
  if (!ehMenorDeIdade(nascimento, hoje) || (dados.responsavel_nome as string | undefined)?.trim()) return null
  return `Menor de idade (${idadeEm(nascimento, hoje)} anos) sem responsável legal na planilha: cadastre o responsável na ficha.`
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type DadosDaLinha = Partial<Record<ChaveDeCampo, string | string[]>>
export interface LinhaValidada {
  numero: number; dados: DadosDaLinha; erros: string[]
  /** O que ficou de fora da linha que entra (D2): "CPF inválido…: importada sem o CPF". */
  avisos?: string[]
  /**
   * A14: o telefone desta linha já veio numa linha anterior com OUTRO nome
   * (Karina × Bianca). Na ficha a clínica escolhe juntar ou criar separada; no
   * contato a linha junta (D-10), e a prévia diz qual nome fica.
   */
  mesmoTelefone?: { numero: number; nome: string }
}

/** Dois nomes que são outros (sem caixa, acento e espaço a mais); sem nome não é "outro". */
export function nomeDiferente(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a?.trim() || !b?.trim()) return false
  return semAcento(a) !== semAcento(b)
}

/** Até onde vai cada texto livre (a ficha tem os seus limites de tela). */
const MAX_TEXTO = 500
/** As observações (da ficha e do card) são texto longo. */
const MAX_OBSERVACAO = 2000

/**
 * A linha do CSV (os valores na ordem das colunas) segundo o mapeamento (o
 * campo de cada coluna, ou null para não importar). `erros` recusam a linha
 * (só o impossível); `avisos` dizem o que ficou de fora, e ela entra (D2).
 */
export function validarLinha(
  destino: Destino,
  mapa: (ChaveDeCampo | null)[],
  valores: string[],
  refs: Referencias = {},
): { dados: DadosDaLinha; erros: string[]; avisos: string[] } {
  const bruto = new Map<ChaveDeCampo, string>()
  mapa.forEach((campo, i) => {
    if (!campo) return
    const v = (valores[i] ?? '').trim()
    if (v && !bruto.has(campo)) bruto.set(campo, v)
  })

  const dados: DadosDaLinha = {}
  const erros: string[] = []
  const avisos: string[] = []
  /** O campo opcional ilegível: fica de fora, e a linha diz por quê. */
  const semEle = (motivo: string, oQue: string) => { avisos.push(`${motivo}: importada sem ${oQue}.`) }
  /** O campo do CARD que não se acha: a oportunidade entra sem ele. */
  const doCard = (motivo: string, oQue: string) => { avisos.push(`${motivo}: a oportunidade entra ${oQue}.`) }
  let telefoneRuim: string | null = null
  // Todos os campos que o destino pode ter: o mapeamento já foi conferido
  // contra as opções desta importação (a tela e a action).
  for (const campo of camposDoDestino(destino, { oportunidade: true, unidadePorLinha: true, pacote: true })) {
    const v = bruto.get(campo.chave)
    if (!v) {
      if (campo.obrigatorio) erros.push(`${campo.rotulo} vazio.`)
      continue
    }
    switch (campo.chave) {
      case 'phone': {
        const t = normalizarTelefone(v)
        if (t) dados.phone = t
        // A ficha não existe sem telefone (clients.phone é NOT NULL): é o impossível.
        else if (destino === 'clientes') erros.push(`Telefone sem DDD ou inválido: "${v}".`)
        else telefoneRuim = v
        break
      }
      case 'document': {
        const c = normalizarCpf(v)
        if (c) dados.document = c; else semEle(`CPF inválido ("${v}")`, 'o CPF')
        break
      }
      case 'email': {
        const e = v.toLowerCase()
        if (EMAIL.test(e)) dados.email = e; else semEle(`E-mail inválido ("${v}")`, 'o e-mail')
        break
      }
      case 'birth_date': {
        const d = normalizarData(v)
        if (d) dados.birth_date = d; else semEle(`Data de nascimento ilegível ("${v}", use dd/mm/aaaa)`, 'o nascimento')
        break
      }
      case 'gender': {
        const g = normalizarGenero(v)
        if (g) dados.gender = g; else semEle(`Gênero não reconhecido ("${v}", use F, M, Outro)`, 'o gênero')
        break
      }
      case 'zip_code': {
        const c = soDigitos(v)
        if (c.length === 8) dados.zip_code = c; else semEle(`CEP inválido ("${v}")`, 'o CEP')
        break
      }
      case 'state': {
        const uf = v.toUpperCase()
        if (UFS.has(uf)) dados.state = uf; else semEle(`UF inválida ("${v}", use a sigla, como SC)`, 'a UF')
        break
      }
      case 'cliente_desde': {
        const d = normalizarDesde(v)
        if (d) dados.cliente_desde = d; else semEle(`Cliente desde ilegível ("${v}", use dd/mm/aaaa ou mm/aaaa)`, 'essa data')
        break
      }
      case 'ultima_visita': {
        const d = normalizarData(v)
        if (d) dados.ultima_visita = d; else semEle(`Última visita ilegível ("${v}", use dd/mm/aaaa)`, 'essa data')
        break
      }
      case 'responsavel_nome':
        dados.responsavel_nome = v.slice(0, 120)
        break
      case 'responsavel_parentesco':
        dados.responsavel_parentesco = v.slice(0, 40)
        break
      case 'responsavel_cpf': {
        const c = normalizarCpf(v)
        if (c) dados.responsavel_cpf = c; else semEle(`CPF do responsável inválido ("${v}")`, 'ele')
        break
      }
      case 'responsavel_telefone': {
        const t = telefoneDoCadastro(v)
        if (t) dados.responsavel_telefone = t.gravar; else semEle(`Telefone do responsável incompleto ("${v}")`, 'ele')
        break
      }
      case 'pacote': {
        const lidos = lerPacotesDaPlanilha(v, refs)
        avisos.push(...lidos.avisos)
        if (lidos.pacotes.length) dados.pacote = lidos.pacotes.map(pacoteParaTexto)
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
        if (a !== null) dados.ativo = String(a)
        else avisos.push(`Situação não reconhecida ("${v}", use Ativo ou Inativo): importada como ativa.`)
        break
      }
      case 'op_origem':
        dados.op_origem = normalizarOrigem(v, refs?.origens)
        break
      case 'op_valor': {
        const n = normalizarValor(v)
        if (n !== null) dados.op_valor = String(n); else doCard(`Valor ilegível ("${v}")`, 'sem o valor')
        break
      }
      case 'op_procedimentos': {
        const ids: string[] = []
        for (const nome of separarTags(v)) {
          const id = acharPeloNome(refs.procedimentos, nome)
          if (id === 'ambiguo') doCard(`Há mais de um procedimento chamado "${nome}"`, 'sem ele')
          else if (id) { if (!ids.includes(id)) ids.push(id) }
          else doCard(`Procedimento não encontrado ("${nome}")`, 'sem ele')
        }
        dados.op_procedimentos = ids
        break
      }
      case 'op_etapa': {
        const id = acharPeloNome(refs.etapas, v)
        if (id && id !== 'ambiguo') dados.op_etapa = id
        else doCard(`Etapa não encontrada no funil escolhido ("${v}")`, 'na etapa escolhida na tela')
        break
      }
      case 'op_responsavel': {
        const email = v.toLowerCase()
        const porEmail = (refs.membros ?? []).find(m => m.email?.toLowerCase() === email)
        const id = porEmail?.id ?? acharPeloNome(refs.membros, v)
        if (id === 'ambiguo') doCard(`Mais de uma pessoa da equipe se chama "${v}" (use o e-mail)`, 'com o responsável escolhido na tela')
        else if (id) dados.op_responsavel = id
        else doCard(`Responsável não encontrado na equipe ("${v}")`, 'com o responsável escolhido na tela')
        break
      }
      case 'unidade': {
        const id = acharPeloNome(refs.unidades, v)
        if (id && id !== 'ambiguo') dados.unidade = id
        else avisos.push(`Unidade não encontrada ("${v}"): importada na unidade escolhida na tela.`)
        break
      }
      default:
        dados[campo.chave] = v.slice(0, MAX_TEXTO)
    }
  }
  // D-10 (2026-10-29): o contato precisa do telefone OU do e-mail.
  if (destino === 'contatos') {
    if (!dados.phone && !dados.email) {
      erros.push(bruto.get('phone') || bruto.get('email')
        ? 'Sem telefone nem e-mail válido: o contato precisa de um dos dois.'
        : 'Sem telefone nem e-mail: o contato precisa de um dos dois.')
    } else if (telefoneRuim) {
      avisos.unshift(`Telefone sem DDD ou inválido ("${telefoneRuim}"): importada só com o e-mail.`)
    }
  }
  // A linha recusada não entra: o aviso de "importada sem" não vale para ela.
  return { dados, erros, avisos: erros.length ? [] : avisos }
}

/**
 * A mesma pessoa duas vezes na planilha: a segunda é recusada (seria um
 * "completar" de si mesma). Cliente: pelo CPF; sem CPF, pelo telefone — com
 * CPF diferente, o mesmo telefone é outra pessoa (mãe e filha). No CONTATO
 * não há repetida (D-10, decisão do Heitor de 2026-10-29): a segunda linha do
 * mesmo telefone JUNTA as tags e a origem à pessoa que a primeira criou, e
 * completa só o vazio.
 * A14 da 6ª simulação (2026-11-04): o mesmo TELEFONE com OUTRO nome (Karina ×
 * Bianca) não é repetida. Na ficha, a linha passa com `mesmoTelefone` e a
 * prévia dá a escolha: juntar (o padrão — completa o vazio da ficha da outra,
 * como a ficha que já existe) ou ficha separada (`naoCompletar`). No contato
 * ela junta (D-10), e a prévia diz qual nome fica.
 */
/** Quem é "a mesma pessoa" dentro da planilha (a regra de marcarRepetidas). */
export function chaveDaPessoa(destino: Destino, dados: DadosDaLinha): string {
  const cpf = dados.document as string | undefined
  return destino === 'clientes' && cpf ? `cpf:${cpf}` : `fone:${dados.phone as string}`
}

export function marcarRepetidas(destino: Destino, linhas: LinhaValidada[]): LinhaValidada[] {
  const vistas = new Map<string, number>()
  const nomes = new Map<number, string | undefined>()
  return linhas.map(l => {
    if (l.erros.length) return l
    const nome = l.dados.name as string | undefined
    const chave = chaveDaPessoa(destino, l.dados)
    // O contato só com e-mail não tem telefone para repetir.
    if (destino === 'contatos' && !l.dados.phone) return l
    const primeira = vistas.get(chave)
    if (primeira === undefined) { vistas.set(chave, l.numero); nomes.set(l.numero, nome); return l }
    // A14: o mesmo TELEFONE com outro nome não é a linha repetida — é a
    // escolha da clínica (ficha) ou a pessoa que junta (contato, D-10).
    const nomeDaPrimeira = nomes.get(primeira)
    if (chave.startsWith('fone:') && nomeDiferente(nome, nomeDaPrimeira)) {
      return { ...l, mesmoTelefone: { numero: primeira, nome: nomeDaPrimeira! } }
    }
    if (destino === 'contatos') return l
    return { ...l, erros: [`Repetida na planilha (igual à linha ${primeira}).`] }
  })
}
