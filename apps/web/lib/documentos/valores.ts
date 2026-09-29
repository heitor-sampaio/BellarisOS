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
  }
  rede:     { name: string | null; document: string | null; phone: string | null; email: string | null }
  unidade:  { name: string | null; document: string | null; address: string | null; city: string | null; state: string | null; phone: string | null } | null
  procedimento: { name: string | null } | null
  agendamento:  { scheduled_at: string | null; price: number | null; profissional: string | null } | null
}

const vazio = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function formatarDocumento(doc: string | null | undefined): string | null {
  const d = digitos(doc)
  if (d.length === 11) return maskCPF(d)
  if (d.length === 14) return maskCNPJ(d)
  return vazio(doc)
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
    'cliente.cpf':         formatarDocumento(c.document),
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

    'procedimento.nome':   vazio(d.procedimento?.name),
    'procedimento.valor':  a?.price != null ? formatBRL(Number(a.price)) : null,
    'agendamento.data':    a?.scheduled_at ? formatDate(a.scheduled_at) : null,
    'agendamento.hora':    a?.scheduled_at ? formatTime(a.scheduled_at) : null,
    'profissional.nome':   vazio(a?.profissional),
  }
}
