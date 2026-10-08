import type { ResolvedPermissions } from '@estetica-os/types'
import { rotaAgenda, rotaCliente, rotaNoPortal } from '@/lib/rotas'
import { recebe } from '@/lib/menu'
import { casaComTermo } from '@/lib/busca/texto'
import { TERMO_MINIMO } from '@/lib/busca/tipos'

/**
 * As AÇÕES da busca universal (fase 2, 2026-10-08). Cada uma é um ATALHO para
 * o modal que já existe, por URL — a busca não grava nada, e a tela de
 * destino confere tudo de novo (a action dela, como sempre):
 *  - `…/agenda?novo=1[&cliente=]` abre o novo agendamento (com o cliente);
 *  - `…/clients/<id>?acao=vender` abre a venda na ficha;
 *  - `…/clients/new[?nome=|?telefone=]` abre o cadastro preenchido.
 *
 * Só aparece para quem a tela de destino libera: a busca não oferece o que a
 * pessoa não pode fazer. A agenda "só a própria" abre outra tela, sem o modal
 * de criar — por isso não ganha os atalhos de agendar.
 */

export type IdDaAcao = 'novo-agendamento' | 'cadastrar-cliente' | 'cadastrar-termo' | 'agendar' | 'vender'

export interface AcaoDaBusca {
  id:     IdDaAcao
  rotulo: string
  href:   string
}

export interface QuemAge {
  pathname:      string
  /** Slug do portal da unidade; nulo no portal da rede. */
  slug:          string | null
  permissoes:    ResolvedPermissions
  /** A agenda do cargo é "só a própria" (outra tela, sem criar). */
  agendaPropria: boolean
}

const podeAgendar  = (q: QuemAge) => q.permissoes.agenda === 'MANAGE' && !q.agendaPropria
const podeCadastrar = (q: QuemAge) => q.permissoes.clients === 'MANAGE'

/** As ações sem registro: sem termo, todas; com termo, as que casam com ele. */
export function acoesGerais(q: QuemAge & { termo: string }): AcaoDaBusca[] {
  const todas: (AcaoDaBusca & { textos: string[] })[] = []
  if (podeAgendar(q)) {
    todas.push({ id: 'novo-agendamento', rotulo: 'Novo agendamento', href: `${rotaAgenda(q.pathname, q.slug)}?novo=1`,
      textos: ['novo agendamento', 'agendar', 'marcar horário', 'agenda'] })
  }
  if (podeCadastrar(q)) {
    todas.push({ id: 'cadastrar-cliente', rotulo: 'Cadastrar cliente', href: rotaNoPortal(q.pathname, q.slug, '/clients/new'),
      textos: ['cadastrar cliente', 'novo cliente', 'novo paciente', 'cadastro'] })
  }
  const termo = q.termo.trim()
  return todas
    .filter(a => !termo || casaComTermo(termo, a.textos))
    .map(({ id, rotulo, href }) => ({ id, rotulo, href }))
}

/** As ações de um cliente achado: agendar para ele, vender para ele. */
export function acoesDoCliente(q: QuemAge, clienteId: string): AcaoDaBusca[] {
  const acoes: AcaoDaBusca[] = []
  const id = encodeURIComponent(clienteId)
  if (podeAgendar(q)) acoes.push({ id: 'agendar', rotulo: 'Agendar', href: `${rotaAgenda(q.pathname, q.slug)}?novo=1&cliente=${id}` })
  if (recebe(q.permissoes)) acoes.push({ id: 'vender', rotulo: 'Vender', href: `${rotaCliente(q.pathname, q.slug, clienteId)}?acao=vender` })
  return acoes
}

/**
 * O termo que não achou cliente nenhum vira o atalho de cadastrá-lo: um
 * telefone vai como telefone; o resto, como nome.
 */
export function acaoDeCadastrar(q: QuemAge, termo: string): AcaoDaBusca | null {
  const t = termo.trim()
  if (!podeCadastrar(q) || t.length < TERMO_MINIMO) return null
  const digitos = t.replace(/\D/g, '')
  const ehTelefone = !/[a-zA-ZÀ-ÿ]/.test(t) && digitos.length >= 8
  const base = rotaNoPortal(q.pathname, q.slug, '/clients/new')
  return {
    id: 'cadastrar-termo',
    rotulo: `Cadastrar “${t}” como cliente`,
    href: ehTelefone ? `${base}?telefone=${digitos}` : `${base}?nome=${encodeURIComponent(t)}`,
  }
}

/** O que o cadastro preenche a partir da URL da busca (texto curto; o telefone, só dígitos). */
export function prefillDaBusca(p: { nome?: string; telefone?: string }): { name?: string; phone?: string } | undefined {
  const nome = typeof p.nome === 'string' ? p.nome.trim().slice(0, 120) : ''
  const telefone = typeof p.telefone === 'string' ? p.telefone.replace(/\D/g, '').slice(0, 13) : ''
  if (!nome && !telefone) return undefined
  return { ...(nome ? { name: nome } : {}), ...(telefone ? { phone: telefone } : {}) }
}
