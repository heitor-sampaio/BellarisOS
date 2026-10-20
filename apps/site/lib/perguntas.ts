import { reaisDe } from '@estetica-os/nucleo/lib/redes/valor'
import type { PlanoDoSite } from '@/lib/planos'

/**
 * As perguntas do site — a seção "O que costumam perguntar" E o `FAQPage` dos
 * dados estruturados, palavra por palavra (o buscador confere).
 *
 * As quatro primeiras (2026-10-20, GEO) são as que alguém faz a um buscador
 * ou a uma IA antes de conhecer o produto — "o que é", "para quem", "o que
 * substitui", "quanto custa" — com a resposta numa frase que se cita sozinha.
 * O preço é o do sistema (o plano mais barato ATIVO); sem planos, a pergunta
 * não aparece em vez de dizer um número inventado.
 */
export interface Pergunta { p: string; r: string }

export function perguntasDoSite(planos: PlanoDoSite[] | null): Pergunta[] {
  const maisBarato = (planos ?? []).reduce<PlanoDoSite | null>((m, p) => (!m || p.valorCentavos < m.valorCentavos ? p : m), null)
  return [
    { p: 'O que é o BellarisOS?', r: 'O BellarisOS é um sistema de gestão para clínicas de estética que junta ERP e CRM num lugar só: agenda, prontuário, WhatsApp, vendas, financeiro, estoque, marketing e um app para a cliente agendar sozinha. Funciona no navegador, no computador e no celular, e tem app para Android.' },
    { p: 'Para que tipo de clínica serve?', r: 'Para clínicas de estética, da clínica de uma unidade só às redes com várias unidades. Cada pessoa da equipe entra com o próprio acesso, e o cargo dela decide o que ela vê.' },
    { p: 'Quais sistemas o BellarisOS substitui?', r: 'A agenda num aplicativo, a planilha do financeiro e da comissão, o WhatsApp no celular de alguém, o termo em papel, o controle de estoque à parte e o lembrete mandado um por um: tudo isso fica num sistema só, falando entre si.' },
    ...(maisBarato ? [{
      p: 'Quanto custa?',
      r: `A partir de ${reaisDe(maisBarato.valorCentavos)} por mês, no plano ${maisBarato.nome}, com 14 dias grátis e sem cartão de crédito. Os planos, o que cada um inclui e a calculadora que indica o da sua clínica estão em Preços.`,
    }] : []),
    { p: 'Como funciona o teste grátis?', r: 'Você cria a conta com seu e-mail e usa o sistema inteiro por 14 dias, sem cartão de crédito. Antes de terminar, combinamos o plano; o pagamento é por Pix, boleto ou cartão.' },
    { p: 'Consigo trazer meus clientes de outro sistema?', r: 'Sim. A importação aceita uma planilha (CSV) com os contatos, e você confere tudo antes de entrar.' },
    { p: 'Preciso do WhatsApp oficial?', r: 'Não. Dá para conectar pelo WhatsApp Web, lendo o QR code, ou pelo oficial da Meta — e no oficial o aplicativo do celular continua funcionando no mesmo número. As conversas do oficial têm a tarifa da Meta, cobrada por ela direto na conta da clínica.' },
    { p: 'Quantas pessoas da equipe podem usar?', r: 'O limite de equipe, de unidades e de números de WhatsApp de cada plano está em Preços. Cada pessoa entra com o próprio acesso, e o cargo dela decide o que ela vê.' },
    { p: 'Funciona no celular?', r: 'Sim: a equipe e as clientes usam pelo navegador, no computador ou no celular. No Android também há o aplicativo, com notificações.' },
    { p: 'Minha clínica tem mais de uma unidade. Serve?', r: 'Serve. Cada unidade tem a agenda, o estoque e o caixa dela, e quem é da rede vê tudo consolidado.' },
    { p: 'Os dados são meus?', r: 'São. A clínica é a dona dos dados das clientes; o BellarisOS só os guarda e processa para o sistema funcionar, como diz a política de privacidade.' },
  ]
}
