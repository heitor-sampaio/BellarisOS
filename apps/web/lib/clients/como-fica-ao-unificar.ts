import { maskPhone as telefoneParaExibir, maskCPF, formatDia } from '@estetica-os/utils'

type TipoDoDocumento = 'CPF' | 'PASSAPORTE' | 'RNE'

/**
 * O que a ficha que já existe tem (`FichaQueJaExiste.naFicha`). O e-mail e o
 * telefone vão a toda pergunta; o resto (documento, nascimento, gênero, tags,
 * se tem observações e o acesso), só à do cadastro, que pede Clientes em
 * Gerenciar (`fichasQueJaExistem(..., { comOCadastro: true })`).
 */
export interface OQueAFichaTem {
  email:           string | null
  telefone:        string | null
  /** O CPF (só os dígitos) ou o passaporte/RNE da ficha. */
  documento?:      { tipo: TipoDoDocumento; numero: string } | null
  /** AAAA-MM-DD. */
  nascimento?:     string | null
  genero?:         string | null
  tags?:           string[]
  temObservacoes?: boolean
  temAcesso?:      boolean
}

/** O que está no formulário agora. */
export interface OQueFoiDigitado {
  email:        string
  telefone:     string
  documento?:   { tipo: string; numero: string }
  /** AAAA-MM-DD. */
  nascimento?:  string
  genero?:      string
  observacoes?: string
  tags?:        string[]
  endereco?:    Partial<Record<'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf', string>>
  /** A caixa "Criar o acesso ao app" marcada (e valendo: com o e-mail e o documento). */
  acesso?:      boolean
}

const GENEROS: Record<string, string> = { F: 'Feminino', M: 'Masculino', O: 'Outro', N: 'Prefiro não informar' }
const ROTULO_DO_DOCUMENTO: Record<string, string> = { CPF: 'CPF', PASSAPORTE: 'Passaporte', RNE: 'RNE' }
const chave = (t: string) => t.trim().toLowerCase()

function linha(rotulo: string, agora: string, dela: string | null): string {
  const a = agora.trim()
  if (!a) return dela ? `${rotulo}: ${dela} (o da ficha)` : `${rotulo}: — (a ficha não tem)`
  if (!dela) return `${rotulo}: ${a} (o digitado agora)`
  if (dela === a) return `${rotulo}: ${a} (o mesmo da ficha)`
  return `${rotulo}: ${a} (o digitado agora, no lugar de ${dela})`
}

const docParaExibir = (d: { tipo: string; numero: string }) => d.tipo === 'CPF' ? maskCPF(d.numero) : d.numero.toUpperCase()

/**
 * O documento, com a regra de `atualizarFichaComOPreenchido`: a ficha tem UM
 * documento, e o diferente do que ela tem é recusado — a prévia diz antes.
 */
function linhaDoDocumento(dela: OQueAFichaTem['documento'], agora: OQueFoiDigitado['documento']): string {
  const numero = (agora?.numero ?? '').trim()
  if (!numero || !agora) {
    return dela ? `${ROTULO_DO_DOCUMENTO[dela.tipo]}: ${docParaExibir(dela)} (o da ficha)` : 'Documento: — (a ficha não tem)'
  }
  const rotulo = ROTULO_DO_DOCUMENTO[agora.tipo] ?? 'Documento'
  const digitado = docParaExibir({ tipo: agora.tipo, numero })
  if (!dela) return `${rotulo}: ${digitado} (o digitado agora)`
  const mesmo = dela.tipo === agora.tipo && (agora.tipo === 'CPF'
    ? dela.numero.replace(/\D/g, '') === numero.replace(/\D/g, '')
    : dela.numero.toUpperCase() === numero.toUpperCase())
  if (mesmo) return `${rotulo}: ${digitado} (o mesmo da ficha)`
  if (agora.tipo === 'CPF' && dela.tipo === 'CPF') {
    return `CPF: ${digitado} — a ficha já tem outro CPF (${docParaExibir(dela)}): o Unificar recusa. Confira o CPF digitado.`
  }
  if (dela.tipo === 'CPF') return `${rotulo}: ${digitado} — a ficha já tem CPF: o Unificar recusa. Confira o documento digitado.`
  return `${rotulo}: ${digitado} — a ficha já tem outro documento (${ROTULO_DO_DOCUMENTO[dela.tipo]} ${docParaExibir(dela)}): o Unificar recusa. Confira o documento digitado.`
}

/**
 * Como a ficha FICA ao unificar (A17 da 6ª simulação; D18 da 33ª — CL-08: "A
 * pergunta mostra antes como a ficha fica, acompanhando o que se digita").
 * Mostra TUDO o que `atualizarFichaComOPreenchido` grava: o nome é sempre o da
 * ficha (r3-f14-01); o telefone, o e-mail, o documento e o nascimento, sempre
 * (o digitado no lugar do dela, ou o dela); o gênero, o endereço, as
 * observações (que se somam), as tags (que se juntam) e o acesso ao app, quando
 * preenchidos. Puro: a pergunta do cadastro e o teste dividem.
 */
export function linhasDoComoFica(nome: string, naFicha: OQueAFichaTem | undefined, digitado: OQueFoiDigitado): string[] {
  const foneDela = naFicha?.telefone ? telefoneParaExibir(naFicha.telefone) : null
  const linhas = [
    `Nome: ${nome} (o da ficha)`,
    linha('Telefone', digitado.telefone, foneDela),
    linha('E-mail', digitado.email, naFicha?.email ?? null),
  ]
  // Sem o que a ficha tem (a pergunta fora do cadastro), só as três de sempre.
  if (!naFicha || !('nascimento' in naFicha)) return linhas

  linhas.push(linhaDoDocumento(naFicha.documento ?? null, digitado.documento))
  linhas.push(linha('Nascimento', formatDia(digitado.nascimento) ?? '', formatDia(naFicha.nascimento)))

  const genero = digitado.genero?.trim()
  if (genero) linhas.push(linha('Gênero', GENEROS[genero] ?? genero, naFicha.genero ? (GENEROS[naFicha.genero] ?? naFicha.genero) : null))

  const e = digitado.endereco ?? {}
  const rua = [e.logradouro, e.numero, e.complemento, e.bairro].map(x => x?.trim()).filter(Boolean)
  const cidade = [e.cidade?.trim(), e.uf?.trim()].filter(Boolean).join('/')
  const partes = [...rua, cidade, e.cep?.trim() ? `CEP ${e.cep.trim()}` : ''].filter(Boolean)
  if (partes.length) linhas.push(`Endereço: ${partes.join(', ')} (o preenchido agora vai por cima do da ficha, campo a campo)`)

  const obs = digitado.observacoes?.trim()
  if (obs) linhas.push(naFicha.temObservacoes ? `Observações: “${obs}” vai abaixo das que a ficha já tem` : `Observações: “${obs}” (a ficha não tinha)`)

  const marcadas = (digitado.tags ?? []).filter(t => t.trim())
  if (marcadas.length) {
    const dela = naFicha.tags ?? []
    const novas = marcadas.filter((t, i) => !dela.some(x => chave(x) === chave(t)) && marcadas.findIndex(x => chave(x) === chave(t)) === i)
    const todas = [...dela, ...novas]
    linhas.push(novas.length
      ? `Tags: ${todas.join(', ')} (entra ${novas.join(', ')}; as da ficha ficam)`
      : `Tags: ${todas.join(', ')} (as mesmas da ficha)`)
  }

  if (digitado.acesso) linhas.push(naFicha.temAcesso ? 'Acesso ao app: a ficha já tem; nada muda' : 'Acesso ao app: criado agora (login: o e-mail)')

  linhas.push('O que ficou em branco aqui não muda na ficha.')
  return linhas
}
