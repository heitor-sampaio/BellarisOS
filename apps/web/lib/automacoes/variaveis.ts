import { valorDoCampo, caminhosDoCampo } from './condicoes'

/**
 * As variáveis dos textos: `Olá {{cliente.nome}}, seu horário é {{agendamento.data}}`.
 *
 * Mesmo formato nomeado dos templates da Meta (`lib/templates/core.ts`), de
 * propósito: a clínica já escreve `{{assim}}` ali, e dois formatos diferentes
 * para a mesma ideia é armadilha garantida. A diferença é que aqui o nome é um
 * CAMINHO no contexto, e não uma variável posicional.
 *
 * Dentro das chaves também cabe uma EXPRESSÃO — `{{cliente.nome ?? 'tudo bem'}}`,
 * `{{moeda(agendamento.valor)}}`. O caminho puro continua sendo o caminho
 * rápido e nada do que já estava escrito mudou de sentido.
 */

// Qualquer coisa até o `}}`. A gramática das expressões não tem chaves, então
// não há ambiguidade — e restringir a `[a-zA-Z0-9_.]` como antes cortaria toda
// expressão fora, em silêncio: o texto sairia com `{{...}}` cru para o cliente.
const RE_VARIAVEL = /\{\{([^}]*)\}\}/g

/** Os caminhos citados num texto — é o que o motor precisa hidratar antes. */
export function caminhosDoTexto(texto: string): string[] {
  const achados = new Set<string>()
  for (const m of (texto ?? '').matchAll(RE_VARIAVEL)) {
    for (const caminho of caminhosDoCampo(m[1]!)) achados.add(caminho)
  }
  return [...achados]
}

/**
 * Troca as variáveis pelos valores do contexto.
 *
 * Variável sem valor vira **string vazia**, não `{{cliente.nome}}` cru: o texto
 * vai para o WhatsApp de um cliente, e mostrar o nome da variável é pior que a
 * frase ficar um pouco torta. Quem quiser garantir que o nome existe põe uma
 * condição antes — que é justamente para isso que o IF serve.
 */
export function interpolarTexto(texto: string, contexto: Record<string, unknown>): string {
  return (texto ?? '').replace(RE_VARIAVEL, (_, dentro: string) => {
    const v = valorDoCampo(contexto, dentro)
    if (v === null || v === undefined) return ''
    if (v instanceof Date) return formatarData(v.toISOString())
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') return ''
    // Data em ISO vira data legível: ninguém quer ler
    // "2026-09-24T14:30:00.000Z" numa mensagem de lembrete.
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatarData(v)
    return String(v)
  })
}

/**
 * "24/09/2026 às 11:30" — no fuso do negócio.
 *
 * O `às` no lugar da vírgula do `toLocaleString` porque isto vai dentro de uma
 * frase escrita para o cliente ("seu horário é 24/09/2026, 11:30" soa como
 * planilha), e o fuso é explícito porque o container roda em UTC: sem ele, o
 * lembrete das 11h chegaria dizendo 14h.
 */
function formatarData(iso: string): string {
  const d = new Date(iso)
  const dia  = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const hora = d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  })
  return `${dia} às ${hora}`
}
