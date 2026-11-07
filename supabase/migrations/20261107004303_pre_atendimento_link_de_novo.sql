-- A22 da 9ª simulação (2026-11-07): o link da ficha de pré-atendimento
-- aparecia UMA vez, e quem o perdia tinha de "Gerar outro link" — que cancela
-- o anterior (a recepção gerava vários). Enquanto o link vale, a janela do
-- agendamento o mostra de novo, o MESMO.
--
-- O token segue fora do banco em texto: guarda-se CIFRADO (AES-256-GCM, a
-- chave do cofre das integrações, `CREDENCIAIS_CHAVE`, fora do banco — o mesmo
-- `cifrado:v1:`), ao lado do hash que confere quem abre. Quem tem só o banco
-- não abre o link; e o link ainda pede o CPF ou o nascimento. A tabela segue
-- sem política nenhuma (só o servidor lê e grava).

alter table public.pre_atendimento_links
  add column if not exists token_cifrado text;

comment on column public.pre_atendimento_links.token_cifrado is
  'A22 (9ª simulação): o token do link, cifrado pelo cofre (lib/integracoes/cofre.ts), para a equipe copiar de novo enquanto vale. Nulo nos links de antes.';
