import 'server-only'

/**
 * As três formas de terminar uma consulta ao banco — e nenhuma delas é o
 * silêncio.
 *
 * O padrão que este arquivo existe para eliminar é
 * `await admin.from('x').update(...)`, sem nada recebendo o retorno: ali o
 * erro não chega nem a existir para o código. A gravação acontece ou não
 * acontece, e o sistema segue igual nos dois casos. Foi assim que o caixa
 * ficou dois meses com a tabela em zero linhas e que a exportação de LGPD saiu
 * sem atendimentos — sempre o mesmo sintoma, que é a ausência de sintoma.
 *
 * Escolher entre `gravar`, `ler` e `tentar` obriga a decidir o que fazer
 * quando falhar. Continuar em frente vira uma escolha escrita (`tentar`), e
 * não o que acontece por descuido.
 *
 * `gravar` e `ler` têm a mesma garantia — erro vira exceção — e nomes
 * diferentes de propósito: procurar por `gravar(` lista, num grep, tudo que
 * este sistema escreve.
 */

/**
 * A falha, como o supabase-js a entrega.
 *
 * Tipada à mão em vez de importar `PostgrestError`: o Storage devolve
 * `StorageError`, que não tem `code`, e apagar um arquivo falha em silêncio
 * exatamente como um `update`. Um helper que só servisse ao Postgres deixaria
 * metade das gravações de fora.
 */
export interface FalhaDoSupabase {
  message: string
  code?:   string
  details?: string
}

/** Falha de banco com o que se tentava fazer, em português, junto. */
export class ErroDeBanco extends Error {
  constructor(
    readonly oQue: string,
    readonly causa: FalhaDoSupabase,
  ) {
    super(`Não consegui ${oQue}.`)
    this.name = 'ErroDeBanco'
  }
}

/**
 * O que uma consulta devolve. O builder do supabase-js é *thenable*, não
 * `Promise`: aceitar `PromiseLike` é o que permite passar a consulta direto,
 * sem `await` antes.
 */
type Resposta<T> = { data: T; error: FalhaDoSupabase | null }

/**
 * Escreve — e para o fluxo se não escrever.
 *
 * `oQue` completa a frase "Não consegui ___": *criar a parcela*, *marcar a
 * transação como estornada*. É o que a pessoa vê e o que sai no log.
 */
export async function gravar<T>(consulta: PromiseLike<Resposta<T>>, oQue: string): Promise<T> {
  const { data, error } = await consulta
  if (error) throw registrar(oQue, error)
  return data
}

/** Lê — e para o fluxo se a leitura falhar, em vez de devolver lista vazia. */
export async function ler<T>(consulta: PromiseLike<Resposta<T>>, oQue: string): Promise<T> {
  const { data, error } = await consulta
  if (error) throw registrar(oQue, error)
  return data
}

/**
 * Tenta, registra a falha e segue em frente — para o que é acessório de
 * verdade: o retrato de uma versão, o aviso que acompanha uma ação que já
 * aconteceu. Devolve se deu certo, para quem quiser contar.
 *
 * O ponto não é evitar a exceção; é que o silêncio fique escrito no código,
 * com o motivo ao lado, em vez de ser o que sobra quando ninguém olhou.
 */
export async function tentar(consulta: PromiseLike<Resposta<unknown>>, oQue: string): Promise<boolean> {
  const { error } = await consulta
  if (error) { registrar(oQue, error); return false }
  return true
}

/**
 * Os códigos com que uma função do banco FALA COM O USUÁRIO.
 *
 * Uma função nossa que levanta `RAISE EXCEPTION 'Este lançamento já foi
 * estornado.' USING ERRCODE = 'invalid_parameter_value'` escreveu uma frase
 * para ser lida por gente. Trocá-la por "Não consegui estornar o lançamento."
 * seria jogar fora a única explicação que existe.
 *
 * Fora desta lista, a mensagem do Postgres é técnica (`column "x" does not
 * exist`) e não vai para a tela.
 */
const CODIGOS_DE_REGRA = new Set([
  'P0001', // raise_exception — o RAISE sem código próprio
  'P0002', // no_data_found
  '22023', // invalid_parameter_value
])

/**
 * A mensagem que a tela mostra.
 *
 * As actions do projeto devolvem `{ error: string }` e o componente exibe ao
 * lado do formulário. Deixar a exceção subir até o `error.tsx` trocaria esse
 * aviso por uma página de falha — barulhento demais para um lançamento que só
 * precisa ser refeito.
 */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroDeBanco) {
    return CODIGOS_DE_REGRA.has(e.causa.code ?? '') && e.causa.message
      ? e.causa.message
      : e.message
  }
  if (e instanceof Error && e.message) return e.message
  return 'Não consegui completar a operação.'
}

function registrar(oQue: string, error: FalhaDoSupabase): ErroDeBanco {
  // `code` na frente porque é ele que identifica a classe do problema — 42703
  // é coluna que não existe, 23505 é violação de único —, e é a primeira coisa
  // que se procura no log.
  console.error(`[db] falhou ao ${oQue}: ${error.code ?? '?'} ${error.message}`, error.details ?? '')
  return new ErroDeBanco(oQue, error)
}
