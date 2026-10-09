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
  financeiro_demandas: ['atualizado_em', true, false],
  custos_lancamentos: ['dia', true, false],
  relatorios: ['criado_em', true, true],
  frases: ['criado_em', true, false],
  epi_itens: ['nome', true, false],
  epi_movimentos: ['criado_em', true, false],
  orcamentos: ['criado_em', false, false],
  orcamento_parametros: ['versao', true, false],
  clientes: ['nome', true, false],
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

  const avisadas = useRef(new Set()); // tabelas que já geraram aviso (não repetir a cada recarga)
  const recarregar = useCallback(async (t) => {
    const [col, asc, recente] = TABELAS[t];
    let q = supabase.from(t).select('*').order(col, { ascending: asc });
    if (recente) q = q.gte('dia', limiteDias());
    const { data, error } = await q;
    if (error) {
      const faltaTabela = /does not exist|schema cache|Could not find/i.test(error.message);
      if (faltaTabela) {
        setFaltando((f) => (f.has(t) ? f : new Set(f).add(t)));
        // tabelas de recursos novos (custos etc.): só registra; o próprio recurso avisa quando for usado
        if (!avisadas.current.has('__falta') && !OPCIONAIS.includes(t)) {
          avisadas.current.add('__falta');
          avisarRef.current?.('Falta atualizar o banco: rode no Supabase o arquivo SQL mais recente da pasta supabase/.');
        }
      } else if (!avisadas.current.has(t)) {
        avisadas.current.add(t);
        avisarRef.current?.('Erro ao carregar: ' + error.message);
      }
      return false;
    }
    avisadas.current.delete(t);
    setFaltando((f) => { if (!f.has(t)) return f; const n = new Set(f); n.delete(t); return n; });
    setTabela(t, data || []);
    return true;
  }, []);

  useEffect(() => {
    let vivo = true;
    let canal = null;
    let polling = null;
    Promise.all(NOMES.map(recarregar)).then((oks) => {
      if (!vivo) return;
      setCarregando(false);
      // Tempo real só nas tabelas que existem: uma tabela inexistente derruba a assinatura inteira
      const existentes = NOMES.filter((_, i) => oks[i]);
      canal = supabase.channel('eql-tempo-real');
      existentes.forEach((t) => canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => recarregar(t)));
      canal.subscribe((status) => {
        // se o tempo real cair, atualiza a cada 30 s até voltar
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !polling && vivo) {
          polling = setInterval(() => document.visibilityState === 'visible' && existentes.forEach(recarregar), 30000);
        }
        if (status === 'SUBSCRIBED' && polling) { clearInterval(polling); polling = null; }
      });
    });
    const vis = () => document.visibilityState === 'visible' && NOMES.forEach(recarregar);
    document.addEventListener('visibilitychange', vis);
    return () => {
      vivo = false;
      if (canal) supabase.removeChannel(canal);
      if (polling) clearInterval(polling);
      document.removeEventListener('visibilitychange', vis);
    };
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
    avisarRef.current?.('Não foi possível salvar: ' + explicarErro(error));
    console.error('[EQL] erro ao salvar em', t, error);
    recarregar(t);
    return true;
  };
  // Se o banco ainda não tem alguma coluna (arquivo SQL não rodado), tira o campo e tenta de novo
  const comTolerancia = async (fazer, campos) => {
    let dados = Array.isArray(campos) ? campos.map((c) => ({ ...c })) : { ...campos };
    for (let i = 0; i < 6; i++) {
      const { error } = await fazer(dados);
      const col = error && colunaFaltando(error);
      if (!col) return { error };
      console.warn('[EQL] coluna inexistente no banco, ignorando:', col);
      dados = Array.isArray(dados) ? dados.map(({ [col]: _, ...r }) => r) : (({ [col]: _, ...r }) => r)(dados);
    }
    return { error: { message: 'colunas faltando no banco' } };
  };
  const tmp = () => 'tmp-' + Math.random().toString(36).slice(2);

  // ---------- genéricos ----------
  const inserir = async (t, linhas, otimista = true) => {
    const lista = Array.isArray(linhas) ? linhas : [linhas];
    if (!lista.length) return true;
    if (otimista) setTabela(t, (xs) => [...xs, ...lista.map((l) => ({ id: tmp(), ...l }))]);
    const { error } = await comTolerancia((l) => supabase.from(t).insert(l), lista);
    if (!falhou(error, t)) recarregar(t);
    return !error;
  };
  const atualizar = async (t, id, campos) => {
    if (String(id).startsWith('tmp-')) { recarregar(t); return false; } // ainda salvando: tenta de novo em instantes
    setTabela(t, (xs) => xs.map((x) => (x.id === id ? { ...x, ...campos } : x)));
    const { error } = await comTolerancia((c) => supabase.from(t).update(c).eq('id', id), campos);
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
  // Envia só as colunas recebidas (quem chama manda só o que mudou), para duas pessoas
  // editando a mesma demanda ao mesmo tempo não apagarem a alteração uma da outra.
  const salvarDemanda = async (d) => {
    const { id } = d;
    const campos = Object.fromEntries(Object.entries(d).filter(([k]) => CAMPOS_DEMANDA.includes(k)));
    if (id && !Object.keys(campos).length) return true;
    // o banco pode criar o cliente sozinho (nome repetido em 2 obras) e acerta o nome oficial
    if (id) { const ok = await atualizar('demandas', id, campos); recarregar('demandas'); recarregar('clientes'); return ok; }
    const ok = await inserir('demandas', campos, false); recarregar('clientes'); return ok;
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
  const salvarFinanceiro = async (demanda_id, campos) => {
    setTabela('financeiro_demandas', (xs) => {
      const ex = xs.find((x) => x.demanda_id === demanda_id);
      return ex ? xs.map((x) => (x.demanda_id === demanda_id ? { ...x, ...campos } : x)) : [...xs, { demanda_id, ...campos }];
    });
    const { error } = await supabase.from('financeiro_demandas').upsert({ demanda_id, ...campos }, { onConflict: 'demanda_id' });
    if (!falhou(error, 'financeiro_demandas')) recarregar('financeiro_demandas');
    return !error;
  };
  const lancarCusto = (linha) => inserir('custos_lancamentos', linha);

  // ---------- Relatórios de obra ----------
  // arquivos já comprimidos pelo app; cada foto vai com uma miniatura para as listas ficarem leves
  const enviarArquivo = async (caminho, blob, contentType) => {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const { error } = await supabase.storage.from('relatorios').upload(caminho, blob, { contentType, upsert: true, cacheControl: '31536000' });
      if (!error) return { ok: true };
      if (tentativa === 2) return { ok: false, erro: explicarErro(error) };
      await new Promise((r) => setTimeout(r, 1200 * (tentativa + 1)));
    }
    return { ok: false };
  };
  const urlArquivo = (caminho) => (caminho ? supabase.storage.from('relatorios').getPublicUrl(caminho).data.publicUrl : '');
  const salvarRelatorio = async (r) => {
    const { error } = await supabase.from('relatorios').insert({ ...r, autor_id: userId });
    if (falhou(error, 'relatorios')) return false;
    recarregar('relatorios');
    return true;
  };
  // ---------- Estoque de EPI ----------
  const salvarItemEpi = async (item) => {
    const { id, criado_em, atualizado_em, ...campos } = item;
    if (id && dbRef.current.epi_itens.some((x) => x.id === id)) return atualizar('epi_itens', id, campos);
    return inserir('epi_itens', { ...(id ? { id } : {}), ...campos }, false);
  };
  const movimentarEpi = async (m) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('epi_movimentos').insert({ ...m, autor_id: session?.user?.id });
    if (falhou(error, 'epi_movimentos')) return false;
    recarregar('epi_movimentos');
    return true;
  };
  const atualizarMovimentoEpi = (id, campos) => atualizar('epi_movimentos', id, campos);
  const apagarMovimentoEpi = (id) => apagar('epi_movimentos', id);
  // Clientes (Help, Ageplan…): lista única usada nas obras, fábrica, orçamentos e portal
  const criarCliente = async (nome) => {
    const n = (nome || '').trim();
    if (!n) return null;
    const ex = dbRef.current.clientes.find((c) => c.nome.trim().toLowerCase() === n.toLowerCase());
    if (ex) return ex.nome;
    const ok = await inserir('clientes', { nome: n }, false);
    return ok ? n : null;
  };
  const atualizarCliente = (id, campos) => atualizar('clientes', id, campos).then((ok) => { if (ok && campos.nome) { recarregar('demandas'); recarregar('perfis'); recarregar('orcamentos'); } return ok; });
  const salvarFrase = (texto) => inserir('frases', { texto, ativo: true }, false);
  const alternarFrase = (id, ativo) => atualizar('frases', id, { ativo });
  const apagarFrase = (id) => apagar('frases', id);
  const apagarRelatorio = async (r) => {
    await apagar('relatorios', r.id);
    const caminhos = (r.arquivos || []).flatMap((a) => [a.caminho, a.miniatura]).filter(Boolean);
    if (caminhos.length) await supabase.storage.from('relatorios').remove(caminhos);
  };
  const apagarLancamento = (id) => apagar('custos_lancamentos', id);

  return {
    ...db, carregando, online, faltando, recarregarTabela: recarregar,
    definirCusto, apagarCusto, salvarFinanceiro, lancarCusto, apagarLancamento,
    enviarArquivo, urlArquivo, salvarRelatorio, apagarRelatorio, salvarFrase, alternarFrase, apagarFrase,
    salvarItemEpi, movimentarEpi, atualizarMovimentoEpi, apagarMovimentoEpi,
    atualizarPerfil, enviarFoto,
    salvarDemanda, excluirDemanda, criarCliente, atualizarCliente,
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

// recursos que dependem de arquivos SQL opcionais: não geram aviso ao carregar
const OPCIONAIS = ['custos_funcionarios', 'financeiro_demandas', 'custos_lancamentos', 'relatorios', 'frases', 'epi_itens', 'epi_movimentos', 'orcamentos', 'orcamento_parametros', 'clientes'];

const CAMPOS_DEMANDA = ['empresa', 'grupo', 'nome', 'descricao', 'fase', 'percentual', 'inicio', 'entrega', 'pagamento',
  'qtd_total', 'qtd_produzida', 'unidade', 'arquivada', 'produto', 'especificacao'];

function colunaFaltando(error) {
  const m = /Could not find the '([^']+)' column/i.exec(error.message || '') ||
    /column "([^"]+)" of relation .* does not exist/i.exec(error.message || '');
  return m ? m[1] : null;
}

function explicarErro(error) {
  const msg = error.message || String(error);
  if (/demandas_fase_check/.test(msg)) return 'a fase "Estoque" ainda não está liberada no banco (rode o arquivo 08_eko_e_custos_juntos.sql no Supabase).';
  if (/bucket not found|relatorios.*(does not exist|schema cache)|(does not exist|schema cache).*relatorios/i.test(msg)) return 'os relatórios ainda não estão liberados no banco (rode o arquivo 09_relatorios_de_obra.sql no Supabase).';
  if (/epi_.*(does not exist|schema cache)|(does not exist|schema cache).*epi_/i.test(msg)) return 'o estoque de EPI ainda não está liberado no banco (rode o arquivo 13_estoque_epi.sql no Supabase).';
  if (/orcament.*(does not exist|schema cache)|(does not exist|schema cache).*orcament/i.test(msg)) return 'os orçamentos ainda não estão liberados no banco (rode o arquivo 14_orcamentos.sql no Supabase).';
  if (/payload too large|exceeded the maximum allowed size|too large/i.test(msg)) return 'arquivo grande demais (máximo 50 MB).';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'sem internet no momento. Tente de novo quando o sinal voltar.';
  if (/row-level security|permission denied/i.test(msg)) return 'seu tipo de acesso não permite essa alteração.';
  if (/invalid input syntax for type date/i.test(msg)) return 'data inválida.';
  if (/duplicate key/i.test(msg)) return 'esse registro já existe.';
  if (/JWT|token/i.test(msg)) return 'sua sessão expirou, saia e entre de novo.';
  return msg;
}
