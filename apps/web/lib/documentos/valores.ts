import { formatBRL, formatDate, formatTime, maskCPF, maskCNPJ, maskPhone } from '@estetica-os/utils'

/**
 * Os dados do banco → o valor de cada variável do documento, já formatado.
 *
 * Puro de propósito: é aqui que CPF ganha pontos, telefone ganha parênteses e
 * a data sai por extenso — e é o que o teste de unidade prende. Buscar os
 * dados é de `contexto.ts`.
 *
 * Dado que falta vira null, nunca "" nem "—": é o null que faz o documento
 * ficar INCOMPLETO em vez de sair assinado com um buraco.
 */

const FUSO = 'America/Sao_Paulo'

export interface DadosDoDocumento {
  agora:   Date
  cliente: {
    name: string | null; document: string | null; birth_date: string | null
    phone: string | null; email: string | null
    zip_code: string | null; address: string | null; address_number: string | null
    address_complement: string | null; neighborhood: string | null
    city: string | null; state: string | null
    /** Quem não tem CPF: PASSAPORTE ou RNE, e o número (D-11; cli-09 no documento). */
    documento_tipo?: string | null; documento_numero?: string | null
    /** O sexo da ficha (F, M, O ou vazio): a concordância do texto do modelo (A50). */
    gender?: string | null
  }
  rede:     { name: string | null; document: string | null; phone: string | null; email: string | null }
  unidade:  { name: string | null; document: string | null; address: string | null; city: string | null; state: string | null; phone: string | null } | null
  procedimento: { name: string | null } | null
  agendamento:  { scheduled_at: string | null; price: number | null; profissional: string | null } | null
  /** Documento do fechamento do plano. */
  plano?:       { itens: { nome: string; sessoes: number; valor: number }[]; total: number; sessoes: number } | null
  /** Termo do plano: os procedimentos do plano que usam este termo. */
  procedimentosDoTermo?: string[] | null
  /** As variáveis `pagamento.*`, já montadas (lib/checkout/pagamento.ts). */
  pagamento?:   Record<string, string | null> | null
}

const vazio = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function formatarDocumento(doc: string | null | undefined): string | null {
  const d = digitos(doc)
  if (d.length === 11) return maskCPF(d)
  if (d.length === 14) return maskCNPJ(d)
  return vazio(doc)
}

const ROTULO_DO_DOCUMENTO: Record<string, string> = { PASSAPORTE: 'Passaporte', RNE: 'RNE' }

/**
 * O documento de quem não tem CPF, com o tipo na frente: "Passaporte
 * AB123456" (cli-09, revisão do Heitor de 2026-11-02: o contrato saía sem
 * documento da cliente estrangeira).
 */
export function documentoSemCpf(tipo: string | null | undefined, numero: string | null | undefined): string | null {
  const n = vazio(numero)
  return n && tipo && ROTULO_DO_DOCUMENTO[tipo] ? `${ROTULO_DO_DOCUMENTO[tipo]} ${n}` : null
}

/** O telefone guardado com DDI (55…) ou sem — sai sempre no formato nacional. */
export function formatarTelefone(tel: string | null | undefined): string | null {
  let d = digitos(tel)
  if (!d) return null
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? maskPhone(d) : vazio(tel)
}

export function formatarCep(cep: string | null | undefined): string | null {
  const d = digitos(cep)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : vazio(cep)
}

/** `2026-03-14` → `14/03/1990`, sem passar por Date (que puxaria o fuso). */
export function formatarDataCivil(data: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

export function dataPorExtenso(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSO }).format(d)
}

/** A linha do endereço: rua, número e bairro. Sem a rua não há endereço. */
export function linhaDoEndereco(c: DadosDoDocumento['cliente']): string | null {
  const rua = vazio(c.address)
  if (!rua) return null
  const numero = vazio(c.address_number)
  const bairro = vazio(c.neighborhood)
  return `${rua}${numero ? `, ${numero}` : ''}${bairro ? ` — ${bairro}` : ''}`
}

export function valoresDoDocumento(d: DadosDoDocumento): Record<string, string | null> {
  const c = d.cliente
  const a = d.agendamento
  return {
    'data.hoje':           dataPorExtenso(d.agora),
    'data.hoje_curta':     formatDate(d.agora),

    'cliente.nome':        vazio(c.name),
    // Sem CPF, o passaporte (ou o RNE), com o tipo: o contrato não sai sem
    // documento da cliente (cli-09). `cliente.documento` diz sempre o tipo.
    'cliente.cpf':         formatarDocumento(c.document) ?? documentoSemCpf(c.documento_tipo, c.documento_numero),
    'cliente.documento':   formatarDocumento(c.document) ? `CPF ${formatarDocumento(c.document)}` : documentoSemCpf(c.documento_tipo, c.documento_numero),
    'cliente.nascimento':  formatarDataCivil(c.birth_date),
    'cliente.telefone':    formatarTelefone(c.phone),
    'cliente.email':       vazio(c.email),
    'cliente.endereco':    linhaDoEndereco(c),
    'cliente.complemento': vazio(c.address_complement),
    'cliente.cidade':      vazio(c.city),
    'cliente.uf':          vazio(c.state)?.toUpperCase() ?? null,
    'cliente.cep':         formatarCep(c.zip_code),

    'rede.nome':           vazio(d.rede.name),
    'rede.documento':      formatarDocumento(d.rede.document),
    'rede.telefone':       formatarTelefone(d.rede.phone),
    'rede.email':          vazio(d.rede.email),

    'unidade.nome':        vazio(d.unidade?.name),
    'unidade.cnpj':        formatarDocumento(d.unidade?.document),
    'unidade.endereco':    vazio(d.unidade?.address),
    'unidade.cidade':      vazio(d.unidade?.city),
    'unidade.uf':          vazio(d.unidade?.state)?.toUpperCase() ?? null,
    'unidade.telefone':    formatarTelefone(d.unidade?.phone),

    'procedimento.nome':   d.procedimentosDoTermo?.length ? d.procedimentosDoTermo.join(', ') : vazio(d.procedimento?.name),
    'procedimento.valor':  a?.price != null ? formatBRL(Number(a.price)) : null,
    'agendamento.data':    a?.scheduled_at ? formatDate(a.scheduled_at) : null,
    'agendamento.hora':    a?.scheduled_at ? formatTime(a.scheduled_at) : null,
    'profissional.nome':   vazio(a?.profissional),

    'procedimentos.lista': d.plano?.itens.length
      ? d.plano.itens.map(i => `${i.nome} — ${i.sessoes} ${i.sessoes === 1 ? 'sessão' : 'sessões'} — ${formatBRL(i.valor)}`).join('\n')
      : null,
    'plano.total':         d.plano ? formatBRL(d.plano.total) : null,
    'plano.sessoes':       d.plano ? String(d.plano.sessoes) : null,
    ...(d.pagamento ?? {}),
  }
}
