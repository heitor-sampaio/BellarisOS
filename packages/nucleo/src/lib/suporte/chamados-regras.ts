/**
 * Regras puras dos chamados de suporte (testadas em tests/suporte-chamados.test.ts).
 *
 * Situações:
 *  - `aberto`: a clínica escreveu e ninguém do suporte respondeu ainda;
 *  - `em_andamento`: o suporte está mexendo;
 *  - `aguardando_clinica`: o suporte respondeu e espera a clínica;
 *  - `resolvido`: fechado (reabre se a clínica escrever de novo).
 */
export const SITUACOES_DO_CHAMADO = ['aberto', 'em_andamento', 'aguardando_clinica', 'resolvido'] as const
export type SituacaoDoChamado = typeof SITUACOES_DO_CHAMADO[number]

export const ROTULO_DA_SITUACAO: Record<SituacaoDoChamado, string> = {
  aberto:             'Aberto',
  em_andamento:       'Em andamento',
  aguardando_clinica: 'Aguardando a clínica',
  resolvido:          'Resolvido',
}

export function ehSituacao(s: unknown): s is SituacaoDoChamado {
  return (SITUACOES_DO_CHAMADO as readonly unknown[]).includes(s)
}

/**
 * A situação depois de uma mensagem.
 *  - a clínica escreveu → `aberto` (inclusive reabrindo o resolvido);
 *  - o suporte respondeu à clínica → a que ele escolheu, ou `aguardando_clinica`;
 *  - nota interna → não muda nada, salvo escolha explícita.
 */
export function situacaoDepois(
  atual: SituacaoDoChamado, autor: 'usuario' | 'suporte', opcoes: { interna?: boolean; escolhida?: SituacaoDoChamado | null } = {},
): SituacaoDoChamado {
  if (autor === 'usuario') return 'aberto'
  if (opcoes.escolhida) return opcoes.escolhida
  if (opcoes.interna) return atual
  return 'aguardando_clinica'
}

/**
 * O contexto que o navegador manda junto com o chamado (onde a pessoa estava).
 * Só os campos conhecidos, em texto e curtos — o resto (usuário, rede,
 * unidade) o servidor põe a partir da sessão.
 */
export function contextoDoNavegador(bruto: unknown): { pagina: string | null; tela: string | null; navegador: string | null } {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return { pagina: texto(o.pagina, 300), tela: texto(o.tela, 30), navegador: texto(o.navegador, 300) }
}

/** O anexo é PNG ou JPEG pelo CABEÇALHO do arquivo (não pelo `type` do navegador). */
export function tipoDaImagem(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}

export const ANEXO_MAXIMO = 5 * 1024 * 1024
