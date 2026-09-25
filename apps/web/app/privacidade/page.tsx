import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTROLADOR, ATUALIZADA_EM, faltaPreencher } from './dados-do-controlador'

/**
 * Política de privacidade — PÚBLICA.
 *
 * Não chama `getTenantContext` nem `assertPermission`, e é isso que a torna
 * pública: neste projeto quem protege a rota é a própria página (§6), não há
 * middleware. Ela precisa abrir sem sessão porque é lida por quem ainda não
 * entrou — e porque loja de aplicativo exige uma URL pública para publicar o
 * app.
 *
 * O texto descreve o que o sistema FAZ, e cada afirmação foi conferida no
 * código: os quatro buckets privados, os terceiros que realmente recebem dado,
 * o que o pedido de LGPD entrega e o que a retenção apaga. Não há promessa que
 * o sistema não cumpra — é o tipo de documento em que uma frase confortável e
 * falsa custa caro.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Política de Privacidade — BellarisOS',
  description: 'Como o BellarisOS trata dados pessoais, incluindo dados de saúde, e como exercer seus direitos.',
}

export default function PoliticaDePrivacidade() {
  const pendentes = faltaPreencher()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      <Cabecalho />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
        <p className="overline" style={{ marginBottom: 12 }}>BellarisOS</p>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          lineHeight: 1.15,
          marginBottom: 10,
        }}>
          Política de Privacidade
        </h1>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 32 }}>
          Última atualização: {formatarData(ATUALIZADA_EM)}
        </p>

        {pendentes.length > 0 && <AvisoDePendencia campos={pendentes} />}

        <Secao titulo="1. Em uma frase">
          <P>
            O BellarisOS é o sistema que a clínica usa para operar: agenda, cadastro de
            clientes, prontuário, conversas, estoque e financeiro. Quase todo dado pessoal
            que passa por aqui é <B>da clínica que atende você</B> — nós o guardamos e
            processamos por conta dela, seguindo as instruções dela.
          </P>
        </Secao>

        <Secao titulo="2. Quem decide o quê: controlador e operador">
          <P>
            Essa distinção muda a quem você pede o quê, então ela vem antes de tudo.
          </P>
          <Lista itens={[
            <>
              <B>A clínica é a controladora</B> dos dados de quem ela atende. É ela que
              decide coletar seu CPF, abrir seu prontuário, guardar suas fotos e conversar
              com você. Pedidos sobre esses dados começam nela.
            </>,
            <>
              <B>O BellarisOS é o operador</B> desses mesmos dados: tratamos em nome da
              clínica, dentro do que ela determina, e não usamos o dado dela para
              finalidade própria. Não vendemos dado, não fazemos perfil publicitário com o
              dado da clínica e não cruzamos base de uma clínica com a de outra — cada rede
              vê apenas a própria (isolamento por rede e por unidade, aplicado em todas as
              consultas e também no banco).
            </>,
            <>
              <B>Somos controladores</B> de um conjunto pequeno e específico: os dados de
              conta de quem usa o sistema para trabalhar (nome, e-mail, telefone, cargo,
              unidade), os registros técnicos de acesso e os dados de cobrança da
              assinatura. Sobre esses, fale direto conosco.
            </>,
          ]} />
        </Secao>

        <Secao titulo="3. Que dados o sistema trata">
          <P>
            Depende de quem você é. O sistema separa duas pessoas diferentes, e o que ele
            guarda de cada uma também é diferente.
          </P>

          <SubTitulo>Se você é cliente de uma clínica</SubTitulo>
          <Lista itens={[
            <><B>Identificação e contato:</B> nome, CPF, data de nascimento, telefone, e-mail, endereço.</>,
            <><B>Atendimento:</B> agendamentos, procedimentos realizados, profissional, unidade, observações da equipe.</>,
            <><B>Saúde:</B> fichas clínicas e questionário de saúde, intercorrências, produtos aplicados, fotos de antes, durante e depois, termos de consentimento assinados. <B>Ver a seção 4.</B></>,
            <><B>Conversas:</B> mensagens trocadas com a clínica por WhatsApp, Instagram, Messenger ou e-mail, incluindo anexos, quando a clínica usa a caixa de entrada do sistema.</>,
            <><B>Comercial:</B> origem do contato, interesse, etapa da negociação, marcações (tags).</>,
            <><B>Financeiro:</B> lançamentos, forma de pagamento, parcelas, créditos e estornos.</>,
            <><B>App e portal:</B> credenciais de acesso e identificador do aparelho para envio de notificação, se você instalar o aplicativo.</>,
          ]} />

          <SubTitulo>Se você usa o sistema para trabalhar</SubTitulo>
          <Lista itens={[
            <><B>Conta:</B> nome, e-mail, telefone, foto, cargo, unidade e permissões.</>,
            <><B>Uso:</B> registro de ações relevantes — quem confirmou, cancelou, remarcou, lançou ou alterou o quê, e quando. Esse registro existe para auditoria e para você conseguir reconstruir o que aconteceu.</>,
            <><B>Aparelhos:</B> identificador para notificação, se você instalar o aplicativo ou autorizar avisos no navegador.</>,
          ]} />
        </Secao>

        <Secao titulo="4. Dado de saúde é tratado como dado sensível">
          <P>
            Prontuário, questionário de saúde, fotos clínicas e termos de consentimento são{' '}
            <B>dados pessoais sensíveis</B> (art. 5º, II, da LGPD) e recebem tratamento à
            parte no sistema:
          </P>
          <Lista itens={[
            <>Ficam em armazenamento <B>privado</B>, nunca em endereço público. Cada abertura de foto ou documento gera um link temporário, que expira.</>,
            <>O acesso depende de permissão específica de prontuário. Quem trabalha na clínica sem essa permissão não enxerga o conteúdo clínico, mesmo vendo a agenda ou o cadastro.</>,
            <>O <B>cliente não acessa o próprio prontuário pelo aplicativo</B> — ali ele vê o histórico de procedimentos, não o conteúdo clínico. Para receber o prontuário é preciso pedir, e o pedido passa por liberação de quem responde por ele na clínica (seção 9).</>,
            <>Os avisos que o sistema manda sobre atendimento <B>não carregam conteúdo clínico</B>. A notificação diz que a ficha chegou; quem precisa do conteúdo abre o prontuário, com a permissão que ele exige.</>,
          ]} />
        </Secao>

        <Secao titulo="5. Para que tratamos, e com que fundamento">
          <Tabela
            colunas={['Para quê', 'Fundamento legal (LGPD)']}
            linhas={[
              ['Executar o contrato com a clínica e manter o sistema no ar', 'Execução de contrato (art. 7º, V)'],
              ['Agendar, atender, cobrar e registrar o que aconteceu', 'Execução de contrato e legítimo interesse da clínica (art. 7º, V e IX)'],
              ['Guardar prontuário e registro clínico', 'Tutela da saúde, por profissional de saúde ou serviço de saúde (art. 11, II, "f")'],
              ['Guardar registro financeiro e fiscal', 'Cumprimento de obrigação legal ou regulatória (art. 7º, II)'],
              ['Mandar mensagem de confirmação, lembrete e aviso de atendimento', 'Execução de contrato e legítimo interesse (art. 7º, V e IX)'],
              ['Mandar comunicação de marketing e promoção', 'Consentimento (art. 7º, I) — e você pode retirar quando quiser'],
              ['Registrar quem fez o quê no sistema, para auditoria', 'Legítimo interesse (art. 7º, IX)'],
            ]}
          />
        </Secao>

        <Secao titulo="6. Com quem os dados são compartilhados">
          <P>
            Só com quem é necessário para o sistema funcionar, e cada um recebe apenas o
            que precisa. Esta lista é o que o sistema de fato usa hoje:
          </P>
          <Tabela
            colunas={['Quem', 'Para quê', 'Onde']}
            linhas={[
              ['Supabase', 'Banco de dados, autenticação e armazenamento de arquivos', 'Estados Unidos'],
              ['Railway', 'Hospedagem da aplicação e das rotinas agendadas', 'Estados Unidos'],
              ['Upstash', 'Cache e controle de fila', 'Estados Unidos'],
              ['Meta (WhatsApp, Instagram, Messenger)', 'Envio e recebimento de mensagens pelos canais oficiais e medição de campanhas, quando a clínica conecta a conta dela', 'Estados Unidos'],
              ['uazapi', 'Envio e recebimento pelo WhatsApp em conexão não oficial, quando a clínica escolhe esse caminho', 'Brasil'],
              ['Google (Firebase Cloud Messaging)', 'Entrega das notificações no aplicativo', 'Estados Unidos'],
            ]}
          />
          <P>
            Também compartilhamos quando a lei ou uma ordem de autoridade competente exigir.
            Fora isso, <B>não vendemos e não cedemos dado pessoal a terceiro</B>.
          </P>
          <Nota>
            Alguns desses serviços ficam fora do Brasil, o que caracteriza transferência
            internacional de dados (art. 33 da LGPD). Ela acontece para executar o contrato
            e é feita com fornecedores que assumem compromissos contratuais de proteção.
          </Nota>
        </Secao>

        <Secao titulo="7. Por quanto tempo guardamos">
          <Lista itens={[
            <><B>Prontuário e registro clínico:</B> pelo prazo que a legislação e a regulação profissional exigem. <B>Não são apagados a pedido</B> — ver a seção 9.</>,
            <><B>Registro financeiro e fiscal:</B> pelo prazo legal aplicável. Lançamento não se apaga; correção é feita por estorno, que deixa os dois lados registrados.</>,
            <><B>Cadastro, conversas e histórico comercial:</B> enquanto durar a relação com a clínica e pelos prazos legais depois dela.</>,
            <><B>Registro interno de eventos do sistema</B> (a trilha técnica que o sistema usa para reagir a fatos e para automações): <B>30 dias</B>, e depois é apagado automaticamente.</>,
            <><B>Pacote de exportação de dados:</B> fica disponível por <B>30 dias</B> a partir da geração e depois expira.</>,
          ]} />
        </Secao>

        <Secao titulo="8. Segurança">
          <Lista itens={[
            <>Tráfego cifrado e dados em repouso protegidos pela infraestrutura do provedor.</>,
            <>Arquivos clínicos, documentos e mídia de conversa em armazenamento <B>privado</B>, acessíveis só por link temporário gerado na hora.</>,
            <>Controle de acesso em três eixos — o que o cargo pode fazer, sobre quais registros, em quais unidades —, aplicado na aplicação e reforçado no próprio banco de dados.</>,
            <>Registro de ações relevantes, para que seja possível reconstruir o que aconteceu.</>,
          ]} />
          <Nota>
            Nenhum sistema é imune. Se ocorrer incidente de segurança com risco relevante,
            comunicamos a clínica e, no que nos couber, a Autoridade Nacional de Proteção de
            Dados e os titulares, nos termos do art. 48 da LGPD.
          </Nota>
        </Secao>

        <Secao titulo="9. Seus direitos, e como exercer">
          <P>
            A LGPD garante a você confirmação do tratamento, acesso, correção, portabilidade,
            informação sobre compartilhamento, revogação de consentimento e, em certas
            hipóteses, anonimização, bloqueio ou eliminação (art. 18).
          </P>

          <SubTitulo>Como pedir</SubTitulo>
          <Lista itens={[
            <>
              <B>Se você é cliente de uma clínica:</B> o caminho mais direto é o portal do
              cliente, em <Codigo>Perfil → Meus dados</Codigo>. O sistema monta um pacote com
              o que existe sobre você, em <B>PDF</B> (para ler) e <B>JSON</B> (para levar a
              outro serviço), disponível por download privado durante 30 dias. Você também
              pode falar direto com a clínica que atende você.
            </>,
            <>
              <B>Sobre o conteúdo do prontuário:</B> você marca no pedido que quer incluí-lo,
              e a liberação é decidida por quem responde pelo prontuário na clínica. Aprovado,
              o pacote é gerado de novo com a parte clínica junto.
            </>,
            <>
              <B>Se você usa o sistema para trabalhar:</B> fale com o encarregado, no contato
              da seção 12.
            </>,
          ]} />

          <SubTitulo>O que não apagamos, e por quê</SubTitulo>
          <P>
            <B>Não excluímos prontuário nem registro financeiro a pedido.</B> Não é uma
            escolha de produto: prontuário tem guarda obrigatória por lei e por norma
            profissional, e registro fiscal tem prazo próprio. Apagá-los conflitaria com
            esses deveres — e a LGPD reconhece isso expressamente (art. 16, I). Fora dessas
            hipóteses, o pedido de eliminação é atendido.
          </P>
        </Secao>

        <Secao titulo="10. Cookies e armazenamento no seu aparelho">
          <P>
            Usamos o necessário para o sistema funcionar: manter você conectado, lembrar
            preferências de tela e, se você autorizar, registrar o aparelho para receber
            notificação. <B>Não usamos cookie de publicidade nem de rastreamento de terceiros
            no sistema.</B> Você pode bloquear ou apagar cookies no navegador, com a ressalva
            de que sem os de sessão não é possível manter você conectado.
          </P>
        </Secao>

        <Secao titulo="11. Crianças e adolescentes">
          <P>
            Menores podem ser atendidos pelas clínicas, e nesse caso o tratamento dos dados
            depende de consentimento específico de pelo menos um dos pais ou do responsável
            legal, na forma do art. 14 da LGPD. Recolher esse consentimento é da clínica que
            atende; o sistema é onde ele fica registrado.
          </P>
        </Secao>

        <Secao titulo="12. Contato">
          <P>
            Para exercer direitos, tirar dúvidas ou reclamar sobre o tratamento dos seus
            dados, fale com o nosso encarregado:
          </P>
          <BlocoDeContato />
          <P>
            Você também pode reclamar à{' '}
            <A href="https://www.gov.br/anpd">Autoridade Nacional de Proteção de Dados (ANPD)</A>.
          </P>
        </Secao>

        <Secao titulo="13. Mudanças nesta política">
          <P>
            Se o sistema mudar o que faz com dado pessoal, este texto muda junto e a data no
            topo é atualizada. Mudança relevante é comunicada às clínicas contratantes.
          </P>
        </Secao>
      </main>

      <Rodape />
    </div>
  )
}

/* ── Peças da página ─────────────────────────────────────────────────────── */

function Cabecalho() {
  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{
        maxWidth: 760, margin: '0 auto', padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{
          fontSize: 20, fontWeight: 'var(--weight-extrabold)', color: 'var(--brand)',
          letterSpacing: 'var(--tracking-tight)', textDecoration: 'none',
        }}>
          BellarisOS ✦
        </Link>
        <Link href="/login" style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-muted)', textDecoration: 'none',
        }}>
          Entrar
        </Link>
      </div>
    </header>
  )
}

function Rodape() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: 24, textAlign: 'center' }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
        © 2026 BellarisOS · <Link href="/" style={{ color: 'var(--text-faint)' }}>Início</Link>
      </p>
    </footer>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{
        fontSize: 'var(--text-name)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        color: 'var(--text)',
        marginBottom: 12,
      }}>
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function SubTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 'var(--text-card-title)',
      fontWeight: 'var(--weight-bold)',
      color: 'var(--text)',
      marginTop: 20,
      marginBottom: 8,
    }}>
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 'var(--text-base-sz)',
      color: 'var(--text-soft)',
      lineHeight: 'var(--leading-normal)',
      marginBottom: 12,
    }}>
      {children}
    </p>
  )
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{children}</strong>
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ color: 'var(--brand)', fontWeight: 'var(--weight-semibold)' }}>
      {children}
    </a>
  )
}

function Codigo({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs-sz)',
      background: 'var(--bg-app)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '1px 6px', color: 'var(--text)',
    }}>
      {children}
    </code>
  )
}

function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul style={{ margin: '0 0 12px', paddingLeft: 0, listStyle: 'none' }}>
      {itens.map((item, i) => (
        <li key={i} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          fontSize: 'var(--text-base-sz)', color: 'var(--text-soft)',
          lineHeight: 'var(--leading-normal)', marginBottom: 10,
        }}>
          <span aria-hidden style={{
            flexShrink: 0, width: 5, height: 5, borderRadius: '50%',
            background: 'var(--brand)', marginTop: 9,
          }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Tabela que vira lista de blocos no celular — ver `.cards-mobile`. */
function Tabela({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {colunas.map(c => (
                <th key={c} style={{
                  fontSize: 'var(--text-overline)', fontWeight: 'var(--weight-bold)',
                  color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase',
                  padding: '10px 16px', textAlign: 'left', background: 'var(--bg-app)',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={i} style={{ borderBottom: i < linhas.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                {linha.map((celula, j) => (
                  <td key={j} data-label={j === 0 ? '' : colunas[j]} style={{
                    padding: '11px 16px', fontSize: 'var(--text-sm-sz)',
                    color: j === 0 ? 'var(--text)' : 'var(--text-soft)',
                    fontWeight: j === 0 ? 'var(--weight-bold)' : 'var(--weight-regular)',
                    lineHeight: 'var(--leading-snug)', verticalAlign: 'top',
                  }}>
                    {celula}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
      lineHeight: 'var(--leading-normal)',
      borderLeft: '2px solid var(--border)', paddingLeft: 14, margin: '4px 0 12px',
    }}>
      {children}
    </p>
  )
}

function BlocoDeContato() {
  const { razaoSocial, cnpj, endereco, encarregado, emailContato } = CONTROLADOR
  const linhas: [string, string][] = [
    ['Encarregado (DPO)', encarregado.nome],
    ['E-mail',            encarregado.email],
    ['Razão social',      razaoSocial],
    ['CNPJ',              cnpj],
    ['Endereço',          endereco],
    ['Contato geral',     emailContato],
  ]
  const preenchidas = linhas.filter(([, v]) => v)

  if (preenchidas.length === 0) {
    return (
      <div className="card" style={{ padding: '16px 18px', marginBottom: 12 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Contato ainda não publicado.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {preenchidas.map(([rotulo, valor]) => (
        <div key={rotulo} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span className="overline" style={{ minWidth: 130 }}>{rotulo}</span>
          <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)' }}>
            {rotulo === 'E-mail' || rotulo === 'Contato geral'
              ? <a href={`mailto:${valor}`} style={{ color: 'var(--brand)' }}>{valor}</a>
              : valor}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Enquanto faltar dado de identificação, a página avisa — em vez de publicar um
 * documento que parece completo e não é.
 */
function AvisoDePendencia({ campos }: { campos: string[] }) {
  return (
    <div style={{
      background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
      borderRadius: 'var(--radius-card-token)', padding: '14px 16px', marginBottom: 28,
    }}>
      <p style={{
        fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
        color: 'var(--warning)', marginBottom: 4,
      }}>
        Documento ainda incompleto
      </p>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 'var(--leading-normal)' }}>
        Falta preencher: {campos.join(', ')}. Sem o canal do encarregado, o titular não tem
        a quem recorrer — e é justamente isso que a LGPD exige que esteja publicado.
      </p>
    </div>
  )
}

function formatarData(iso: string): string {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })
}
