import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib.js';

const ORDEM = {
  demandas: ['criado_em', true],
  funcionarios: ['ordem', true],
  alocacoes: ['dia', true],
};

// Carrega as três tabelas, escuta mudanças em tempo real e expõe as ações.
export function useData(avisar) {
  const [demandas, setDemandas] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [alocacoes, setAlocacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const setters = { demandas: setDemandas, funcionarios: setFuncionarios, alocacoes: setAlocacoes };
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  const recarregar = useCallback(async (tabela) => {
    const [col, asc] = ORDEM[tabela];
    let q = supabase.from(tabela).select('*').order(col, { ascending: asc });
    if (tabela === 'alocacoes') q = q.gte('dia', limiteAlocacoes());
    const { data, error } = await q;
    if (error) { avisarRef.current?.('Erro ao carregar: ' + error.message); return; }
    setters[tabela](data || []);
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all(['demandas', 'funcionarios', 'alocacoes'].map(recarregar)).then(() => vivo && setCarregando(false));
    const canal = supabase.channel('eql-tempo-real');
    ['demandas', 'funcionarios', 'alocacoes'].forEach((t) =>
      canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => recarregar(t)));
    canal.subscribe();
    // rede de segurança: recarrega quando a aba volta a ficar visível
    const vis = () => document.visibilityState === 'visible' && ['demandas', 'funcionarios', 'alocacoes'].forEach(recarregar);
    document.addEventListener('visibilitychange', vis);
    return () => { vivo = false; supabase.removeChannel(canal); document.removeEventListener('visibilitychange', vis); };
  }, [recarregar]);

  const falhou = (error, tabela) => {
    if (!error) return false;
    avisarRef.current?.('Não foi possível salvar: ' + error.message);
    recarregar(tabela);
    return true;
  };

  // ---------- Demandas ----------
  const salvarDemanda = async (d) => {
    const { id, criado_em, atualizado_em, ...campos } = d;
    if (id) {
      setDemandas((xs) => xs.map((x) => (x.id === id ? { ...x, ...campos } : x)));
      const { error } = await supabase.from('demandas').update(campos).eq('id', id);
      if (!falhou(error, 'demandas')) recarregar('demandas');
      return !error;
    }
    const { error } = await supabase.from('demandas').insert(campos);
    if (!falhou(error, 'demandas')) recarregar('demandas');
    return !error;
  };
  const excluirDemanda = async (id) => {
    setDemandas((xs) => xs.filter((x) => x.id !== id));
    setAlocacoes((xs) => xs.filter((x) => x.demanda_id !== id));
    const { error } = await supabase.from('demandas').delete().eq('id', id);
    falhou(error, 'demandas');
  };

  // ---------- Funcionários ----------
  const adicionarFuncionario = async (nome, funcao) => {
    const ordem = Math.max(0, ...funcionarios.map((f) => f.ordem || 0)) + 1;
    const { error } = await supabase.from('funcionarios').insert({ nome, funcao: funcao || null, ordem });
    if (!falhou(error, 'funcionarios')) recarregar('funcionarios');
  };
  const atualizarFuncionario = async (id, campos) => {
    setFuncionarios((xs) => xs.map((x) => (x.id === id ? { ...x, ...campos } : x)));
    const { error } = await supabase.from('funcionarios').update(campos).eq('id', id);
    falhou(error, 'funcionarios');
  };

  // ---------- Alocações ----------
  const alocar = async (funcionario_id, demanda_id, dia) => {
    if (alocacoes.some((a) => a.funcionario_id === funcionario_id && a.demanda_id === demanda_id && a.dia === dia)) return;
    const temp = { id: 'tmp-' + Math.random(), funcionario_id, demanda_id, dia };
    setAlocacoes((xs) => [...xs, temp]);
    const { error } = await supabase.from('alocacoes').insert({ funcionario_id, demanda_id, dia });
    if (!falhou(error, 'alocacoes')) recarregar('alocacoes');
  };
  const moverAlocacao = async (id, demanda_id, dia) => {
    const a = alocacoes.find((x) => x.id === id);
    if (!a || (a.demanda_id === demanda_id && a.dia === dia)) return;
    if (alocacoes.some((x) => x.funcionario_id === a.funcionario_id && x.demanda_id === demanda_id && x.dia === dia)) {
      return removerAlocacao(id);
    }
    setAlocacoes((xs) => xs.map((x) => (x.id === id ? { ...x, demanda_id, dia } : x)));
    const { error } = await supabase.from('alocacoes').update({ demanda_id, dia }).eq('id', id);
    falhou(error, 'alocacoes');
  };
  const removerAlocacao = async (id) => {
    setAlocacoes((xs) => xs.filter((x) => x.id !== id));
    if (String(id).startsWith('tmp-')) return;
    const { error } = await supabase.from('alocacoes').delete().eq('id', id);
    falhou(error, 'alocacoes');
  };
  const inserirAlocacoes = async (linhas) => {
    if (!linhas.length) return 0;
    const { error } = await supabase.from('alocacoes').insert(linhas);
    if (!falhou(error, 'alocacoes')) recarregar('alocacoes');
    return error ? 0 : linhas.length;
  };

  return {
    demandas, funcionarios, alocacoes, carregando,
    salvarDemanda, excluirDemanda,
    adicionarFuncionario, atualizarFuncionario,
    alocar, moverAlocacao, removerAlocacao, inserirAlocacoes,
  };
}

// Mantém na tela os últimos ~120 dias de agenda (o histórico completo fica no banco)
function limiteAlocacoes() {
  const d = new Date();
  d.setDate(d.getDate() - 120);
  return d.toISOString().slice(0, 10);
}
