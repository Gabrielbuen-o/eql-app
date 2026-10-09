// Relatórios salvos em tempo real.
// 1) Toda foto/vídeo é guardada NA HORA no próprio celular (IndexedDB) — sobrevive a fechar o app.
// 2) Em seguida sobe para o Supabase (fila com novas tentativas). Assim que sobe, o relatório
//    já existe no banco como "em andamento" — se o celular cair na água, o que subiu está salvo.
// 3) "Concluir" só marca o relatório como enviado (as fotos que faltam sobem sozinhas quando houver sinal).
import { useEffect, useState } from 'react';
import { supabase } from './lib.js';

const BANCO = 'eql-campo';
let dbPromessa = null;
function abrir() {
  if (dbPromessa) return dbPromessa;
  dbPromessa = new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('rascunhos')) db.createObjectStore('rascunhos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('arquivos')) {
        const s = db.createObjectStore('arquivos', { keyPath: 'id' });
        s.createIndex('relatorio', 'relatorioId');
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => { dbPromessa = null; erro(req.error); };
  });
  return dbPromessa;
}
async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction(store, modo);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  });
}
const pegar = (store, id) => tx(store, 'readonly', (s) => s.get(id));
const guardar = (store, v) => tx(store, 'readwrite', (s) => s.put(v));
const remover = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
const todos = (store) => tx(store, 'readonly', (s) => s.getAll());
const arquivosDe = (relatorioId) => tx('arquivos', 'readonly', (s) => s.index('relatorio').getAll(relatorioId));

export const novoId = () => (crypto.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`);

// ---------- rascunhos (local) ----------
export const lerRascunho = (id) => pegar('rascunhos', id);
export const salvarRascunho = async (r) => { await guardar('rascunhos', { ...r, atualizadoEm: Date.now() }); avisar(); };
export const listarRascunhos = () => todos('rascunhos').catch(() => []);
export const lerArquivos = async (relatorioId) => (await arquivosDe(relatorioId)).sort((a, b) => a.ordem - b.ordem);
export async function guardarArquivo(a) { await guardar('arquivos', a); avisar(); processar(); }
export async function tirarArquivo(relatorioId, arquivoId) {
  await remover('arquivos', arquivoId);
  const r = await lerRascunho(relatorioId);
  if (r) await salvarRascunho({ ...r, sincronizarLista: true });
  processar();
}
export async function descartarRascunho(id) {
  const r = await lerRascunho(id);
  for (const a of await arquivosDe(id)) await remover('arquivos', a.id);
  await remover('rascunhos', id);
  if (r?.remoto) await supabase.from('relatorios').delete().eq('id', id); // só apaga se ainda estiver em andamento (regra do banco)
  avisar();
}
export async function concluirRascunho(id, campos) {
  const r = await lerRascunho(id);
  if (!r) return;
  await salvarRascunho({ ...r, ...campos, concluir: true });
  processar();
}

// Traz para este celular um relatório "em andamento" que está no banco (ex.: celular trocado)
export async function importarDoBanco(rel) {
  if (await lerRascunho(rel.id)) return;
  await guardar('rascunhos', {
    id: rel.id, demanda_id: rel.demanda_id, tipo: rel.tipo, dia: rel.dia, funcionario_id: rel.funcionario_id,
    observacao: rel.observacao || '', criadoEm: Date.parse(rel.criado_em) || Date.now(), remoto: true, concluir: false,
  });
  for (const [i, a] of (rel.arquivos || []).entries()) {
    await guardar('arquivos', { id: a.id || `${rel.id}-${i}`, relatorioId: rel.id, ordem: a.ordem ?? i, tipo: a.tipo || 'foto', enviado: true, remoto: a });
  }
  avisar();
}

// ---------- estado para a tela ----------
const ouvintes = new Set();
let estado = { online: typeof navigator === 'undefined' ? true : navigator.onLine, enviando: false, erro: '', versao: 0 };
function avisar(parcial) { estado = { ...estado, ...(parcial || {}), versao: estado.versao + 1 }; ouvintes.forEach((f) => f(estado)); }
export function useEnvio() {
  const [e, setE] = useState(estado);
  useEffect(() => { ouvintes.add(setE); return () => ouvintes.delete(setE); }, []);
  return e;
}

// ---------- envio para o Supabase ----------
let tempoReal = null; // o banco já tem a coluna "status"? (arquivo 12)
async function bancoTempoReal() {
  if (tempoReal != null) return tempoReal;
  const { error } = await supabase.from('relatorios').select('status').limit(1);
  tempoReal = !error;
  return tempoReal;
}
let rodando = false, deNovo = false;
let aoMudar = () => {};
export function configurarEnvio({ depoisDeSalvar }) { aoMudar = depoisDeSalvar || (() => {}); }

async function subir(caminho, blob, contentType) {
  for (let t = 0; t < 3; t++) {
    const { error } = await supabase.storage.from('relatorios').upload(caminho, blob, { contentType, upsert: true, cacheControl: '31536000' });
    if (!error) return;
    if (t === 2) throw error;
    await new Promise((r) => setTimeout(r, 1500 * (t + 1)));
  }
}
const metaPublica = (a) => a.remoto || {
  id: a.id, ordem: a.ordem, tipo: a.tipo, caminho: a.caminho, miniatura: a.mini, bytes: a.bytes, origem: a.origem,
  quando: a.quando || null, duracao: a.duracao, ...(a.etapa ? { etapa: a.etapa } : {}),
  ...(a.lat != null ? { lat: a.lat, lon: a.lon, precisao: a.precisao } : {}),
};

export async function processar() {
  if (rodando) { deNovo = true; return; }
  rodando = true;
  try {
    do {
      deNovo = false;
      const rascunhos = await listarRascunhos();
      for (const r of rascunhos) await processarUm(r);
    } while (deNovo);
    avisar({ enviando: false, erro: '' });
  } catch (e) {
    avisar({ enviando: false, erro: /fetch|network|load failed/i.test(e?.message || '') ? 'sem sinal' : (e?.message || 'erro') });
  } finally {
    rodando = false;
  }
}

async function processarUm(r) {
  const tr = await bancoTempoReal();
  const lista = await lerArquivos(r.id);
  if (!lista.length && !r.concluir) return;
  avisar({ enviando: true });
  let mudou = !!r.sincronizarLista;
  const base = `${r.dia}/${r.demanda_id}/${r.id}`;
  for (const a of lista) {
    if (a.enviado) continue;
    if (a.tipo === 'video') {
      const caminho = `${base}/video-${a.id}.${a.ext || 'mp4'}`;
      await subir(caminho, a.blob, a.mime || 'video/mp4');
      Object.assign(a, { enviado: true, caminho, bytes: a.blob.size, blob: null });
    } else {
      const caminho = `${base}/foto-${a.id}.jpg`, mini = `${base}/foto-${a.id}-mini.jpg`;
      await subir(caminho, a.foto, 'image/jpeg');
      await subir(mini, a.miniatura, 'image/jpeg');
      Object.assign(a, { enviado: true, caminho, mini, bytes: a.foto.size, foto: null }); // a miniatura fica para a prévia
    }
    if (!(await pegar('arquivos', a.id))) continue; // apagada enquanto subia
    await guardar('arquivos', a);
    mudou = true;
    avisar();
    if (tr) await registrar(r, lista, 'rascunho');
  }
  if (tr && mudou && !r.concluir) await registrar(r, lista, 'rascunho');
  if (r.concluir && lista.every((a) => a.enviado)) {
    await registrar(r, lista, 'enviado', tr);
    for (const a of lista) await remover('arquivos', a.id);
    await remover('rascunhos', r.id);
    aoMudar();
    avisar();
  } else if (mudou) {
    if (r.sincronizarLista) await guardar('rascunhos', { ...r, sincronizarLista: false });
    aoMudar();
  }
}

// grava/atualiza a linha do relatório no banco
async function registrar(r, lista, status, tr = true) {
  const arquivos = lista.filter((a) => a.enviado).sort((a, b) => a.ordem - b.ordem).map(metaPublica);
  const linha = {
    demanda_id: r.demanda_id, funcionario_id: r.funcionario_id || null, dia: r.dia, tipo: r.tipo,
    observacao: (r.observacao || '').trim() || null, arquivos, ...(tr ? { status } : {}),
  };
  if (!r.remoto) {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('relatorios').insert({ id: r.id, autor_id: session?.user?.id, ...linha });
    if (error && !/duplicate|already exists|23505/i.test(error.message + (error.code || ''))) throw error;
    r.remoto = true;
    await guardar('rascunhos', { ...r });
    return;
  }
  const { error } = await supabase.from('relatorios').update(linha).eq('id', r.id);
  if (error) throw error;
}

// liga a fila: ao abrir, quando a internet volta e a cada 20 s se houver pendências
let ligado = false;
export function ligarEnvio() {
  if (ligado) return;
  ligado = true;
  window.addEventListener('online', () => { avisar({ online: true }); processar(); });
  window.addEventListener('offline', () => avisar({ online: false }));
  setInterval(async () => {
    const rs = await listarRascunhos();
    if (rs.length && navigator.onLine) processar();
  }, 20000);
  processar();
}
