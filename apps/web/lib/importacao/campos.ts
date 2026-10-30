/**
 * Os campos do sistema para onde uma coluna do CSV pode ir (2026-10-13).
 *
 * Dois destinos, escolhidos a cada importação: **clientes** (a ficha na
 * clínica) e **contatos** do CRM (a pessoa — nome, telefone, e-mail, rede
 * social, tags). Com "Criar oportunidade" ligado, entram também os campos do
 * CARD (origem, valor, etapa, responsável…); na rede, o cliente pode trazer a
 * unidade de cada linha. Puro, dividido pela tela e pelo servidor.
 */

export type Destino = 'clientes' | 'contatos'

export type ChaveDeCampo =
  | 'name' | 'phone' | 'document' | 'email' | 'social_media' | 'birth_date' | 'gender'
  | 'zip_code' | 'address' | 'address_number' | 'address_complement' | 'neighborhood'
  | 'city' | 'state' | 'referred_by' | 'tags' | 'notes' | 'unidade' | 'ativo'
  | 'op_origem' | 'op_valor' | 'op_observacoes' | 'op_procedimentos' | 'op_etapa' | 'op_responsavel'
  | 'op_utm_source' | 'op_utm_medium' | 'op_utm_campaign' | 'op_tags'

export interface CampoDoSistema {
  chave:       ChaveDeCampo
  rotulo:      string
  obrigatorio: boolean
  /** Como o cabeçalho costuma vir (comparado sem acento, caixa nem pontuação). */
  sinonimos:   string[]
  /** Da pessoa (cliente ou contato) ou do card no funil. */
  grupo:       'pessoa' | 'oportunidade'
}

/** Quais campos a importação oferece além dos da pessoa. */
export interface OpcoesDosCampos {
  /** "Criar oportunidade no funil" ligado: os campos do card. */
  oportunidade?:    boolean
  /** Clientes importados pela REDE: a unidade de cada linha. */
  unidadePorLinha?: boolean
}

const p = (chave: ChaveDeCampo, rotulo: string, sinonimos: string[], obrigatorio = false): CampoDoSistema =>
  ({ chave, rotulo, obrigatorio, sinonimos, grupo: 'pessoa' })
const o = (chave: ChaveDeCampo, rotulo: string, sinonimos: string[]): CampoDoSistema =>
  ({ chave, rotulo, obrigatorio: false, sinonimos, grupo: 'oportunidade' })

const NOME = p('name', 'Nome', ['nome', 'nome completo', 'cliente', 'paciente', 'name', 'nome do cliente', 'nome do paciente', 'lead', 'nome do lead'], true)
const TELEFONE = p('phone', 'Telefone', ['telefone', 'celular', 'fone', 'whatsapp', 'whats', 'tel', 'phone', 'telefone celular', 'contato', 'numero de telefone'], true)
const EMAIL = p('email', 'E-mail', ['email', 'e mail', 'mail', 'endereco de email'])
const SOCIAL_SINONIMOS = ['rede social', 'redes sociais', 'instagram', 'insta', 'perfil', 'perfil do instagram', 'social', 'arroba']
const TAGS = p('tags', 'Tags', ['tags', 'tag', 'etiquetas', 'etiqueta', 'marcadores', 'categoria', 'categorias'])

const DA_PESSOA: Record<Destino, CampoDoSistema[]> = {
  clientes: [
    NOME,
    TELEFONE,
    p('document', 'CPF', ['cpf', 'documento', 'doc', 'cpf do cliente']),
    EMAIL,
    p('birth_date', 'Nascimento', ['nascimento', 'data de nascimento', 'data nascimento', 'data nasc', 'dt nasc', 'dt nascimento', 'aniversario', 'birth', 'birthday']),
    p('gender', 'Gênero', ['genero', 'sexo', 'gender']),
    p('zip_code', 'CEP', ['cep', 'codigo postal']),
    p('address', 'Endereço', ['endereco', 'logradouro', 'rua', 'address']),
    p('address_number', 'Número', ['numero', 'n', 'no', 'num', 'nº', 'n°']),
    p('address_complement', 'Complemento', ['complemento']),
    p('neighborhood', 'Bairro', ['bairro']),
    p('city', 'Cidade', ['cidade', 'municipio', 'city']),
    p('state', 'UF', ['uf', 'estado', 'state']),
    p('referred_by', 'Indicado por', ['indicado por', 'indicacao', 'quem indicou']),
    TAGS,
    p('notes', 'Observações', ['observacoes', 'observacao', 'obs', 'notas', 'nota', 'anotacoes', 'comentarios']),
    p('ativo', 'Situação (ativo/inativo)', ['situacao', 'ativo', 'status', 'ativo inativo', 'inativo']),
  ],
  contatos: [
    { ...NOME, obrigatorio: false },
    // D-10 (2026-10-29): o contato entra com o telefone OU o e-mail
    // (`colunasQueFaltam` pede uma das duas colunas; `validarLinha`, um dos dois valores).
    { ...TELEFONE, obrigatorio: false },
    EMAIL,
    p('social_media', 'Rede social', SOCIAL_SINONIMOS),
    TAGS,
  ],
}

const UNIDADE = p('unidade', 'Unidade', ['unidade', 'filial', 'loja', 'clinica', 'unidade de atendimento'])

const DA_OPORTUNIDADE: CampoDoSistema[] = [
  o('op_origem', 'Origem', ['origem', 'fonte', 'canal', 'como conheceu', 'como nos conheceu', 'midia', 'origem do lead']),
  o('op_valor', 'Valor estimado', ['valor', 'valor estimado', 'ticket', 'orcamento', 'valor da oportunidade', 'valor do orcamento']),
  o('op_observacoes', 'Observações da oportunidade', ['observacoes da oportunidade', 'observacoes do lead', 'observacoes', 'observacao', 'obs', 'notas', 'anotacoes', 'comentarios']),
  o('op_procedimentos', 'Procedimento de interesse', ['procedimento', 'procedimentos', 'procedimento de interesse', 'interesse', 'servico', 'servicos', 'tratamento']),
  o('op_etapa', 'Etapa do funil', ['etapa', 'fase', 'estagio', 'etapa do funil']),
  o('op_responsavel', 'Responsável', ['responsavel', 'vendedor', 'vendedora', 'sdr', 'consultor', 'consultora', 'atendente', 'dono']),
  o('op_utm_source', 'UTM source', ['utm source', 'source']),
  o('op_utm_medium', 'UTM medium', ['utm medium', 'medium']),
  o('op_utm_campaign', 'Campanha (UTM campaign)', ['utm campaign', 'campanha', 'campaign']),
  o('op_tags', 'Tags da oportunidade', ['tags da oportunidade', 'tags do lead', 'etiquetas da oportunidade']),
]

/**
 * Os campos que esta importação oferece, na ordem da tela: os da pessoa, a
 * unidade (se por linha) e os do card (se há oportunidade). No cliente a rede
 * social não é da ficha — vai só para o card.
 */
export function camposDoDestino(destino: Destino, opcoes: OpcoesDosCampos = {}): CampoDoSistema[] {
  const lista = [...DA_PESSOA[destino]]
  if (destino === 'clientes' && opcoes.unidadePorLinha) lista.push(UNIDADE)
  if (opcoes.oportunidade) {
    if (destino === 'clientes') lista.push({ ...p('social_media', 'Rede social', SOCIAL_SINONIMOS), grupo: 'oportunidade' })
    lista.push(...DA_OPORTUNIDADE)
  }
  return lista
}

/**
 * As colunas que faltam escolher antes da prévia: as obrigatórias e, no
 * contato, a do telefone OU a do e-mail (D-10, 2026-10-29). A tela e a action
 * usam esta — a mesma conta nos dois lados.
 */
export function colunasQueFaltam(destino: Destino, campos: CampoDoSistema[], mapa: (ChaveDeCampo | null)[]): string[] {
  const faltam = campos.filter(c => c.obrigatorio && !mapa.includes(c.chave)).map(c => c.rotulo)
  if (destino === 'contatos' && !mapa.includes('phone') && !mapa.includes('email')) faltam.push('Telefone ou E-mail')
  return faltam
}

/** "Data de Nascimento:" → "data de nascimento". */
export function chaveDoCabecalho(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9º°@]+/g, ' ').trim()
}

/**
 * Para cada coluna, o campo sugerido (ou null). Primeiro o sinônimo exato,
 * depois o cabeçalho que CONTÉM um sinônimo de três letras ou mais (por
 * palavra). Cada campo vai para uma coluna só — a primeira.
 */
export function sugerirMapeamento(cabecalho: string[], destino: Destino, opcoes: OpcoesDosCampos = {}): (ChaveDeCampo | null)[] {
  const campos = camposDoDestino(destino, opcoes)
  const usados = new Set<ChaveDeCampo>()
  const chaves = cabecalho.map(chaveDoCabecalho)
  const saida: (ChaveDeCampo | null)[] = chaves.map(() => null)

  const tentar = (casa: (h: string, s: string) => boolean) => {
    chaves.forEach((h, i) => {
      if (saida[i] || !h) return
      const campo = campos.find(c => !usados.has(c.chave) && c.sinonimos.some(s => casa(h, chaveDoCabecalho(s))))
      if (campo) { saida[i] = campo.chave; usados.add(campo.chave) }
    })
  }
  tentar((h, s) => h === s)
  tentar((h, s) => s.length >= 3 && ` ${h} `.includes(` ${s} `))
  return saida
}
