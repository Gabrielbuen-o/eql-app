// O que cada cliente vê no portal (Configurações → Visualizações).
// O banco aplica as mesmas regras (supabase/21_visualizacoes_do_portal.sql): mantenha os dois iguais.

export const PADRAO_PORTAL = {
  obras: { andamento: true, datas: true, concluidas: true, engenharia: true, impermeabilizacao: true },
  fabrica: { mostrar: false },
  equipe: { mostrar: true, funcao: true, futuro: true },
  relatorios: {
    mostrar: true, observacao: true, videos: true, baixar: true,
    tipos: { inicio_dia: true, fim_dia: true, limpeza: true, rfi: true, ancoragem: true, entrega_obra: true },
  },
  ocultas: [],
};

// cada opção: caminho na configuração, nome, explicação e de qual opção depende
export const GRUPOS_PORTAL = [
  {
    titulo: 'Obras', icone: 'obras',
    itens: [
      { k: 'obras.engenharia', nome: 'Obras da EQL Engenharia' },
      { k: 'obras.impermeabilizacao', nome: 'Obras da EQL Impermeabilização' },
      { k: 'obras.concluidas', nome: 'Obras concluídas', dica: 'as já entregues e arquivadas' },
      { k: 'obras.andamento', nome: 'Andamento (% concluído)', dica: 'barra de progresso de cada obra' },
      { k: 'obras.datas', nome: 'Datas', dica: 'início e previsão de entrega' },
    ],
  },
  {
    titulo: 'Fábrica (EQL Eko)', icone: 'fabrica',
    itens: [
      { k: 'fabrica.mostrar', nome: 'Pedidos da fábrica', dica: 'produto, quantidade pronta e prazo; nunca valores' },
    ],
  },
  {
    titulo: 'Equipe', icone: 'equipe',
    itens: [
      { k: 'equipe.mostrar', nome: 'Quem trabalhou e vai trabalhar na obra' },
      { k: 'equipe.funcao', nome: 'Função de cada pessoa', depende: 'equipe.mostrar' },
      { k: 'equipe.futuro', nome: 'Programação dos próximos dias', depende: 'equipe.mostrar' },
    ],
  },
  {
    titulo: 'Relatórios de obra', icone: 'relatorios',
    itens: [
      { k: 'relatorios.mostrar', nome: 'Relatórios de obra', dica: 'só os concluídos pela equipe' },
      { k: 'relatorios.tipos.inicio_dia', nome: 'Início do dia', depende: 'relatorios.mostrar', sub: true },
      { k: 'relatorios.tipos.fim_dia', nome: 'Final do dia', depende: 'relatorios.mostrar', sub: true },
      { k: 'relatorios.tipos.limpeza', nome: 'Limpeza do dia', depende: 'relatorios.mostrar', sub: true },
      { k: 'relatorios.tipos.rfi', nome: 'RFI', depende: 'relatorios.mostrar', sub: true },
      { k: 'relatorios.tipos.ancoragem', nome: 'Ancoragem', depende: 'relatorios.mostrar', sub: true },
      { k: 'relatorios.observacao', nome: 'Observação escrita pela equipe', depende: 'relatorios.mostrar' },
      { k: 'relatorios.videos', nome: 'Vídeos', depende: 'relatorios.mostrar' },
      { k: 'relatorios.baixar', nome: 'Baixar fotos e PDF', dica: 'botões de baixar no relatório', depende: 'relatorios.mostrar' },
    ],
  },
];

export const ler = (obj, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
export function gravar(obj, k, v) {
  const out = structuredClone(obj || {});
  const ps = k.split('.');
  let o = out;
  ps.slice(0, -1).forEach((p) => { if (typeof o[p] !== 'object' || o[p] === null) o[p] = {}; o = o[p]; });
  o[ps[ps.length - 1]] = v;
  return out;
}
export function tirar(obj, k) {
  const out = structuredClone(obj || {});
  const ps = k.split('.');
  const pais = [out];
  for (const p of ps.slice(0, -1)) { const prox = pais[pais.length - 1]?.[p]; if (typeof prox !== 'object' || prox === null) return out; pais.push(prox); }
  delete pais[pais.length - 1][ps[ps.length - 1]];
  // limpa objetos que ficaram vazios
  for (let i = ps.length - 2; i >= 0; i--) if (!Object.keys(pais[i + 1]).length) delete pais[i][ps[i]];
  return out;
}
export function mesclar(a, b) {
  if (b === undefined) return a;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    Object.keys(b).forEach((k) => { out[k] = mesclar(a[k], b[k]); });
    return out;
  }
  return b;
}
// configuração que vale: padrão do sistema → todos os clientes → o cliente
export function regraDe(configs, clienteId) {
  const todos = configs.find((c) => c.escopo === '*')?.config || {};
  const { ocultas: _ignora, ...todosSemOcultas } = todos;
  const cli = clienteId ? configs.find((c) => c.escopo === clienteId)?.config || {} : {};
  return mesclar(mesclar(PADRAO_PORTAL, todosSemOcultas), cli);
}

// para o registro de atividades: o que mudou numa configuração do portal
const NOMES = Object.fromEntries(GRUPOS_PORTAL.flatMap((g) => g.itens.map((i) => [i.k, (i.sub ? 'Relatórios · ' : '') + i.nome])));
function folhas(o, pre = '', out = {}) {
  Object.entries(o || {}).forEach(([k, v]) => {
    const c = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) folhas(v, c, out); else out[c] = v;
  });
  return out;
}
export function mudancasPortal(antes, depois) {
  const a = folhas(antes), d = folhas(depois);
  const fmtv = (k, v) => (v === undefined ? 'padrão' : k === 'ocultas' ? `${(v || []).length} escondida(s)` : v === true ? 'Sim' : v === false ? 'Não' : String(v));
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]))
    .map((k) => ({ k, nome: k === 'ocultas' ? 'Obras e pedidos escondidos' : NOMES[k] || k, antes: fmtv(k, a[k]), depois: fmtv(k, d[k]) }));
}
