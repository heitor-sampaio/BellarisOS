import {
  Check, Plus, Package, Gift, BarChart3, ShieldCheck, Search, FileSpreadsheet, Megaphone, Building2, ArrowRight,
} from 'lucide-react'
import { Navegador, Celular } from '@/components/molduras'
import { AvisosDoHero, DemoConversa, DemoCopilot } from '@/components/demos'
import { TELAS, type Tela } from '@/lib/telas'

/**
 * O texto do site (2026-10-17). Regra: NADA inventado — sem depoimento, sem
 * cliente, sem número de uso. Cada promessa aqui é uma funcionalidade que
 * existe no sistema (conferida no DEVLOG e no código); funcionalidade que
 * ainda depende de aprovação de terceiro (Instagram e Messenger, pela análise
 * do app na Meta) fica de fora até valer em produção.
 */

type Links = { comecar: string; entrar: string; privacidade: string }

/**
 * `data-revelar` marca o que ENTRA quando chega na tela (o valor é a direção:
 * vazio sobe, `esquerda`/`direita` vêm do lado, `zoom` cresce); `--ordem`
 * escalona os vizinhos. Quem liga é `components/movimento.tsx` — sem ele, a
 * marca não faz nada e a página fica como sempre foi.
 */
const ordem = (n: number) => ({ '--ordem': n }) as React.CSSProperties

export function Topo({ links }: { links: Links }) {
  return (
    <header className="site-topo">
      <div className="site-container site-topo-linha">
        <a href="#inicio" className="site-wordmark" aria-label="BellarisOS, início">BellarisOS <span>✦</span></a>
        <nav className="site-ancoras" aria-label="Seções">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#precos">Preços</a>
          <a href="#perguntas">Perguntas</a>
        </nav>
        <div className="site-acoes">
          <a className="site-entrar" href={links.entrar}>Entrar</a>
          <a className="site-botao site-botao-primario site-botao-pequeno" href={links.comecar}>Começar grátis</a>
        </div>
      </div>
    </header>
  )
}

export function Hero({ links }: { links: Links }) {
  return (
    <section id="inicio" className="site-hero">
      <div className="site-container">
        <div className="site-hero-texto">
          <span className="site-overline" data-revelar style={ordem(0)}>✦ Sistema para clínicas de estética</span>
          <h1 className="site-h1" data-revelar style={ordem(1)}>A clínica inteira <span className="site-h1-marca">num lugar só.</span></h1>
          <p className="site-lead" data-revelar style={{ maxWidth: 640, ...ordem(2) }}>
            Da primeira mensagem no WhatsApp ao retorno da cliente: agenda, prontuário, vendas,
            financeiro e atendimento falando entre si — sem planilha e sem cinco sistemas abertos.
          </p>
          <div className="site-hero-chamadas" data-revelar style={ordem(3)}>
            <a className="site-botao site-botao-primario" href={links.comecar}>
              Começar grátis <ArrowRight size={18} className="site-botao-seta" aria-hidden="true" />
            </a>
            <a className="site-botao site-botao-secundario" href="#precos">Ver os preços</a>
          </div>
          <p className="site-hero-nota" data-revelar style={ordem(4)}>14 dias com tudo liberado. Sem cartão de crédito.</p>
        </div>
        <div className="site-hero-visual" data-revelar="zoom" style={ordem(5)}>
          {/* O palco inclina a tela e a endireita conforme a página rola. */}
          <div className="site-hero-palco">
            <Navegador tela={TELAS.agenda} prioridade tamanhos="(min-width: 1100px) 1000px, 100vw" />
            <div className="site-hero-celular">
              <Celular tela={TELAS.inboxCelular} prioridade />
            </div>
          </div>
          <AvisosDoHero />
        </div>
      </div>
    </section>
  )
}

const FAIXA = [
  'Agenda', 'WhatsApp', 'Prontuário', 'Injetáveis', 'Pacotes', 'Financeiro', 'Comissões', 'Estoque',
  'Fidelidade', 'Automações', 'Termos assinados', 'Copilot', 'Portal da cliente', 'Relatórios',
]

/**
 * A faixa que corre embaixo do hero. É decoração (cada item está descrito na
 * página): vai duas vezes, para a volta não ter emenda, e fica parada para
 * quem pede menos movimento.
 */
export function Faixa() {
  const itens = FAIXA.map(f => <span key={f} className="site-faixa-item">{f}<i>✦</i></span>)
  return (
    <div className="site-faixa" aria-hidden="true">
      <div className="site-faixa-trilho">
        <span className="site-faixa-grupo">{itens}</span>
        <span className="site-faixa-grupo">{itens}</span>
      </div>
    </div>
  )
}

const PASSOS = [
  { titulo: 'A conversa chega', texto: 'A mensagem do WhatsApp cai no inbox da equipe, já dizendo de qual anúncio a cliente veio.' },
  { titulo: 'Vira horário', texto: 'Na própria conversa, a recepção encontra o horário livre da profissional e agenda.' },
  { titulo: 'O atendimento', texto: 'Ficha, anamnese, fotos e prontuário na sessão — e o produto usado sai do estoque.' },
  { titulo: 'A venda', texto: 'Pacote, pré-pago ou parcelado: o financeiro e a comissão se fazem sozinhos.' },
  { titulo: 'O retorno', texto: 'Automações lembram do horário e do retorno; a fidelidade dá pontos para voltar.' },
]

export function DiaDaClinica() {
  return (
    <section className="site-secao" aria-labelledby="dia-titulo">
      <div className="site-container">
        <div className="site-cabeca" data-revelar>
          <span className="site-overline">✦ O dia da clínica</span>
          <h2 id="dia-titulo" className="site-h2">Uma cliente, do primeiro “oi” ao retorno — sem passar a limpo.</h2>
        </div>
        {/* Com movimento, a vez passa de passo em passo (o preenchido em rosé). */}
        <ol className="site-passos" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="site-passo" data-revelar style={ordem(i)}>
              <span className="site-passo-numero" aria-hidden="true">{i + 1}</span>
              <h3 className="site-h3">{p.titulo}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

interface Destaque {
  overline: string
  titulo: string
  texto: string
  itens: { forte: string; resto: string }[]
  tela: Tela
  celular?: boolean
  /** A demonstração viva que flutua sobre a tela. */
  demo?: 'conversa' | 'copilot'
}

const DESTAQUES: Destaque[] = [
  {
    overline: 'WhatsApp e atendimento', titulo: 'Todo o WhatsApp da clínica numa caixa só',
    texto: 'Várias pessoas atendendo os mesmos números, cada conversa com a ficha da cliente ao lado.',
    itens: [
      { forte: 'O WhatsApp oficial da Meta', resto: ' sem largar o aplicativo do celular — os dois funcionam juntos. Ou o WhatsApp Web, pelo QR code.' },
      { forte: 'Cada conversa vira oportunidade', resto: ' num funil de vendas, com responsável e etapa.' },
      { forte: 'Modelos aprovados pela Meta', resto: ' para lembrete, confirmação e campanha.' },
    ],
    tela: TELAS.inbox, demo: 'conversa',
  },
  {
    overline: 'Agenda e atendimento', titulo: 'A agenda que a recepção entende de primeira',
    texto: 'Por profissional e por sala, com confirmação, chegada e falta. A sessão abre a ficha certa.',
    itens: [
      { forte: 'A sessão completa', resto: ': anamnese, fichas, fotos, consumo de produtos e pagamento num lugar só.' },
      { forte: 'O histórico inteiro da cliente', resto: ' — pacotes, créditos, próximos horários — na ficha.' },
      { forte: 'Cargos sob medida', resto: ': cada pessoa vê só o que o cargo dela libera.' },
    ],
    tela: TELAS.ficha,
  },
  {
    overline: 'Prontuário', titulo: 'O planejador de injetáveis, ponto a ponto',
    texto: 'O mapa do rosto com cada ponto, o produto e a dose — e o plano de tratamento ao lado.',
    itens: [
      { forte: 'Prontuário e evolução', resto: ' guardados com o cuidado que dado de saúde pede.' },
      { forte: 'Fichas do seu jeito', resto: ': monte as perguntas de anamnese da clínica.' },
      { forte: 'Planos de tratamento', resto: ' com as sessões e o que já foi feito.' },
    ],
    tela: TELAS.injetaveis,
  },
  {
    overline: 'Vendas e financeiro', titulo: 'Vendeu, entrou no caixa. Atendeu, gerou a comissão.',
    texto: 'Pacote, procedimento pré-pago, desconto e parcelas — com cada parcela no financeiro e a comissão calculada.',
    itens: [
      { forte: 'O resultado do mês', resto: ' (DRE), contas a pagar e a receber, por unidade ou da clínica inteira.' },
      { forte: 'Comissões com regra', resto: ': por profissional, por procedimento, descontando a taxa do cartão.' },
      { forte: 'Relatórios', resto: ' de vendas, agenda, clientes e comercial, prontos para exportar.' },
    ],
    tela: TELAS.financeiro,
  },
  {
    overline: 'Termos e contratos', titulo: 'Termo assinado sem papel — e conferível por qualquer um',
    texto: 'Modelos com os dados da cliente preenchidos sozinhos. A assinatura é na clínica, pelo portal ou por um link.',
    itens: [
      { forte: 'O PDF assinado', resto: ' fica na ficha, com a verificação pública do documento.' },
      { forte: 'Prefere papel?', resto: ' Imprima, colha a assinatura e guarde o documento na ficha do mesmo jeito.' },
    ],
    tela: TELAS.documento,
  },
  {
    overline: 'Automações', titulo: 'O que a recepção faria de cabeça, o sistema faz sozinho',
    texto: 'Monte regras sem programador: quando acontecer isto, espere tanto, mande aquilo — fora do horário de silêncio.',
    itens: [
      { forte: 'Lembrete e confirmação', resto: ' de horário, aniversário, retorno, reativação de quem sumiu.' },
      { forte: 'Campanhas', resto: ' para uma lista de clientes, por WhatsApp e notificação no app.' },
    ],
    tela: TELAS.automacao,
  },
  {
    overline: 'Copilot', titulo: 'Uma secretária que conhece a clínica',
    texto: 'Peça por texto ou por voz: “quais horários a Dra. Ana tem amanhã?”, “agende a Maria às 15h”. Antes de gravar qualquer coisa, ela mostra e você confirma.',
    itens: [
      { forte: 'Consulta e opera', resto: ' agenda, clientes, vendas, financeiro e estoque, com as permissões de quem pede.' },
      { forte: 'Nada clínico', resto: ' vai para a inteligência artificial: o prontuário fica no sistema.' },
    ],
    tela: TELAS.copilot, demo: 'copilot',
  },
  {
    overline: 'Portal da cliente', titulo: 'A cliente agenda sozinha — e vê o que já fez',
    texto: 'Pelo celular, a cliente vê os próximos horários, o histórico, os pacotes e os pontos, e agenda o que a clínica liberar.',
    itens: [
      { forte: 'Assina os termos', resto: ' e pede uma cópia dos próprios dados, como manda a LGPD.' },
      { forte: 'Notificações', resto: ' de horário e de campanha no celular.' },
    ],
    tela: TELAS.portal, celular: true,
  },
]

export function Destaques() {
  return (
    <section id="funcionalidades" className="site-secao" aria-label="Funcionalidades">
      <div className="site-container site-destaques">
        {DESTAQUES.map((d, i) => (
          <article key={d.titulo} className={`site-destaque${i % 2 ? ' site-destaque-invertido' : ''}`}>
            <div className="site-destaque-texto" data-revelar>
              <span className="site-overline">✦ {d.overline}</span>
              <h2 className="site-h2">{d.titulo}</h2>
              <p className="site-lead">{d.texto}</p>
              <ul className="site-lista">
                {d.itens.map(it => (
                  <li key={it.forte}><Check size={16} aria-hidden="true" /><span><strong>{it.forte}</strong>{it.resto}</span></li>
                ))}
              </ul>
            </div>
            {/* A tela vem do lado em que fica: do outro lado do texto. */}
            <div className={`site-destaque-visual${d.demo ? ' site-destaque-com-demo' : ''}`}
              data-revelar={i % 2 ? 'esquerda' : 'direita'} style={ordem(1)}>
              {d.celular ? <Celular tela={d.tela} className="site-destaque-celular" /> : <Navegador tela={d.tela} />}
              {d.demo === 'conversa' && <DemoConversa />}
              {d.demo === 'copilot' && <DemoCopilot />}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

const ITENS = [
  { icone: Package, titulo: 'Estoque com lotes', texto: 'Validade, mínimo por unidade e a baixa no próprio atendimento.' },
  { icone: Gift, titulo: 'Fidelidade', texto: 'Pontos, recompensas, vouchers e o bônus de aniversário.' },
  { icone: BarChart3, titulo: 'Indicadores', texto: 'Faturamento, ocupação, ticket médio e funil — os números de um lugar só.' },
  { icone: Megaphone, titulo: 'Anúncios', texto: 'Meta e Google ligados à venda: saiba qual campanha trouxe cliente que pagou.' },
  { icone: FileSpreadsheet, titulo: 'Importação', texto: 'Traga os contatos de outro sistema por planilha.' },
  { icone: Search, titulo: 'Busca universal', texto: 'Cliente, agendamento ou tela: tudo a um Ctrl+K.' },
  { icone: ShieldCheck, titulo: 'Cargos e acessos', texto: 'Você monta os cargos e decide quem vê o quê, módulo a módulo.' },
  { icone: Building2, titulo: 'Mais unidades', texto: 'Cresceu? Cada unidade com a operação dela, e a visão da rede inteira.' },
]

export function EAinda() {
  return (
    <section className="site-secao" aria-labelledby="ainda-titulo">
      <div className="site-container">
        <div className="site-cabeca" data-revelar>
          <span className="site-overline">✦ E ainda</span>
          <h2 id="ainda-titulo" className="site-h2">O resto do dia também mora aqui.</h2>
        </div>
        <div className="site-grade">
          {ITENS.map(({ icone: Icone, titulo, texto }, i) => (
            <div key={titulo} className="site-item" data-revelar data-luz style={ordem(i % 4)}>
              <span className="site-item-icone" aria-hidden="true"><Icone size={19} /></span>
              <h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>{titulo}</h3>
              <p>{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Seguranca() {
  return (
    <section className="site-secao" aria-labelledby="seguranca-titulo">
      <div className="site-container">
        <div className="site-seguranca" data-revelar>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="site-overline">✦ Segurança e LGPD</span>
            <h2 id="seguranca-titulo" className="site-h2">Dado de saúde com o cuidado que ele pede.</h2>
          </div>
          <div className="site-seguranca-itens">
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>O prontuário é de quem atende</h3><p>Só o cargo que libera o clínico vê prontuário, evolução e fotos — o resto da equipe, não.</p></div>
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>Cada clínica isolada</h3><p>Os dados de uma clínica nunca aparecem para outra: o isolamento está no próprio banco de dados.</p></div>
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>A cliente pede os dados dela</h3><p>Pelo portal, a cliente pede uma cópia de todos os dados dela, como manda a LGPD.</p></div>
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>Suporte só com a sua permissão</h3><p>A equipe do BellarisOS só entra na sua conta quando você libera — e nunca vê o clínico.</p></div>
          </div>
        </div>
      </div>
    </section>
  )
}

const PERGUNTAS = [
  { p: 'Como funciona o teste grátis?', r: 'Você cria a conta com seu e-mail e usa o sistema inteiro por 14 dias, sem cartão de crédito. Antes de terminar, combinamos o plano; o pagamento é por Pix, boleto ou cartão.' },
  { p: 'Consigo trazer meus clientes de outro sistema?', r: 'Sim. A importação aceita uma planilha (CSV) com os contatos, e você confere tudo antes de entrar.' },
  { p: 'Preciso do WhatsApp oficial?', r: 'Não. Dá para conectar pelo WhatsApp Web, lendo o QR code, ou pelo oficial da Meta — e no oficial o aplicativo do celular continua funcionando no mesmo número. As conversas do oficial têm a tarifa da Meta, cobrada por ela direto na conta da clínica.' },
  { p: 'Quantas pessoas da equipe podem usar?', r: 'O limite de equipe, de unidades e de números de WhatsApp de cada plano está em Preços. Cada pessoa entra com o próprio acesso, e o cargo dela decide o que ela vê.' },
  { p: 'Funciona no celular?', r: 'Sim: a equipe e as clientes usam pelo navegador, no computador ou no celular. No Android também há o aplicativo, com notificações.' },
  { p: 'Minha clínica tem mais de uma unidade. Serve?', r: 'Serve. Cada unidade tem a agenda, o estoque e o caixa dela, e quem é da rede vê tudo consolidado.' },
  { p: 'Os dados são meus?', r: 'São. A clínica é a dona dos dados das clientes; o BellarisOS só os guarda e processa para o sistema funcionar, como diz a política de privacidade.' },
]

export function Perguntas() {
  return (
    <section id="perguntas" className="site-secao" aria-labelledby="perguntas-titulo">
      <div className="site-container">
        <div className="site-cabeca site-cabeca-centro" data-revelar>
          <span className="site-overline">✦ Perguntas</span>
          <h2 id="perguntas-titulo" className="site-h2">O que costumam perguntar</h2>
        </div>
        <div className="site-perguntas">
          {PERGUNTAS.map((q, i) => (
            <details key={q.p} className="site-pergunta" data-revelar style={ordem(i)}>
              <summary>{q.p}<Plus size={18} aria-hidden="true" /></summary>
              <p>{q.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Final({ links }: { links: Links }) {
  return (
    <section className="site-secao" aria-labelledby="final-titulo">
      <div className="site-container">
        <div className="site-final" data-revelar="zoom">
          <h2 id="final-titulo" className="site-h2">Teste na sua clínica, com a sua agenda.</h2>
          <p className="site-lead">14 dias com tudo liberado. Se não fizer sentido, é só não continuar.</p>
          <a className="site-botao site-botao-claro" href={links.comecar}>Começar grátis</a>
        </div>
      </div>
    </section>
  )
}

export function Rodape({ links }: { links: Links }) {
  return (
    <footer className="site-rodape">
      <div className="site-container site-rodape-linha">
        <a href="#inicio" className="site-wordmark">BellarisOS <span>✦</span></a>
        <nav aria-label="Rodapé">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#precos">Preços</a>
          <a href={links.entrar}>Entrar</a>
          <a href={links.comecar}>Começar grátis</a>
          <a href={links.privacidade}>Política de Privacidade</a>
        </nav>
        <small>© {new Date().getFullYear()} BellarisOS</small>
      </div>
    </footer>
  )
}
