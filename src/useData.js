import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib.js';

// tabela -> [coluna de ordenação, ascendente, filtra por dia recente?]
const TABELAS = {
  demandas: ['criado_em', true, false],
  funcionarios: ['ordem', true, false],
  alocacoes: ['dia', true, true],
  ausencias: ['dia', true, true],
  veiculos: ['ordem', true, false],
  veiculo_alocacoes: ['dia', true, true],
  perfis: ['nome', true, false],
  custos_funcionarios: ['vigente_desde', true, false],
};
const NOMES = Object.keys(TABELAS);

// Carrega as tabelas, escuta mudanças em tempo real e expõe as ações.
export function useData(avisar, userId) {
  const [db, setDb] = useState(() => Object.fromEntries(NOMES.map((t) => [t, []])));
  const [carregando, setCarregando] = useState(true);
  const [online, setOnline] = useState(() => new Set());
  const [faltando, setFaltando] = useState(() => new Set()); // tabelas que ainda não existem no banco
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;
  const dbRef = useRef(db);
  dbRef.current = db;

  const setTabela = (t, fn) => setDb((d) => ({ ...d, [t]: typeof fn === 'function' ? fn(d[t]) : fn }));

  const recarregar = useCallback(async (t) => {
    const [col, asc, recente] = TABELAS[t];
    let q = supabase.from(t).select('*').order(col, { ascending: asc });
    if (recente) q = q.gte('dia', limiteDias());
    const { data, error } = await q;
    if (error) {
      const faltaTabela = /does not exist|schema cache|Could not find/i.test(error.message);
      if (faltaTabela) setFaltando((f) => new Set(f).add(t));
      avisarRef.current?.(faltaTabela
        ? 'Falta atualizar o banco: rode no Supabase o arquivo SQL mais recente da pasta supabase/.'
        : 'Erro ao carregar: ' + error.message);
      return;
    }
    setFaltando((f) => { if (!f.has(t)) return f; const n = new Set(f); n.delete(t); return n; });
    setTabela(t, data || []);
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all(NOMES.map(recarregar)).then(() => vivo && setCarregando(false));
    const canal = supabase.channel('eql-tempo-real');
    NOMES.forEach((t) => canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => recarregar(t)));
    canal.subscribe();
    const vis = () => document.visibilityState === 'visible' && NOMES.forEach(recarregar);
    document.addEventListener('visibilitychange', vis);
    return () => { vivo = false; supabase.removeChannel(canal); document.removeEventListener('visibilitychange', vis); };
  }, [recarregar]);

  // Quem está online agora (presença em tempo real) + registro do último acesso
  useEffect(() => {
    if (!userId) return;
    const pres = supabase.channel('eql-online', { config: { presence: { key: userId } } });
    pres.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(pres.presenceState()))));
    pres.subscribe((status) => { if (status === 'SUBSCRIBED') pres.track({ desde: new Date().toISOString() }); });
    const marcar = () => supabase.from('perfis').update({ ultimo_acesso: new Date().toISOString() }).eq('id', userId).then(() => {});
    marcar();
    const t = setInterval(marcar, 120000);
    return () => { clearInterval(t); supabase.removeChannel(pres); };
  }, [userId]);

  const falhou = (error, t) => {
    if (!error) return false;
    avisarRef.current?.('Não foi possível salvar: ' + error.message);
    recarregar(t);
    return true;
  };
  const tmp = () => 'tmp-' + Math.random().toString(36).slice(2);

  // ---------- genéricos ----------
  const inserir = async (t, linhas, otimista = true) => {
    const lista = Array.isArray(linhas) ? linhas : [linhas];
    if (!lista.length) return true;
    if (otimista) setTabela(t, (xs) => [...xs, ...lista.map((l) => ({ id: tmp(), ...l }))]);
    const { error } = await supabase.from(t).insert(lista);
    if (!falhou(error, t)) recarregar(t);
    return !error;
  };
  const atualizar = async (t, id, campos) => {
    setTabela(t, (xs) => xs.map((x) => (x.id === id ? { ...x, ...campos } : x)));
    if (String(id).startsWith('tmp-')) return true;
    const { error } = await supabase.from(t).update(campos).eq('id', id);
    falhou(error, t);
    return !error;
  };
  const apagar = async (t, id) => {
    setTabela(t, (xs) => xs.filter((x) => x.id !== id));
    if (String(id).startsWith('tmp-')) return;
    const { error } = await supabase.from(t).delete().eq('id', id);
    falhou(error, t);
  };

  // ---------- Demandas ----------
  const salvarDemanda = async (d) => {
    const { id, criado_em, atualizado_em, ...campos } = d;
    if (id) { const ok = await atualizar('demandas', id, campos); recarregar('demandas'); return ok; }
    return inserir('demandas', campos, false);
  };
  const excluirDemanda = async (id) => {
    setTabela('alocacoes', (xs) => xs.filter((x) => x.demanda_id !== id));
    setTabela('veiculo_alocacoes', (xs) => xs.filter((x) => x.demanda_id !== id));
    await apagar('demandas', id);
  };

  // ---------- Funcionários e veículos ----------
  const proximaOrdem = (t) => Math.max(0, ...dbRef.current[t].map((f) => f.ordem || 0)) + 1;
  const adicionarFuncionario = (nome, funcao) =>
    inserir('funcionarios', { nome, funcao: funcao || null, ordem: proximaOrdem('funcionarios'), ativo: true }, false);
  const atualizarFuncionario = (id, campos) => atualizar('funcionarios', id, campos);
  const salvarVeiculo = async (v) => {
    const { id, criado_em, ...campos } = v;
    if (id) return atualizar('veiculos', id, campos);
    return inserir('veiculos', { ...campos, ordem: proximaOrdem('veiculos'), ativo: true }, false);
  };

  // ---------- Agenda ----------
  // recurso: { tipo: 'func' | 'veic', id }
  const tabAloc = (tipo) => (tipo === 'veic' ? 'veiculo_alocacoes' : 'alocacoes');
  const colRec = (tipo) => (tipo === 'veic' ? 'veiculo_id' : 'funcionario_id');

  const alocar = async (tipo, recursoId, demanda_id, dia) => {
    const t = tabAloc(tipo), c = colRec(tipo);
    if (dbRef.current[t].some((a) => a[c] === recursoId && a.demanda_id === demanda_id && a.dia === dia)) return;
    return inserir(t, { [c]: recursoId, demanda_id, dia });
  };
  const moverAlocacao = async (tipo, id, demanda_id, dia) => {
    const t = tabAloc(tipo), c = colRec(tipo);
    const a = dbRef.current[t].find((x) => x.id === id);
    if (!a || (a.demanda_id === demanda_id && a.dia === dia)) return;
    if (dbRef.current[t].some((x) => x[c] === a[c] && x.demanda_id === demanda_id && x.dia === dia)) return apagar(t, id);
    return atualizar(t, id, { demanda_id, dia });
  };
  const removerAlocacao = (tipo, id) => apagar(tabAloc(tipo), id);
  const inserirAlocacoes = (tipo, linhas) => inserir(tabAloc(tipo), linhas, false);

  // Folga / férias: um registro por funcionário por dia
  const marcarAusencia = async (funcionario_id, dia, tipo) => {
    const ex = dbRef.current.ausencias.find((a) => a.funcionario_id === funcionario_id && a.dia === dia);
    if (ex) return ex.tipo === tipo ? true : atualizar('ausencias', ex.id, { tipo });
    return inserir('ausencias', { funcionario_id, dia, tipo });
  };
  const marcarPeriodo = async (funcionario_id, de, ate, tipo, dias) => {
    const existentes = dbRef.current.ausencias.filter((a) => a.funcionario_id === funcionario_id && a.dia >= de && a.dia <= ate);
    const ja = new Set(existentes.map((a) => a.dia));
    for (const a of existentes) if (a.tipo !== tipo) await atualizar('ausencias', a.id, { tipo });
    return inserir('ausencias', dias.filter((d) => !ja.has(d)).map((dia) => ({ funcionario_id, dia, tipo })), false);
  };
  const removerAusencia = (id) => apagar('ausencias', id);

  // ---------- Perfis e fotos ----------
  const atualizarPerfil = async (id, campos) => {
    const ok = await atualizar('perfis', id, campos);
    if (!ok) return false;
    recarregar('perfis');
    return true;
  };
  const enviarFoto = async (id, blob) => {
    const caminho = `${id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('fotos').upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) { avisarRef.current?.('Não foi possível enviar a foto: ' + error.message); return false; }
    const { data } = supabase.storage.from('fotos').getPublicUrl(caminho);
    return atualizarPerfil(id, { foto_url: data.publicUrl });
  };

  // ---------- Custos (só administradores) ----------
  const definirCusto = async (funcionario_id, custo_diario, vigente_desde) => {
    const ex = dbRef.current.custos_funcionarios.find((c) => c.funcionario_id === funcionario_id && c.vigente_desde === vigente_desde);
    if (ex) return atualizar('custos_funcionarios', ex.id, { custo_diario });
    return inserir('custos_funcionarios', { funcionario_id, custo_diario, vigente_desde }, false);
  };
  const apagarCusto = (id) => apagar('custos_funcionarios', id);

  return {
    ...db, carregando, online, faltando,
    definirCusto, apagarCusto,
    atualizarPerfil, enviarFoto,
    salvarDemanda, excluirDemanda,
    adicionarFuncionario, atualizarFuncionario, salvarVeiculo,
    alocar, moverAlocacao, removerAlocacao, inserirAlocacoes,
    marcarAusencia, marcarPeriodo, removerAusencia,
  };
}

// Mantém na tela os últimos ~120 dias de agenda (o histórico completo fica no banco)
function limiteDias() {
  const d = new Date();
  d.setDate(d.getDate() - 120);
  return d.toISOString().slice(0, 10);
}
