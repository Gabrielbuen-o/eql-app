// Orçamento de MUROS PRÉ-MOLDADOS — regras de cálculo (categoria própria; outras categorias terão o seu arquivo).
// Tudo aqui é função pura: entra (dados do orçamento + parâmetros da tabela) e sai o resultado.
// O mesmo cálculo é refeito no servidor (supabase/14_orcamentos.sql) ao salvar e ao emitir.

export const CATEGORIA = 'muros';
export const NOME = 'Muros pré-moldados';

// Dinheiro: duas casas, regra única (meio para cima). Quantidades físicas nunca usam valores arredondados para exibição.
export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const teto = (x) => Math.ceil(x - 1e-9);
const n = (v, pad = 0) => { const x = Number(v); return Number.isFinite(x) ? x : pad; };

// ---------- Parâmetros iniciais (base adotada; editáveis e versionados pela gestão) ----------
export const PARAMETROS_INICIAIS = {
  nome_tabela: 'Tabela inicial',
  precos: { placa: 90, mourao: 225, montagem_m: 150 },
  custos: { placa: 42.42, mourao: 109.01 },
  dimensoes: {
    vao: 1.5, placa_altura: 0.5, mourao_comprimento: 3.2,
    placa_desc: '1,50 × 0,50 × 0,03 m', mourao_desc: '3,20 × 0,12 × 0,12 m',
  },
  alturas_validadas: [1.5, 2.0, 2.5],
  altura_referencia: 2.5,
  produtividade_placas_dia: 110,           // por equipe, a 2,50 m, mourões instalados, peças e frente liberadas
  equipe_desc: '1 encarregado, 1 técnico de obras e 2 ajudantes',
  fte_dia: 850,                            // equipe inteira por dia
  aliquota: 0.08,                          // premissa de simulação
  margem_material_min: 0.30,               // política: margem do material precisa ser SUPERIOR a 30%
  margem_material_meta: 0.40,
  margem_instalacao_min: null,             // ainda não definida: desconto na instalação depende de autorização
  despesas: [],                            // { id, nome, componente: 'material'|'instalacao', base: 'pct_custo'|'reais'|'reais_m', valor }
};

export const ESCOPOS = [
  { id: 'material', nome: 'Somente material', material: true, montagem: false },
  { id: 'material_montagem', nome: 'Material e montagem das placas', material: true, montagem: true },
  { id: 'completa', nome: 'Material e instalação completa', material: true, montagem: true, completa: true },
  { id: 'mao_de_obra', nome: 'Somente mão de obra (montagem)', material: false, montagem: true },
];
export const escopoPorId = Object.fromEntries(ESCOPOS.map((e) => [e.id, e]));
export const STATUS = [
  { id: 'rascunho', nome: 'Rascunho' }, { id: 'enviado', nome: 'Enviado' }, { id: 'negociacao', nome: 'Em negociação' },
  { id: 'aprovado', nome: 'Aprovado' }, { id: 'perdido', nome: 'Perdido' }, { id: 'cancelado', nome: 'Cancelado' },
];
export const statusNome = Object.fromEntries(STATUS.map((s) => [s.id, s.nome]));

const novoIdLocal = () => Math.random().toString(36).slice(2, 10);

// ---------- Configuração inicial de um orçamento novo ----------
export function entradaInicial({ responsavel_id = null, hojeIso } = {}) {
  const d = hojeIso || new Date().toISOString().slice(0, 10);
  const v = new Date(d + 'T12:00'); v.setDate(v.getDate() + 15);
  return {
    cliente: '', contato: '', telefone: '', projeto: '', local: '', responsavel_id, data: d, validade: v.toISOString().slice(0, 10), pagamento: '',
    geometria: { modo: 'unico', comprimento: 100, trechos: [{ id: novoIdLocal(), nome: 'Trecho 1', comprimento: 100 }], altura: 2.5, cantos: 0, aberturas: [] },
    escopo: 'material_montagem',
    fornece_placas: true, fornece_mouroes: true,
    implantacao_mouroes: 'terceiros', mouroes_antes: true,
    prazo: { dias_desejados: '', modo: 'auto', equipes_manual: 1, equipes_disponiveis: 2, frentes: 2, dias_equipe_reais: '', motivo_ajuste: '', fabricacao: '', entrega: '' },
    condicoes: { terreno: 'plano', acesso: 'livre', distancia_km: '', equipamentos: 'nao', frete: 'cliente', fundacoes: 'terceiros', pecas: 'estoque', frente: 'liberada' },
    comercial: {
      desconto_material_pct: 0, desconto_instalacao_pct: 0, desconto_global_pct: 0, autorizacao_instalacao: null,
      adicionais: [], observacoes: '', exclusoes_extra: '', resolvidas: {},
    },
  };
}

// ---------- Cálculo ----------
export function calcular(e, p = PARAMETROS_INICIAIS) {
  const erros = [], avisos = [], pendencias = [], bloqueios = [];
  const esc = escopoPorId[e.escopo] || ESCOPOS[1];
  const g = e.geometria || {};
  const vao = n(p.dimensoes?.vao, 1.5), hPlaca = n(p.dimensoes?.placa_altura, 0.5);
  const H = n(g.altura);
  const resolvida = (id) => !!e.comercial?.resolvidas?.[id];
  const pend = (id, texto, tipo, extra = {}) => { if (!resolvida(id)) pendencias.push({ id, texto, tipo, ...extra }); };

  // --- trechos ---
  const aberturas = (g.aberturas || []).filter((a) => n(a.largura) > 0);
  const somaAberturas = aberturas.reduce((s, a) => s + n(a.largura), 0);
  let trechosIn = g.modo === 'trechos'
    ? (g.trechos || []).map((t) => ({ nome: t.nome, L: n(t.comprimento) }))
    : [{ nome: 'Trecho único', L: n(g.comprimento) - (somaAberturas || 0) }];
  if (!trechosIn.length) erros.push('Informe pelo menos um trecho de muro.');
  trechosIn.forEach((t) => {
    if (!(t.L > 0)) erros.push(`${t.nome}: comprimento precisa ser maior que zero.`);
    else if (t.L > 50000) erros.push(`${t.nome}: comprimento fora do limite (máx. 50.000 m).`);
  });
  if (!(H > 0)) erros.push('Informe a altura do muro.');
  const ppvBruto = H / hPlaca;
  const modularAltura = H > 0 && Math.abs(ppvBruto - Math.round(ppvBruto)) < 1e-9;
  if (H > 0 && !modularAltura) erros.push(`Altura de ${fmtM(H)} fora do módulo de ${fmtM(hPlaca)}: precisa de solução técnica (não arredondamos sozinhos).`);
  const validada = (p.alturas_validadas || []).some((a) => Math.abs(a - H) < 1e-9);
  if (modularAltura && !validada) {
    pend('altura_nao_validada', `Altura de ${fmtM(H)} não validada: o mourão de ${fmtM(p.dimensoes?.mourao_comprimento || 3.2)} não está validado para ela. Defina especificação, custo, engastamento e estrutura antes da proposta definitiva.`, 'tecnica');
  }
  const ppv = modularAltura ? Math.round(ppvBruto) : 0;

  const ok = !erros.length;
  const trechos = ok ? trechosIn.map((t) => {
    const vaos = teto(t.L / vao);
    return { nome: t.nome, L: t.L, vaos, placas: vaos * ppv, mouroes: vaos + 1, modular: vaos * vao };
  }) : [];
  const L = trechos.reduce((s, t) => s + t.L, 0);
  const vaos = trechos.reduce((s, t) => s + t.vaos, 0);
  const placas = trechos.reduce((s, t) => s + t.placas, 0);
  const mouroes = trechos.reduce((s, t) => s + t.mouroes, 0);
  const modular = trechos.reduce((s, t) => s + t.modular, 0);
  const area = L * H;
  const ajuste = modular - L;
  if (ok && ajuste > 1e-9) avisos.push(`Comprimento modular de ${fmtM(modular)} para ${fmtM(L)} solicitados: ajuste de modulação de ${fmtM(ajuste)} a detalhar (peças inteiras reservadas não aprovam corte nem solução técnica).`);
  if (ok && (trechos.length > 1 || n(g.cantos) > 0)) pend('encontros', `Revisar encontros${n(g.cantos) ? ` e ${n(g.cantos)} canto(s)` : ''}: mourões compartilhados não foram descontados automaticamente; cantos e terminais especiais exigem levantamento.`, 'tecnica');
  if (ok && g.modo !== 'trechos' && aberturas.length) pend('aberturas', `${aberturas.length} abertura(s) descontada(s) (${fmtM(somaAberturas)}): defina os trechos resultantes (use “Vários trechos”) — cada trecho tem os próprios mourões de ponta.`, 'tecnica');

  // --- fornecimento ---
  const pf = ok && esc.material && e.fornece_placas ? placas : 0;
  const mf = ok && esc.material && e.fornece_mouroes ? mouroes : 0;

  // --- prazo e equipes (só quando há montagem) ---
  const prod = n(p.produtividade_placas_dia, 110);
  const pr = e.prazo || {};
  const prazo = { aplica: ok && esc.montagem && placas > 0 };
  if (prazo.aplica) {
    const diasDesejados = Math.floor(n(pr.dias_desejados));
    const disp = Math.max(1, Math.floor(n(pr.equipes_disponiveis, 1)));
    const frentes = Math.max(1, Math.floor(n(pr.frentes, 1)));
    const limite = Math.min(disp, frentes);
    const sugeridas = diasDesejados > 0 ? teto(placas / (prod * diasDesejados)) : 1;
    let equipes = pr.modo === 'manual' ? Math.max(1, Math.floor(n(pr.equipes_manual, 1))) : Math.min(sugeridas, limite);
    equipes = Math.max(1, equipes);
    const dias = teto(placas / (prod * equipes));
    const reais = Math.floor(n(pr.dias_equipe_reais));
    const diasEquipe = reais > 0 ? reais : equipes * dias;
    Object.assign(prazo, {
      diasDesejados: diasDesejados || null, sugeridas, limite, equipes, dias, diasEquipe, ajusteManual: reais > 0,
      fte: r2(diasEquipe * n(p.fte_dia, 850)), atende: !diasDesejados || dias <= diasDesejados,
    });
    if (pr.modo !== 'manual' && sugeridas > limite) {
      avisos.push(`Para ${diasDesejados} dia(s) seriam ${sugeridas} equipes, mas há ${limite} (${disp < frentes ? 'equipes disponíveis' : 'frentes simultâneas'}). Prazo possível: ${dias} dia(s).`);
    }
    if (pr.modo === 'manual' && equipes > limite) avisos.push(`${equipes} equipes selecionadas, mas há ${disp} disponível(is) e ${frentes} frente(s) simultânea(s).`);
    if (diasDesejados && !prazo.atende) avisos.push(`Prazo desejado de ${diasDesejados} dia(s) não atendido: montagem em ${dias} dia(s).`);
    if (reais > 0 && !String(pr.motivo_ajuste || '').trim()) avisos.push('Ajuste de dias-equipe sem motivo registrado.');
    if (Math.abs(H - n(p.altura_referencia, 2.5)) > 1e-9) avisos.push(`Produtividade estimada para ${fmtM(H)} (proporcional à referência de ${prod} placas/dia a ${fmtM(p.altura_referencia)}): precisa de validação.`);
    if (!e.mouroes_antes) pend('mouroes_antes', `Mourões não estarão instalados antes da montagem: a referência de ${prod} placas/equipe/dia não vale assim.`, 'tecnica');
    if (e.condicoes?.pecas === 'fabricar' || e.condicoes?.frente === 'confirmar') avisos.push('A produtividade de referência pressupõe peças disponíveis e frente liberada.');
  }

  // --- escopo e condições que não têm composição: pendentes ou excluídos (nunca incluídos a custo zero) ---
  if (ok && esc.completa) pend('instalacao_completa', 'Instalação completa: implantação dos mourões e fundações sem composição validada.', 'exclusao', { exclusao: 'Implantação dos mourões e fundações' });
  if (ok && esc.montagem && e.implantacao_mouroes === 'eql' && !esc.completa) pend('implantacao_eql', 'Implantação dos mourões pela EQL sem composição cadastrada.', 'exclusao', { exclusao: 'Implantação dos mourões' });
  const c = e.condicoes || {};
  if (ok && c.frete === 'definir') pend('frete', 'Frete a definir: sem composição.', 'exclusao', { exclusao: 'Frete das peças', componente: 'outro' });
  if (ok && c.fundacoes === 'definir') pend('fundacoes', 'Fundações a definir: sem composição.', 'exclusao', { exclusao: 'Fundações' });
  if (ok && c.terreno === 'irregular') pend('terreno', 'Terreno irregular: composição e produtividade a validar.', 'exclusao', { exclusao: 'Adequações para terreno irregular' });
  if (ok && c.acesso === 'restrito') pend('acesso', 'Acesso restrito: logística e produtividade a validar.', 'exclusao', { exclusao: 'Custos de acesso restrito' });
  if (ok && c.equipamentos === 'sim') pend('equipamentos', 'Equipamentos necessários (ex.: munck, guindaste) sem composição.', 'exclusao', { exclusao: 'Equipamentos de içamento', componente: 'instalacao' });

  // --- preço ---
  const pre = p.precos || {}, cus = p.custos || {};
  const com = e.comercial || {};
  const adic = (com.adicionais || []).filter((a) => a.cobrado !== false || n(a.custo) > 0).map((a) => ({
    ...a, venda: a.cobrado === false ? 0 : r2(n(a.quantidade) * n(a.preco)), custoT: r2(n(a.quantidade) * n(a.custo)),
  }));
  const somaAd = (comp, k) => adic.filter((a) => (a.componente || 'outro') === comp).reduce((s, a) => s + a[k], 0);

  const tabM = r2(pf * n(pre.placa) + mf * n(pre.mourao));
  const tabI = ok && esc.montagem ? r2(L * n(pre.montagem_m)) : 0;
  const dM = r2(tabM * n(com.desconto_material_pct) / 100);
  const dI = r2(tabI * n(com.desconto_instalacao_pct) / 100);
  const addM = r2(somaAd('material', 'venda')), addI = r2(somaAd('instalacao', 'venda')), addO = r2(somaAd('outro', 'venda'));
  const baseM = tabM - dM + addM, baseI = tabI - dI + addI;
  const dG = r2((baseM + baseI) * n(com.desconto_global_pct) / 100);
  const dGM = baseM + baseI > 0 ? r2(dG * baseM / (baseM + baseI)) : 0;
  const dGI = r2(dG - dGM);
  const recM = r2(baseM - dGM), recI = r2(baseI - dGI), recO = addO;
  const total = r2(recM + recI + recO);
  const comercial = {
    material: { tabela: tabM, desconto: r2(dM + dGM), adicionais: addM, receita: recM },
    instalacao: { tabela: tabI, desconto: r2(dI + dGI), adicionais: addI, receita: recI },
    outros: { receita: recO },
    tabela: r2(tabM + tabI), desconto: r2(dM + dI + dG), adicionais: r2(addM + addI + addO), total,
    porM: L > 0 ? total / L : 0, porM2: area > 0 ? total / area : 0,
    tarifaProvisoria: esc.montagem && Math.abs(H - n(p.altura_referencia, 2.5)) > 1e-9,
  };
  if (comercial.tarifaProvisoria && ok) avisos.push(`Tarifa de montagem de ${brl(pre.montagem_m)}/m aplicada a ${fmtM(H)} é provisória (tabela definida para ${fmtM(p.altura_referencia)}).`);

  // --- custos e margem por componente (gestão) ---
  const aliq = n(p.aliquota);
  if (ok && pf > 0 && !(n(cus.placa) > 0)) erros.push('Custo da placa não cadastrado nos parâmetros.');
  if (ok && mf > 0 && !(n(cus.mourao) > 0)) erros.push('Custo do mourão não cadastrado nos parâmetros.');
  const custoM = r2(r2(pf * n(cus.placa) + mf * n(cus.mourao)) + somaAd('material', 'custoT'));
  const custoI = r2((prazo.aplica ? prazo.fte : 0) + somaAd('instalacao', 'custoT'));
  const custoO = r2(somaAd('outro', 'custoT'));
  const reserva = (comp, custo) => r2((p.despesas || []).filter((d) => d.componente === comp).reduce((s, d) => s + (
    d.base === 'pct_custo' ? custo * n(d.valor) / 100 : d.base === 'reais_m' ? n(d.valor) * L : n(d.valor)), 0));
  const comp = (receita, custo, res) => {
    const impostos = r2(receita * aliq);
    const resultado = r2(receita - impostos - custo);
    const apos = r2(resultado - res);
    return { receita, impostos, custos: custo, reservas: res, resultado, margem: receita > 0 ? resultado / receita : null, resultadoApos: apos, margemApos: receita > 0 ? apos / receita : null };
  };
  const gM = comp(recM, custoM, recM > 0 ? reserva('material', custoM) : 0);
  const gI = comp(recI, custoI, recI > 0 ? reserva('instalacao', custoI) : 0);
  const gO = comp(recO, custoO, 0);
  const soma = (k) => r2(gM[k] + gI[k] + gO[k]);
  const gT = { receita: soma('receita'), impostos: soma('impostos'), custos: soma('custos'), reservas: soma('reservas'), resultado: soma('resultado'), resultadoApos: soma('resultadoApos') };
  gT.margem = gT.receita > 0 ? gT.resultado / gT.receita : null;
  gT.margemApos = gT.receita > 0 ? gT.resultadoApos / gT.receita : null;

  // --- limites e bloqueios ---
  const minM = n(p.margem_material_min, 0.3);
  const custoConsM = r2(custoM + gM.reservas);
  const den = 1 - aliq - minM;
  const precoLimite = den > 0 ? custoConsM / den : null;
  const baseTabM = tabM + addM;
  const descMaxM = precoLimite != null && baseTabM > 0 ? Math.max(0, 1 - precoLimite / baseTabM) : null;
  const limites = { precoLimiteMaterial: precoLimite, descontoMaxMaterial: descMaxM, margemMinMaterial: minM, metaMaterial: n(p.margem_material_meta, 0.4) };
  if (ok && recM > 0) {
    const mApos = gM.margemApos;
    if (comercial.material.desconto > 0 && mApos <= minM + 1e-9) {
      bloqueios.push({ id: 'desconto_material', texto: `Desconto no material deixa a margem em ${pct(mApos)} (precisa ser acima de ${pct(minM)}). Desconto máximo: ${descMaxM != null ? pct(descMaxM) : '—'}.` });
    } else if (!comercial.material.desconto && mApos <= minM + 1e-9) {
      bloqueios.push({ id: 'tabela_material', texto: `A tabela já deixa a margem do material em ${pct(mApos)} (piso ${pct(minM)}): recomponha o preço antes de emitir.` });
    } else if (mApos < limites.metaMaterial) {
      avisos.push(`Margem do material em ${pct(mApos)}, abaixo da meta de ${pct(limites.metaMaterial)}.`);
    }
  }
  if (ok && recI > 0 && comercial.instalacao.desconto > 0) {
    const minI = p.margem_instalacao_min;
    if (minI == null) {
      if (!com.autorizacao_instalacao) bloqueios.push({ id: 'desconto_instalacao', texto: 'Desconto na instalação precisa de autorização interna (piso de margem ainda não definido pela gestão).' });
    } else if (gI.margemApos <= n(minI) + 1e-9) {
      bloqueios.push({ id: 'desconto_instalacao_piso', texto: `Desconto na instalação deixa a margem em ${pct(gI.margemApos)} (piso ${pct(minI)}).` });
    }
  }
  if (ok && !(total > 0)) erros.push('Receita zero ou negativa: não dá para apurar o orçamento.');
  if (ok && total > 0 && gT.resultadoApos < 0) bloqueios.push({ id: 'prejuizo', texto: `Resultado estimado negativo (prejuízo de ${brl(-gT.resultadoApos)}): emissão bloqueada.` });

  // --- exclusões (aparecem na proposta) ---
  const exclusoes = [];
  if (ok) {
    if (!esc.montagem) exclusoes.push('Montagem das placas');
    if (esc.montagem && !esc.completa && e.implantacao_mouroes !== 'eql') exclusoes.push('Implantação dos mourões (por terceiros/cliente, antes da montagem)');
    if (esc.material && !e.fornece_mouroes) exclusoes.push('Fornecimento dos mourões (do cliente)');
    if (esc.material && !e.fornece_placas) exclusoes.push('Fornecimento das placas (do cliente)');
    if (!esc.material) exclusoes.push('Fornecimento de placas e mourões');
    if (c.frete !== 'definir') exclusoes.push('Frete das peças');
    if (c.fundacoes !== 'definir' && !esc.completa) exclusoes.push('Fundações');
    Object.entries(com.resolvidas || {}).forEach(([, r]) => { if (r?.acao === 'excluir' && r.exclusao) exclusoes.push(r.exclusao); });
    String(com.exclusoes_extra || '').split('\n').map((x) => x.trim()).filter(Boolean).forEach((x) => exclusoes.push(x));
  }

  const final = ok && !bloqueios.length && !pendencias.length;
  return {
    ok, final, erros, avisos, pendencias, bloqueios, exclusoes: [...new Set(exclusoes)],
    escopo: esc, altura: H, ppv,
    qt: { trechos, L, vaos, placas, mouroes, modular, area, ajuste, placasFornecidas: pf, mouroesFornecidos: mf },
    prazo, comercial,
    gestao: { material: gM, instalacao: gI, outros: gO, total: gT, limites, custosConhecidosMaterial: custoM },
  };
}

// Resumo guardado junto do orçamento (para a lista e para conferência do servidor)
export const resumo = (r) => ({
  total: r.comercial.total, L: r.qt.L, area: r.qt.area, placas: r.qt.placas, mouroes: r.qt.mouroes,
  dias: r.prazo.dias || null, equipes: r.prazo.equipes || null, final: r.final,
  resultado: r.gestao.total.resultadoApos, margem: r.gestao.total.margemApos,
});

// ---------- formatação (padrão brasileiro) ----------
export const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`);
export const fmtM = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
export const fmtN = (v, d = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
