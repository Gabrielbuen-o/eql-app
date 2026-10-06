-- =====================================================================
-- EQL Group — carga inicial (demandas e funcionários de 06/10/2026)
-- Rode UMA vez, depois do 01_estrutura.sql. Daqui pra frente, tudo pelo app.
-- =====================================================================

insert into public.demandas (empresa, grupo, nome, descricao, fase, percentual, inicio, entrega) values
-- EQL Engenharia · obras civis
('engenharia', 'Obras civis', 'Zopone',               'Pré-moldados: produção e entrega', 'execucao',  0, null,         '2026-10-15'),
('engenharia', 'Obras civis', 'Scala',                'Obra',                             'aprovacao', 0, '2026-10-08', '2027-02-03'),
('engenharia', 'Obras civis', 'Santa Maria',          'Obra',                             'aprovacao', 0, '2026-10-12', '2026-10-30'),
('engenharia', 'Obras civis', 'Arujazinho Visitante', 'Obra',                             'execucao', 80, null,         '2026-10-15'),
('engenharia', 'Obras civis', 'Arujazinho Pinheiros', 'Obra',                             'aprovacao', 0, '2026-10-16', '2026-11-14'),
('engenharia', 'Obras civis', 'Riviera',              'Obra',                             'execucao', 50, null,         '2026-10-07'),
('engenharia', 'Obras civis', 'Tatuapé',              'Obra',                             'execucao', 50, null,         '2026-10-14'),
-- EQL Engenharia · Help (telecom)
('engenharia', 'Help', 'SPO765', 'Telecom', 'execucao', 0, null, '2026-10-09'),
('engenharia', 'Help', 'SPO131', 'Telecom', 'execucao', 0, null, '2026-10-09'),
('engenharia', 'Help', 'RJO018', 'Telecom', 'execucao', 0, null, null),
('engenharia', 'Help', 'RJO092', 'Telecom', 'execucao', 0, null, '2026-10-31'),
('engenharia', 'Help', 'MGC006', 'Telecom', 'execucao', 0, null, '2026-10-31'),
('engenharia', 'Help', 'SPO138', 'Telecom', 'execucao', 0, null, null),
('engenharia', 'Help', 'SPO790', 'Telecom', 'execucao', 0, null, '2026-10-15'),
('engenharia', 'Help', 'MAU007', 'Telecom', 'execucao', 0, null, null),
('engenharia', 'Help', 'SPO230', 'Telecom', 'execucao', 0, null, null),
-- EQL Engenharia · Agplan (telecom)
('engenharia', 'Agplan', 'IHS1', 'Telecom', 'execucao', 0, null, null),
('engenharia', 'Agplan', 'IHS2', 'Telecom', 'execucao', 0, null, null),
('engenharia', 'Agplan', 'PGR',  'Telecom', 'execucao', 0, null, null),
-- EQL Impermeabilização
('impermeabilizacao', 'Obras', 'Santa Maria', 'Impermeabilização da obra Santa Maria', 'aprovacao', 0, null, '2026-11-03'),
('impermeabilizacao', 'Obras', 'Juliano',     'Impermeabilização', 'execucao',   0, null, '2026-10-07'),
('impermeabilizacao', 'Obras', 'SBI',         'Impermeabilização', 'execucao',   0, null, '2026-10-09'),
('impermeabilizacao', 'Obras', 'Sérgio',      'Impermeabilização', 'execucao',   0, null, '2026-10-05'),
('impermeabilizacao', 'Obras', 'Felipe',      'Impermeabilização', 'execucao',  80, null, '2026-10-09'),
('impermeabilizacao', 'Obras', 'Daniel',      'Impermeabilização', 'orcamento',  0, null, null),
('impermeabilizacao', 'Obras', 'Silvio',      'Impermeabilização', 'execucao',  90, null, '2026-10-09');

-- EQL Eko · produção
insert into public.demandas (empresa, grupo, nome, descricao, fase, entrega, qtd_total, qtd_produzida, unidade) values
('eko', 'Produção', 'Sacos EQL Concret', '30 kg · 30 MPa',       'execucao', null,         1000, 0, 'sacos'),
('eko', 'Produção', 'Placas',            'Para a obra Zopone',   'execucao', '2026-10-15',  500, 0, 'placas'),
('eko', 'Produção', 'Mourões',           'Para a obra Zopone',   'execucao', '2026-10-15',   50, 0, 'mourões');

-- Funcionários
insert into public.funcionarios (nome, ordem) values
('Rodrigo', 1), ('Anderson', 2), ('Felipe', 3), ('Ezequias', 4),
('Jefferson', 5),
('Willian', 6), ('Diego', 7), ('Raimundo', 8), ('Jeferson', 9),
('Rafael', 10), ('Luiz Carlos', 11), ('Jackson', 12);
