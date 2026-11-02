-- F2b da 5ª simulação (decisão do Heitor, 2026-11-01: "concordo"): o pacote
-- se cancela, e as sessões que sobraram ficam CANCELADAS — nem livres (não se
-- agendam mais), nem usadas (não foram feitas).
--
-- Sozinha porque o valor novo de um enum não se usa na mesma transação em
-- que nasce (o 20261101000252 o usa).
alter type public."PackageSessionStatus" add value if not exists 'CANCELLED';
