DELETE FROM public.epika_opzioni WHERE tipo = 'soggetto_scab';
DELETE FROM public.epika_opzioni WHERE tipo IN ('scab_validatore', 'allenatore', 'scab_allievo_allenatore');

INSERT INTO public.epika_opzioni (tipo, valore, attivo) VALUES
-- Validatori
('scab_validatore', 'Beleno', true),
('scab_validatore', 'Cunagato', true),
('scab_validatore', 'Kratos', true),
('scab_validatore', 'Tito', true),

-- Allenatori
('allenatore', 'Beleno', true),
('allenatore', 'Canturios', true),
('allenatore', 'Cunagato', true),
('allenatore', 'Garid', true),
('allenatore', 'Kratos', true),
('allenatore', 'Lisando', true),
('allenatore', 'Minor', true),
('allenatore', 'Tito', true),
('allenatore', 'Nevio', true),
('allenatore', 'Mirco', true),

-- Allievi Allenatori
('scab_allievo_allenatore', 'Alcor', true),
('scab_allievo_allenatore', 'Aspies', true),
('scab_allievo_allenatore', 'Bledinus', true),
('scab_allievo_allenatore', 'Bran', true),
('scab_allievo_allenatore', 'Cadmo', true),
('scab_allievo_allenatore', 'Eutidemo', true),
('scab_allievo_allenatore', 'Ferret', true),
('scab_allievo_allenatore', 'Lykos', true),
('scab_allievo_allenatore', 'Maponos', true),
('scab_allievo_allenatore', 'Vinnoviro', true),
('scab_allievo_allenatore', 'Virosagos', true),
('scab_allievo_allenatore', 'Zobo', true);
