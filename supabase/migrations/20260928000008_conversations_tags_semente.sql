-- conversations.tags FICA — decisão do Heitor em 2026-09-28.
--
-- Estava na lista de dívidas para sair "depois do soak". Não sai: é a SEMENTE
-- das tags da pessoa. Quem cria a conversa (webhook, anúncio, cadastro) escreve
-- ali as tags derivadas da origem, e o gatilho trg_conversa_ganha_contato as
-- leva para contacts.tags no nascimento da thread. Tirá-la obrigaria os três
-- pontos que criam conversa a escrever na pessoa — o que o gatilho existe
-- justamente para evitar (CLAUDE.md §9.2.1).
--
-- O app nunca a LÊ: a fonte das tags é contacts.tags.

comment on column public.conversations.tags is
  'SEMENTE das tags da pessoa: escrita no nascimento da thread (tags derivadas da origem) e levada a contacts.tags pelo gatilho trg_conversa_ganha_contato. O app nunca lê daqui — a fonte é contacts.tags.';
