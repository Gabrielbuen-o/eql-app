import { createClient } from '@supabase/supabase-js';

// ---------- Supabase ----------
export const SUPABASE_URL = __SUPABASE_URL__;
export const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;
export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabase = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ---------- Empresas, fases ----------
export const EMPRESAS = [
  { id: 'engenharia', nome: 'EQL Engenharia', curto: 'Engenharia', cor: '#CFC8F5' },
  { id: 'impermeabilizacao', nome: 'EQL Impermeabilização', curto: 'Impermeabilização', cor: '#B9D3F7' },
  { id: 'eko', nome: 'EQL Eko', curto: 'Eko', cor: '#A9E4C3' },
];
export const empresaPorId = Object.fromEntries(EMPRESAS.map((e) => [e.id, e]));

export const FASES = [
  { id: 'orcamento', nome: 'Orçamento' },
  { id: 'aprovacao', nome: 'Aprovação' },
  { id: 'execucao', nome: 'Execução' },
  { id: 'entrega', nome: 'Entrega' },
];
export const faseNome = Object.fromEntries(FASES.map((f) => [f.id, f.nome]));

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
  if (percentual(d) >= 100) return 'ok';
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
  const base = `${(d.qtd_produzida || 0).toLocaleString('pt-BR')} de ${d.qtd_total.toLocaleString('pt-BR')} ${un}`;
  if (falta === 0) return `${base} · concluído`;
  if (!d.entrega) return `${base} · sem prazo`;
  const dias = d.entrega >= dia ? diasUteis(dia, d.entrega) : 0;
  if (dias === 0) return `${base} · prazo vencido, faltam ${falta.toLocaleString('pt-BR')}`;
  return `${base} · ${Math.ceil(falta / dias).toLocaleString('pt-BR')}/dia até ${fmt(d.entrega)}`;
}

export const iniciais = (nome) =>
  (nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
