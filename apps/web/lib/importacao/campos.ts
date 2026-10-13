/**
 * Os campos do sistema para onde uma coluna do CSV pode ir (2026-10-13).
 *
 * Dois destinos, escolhidos a cada importação: **clientes** (a ficha na
 * clínica) e **contatos** do CRM (só a pessoa — nome, telefone, tags). Puro,
 * dividido pela tela e pelo servidor.
 */

export type Destino = 'clientes' | 'contatos'

export type ChaveDeCampo =
  | 'name' | 'phone' | 'document' | 'email' | 'birth_date' | 'gender'
  | 'zip_code' | 'address' | 'address_number' | 'address_complement' | 'neighborhood'
  | 'city' | 'state' | 'referred_by' | 'tags' | 'notes'

export interface CampoDoSistema {
  chave:       ChaveDeCampo
  rotulo:      string
  obrigatorio: boolean
  /** Como o cabeçalho costuma vir (comparado sem acento, caixa nem pontuação). */
  sinonimos:   string[]
}

const NOME: CampoDoSistema = { chave: 'name', rotulo: 'Nome', obrigatorio: true,
  sinonimos: ['nome', 'nome completo', 'cliente', 'paciente', 'name', 'nome do cliente', 'nome do paciente'] }
const TELEFONE: CampoDoSistema = { chave: 'phone', rotulo: 'Telefone', obrigatorio: true,
  sinonimos: ['telefone', 'celular', 'fone', 'whatsapp', 'whats', 'tel', 'phone', 'telefone celular', 'contato', 'numero de telefone'] }
const TAGS: CampoDoSistema = { chave: 'tags', rotulo: 'Tags', obrigatorio: false,
  sinonimos: ['tags', 'tag', 'etiquetas', 'etiqueta', 'marcadores', 'categoria', 'categorias'] }

export const CAMPOS: Record<Destino, CampoDoSistema[]> = {
  clientes: [
    NOME,
    TELEFONE,
    { chave: 'document', rotulo: 'CPF', obrigatorio: false, sinonimos: ['cpf', 'documento', 'doc', 'cpf do cliente'] },
    { chave: 'email', rotulo: 'E-mail', obrigatorio: false, sinonimos: ['email', 'e mail', 'mail', 'endereco de email'] },
    { chave: 'birth_date', rotulo: 'Nascimento', obrigatorio: false,
      sinonimos: ['nascimento', 'data de nascimento', 'data nascimento', 'data nasc', 'dt nasc', 'dt nascimento', 'aniversario', 'birth', 'birthday'] },
    { chave: 'gender', rotulo: 'Gênero', obrigatorio: false, sinonimos: ['genero', 'sexo', 'gender'] },
    { chave: 'zip_code', rotulo: 'CEP', obrigatorio: false, sinonimos: ['cep', 'codigo postal'] },
    { chave: 'address', rotulo: 'Endereço', obrigatorio: false, sinonimos: ['endereco', 'logradouro', 'rua', 'address'] },
    { chave: 'address_number', rotulo: 'Número', obrigatorio: false, sinonimos: ['numero', 'n', 'no', 'num', 'nº', 'n°'] },
    { chave: 'address_complement', rotulo: 'Complemento', obrigatorio: false, sinonimos: ['complemento'] },
    { chave: 'neighborhood', rotulo: 'Bairro', obrigatorio: false, sinonimos: ['bairro'] },
    { chave: 'city', rotulo: 'Cidade', obrigatorio: false, sinonimos: ['cidade', 'municipio', 'city'] },
    { chave: 'state', rotulo: 'UF', obrigatorio: false, sinonimos: ['uf', 'estado', 'state'] },
    { chave: 'referred_by', rotulo: 'Indicado por', obrigatorio: false, sinonimos: ['indicado por', 'indicacao', 'quem indicou'] },
    TAGS,
    { chave: 'notes', rotulo: 'Observações', obrigatorio: false,
      sinonimos: ['observacoes', 'observacao', 'obs', 'notas', 'nota', 'anotacoes', 'comentarios'] },
  ],
  contatos: [
    { ...NOME, obrigatorio: false },
    TELEFONE,
    TAGS,
  ],
}

/** "Data de Nascimento:" → "data de nascimento". */
export function chaveDoCabecalho(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9º°]+/g, ' ').trim()
}

/**
 * Para cada coluna, o campo sugerido (ou null). Primeiro o sinônimo exato,
 * depois o cabeçalho que CONTÉM um sinônimo de duas letras ou mais (por
 * palavra). Cada campo vai para uma coluna só — a primeira.
 */
export function sugerirMapeamento(cabecalho: string[], destino: Destino): (ChaveDeCampo | null)[] {
  const campos = CAMPOS[destino]
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
