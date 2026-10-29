/**
 * A saudação da topbar e o nome dela. Era "Bom dia" a qualquer hora, e o
 * primeiro nome de "Dra. Lívia Ramos" saía "Dra." (simulação de um dia de
 * clínica, 2026-10-20). A hora é a de Brasília, nos dois lados (servidor e
 * navegador), para a hidratação não divergir.
 */

const TITULOS = /^(dr|dra|sr|sra|srta|prof|profa)\.?$/i

export function saudacao(agora: Date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora)) % 24
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** O primeiro nome, com o título junto ("Dra. Lívia"); sem o que vem entre parênteses. */
export function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(p => p && !/^\(.*\)?$/.test(p))
  if (partes.length >= 2 && TITULOS.test(partes[0]!)) return `${partes[0]} ${partes[1]}`
  return partes[0] ?? nome
}

/**
 * O tratamento que vem antes do nome no cadastro ("Dona Ivone Becker", "Sr.
 * João"). Na saudação à CLIENTE ele não é nome: o link da ficha dizia "Olá,
 * Dona!" (D19 da simulação de 2026-10-29). A palavra inteira, com ou sem
 * ponto — "Donato" e "Drauzio" são nomes.
 */
const TRATAMENTOS = /^(dona|dom|seu|sr|sra|srta|senhor|senhora|dr|dra|doutor|doutora|prof|profa|professor|professora)\.?$/i

/** O primeiro nome para saudar a CLIENTE ("Olá, Ivone!"), sem o tratamento; vazio se não houver nome. */
export function nomeParaSaudar(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(p => p && !/^\(.*\)?$/.test(p))
  return partes.find(p => !TRATAMENTOS.test(p)) ?? ''
}

/**
 * O texto do link mandado à cliente (a ficha de pré-atendimento, a
 * assinatura de documento): a MESMA frase nos dois, saudando pelo nome e com
 * a concordância do que ela confirma — "o seu CPF", "a sua data de
 * nascimento" (era "o seu data de nascimento", D19).
 */
export function mensagemDoLink(p: {
  nome: string | null | undefined; pedido: string; acao: string; temCpf: boolean; dias: number; url: string
}): string {
  const nome = nomeParaSaudar(p.nome)
  return `Olá${nome ? `, ${nome}` : ''}! ${p.pedido} `
    + `${p.acao}, abra o link abaixo e confirme ${p.temCpf ? 'o seu CPF' : 'a sua data de nascimento'}. O link vale por ${p.dias} dias.\n\n${p.url}`
}

/**
 * As boas-vindas do portal pelo sexo da ficha (`clients.gender`: F, M, O ou
 * vazio). O portal dizia "Bem-vinda" ao Gabriel, cadastrado como Masculino
 * (D17 da simulação de 2026-10-29). Sem sexo (ou "Outro"), o neutro.
 */
export function boasVindas(sexo: string | null | undefined): 'Bem-vinda' | 'Bem-vindo' | 'Boas-vindas' {
  if (sexo === 'F') return 'Bem-vinda'
  if (sexo === 'M') return 'Bem-vindo'
  return 'Boas-vindas'
}
