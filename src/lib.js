import { createClient } from '@supabase/supabase-js';

// ---------- Supabase ----------
export const SUPABASE_URL = __SUPABASE_URL__;
export const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;
export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabase = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ---------- Empresas, fases ----------
export const EMPRESAS = [
  { id: 'engenharia', nome: 'EQL Engenharia', curto: 'Engenharia', cor: 'var(--s-eng)' },
  { id: 'impermeabilizacao', nome: 'EQL Impermeabilização', curto: 'Impermeabilização', cor: 'var(--s-imp)' },
  { id: 'eko', nome: 'EQL Eko', curto: 'Eko', cor: 'var(--s-eko)' },
];
export const empresaPorId = Object.fromEntries(EMPRESAS.map((e) => [e.id, e]));

export const FASES = [
  { id: 'orcamento', nome: 'Orçamento' },
  { id: 'aprovacao', nome: 'Aprovação' },
  { id: 'execucao', nome: 'Execução' },
  { id: 'entrega', nome: 'Entrega' },
];
// Fábrica (EQL Eko): orçamento → execução → estoque
export const FASES_EKO = [
  { id: 'orcamento', nome: 'Orçamento' },
  { id: 'execucao', nome: 'Execução' },
  { id: 'estoque', nome: 'Estoque' },
];
export const fasesDe = (empresa) => (empresa === 'eko' ? FASES_EKO : FASES);
export const faseNome = { ...Object.fromEntries(FASES.map((f) => [f.id, f.nome])), estoque: 'Estoque' };

export const PRODUTOS_EKO = [
  { id: 'Concreto ensacado', unidade: 'sacos', espec: '20 kg · 30 MPa' },
  { id: 'Graute', unidade: 'sacos', espec: '' },
  { id: 'Mourão', unidade: 'mourões', espec: '' },
  { id: 'Placa', unidade: 'placas', espec: '' },
  { id: 'Outro', unidade: 'un.', espec: '' },
];

export const PAGAMENTOS = [
  { id: 'a_faturar', nome: 'A faturar' },
  { id: 'faturada', nome: 'Faturada' },
  { id: 'paga', nome: 'Paga' },
];

// Ordem dos grupos dentro de cada empresa
const ORDEM_GRUPOS = ['Obras civis', 'Obras', 'Help', 'Agplan', 'Produção'];
export function ordemGrupo(a, b) {
  const ia = ORDEM_GRUPOS.indexOf(a), ib = ORDEM_GRUPOS.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return (a || '').localeCompare(b || '', 'pt-BR');
}

// ---------- Datas (sempre 'AAAA-MM-DD', horário local) ----------
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hoje = () => iso(new Date());
export const addDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDias = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
export const inicioSemana = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
export function fmt(s) {
  if (!s) return '';
  const ano = s.slice(0, 4) === String(new Date().getFullYear()) ? '' : '/' + s.slice(2, 4);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}${ano}`;
}
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const diaSemana = (s) => DIAS[parse(s).getDay()];
export const dataLonga = () =>
  new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function diasUteis(de, ate) { // conta seg–sáb, inclusive
  let n = 0;
  for (let c = de; c <= ate; c = addDias(c, 1)) if (parse(c).getDay() !== 0) n++;
  return n;
}

// ---------- Regras das demandas ----------
export const ehProducao = (d) => d.empresa === 'eko' && d.qtd_total > 0;

export function percentual(d) {
  if (ehProducao(d)) return Math.min(100, Math.round(((d.qtd_produzida || 0) / d.qtd_total) * 100));
  return d.percentual || 0;
}

export function situacao(d, dia = hoje()) {
  if (!d.entrega) return 'sem';
  if (percentual(d) >= 100 || d.fase === 'estoque') return 'ok';
  const dd = diffDias(d.entrega, dia);
  if (dd < 0) return 'atrasada';
  if (dd <= 3) return 'urgente';
  if (dd <= 7) return 'semana';
  return 'ok';
}

// Texto do selo de prazo: "Atrasada há 2 dias", "Entrega hoje", "Faltam 3 dias · 09/10"
export function rotuloPrazo(d, dia = hoje()) {
  if (!d.entrega) return 'sem prazo';
  const sit = situacao(d, dia);
  const dd = diffDias(d.entrega, dia);
  if (sit === 'ok') return fmt(d.entrega);
  if (dd < 0) return dd === -1 ? 'Atrasada há 1 dia' : `Atrasada há ${-dd} dias`;
  if (dd === 0) return 'Entrega hoje';
  if (dd === 1) return 'Entrega amanhã';
  return `Faltam ${dd} dias · ${fmt(d.entrega)}`;
}

export function resumoProducao(d, dia = hoje()) {
  const falta = Math.max(0, d.qtd_total - (d.qtd_produzida || 0));
  const un = d.unidade || 'un.';
  const n = (x) => x.toLocaleString('pt-BR');
  const base = `${n(d.qtd_produzida || 0)} de ${n(d.qtd_total)} ${un} em estoque`;
  if (falta === 0) return `${base} · pedido completo`;
  if (d.fase === 'orcamento') return `${n(d.qtd_total)} ${un} · em orçamento`;
  if (!d.entrega) return `${base} · faltam ${n(falta)}`;
  const dias = d.entrega >= dia ? diasUteis(dia, d.entrega) : 0;
  if (dias === 0) return `${base} · prazo vencido, faltam ${n(falta)}`;
  return `${base} · produzir ${n(Math.ceil(falta / dias))}/dia até ${fmt(d.entrega)}`;
}

export const iniciais = (nome) =>
  (nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// ---------- Identidade ----------
export const SLOGAN = 'Toda obra sob controle';

// ---------- Acessos ----------
export const PAPEIS = [
  { id: 'admin', nome: 'Administrador', desc: 'Tudo, inclusive usuários e acessos' },
  { id: 'gerente', nome: 'Gerente', desc: 'Demandas, agenda, equipes e frotas' },
  { id: 'campo', nome: 'Campo', desc: 'Só a tela de campo: obra do dia e envio de relatórios com fotos' },
  { id: 'cliente', nome: 'Cliente', desc: 'Vê só as demandas do seu grupo (ex.: Help)' },
];
export const papelNome = Object.fromEntries(PAPEIS.map((p) => [p.id, p.nome]));

export function permissoes(papel) {
  const gestao = papel === 'admin' || papel === 'gerente';
  return {
    papel,
    admin: papel === 'admin',
    gestao,                                   // cria/apaga demandas, mexe na agenda, equipes, frotas
    editarAndamento: gestao || papel === 'campo',
    verOperacao: papel !== 'cliente',        // agenda, equipes, frotas
    verFinanceiro: papel === 'admin',
    soCampo: papel === 'campo',              // app do campo: só a tela de relatórios
    soCliente: papel === 'cliente',          // portal do cliente: obras, equipe e relatórios do grupo dele
  };
}

// ---------- Preferências de uso ----------
export const PREFS_PADRAO = { tema: 'claro', texto: 'm', densidade: 'confortavel', idioma: 'pt-BR' };

export function aplicarPrefs(p) {
  const prefs = { ...PREFS_PADRAO, ...(p || {}) };
  const escuro = prefs.tema === 'escuro'; // padrão é claro; escuro só se a pessoa escolher
  const r = document.documentElement;
  r.dataset.tema = escuro ? 'escuro' : 'claro';
  r.dataset.texto = prefs.texto;
  r.dataset.densidade = prefs.densidade;
  r.lang = prefs.idioma;
  return prefs;
}

// "agora", "há 5 min", "há 2 h", "ontem", "12/10"
export function tempoRelativo(isoTs) {
  if (!isoTs) return 'nunca';
  const s = (Date.now() - new Date(isoTs).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ontem';
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} dias`;
  return new Date(isoTs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Reduz a foto para no máximo 320px antes de enviar (fica leve)
export async function reduzirImagem(arquivo, max = 320) {
  const bmp = await createImageBitmap(arquivo);
  const lado = Math.min(bmp.width, bmp.height); // recorte quadrado central
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(max, lado);
  c.getContext('2d').drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}

// ---------- Relatórios de obra ----------
export const TIPOS_RELATORIO = [
  { id: 'inicio_dia', nome: 'Início do dia', curto: 'Início', desc: 'Como a obra está ao chegar', ativo: true },
  { id: 'fim_dia', nome: 'Final do dia', curto: 'Fim', desc: 'O que foi feito hoje', ativo: true },
  { id: 'limpeza', nome: 'Limpeza do dia', curto: 'Limpeza', desc: 'Local limpo e organizado', ativo: true },
  { id: 'rfi', nome: 'RFI', curto: 'RFI', desc: 'Em breve', ativo: false },
  { id: 'ancoragem', nome: 'Ancoragem', curto: 'Ancoragem', desc: 'Em breve', ativo: false },
  { id: 'entrega_obra', nome: 'Entrega de obra', curto: 'Entrega', desc: 'Em breve', ativo: false },
];
export const tipoRelatorio = Object.fromEntries(TIPOS_RELATORIO.map((t) => [t.id, t]));
export const FOTOS_MIN = 5;
export const FOTOS_MAX = 30;

export function saudacao(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

// Frase do dia: as cadastradas pelos administradores (Configurações) ou estas, se não houver nenhuma.
// Todo mundo vê a mesma frase no mesmo dia; muda à meia-noite.
export const FRASES_PADRAO = [
  'Que seu dia seja iluminado!',
  'Que hoje tudo saia como planejado. Bom trabalho!',
  'Segurança primeiro: capacete, luva e atenção o dia todo.',
  'Cada detalhe bem feito hoje evita retrabalho amanhã.',
  'Obrigado pelo empenho. A EQL é feita por quem está na obra.',
  'Um passo de cada vez, com qualidade. Bora pra cima!',
  'Local limpo é local seguro. Organização também é qualidade.',
  'Dúvida na obra? Pergunta antes de fazer. Melhor que refazer.',
  'Hidrata, faz pausa e se cuida. Você é o mais importante da obra.',
  'Trabalho em equipe rende mais. Dá uma força pro colega hoje.',
  'Fez bem feito? Mostra! Foto de perto e foto de longe.',
  'Toda obra sob controle começa com você.',
  'Viu algo errado ou perigoso? Avisa na hora e registra com foto.',
  'Pontualidade e capricho: é isso que faz a EQL ser chamada de novo.',
  'Antes de ir embora: ferramentas guardadas e área limpa.',
  'Hoje é dia de fazer bonito. Conta com a gente!',
  'Que a energia de hoje seja de obra entregue e sorriso no rosto.',
  'Grandes obras são feitas de pequenos cuidados.',
  'Começou bem, termina bem: relatório de início e de fim, combinado?',
  'Seu trabalho constrói coisas que ficam. Orgulho disso!',
  'Respira fundo, planeja e manda ver. Bom dia de trabalho!',
  'Qualidade não é sorte, é capricho todo dia.',
  'Que hoje o tempo ajude e o serviço renda!',
  'Material no lugar certo economiza tempo e evita acidente.',
  'Ninguém faz sozinho. Obrigado por fazer parte do time EQL.',
  'Foco, segurança e bom humor: combinação que não falha.',
  'Hoje vai ser produtivo. Confia no processo!',
  'Cuide de você e de quem está do seu lado. Bom trabalho!',
  'O cliente vê o resultado; as fotos mostram o caminho. Registra tudo.',
  'Que seu dia seja leve e sua obra, caprichada!',
  'Mais um dia para fazer o melhor serviço da região. Vamos nessa!',
];
export function mensagemDoDia(dia = hoje(), lista) {
  const frases = (lista && lista.length ? lista : FRASES_PADRAO);
  const n = Math.round(parse(dia).getTime() / 86400000);
  return frases[((n % frases.length) + frases.length) % frases.length];
}
