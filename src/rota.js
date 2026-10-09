import { useEffect, useRef, useSyncExternalStore } from 'react';

// Endereços do sistema (app.eqlgroup.com.br/...). Sem biblioteca: History API do navegador.
// Cada tela do menu tem um caminho; o caminho é a fonte da verdade da navegação.

const ouvintes = new Set();
const avisarTodos = () => ouvintes.forEach((f) => f());
const camadas = []; // janelas abertas que o botão voltar fecha (a de cima primeiro)
let ignorar = 0;
let bloqueio = null; // função que devolve true se pode sair da tela atual (ex.: orçamento não salvo)

export function caminhoAtual() {
  return decodeURI(window.location.pathname).replace(/\/+$/, '') || '/';
}

// Navega para um caminho. replace: troca o endereço sem criar um "voltar".
export function navegar(caminho, { replace = false, forcar = false } = {}) {
  const destino = caminho.replace(/\/+$/, '') || '/';
  if (destino === caminhoAtual()) return true;
  if (!forcar && bloqueio && !bloqueio()) return false;
  if (!forcar) bloqueio = null;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', encodeURI(destino) + window.location.search);
  avisarTodos();
  return true;
}

let ultimo = typeof window !== 'undefined' ? caminhoAtual() : '/';
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorar > 0) { ignorar--; return; }
    // botão voltar com uma janela aberta (relatório, câmera…): fecha só ela, fica na mesma tela
    if (camadas.length) { const c = camadas.pop(); c.fechado = true; c.fechar(); return; }
    // botão voltar/avançar: se a tela atual tem alterações não salvas, pergunta antes
    if (bloqueio && !bloqueio()) { window.history.pushState({}, '', encodeURI(ultimo)); return; }
    bloqueio = null;
    avisarTodos();
  });
}
ouvintes.add(() => { ultimo = caminhoAtual(); });

export function useCaminho() {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, caminhoAtual);
}

// A tela pede confirmação antes de sair (botão voltar do celular, menu, links).
// pergunta: () => boolean (true = pode sair). Passe null/false para liberar.
export function useBloqueioSaida(ativo, pergunta) {
  useEffect(() => {
    if (!ativo) return undefined;
    bloqueio = pergunta;
    return () => { if (bloqueio === pergunta) bloqueio = null; };
  }, [ativo, pergunta]);
}

// ---------- mapa entre as abas do menu e os endereços ----------
// id interno da aba (como o App usa) → caminho público
const CAMINHOS = {
  inicio: '/inicio',
  'demandas/obras': '/demandas/obras',
  'demandas/fabrica': '/demandas/fabrica',
  'calendario/agenda': '/calendario',
  'calendario/relatorios': '/calendario/relatorios',
  orcamentos: '/orcamentos',
  equipes: '/equipes',
  frotas: '/frotas',
  epi: '/epi',
  financeiro: '/financeiro',
  rh: '/rh',
  aquisicao: '/aquisicao',
  config: '/configuracoes',
};
const ALIAS = { '/demandas': 'demandas', '/calendario/agenda': 'calendario/agenda', '/config': 'config' };
const PORCAMINHO = Object.fromEntries(Object.entries(CAMINHOS).map(([id, c]) => [c, id]));

export function caminhoDaAba(id) {
  return CAMINHOS[id] || CAMINHOS[id + '/' + ({ demandas: 'obras', calendario: 'agenda' }[id] || '')] || '/' + id;
}

// Lê o endereço: { tv, aba, resto[] }. Ex.: /tv/calendario → tv, calendario/agenda
//                                          /orcamentos/ORC-2026-0012 → orcamentos, ['ORC-2026-0012']
export function lerCaminho(caminho) {
  let partes = caminho.split('/').filter(Boolean);
  const tv = partes[0] === 'tv';
  if (tv) partes = partes.slice(1);
  for (let n = Math.min(2, partes.length); n >= 1; n--) {
    const c = '/' + partes.slice(0, n).join('/');
    const id = PORCAMINHO[c] || ALIAS[c];
    if (id) return { tv, aba: id, resto: partes.slice(n) };
  }
  return { tv, aba: null, resto: partes };
}

export const TITULOS = {
  inicio: 'Início', 'demandas/obras': 'Obras', 'demandas/fabrica': 'Fábrica', 'calendario/agenda': 'Calendário de obras',
  'calendario/relatorios': 'Relatórios de obra', orcamentos: 'Orçamentos', equipes: 'Equipes', frotas: 'Frotas',
  epi: 'Estoque de EPI', financeiro: 'Financeiro', rh: 'RH & Ponto', aquisicao: 'Aquisição', config: 'Configurações',
};

// Janela por cima da tela (relatório, câmera, gravador): o botão voltar do celular fecha a janela
// em vez de sair do app.
export function useVoltarFecha(aberto, fechar) {
  const ref = useRef(fechar); ref.current = fechar;
  useEffect(() => {
    if (!aberto) return undefined;
    const c = { fechado: false, fechar: () => ref.current?.() };
    camadas.push(c);
    window.history.pushState({ camada: true }, '', window.location.href);
    return () => {
      if (c.fechado) return;
      const i = camadas.indexOf(c); if (i >= 0) camadas.splice(i, 1);
      ignorar++; window.history.back();
    };
  }, [aberto]);
}
