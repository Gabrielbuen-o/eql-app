import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMPRESAS, addDias, diffDias, fmt, hoje } from './lib.js';

// Estoque de EPI (equipamento de proteção individual) e EPC (equipamento de proteção coletiva).
// Abas: Painel · Catálogo · Registrar saída · Histórico. Só administradores e gerente.
const ABAS = [
  { id: 'painel', nome: 'Painel' },
  { id: 'catalogo', nome: 'Catálogo EPI/EPC' },
  { id: 'saida', nome: 'Registrar saída' },
  { id: 'historico', nome: 'Histórico' },
];
export const CATEGORIAS_EPI = [
  'Proteção da cabeça', 'Proteção visual e facial', 'Proteção auditiva', 'Proteção respiratória',
  'Proteção das mãos e braços', 'Proteção dos pés e pernas', 'Proteção do tronco', 'Proteção contra quedas',
  'Proteção do corpo inteiro', 'Sinalização e isolamento', 'Combate a incêndio', 'Primeiros socorros', 'Outros',
];
const UNIDADES = ['un', 'par', 'caixa', 'pacote', 'kit', 'metro', 'rolo', 'litro'];
const MOTIVOS = [
  'Primeira entrega', 'Reposição por desgaste', 'Reposição por perda ou dano', 'Troca de tamanho',
  'Admissão de funcionário', 'Uso coletivo em obra', 'Visitante / terceiro', 'Outro',
];
const num = (v) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const qtd = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// situação do Certificado de Aprovação
export function statusCA(item, dia = hoje()) {
  if (!item.ca_validade) return item.ca ? 'sem-data' : 'sem';
  const d = diffDias(item.ca_validade, dia);
  return d < 0 ? 'vencido' : d <= 30 ? 'vence' : 'ok';
}
const ROTULO_CA = { vencido: 'CA vencido', vence: 'vence em breve', ok: 'em dia', 'sem-data': 'sem validade', sem: 'sem CA' };

export function EstoqueEPI({ dados, pode, avisar }) {
  const dia = hoje();
  const [aba, setAba] = useState('painel');
  const [entradaDe, setEntradaDe] = useState(null); // item para registrar entrada
  const [editar, setEditar] = useState(null); // item em edição no catálogo
  const itens = dados.epi_itens || [];
  const movs = dados.epi_movimentos || [];
  const falta = dados.faltando.has('epi_itens') || dados.faltando.has('epi_movimentos');

  const saldo = useMemo(() => {
    const m = {};
    movs.forEach((x) => { m[x.item_id] = (m[x.item_id] || 0) + (x.tipo === 'saida' ? -Number(x.quantidade) : Number(x.quantidade)); });
    return m;
  }, [movs]);
  const ativos = itens.filter((i) => i.ativo !== false);

  return (
    <>
      <header className="head">
        <div>
          <h1>Estoque de EPI</h1>
          <p className="date">EPI: equipamento de proteção individual · EPC: equipamento de proteção coletiva</p>
        </div>
        <div className="row">
          <button type="button" className="pill lime" onClick={() => setAba('saida')} disabled={falta}>Registrar saída</button>
        </div>
      </header>

      {falta && (
        <section className="card aviso-banco" role="status">
          <strong>Falta liberar o estoque de EPI no banco.</strong>
          <span>Rode o arquivo <b>13_estoque_epi.sql</b> no SQL Editor do Supabase (igual aos outros).</span>
        </section>
      )}

      <div className="seg epi-abas" role="tablist" aria-label="Estoque de EPI">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'on' : ''} onClick={() => setAba(a.id)}>{a.nome}</button>
        ))}
      </div>

      {aba === 'painel' && <Painel itens={ativos} movs={movs} saldo={saldo} dados={dados} dia={dia} onEntrada={setEntradaDe} irPara={setAba} />}
      {aba === 'catalogo' && (
        <Catalogo itens={itens} saldo={saldo} dados={dados} dia={dia} avisar={avisar} editar={editar} setEditar={setEditar} onEntrada={setEntradaDe} desabilitado={falta} />
      )}
      {aba === 'saida' && <Saida itens={ativos} saldo={saldo} dados={dados} dia={dia} avisar={avisar} movs={movs} desabilitado={falta} />}
      {aba === 'historico' && <Historico itens={itens} movs={movs} dados={dados} dia={dia} pode={pode} />}

      {entradaDe && <Entrada item={entradaDe} saldo={saldo[entradaDe.id] || 0} dados={dados} avisar={avisar} onFechar={() => setEntradaDe(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Painel
function Painel({ itens, movs, saldo, dados, dia, onEntrada, irPara }) {
  const nomeItem = Object.fromEntries((dados.epi_itens || []).map((i) => [i.id, i]));
  const abaixo = itens.filter((i) => (saldo[i.id] || 0) < Number(i.estoque_minimo || 0))
    .sort((a, b) => (saldo[a.id] || 0) / Math.max(1, a.estoque_minimo) - (saldo[b.id] || 0) / Math.max(1, b.estoque_minimo));
  const caAlerta = itens.filter((i) => ['vencido', 'vence'].includes(statusCA(i, dia)))
    .sort((a, b) => (a.ca_validade || '').localeCompare(b.ca_validade || ''));
  const mes = dia.slice(0, 7);
  const saidasMes = movs.filter((m) => m.tipo === 'saida' && m.dia.slice(0, 7) === mes);
  const pendFicha = movs.filter((m) => m.tipo === 'saida' && m.destino === 'individual' && !m.ficha_assinada);
  const desde = addDias(dia, -30);
  const porItem = {};
  movs.filter((m) => m.tipo === 'saida' && m.dia >= desde).forEach((m) => { porItem[m.item_id] = (porItem[m.item_id] || 0) + Number(m.quantidade); });
  const top = Object.entries(porItem).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxTop = Math.max(1, ...top.map((t) => t[1]));
  const ultimas = [...movs].sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '')).slice(0, 8);
  const nomeFunc = (id) => dados.funcionarios.find((f) => f.id === id)?.nome;

  return (
    <>
      <div className="epi-kpis">
        <div className="epi-kpi"><span className="l">Itens no catálogo</span><b>{itens.length}</b>
          <span className="h">{itens.filter((i) => i.tipo === 'EPI').length} EPI · {itens.filter((i) => i.tipo === 'EPC').length} EPC</span></div>
        <button type="button" className={'epi-kpi' + (abaixo.length ? ' ruim' : '')} onClick={() => irPara('catalogo')}><span className="l">Abaixo do mínimo</span><b>{abaixo.length}</b>
          <span className="h">{abaixo.length ? 'precisa comprar' : 'tudo abastecido'}</span></button>
        <button type="button" className={'epi-kpi' + (caAlerta.some((i) => statusCA(i, dia) === 'vencido') ? ' ruim' : caAlerta.length ? ' atencao' : '')} onClick={() => irPara('catalogo')}>
          <span className="l">CA vencido ou vencendo</span><b>{caAlerta.length}</b><span className="h">próximos 30 dias</span></button>
        <button type="button" className="epi-kpi" onClick={() => irPara('historico')}><span className="l">Saídas no mês</span><b>{qtd(saidasMes.reduce((s, m) => s + Number(m.quantidade), 0))}</b>
          <span className="h">{saidasMes.length} {saidasMes.length === 1 ? 'registro' : 'registros'}</span></button>
        <button type="button" className={'epi-kpi' + (pendFicha.length ? ' atencao' : '')} onClick={() => irPara('historico')}>
          <span className="l">Fichas NR-6 pendentes</span><b>{pendFicha.length}</b><span className="h">entregas sem ficha assinada</span></button>
      </div>

      <div className="painel-grid g-2-1">
        <section className="card stack">
          <h2 className="card-title">Precisa repor</h2>
          {abaixo.length ? (
            <ul className="epi-lista">
              {abaixo.map((i) => {
                const s = saldo[i.id] || 0, min = Number(i.estoque_minimo || 0);
                return (
                  <li key={i.id}>
                    <span className="epi-nome"><b>{i.nome}</b>{i.tamanho && <small> · {i.tamanho}</small>}<small> · {i.tipo}</small></span>
                    <span className="epi-barra" title={`${qtd(s)} de ${qtd(min)} (mínimo)`}><span style={{ width: `${Math.min(100, (s / Math.max(1, min)) * 100)}%` }} /></span>
                    <span className="epi-num ruim">{qtd(s)} / {qtd(min)} {i.unidade}</span>
                    <button type="button" className="pill" onClick={() => onEntrada(i)}>+ Entrada</button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="empty">Nenhum item abaixo do estoque mínimo.</p>}
        </section>
        <section className="card stack">
          <h2 className="card-title">CA vencido ou vencendo</h2>
          {caAlerta.length ? (
            <ul className="epi-lista simples">
              {caAlerta.map((i) => (
                <li key={i.id}><span className="epi-nome"><b>{i.nome}</b><small> · CA {i.ca || '—'}</small></span>
                  <span className={'epi-ca ' + statusCA(i, dia)}>{statusCA(i, dia) === 'vencido' ? 'venceu' : 'vence'} {fmt(i.ca_validade)}</span></li>
              ))}
            </ul>
          ) : <p className="empty">Todos os CAs em dia.</p>}
        </section>
      </div>

      <div className="painel-grid g-2-1">
        <section className="card stack">
          <h2 className="card-title">Mais retirados · últimos 30 dias</h2>
          {top.length ? (
            <div className="fin-custos">
              {top.map(([id, q]) => (
                <div key={id} className="fin-custo epi-top">
                  <span className="fin-custo-n">{nomeItem[id]?.nome || '?'}{nomeItem[id]?.tamanho ? ` (${nomeItem[id].tamanho})` : ''}</span>
                  <span className="fin-custo-bar"><span style={{ width: `${(q / maxTop) * 100}%` }} /></span>
                  <b>{qtd(q)} {nomeItem[id]?.unidade}</b>
                </div>
              ))}
            </div>
          ) : <p className="empty">Nenhuma saída nos últimos 30 dias.</p>}
        </section>
        <section className="card stack">
          <h2 className="card-title">Últimas movimentações</h2>
          {ultimas.length ? (
            <ul className="epi-lista simples">
              {ultimas.map((m) => (
                <li key={m.id}>
                  <span className={'epi-mov ' + m.tipo}>{m.tipo === 'saida' ? '−' : '+'}{qtd(Math.abs(m.quantidade))}</span>
                  <span className="epi-nome"><b>{nomeItem[m.item_id]?.nome || '?'}</b>
                    <small> · {m.tipo === 'saida' ? (m.destino === 'coletivo' ? 'uso coletivo' : nomeFunc(m.funcionario_id) || '—') : 'entrada'} · {fmt(m.dia)}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Nada registrado ainda.</p>}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Catálogo
const VAZIO = { nome: '', tipo: 'EPI', categoria: '', unidade: 'un', ca: '', ca_validade: '', tamanho: '', estoque_atual: '', estoque_minimo: '' };
function Catalogo({ itens, saldo, dados, dia, avisar, editar, setEditar, onEntrada, desabilitado }) {
  const [f, setF] = useState(VAZIO);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [salvando, setSalvando] = useState(false);
  const [inativos, setInativos] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const emEdicao = !!editar;

  const comecarEdicao = (i) => {
    setEditar(i);
    setF({ ...VAZIO, ...i, ca: i.ca || '', ca_validade: i.ca_validade || '', tamanho: i.tamanho || '', categoria: i.categoria || '', estoque_minimo: String(i.estoque_minimo ?? ''), estoque_atual: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelar = () => { setEditar(null); setF(VAZIO); };

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.nome.trim()) return;
    setSalvando(true);
    const campos = {
      nome: f.nome.trim(), tipo: f.tipo, categoria: f.categoria.trim() || null, unidade: f.unidade || 'un',
      ca: f.ca.trim() || null, ca_validade: f.ca_validade || null, tamanho: f.tamanho.trim() || null,
      estoque_minimo: num(f.estoque_minimo) || 0,
    };
    if (emEdicao) {
      const ok = await dados.salvarItemEpi({ id: editar.id, ...campos });
      if (ok) { avisar(`${campos.nome} atualizado.`); cancelar(); }
    } else {
      const id = crypto.randomUUID?.() || undefined;
      const ok = await dados.salvarItemEpi({ id, ...campos, ativo: true });
      const inicial = num(f.estoque_atual);
      if (ok && id && inicial > 0) await dados.movimentarEpi({ item_id: id, tipo: 'entrada', quantidade: inicial, dia, observacao: 'Estoque inicial' });
      if (ok) { avisar(`${campos.nome} adicionado ao catálogo.`); setF(VAZIO); }
    }
    setSalvando(false);
  };

  const lista = itens
    .filter((i) => (inativos ? i.ativo === false : i.ativo !== false))
    .filter((i) => tipo === 'todos' || i.tipo === tipo)
    .filter((i) => !busca || [i.nome, i.categoria, i.ca, i.tamanho].join(' ').toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.tamanho || '').localeCompare(b.tamanho || ''));

  return (
    <>
      <form className="card stack epi-form" onSubmit={salvar}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="card-title">{emEdicao ? `Editar: ${editar.nome}` : 'Adicionar item ao catálogo'}</h2>
          {emEdicao && <button type="button" className="pill ghost" onClick={cancelar}>Cancelar edição</button>}
        </div>
        <div className="epi-campos">
          <label className="field c2"><span>Nome do item</span>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Luva de raspa" required />
          </label>
          <div className="field"><span>Tipo</span>
            <div className="seg two">
              {['EPI', 'EPC'].map((t) => <button key={t} type="button" className={f.tipo === t ? 'on' : ''} aria-pressed={f.tipo === t} onClick={() => set('tipo', t)}>{t}</button>)}
            </div>
          </div>
          <label className="field"><span>Categoria</span>
            <input list="epi-categorias" value={f.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Ex.: Proteção das mãos" />
            <datalist id="epi-categorias">{CATEGORIAS_EPI.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field"><span>Unidade</span>
            <select value={f.unidade} onChange={(e) => set('unidade', e.target.value)}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          </label>
          <label className="field"><span>Número do CA</span>
            <input value={f.ca} onChange={(e) => set('ca', e.target.value)} inputMode="numeric" placeholder={f.tipo === 'EPC' ? 'se tiver' : 'Ex.: 12345'} />
          </label>
          <label className="field"><span>Validade do CA</span>
            <input type="date" value={f.ca_validade} onChange={(e) => set('ca_validade', e.target.value)} />
          </label>
          <label className="field"><span>Tamanho (se tiver)</span>
            <input value={f.tamanho} onChange={(e) => set('tamanho', e.target.value)} placeholder="Ex.: G, 42, único" />
          </label>
          {!emEdicao && (
            <label className="field"><span>Estoque atual</span>
              <input value={f.estoque_atual} onChange={(e) => set('estoque_atual', e.target.value)} inputMode="decimal" placeholder="0" />
            </label>
          )}
          <label className="field"><span>Estoque mínimo</span>
            <input value={f.estoque_minimo} onChange={(e) => set('estoque_minimo', e.target.value)} inputMode="decimal" placeholder="0" />
          </label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {emEdicao && <span className="note">Para mudar a quantidade, use “+ Entrada” ou registre uma saída.</span>}
          <button type="submit" className="pill lime" disabled={salvando || desabilitado || !f.nome.trim()}>{salvando ? 'Salvando…' : emEdicao ? 'Salvar alterações' : '+ Adicionar item'}</button>
        </div>
      </form>

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="card-title">Estoque · {lista.length} {lista.length === 1 ? 'item' : 'itens'}</h2>
          <div className="row">
            <input className="input" placeholder="Buscar item, categoria, CA…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
            <div className="seg three epi-tipo">
              {[['todos', 'Todos'], ['EPI', 'EPI'], ['EPC', 'EPC']].map(([id, n]) => <button key={id} type="button" className={tipo === id ? 'on' : ''} onClick={() => setTipo(id)}>{n}</button>)}
            </div>
            <button type="button" className={'pill' + (inativos ? ' on' : '')} onClick={() => setInativos(!inativos)}>Desativados</button>
          </div>
        </div>
        <div className="epi-tabela-wrap">
          <table className="epi-tabela">
            <thead><tr><th>Item</th><th>Tipo</th><th>Categoria</th><th>Tamanho</th><th>CA</th><th>Validade</th><th className="num">Estoque</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {lista.map((i) => {
                const s = saldo[i.id] || 0, min = Number(i.estoque_minimo || 0), ca = statusCA(i, dia);
                return (
                  <tr key={i.id}>
                    <td><b>{i.nome}</b></td>
                    <td><span className={'epi-tag ' + i.tipo.toLowerCase()}>{i.tipo}</span></td>
                    <td>{i.categoria || '—'}</td>
                    <td>{i.tamanho || '—'}</td>
                    <td>{i.ca || '—'}</td>
                    <td>{i.ca_validade ? <span className={'epi-ca ' + ca}>{fmt(i.ca_validade)}{ca === 'vencido' ? ' · vencido' : ca === 'vence' ? ' · vence logo' : ''}</span> : '—'}</td>
                    <td className="num"><span className={s < min ? 'epi-num ruim' : 'epi-num'}>{qtd(s)}</span> <small>{i.unidade}{min ? ` · mín. ${qtd(min)}` : ''}</small></td>
                    <td className="epi-acoes">
                      {i.ativo !== false ? (
                        <>
                          <button type="button" className="pill" onClick={() => onEntrada(i)}>+ Entrada</button>
                          <button type="button" className="link-btn" onClick={() => comecarEdicao(i)}>Editar</button>
                          <button type="button" className="link-btn danger-text" onClick={() => dados.salvarItemEpi({ id: i.id, ativo: false })}>Desativar</button>
                        </>
                      ) : <button type="button" className="link-btn" onClick={() => dados.salvarItemEpi({ id: i.id, ativo: true })}>Reativar</button>}
                    </td>
                  </tr>
                );
              })}
              {!lista.length && <tr><td colSpan={8} className="empty">{itens.length ? 'Nenhum item neste filtro.' : 'Nenhum item cadastrado. Comece pelo formulário acima.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Entrada (modal)
function Entrada({ item, saldo, dados, avisar, onFechar }) {
  const [q, setQ] = useState('');
  const [dia, setDia] = useState(hoje());
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const n = num(q);
  const salvar = async (e) => {
    e.preventDefault();
    if (!n || n <= 0) return;
    setSalvando(true);
    const ok = await dados.movimentarEpi({ item_id: item.id, tipo: 'entrada', quantidade: n, dia, observacao: obs.trim() || null });
    setSalvando(false);
    if (ok) { avisar(`Entrada de ${qtd(n)} ${item.unidade} · ${item.nome}.`); onFechar(); }
  };
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Registrar entrada" onSubmit={salvar} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div><span className="modal-kicker">Registrar entrada</span><h2>{item.nome}{item.tamanho ? ` · ${item.tamanho}` : ''}</h2>
            <span className="note">Em estoque agora: {qtd(saldo)} {item.unidade}</span></div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <div className="campo-linha2">
          <label className="field"><span>Quantidade ({item.unidade})</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="decimal" autoFocus placeholder="Ex.: 20" />
          </label>
          <label className="field"><span>Data</span><input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
        </div>
        <label className="field"><span>Observação (opcional)</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: NF 1234, fornecedor X" />
        </label>
        <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="pill ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="pill lime" disabled={salvando || !n || n <= 0}>{salvando ? 'Salvando…' : `Adicionar ${n > 0 ? qtd(n) : ''}`}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Registrar saída
function Saida({ itens, saldo, dados, dia, avisar, movs, desabilitado }) {
  const [itemId, setItemId] = useState('');
  const [busca, setBusca] = useState('');
  const item = itens.find((i) => i.id === itemId);
  const [destino, setDestino] = useState('individual');
  const [funcId, setFuncId] = useState('');
  const [obraId, setObraId] = useState('');
  const [q, setQ] = useState('1');
  const [data, setData] = useState(dia);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [ficha, setFicha] = useState(false);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [okCa, setOkCa] = useState(false);
  const n = num(q);
  const disponivel = item ? saldo[item.id] || 0 : 0;
  const ca = item ? statusCA(item, data) : null;
  const funcs = dados.funcionarios.filter((f) => f.ativo !== false);
  const obras = dados.demandas.filter((d) => !d.arquivada && d.empresa !== 'eko').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const escolher = (id) => {
    setItemId(id); setOkCa(false);
    const it = itens.find((i) => i.id === id);
    if (it) { setDestino(it.tipo === 'EPC' ? 'coletivo' : 'individual'); if (it.tipo === 'EPC') setMotivo('Uso coletivo em obra'); }
  };
  const erros = [];
  if (!item) erros.push('Escolha o EPI/EPC');
  else if (!n || n <= 0) erros.push('Informe a quantidade');
  else if (n > disponivel) erros.push(`Só tem ${qtd(disponivel)} ${item.unidade} em estoque`);
  if (item && destino === 'individual' && !funcId) erros.push('Escolha o funcionário');
  if (item && ca === 'vencido' && !okCa) erros.push('Confirme o CA vencido');

  const registrar = async (e) => {
    e.preventDefault();
    if (erros.length) return;
    setSalvando(true);
    const ok = await dados.movimentarEpi({
      item_id: item.id, tipo: 'saida', quantidade: n, dia: data, destino,
      funcionario_id: destino === 'individual' ? funcId : null, demanda_id: obraId || null,
      motivo, ficha_assinada: destino === 'individual' ? ficha : null, observacao: obs.trim() || null,
    });
    setSalvando(false);
    if (ok) {
      const quem = destino === 'individual' ? dados.funcionarios.find((f) => f.id === funcId)?.nome : 'uso coletivo';
      avisar(`Saída registrada: ${qtd(n)} ${item.unidade} de ${item.nome} · ${quem}.`);
      setQ('1'); setFicha(false); setObs(''); setOkCa(false);
    }
  };
  const lista = itens
    .filter((i) => !busca || [i.nome, i.tamanho, i.categoria, i.ca].join(' ').toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.tamanho || '').localeCompare(b.tamanho || ''));
  const recentes = movs.filter((m) => m.tipo === 'saida').sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '')).slice(0, 6);
  const nomeItem = (id) => (dados.epi_itens || []).find((i) => i.id === id);

  return (
    <div className="painel-grid g-2-1">
      <form className="card stack epi-form" onSubmit={registrar}>
        <h2 className="card-title">Registrar saída</h2>
        <div className="field"><span>EPI / EPC</span>
          <input className="input" placeholder="Buscar item…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar item" />
          <div className="epi-escolha" role="listbox" aria-label="Itens">
            {lista.map((i) => {
              const s = saldo[i.id] || 0;
              return (
                <button key={i.id} type="button" role="option" aria-selected={itemId === i.id} className={'epi-op' + (itemId === i.id ? ' on' : '') + (s <= 0 ? ' zerado' : '')}
                  onClick={() => escolher(i.id)} disabled={s <= 0}>
                  <span><b>{i.nome}</b>{i.tamanho ? ` · ${i.tamanho}` : ''} <span className={'epi-tag ' + i.tipo.toLowerCase()}>{i.tipo}</span></span>
                  <span className={s <= 0 ? 'epi-num ruim' : 'epi-num'}>{s <= 0 ? 'sem estoque' : `${qtd(s)} ${i.unidade}`}</span>
                </button>
              );
            })}
            {!lista.length && <p className="empty">{itens.length ? 'Nenhum item encontrado.' : 'Cadastre os itens no Catálogo primeiro.'}</p>}
          </div>
        </div>

        {item && (
          <>
            {ca === 'vencido' && (
              <label className="epi-alerta"><input type="checkbox" checked={okCa} onChange={(e) => setOkCa(e.target.checked)} />
                O CA deste item venceu em {fmt(item.ca_validade)}. A NR-6 exige CA válido. Marque para registrar mesmo assim.</label>
            )}
            {ca === 'vence' && <p className="epi-aviso">O CA vence em {fmt(item.ca_validade)}.</p>}
            <div className="field"><span>Destino</span>
              <div className="seg two">
                <button type="button" className={destino === 'individual' ? 'on' : ''} onClick={() => setDestino('individual')}>Entrega individual (EPI)</button>
                <button type="button" className={destino === 'coletivo' ? 'on' : ''} onClick={() => setDestino('coletivo')}>Uso coletivo (EPC)</button>
              </div>
            </div>
            <div className="campo-linha2">
              {destino === 'individual' ? (
                <label className="field"><span>Funcionário que recebeu</span>
                  <select value={funcId} onChange={(e) => setFuncId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {funcs.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="field"><span>Obra {destino === 'individual' ? '(opcional)' : ''}</span>
                <select value={obraId} onChange={(e) => setObraId(e.target.value)}>
                  <option value="">{destino === 'individual' ? '—' : 'Escolha a obra (opcional)'}</option>
                  {EMPRESAS.filter((e) => e.id !== 'eko').map((e) => {
                    const os = obras.filter((d) => d.empresa === e.id);
                    return os.length ? <optgroup key={e.id} label={e.curto}>{os.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</optgroup> : null;
                  })}
                </select>
              </label>
            </div>
            <div className="campo-linha2">
              <label className="field"><span>Quantidade ({item.unidade}) · tem {qtd(disponivel)}</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="decimal" />
              </label>
              <label className="field"><span>Data</span><input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} /></label>
            </div>
            <label className="field"><span>Motivo</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </label>
            <label className="field"><span>Observação (opcional)</span>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: luva rasgou na obra" />
            </label>
            {destino === 'individual' && (
              <label className={'epi-ficha' + (ficha ? ' on' : '')}>
                <input type="checkbox" checked={ficha} onChange={(e) => setFicha(e.target.checked)} />
                <span><b>Ficha de entrega assinada pelo funcionário</b><small>conforme NR-6 (dá para marcar depois no Histórico)</small></span>
              </label>
            )}
          </>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {erros.length > 0 && item && <span className="note">{erros[0]}</span>}
          <button type="submit" className="pill lime" disabled={salvando || desabilitado || !!erros.length}>{salvando ? 'Registrando…' : 'Registrar saída'}</button>
        </div>
      </form>

      <section className="card stack">
        <h2 className="card-title">Últimas saídas</h2>
        {recentes.length ? (
          <ul className="epi-lista simples">
            {recentes.map((m) => (
              <li key={m.id}>
                <span className="epi-mov saida">−{qtd(m.quantidade)}</span>
                <span className="epi-nome"><b>{nomeItem(m.item_id)?.nome || '?'}</b>
                  <small> · {m.destino === 'coletivo' ? 'uso coletivo' : dados.funcionarios.find((f) => f.id === m.funcionario_id)?.nome || '—'} · {fmt(m.dia)}</small></span>
                {m.destino === 'individual' && <span className={'epi-ficha-tag' + (m.ficha_assinada ? ' ok' : '')}>{m.ficha_assinada ? 'ficha ✓' : 'sem ficha'}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="empty">Nenhuma saída registrada ainda.</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Histórico
const PERIODOS = [{ id: 'hoje', nome: 'Hoje' }, { id: '7', nome: 'Última semana' }, { id: '30', nome: 'Último mês' }, { id: 'tudo', nome: 'Tudo' }, { id: 'custom', nome: 'De … até' }];
function Historico({ itens, movs, dados, dia, pode }) {
  const [funcId, setFuncId] = useState('');
  const [itemId, setItemId] = useState('');
  const [periodo, setPeriodo] = useState('30');
  const [de, setDe] = useState(addDias(dia, -30));
  const [ate, setAte] = useState(dia);
  const [ver, setVer] = useState('saidas'); // saidas | entradas
  const [confirmar, setConfirmar] = useState(null);
  const ini = periodo === 'hoje' ? dia : periodo === '7' ? addDias(dia, -7) : periodo === '30' ? addDias(dia, -30) : periodo === 'custom' ? de : '0000';
  const fim = periodo === 'custom' ? ate : '9999';
  const item = Object.fromEntries(itens.map((i) => [i.id, i]));
  const nomeFunc = (id) => dados.funcionarios.find((f) => f.id === id)?.nome || '—';
  const nomePerfil = (id) => dados.perfis.find((p) => p.id === id)?.nome || dados.perfis.find((p) => p.id === id)?.email || '—';
  const nomeObra = (id) => dados.demandas.find((d) => d.id === id)?.nome;

  const filtrados = movs
    .filter((m) => m.dia >= ini && m.dia <= fim)
    .filter((m) => !itemId || m.item_id === itemId)
    .filter((m) => !funcId || m.funcionario_id === funcId)
    .sort((a, b) => b.dia.localeCompare(a.dia) || (b.criado_em || '').localeCompare(a.criado_em || ''));
  const saidas = filtrados.filter((m) => m.tipo === 'saida');
  const entradas = filtrados.filter((m) => m.tipo !== 'saida');
  const totalQ = (l) => qtd(l.reduce((s, m) => s + Number(m.quantidade), 0));

  const exportar = () => {
    const linhas = ver === 'saidas'
      ? [['Data', 'Item', 'Tamanho', 'CA', 'Destino', 'Funcionário', 'Obra', 'Quantidade', 'Unidade', 'Motivo', 'Ficha NR-6 assinada', 'Registrado por', 'Observação'],
        ...saidas.map((m) => [fmt(m.dia), item[m.item_id]?.nome, item[m.item_id]?.tamanho, item[m.item_id]?.ca, m.destino === 'coletivo' ? 'Uso coletivo' : 'Individual',
          m.destino === 'individual' ? nomeFunc(m.funcionario_id) : '', nomeObra(m.demanda_id) || '', m.quantidade, item[m.item_id]?.unidade, m.motivo,
          m.destino === 'individual' ? (m.ficha_assinada ? 'Sim' : 'Não') : '', nomePerfil(m.autor_id), m.observacao])]
      : [['Data', 'Item', 'Tamanho', 'Adicionado por', 'Quantidade', 'Unidade', 'Observação'],
        ...entradas.map((m) => [fmt(m.dia), item[m.item_id]?.nome, item[m.item_id]?.tamanho, nomePerfil(m.autor_id), m.quantidade, item[m.item_id]?.unidade, m.observacao])];
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `epi_${ver}_${dia}.csv`; a.click();
  };

  return (
    <>
      <section className="card epi-filtros">
        <label className="field"><span>Funcionário</span>
          <select value={funcId} onChange={(e) => setFuncId(e.target.value)}>
            <option value="">Todos</option>{dados.funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label className="field"><span>Item</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Todos</option>
            {[...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((i) => <option key={i.id} value={i.id}>{i.nome}{i.tamanho ? ` · ${i.tamanho}` : ''}</option>)}
          </select>
        </label>
        <div className="field epi-periodo"><span>Período</span>
          <div className="row">
            {PERIODOS.map((p) => <button key={p.id} type="button" className={'pill' + (periodo === p.id ? ' on' : '')} onClick={() => setPeriodo(p.id)}>{p.nome}</button>)}
          </div>
          {periodo === 'custom' && (
            <div className="row">
              <input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
              <span className="note">até</span>
              <input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
            </div>
          )}
        </div>
      </section>

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="seg two epi-ver">
            <button type="button" className={ver === 'saidas' ? 'on' : ''} onClick={() => setVer('saidas')}>Saídas · {saidas.length}</button>
            <button type="button" className={ver === 'entradas' ? 'on' : ''} onClick={() => setVer('entradas')}>Entradas · {entradas.length}</button>
          </div>
          <div className="row">
            <span className="note">{ver === 'saidas' ? `${totalQ(saidas)} unidades retiradas` : `${totalQ(entradas)} unidades adicionadas`}</span>
            <button type="button" className="pill ghost" onClick={exportar} disabled={!(ver === 'saidas' ? saidas : entradas).length}>Exportar planilha</button>
          </div>
        </div>
        <div className="epi-tabela-wrap">
          {ver === 'saidas' ? (
            <table className="epi-tabela">
              <thead><tr><th>Data</th><th>Item</th><th>Destino</th><th>Funcionário / obra</th><th className="num">Qtd.</th><th>Motivo</th><th>Ficha NR-6</th><th>Registrado por</th>{pode.admin && <th aria-label="Apagar" />}</tr></thead>
              <tbody>
                {saidas.map((m) => (
                  <tr key={m.id}>
                    <td>{fmt(m.dia)}</td>
                    <td><b>{item[m.item_id]?.nome || '?'}</b>{item[m.item_id]?.tamanho ? ` · ${item[m.item_id].tamanho}` : ''}</td>
                    <td>{m.destino === 'coletivo' ? 'Uso coletivo' : 'Individual'}</td>
                    <td>{m.destino === 'individual' ? nomeFunc(m.funcionario_id) : ''}{nomeObra(m.demanda_id) ? `${m.destino === 'individual' ? ' · ' : ''}${nomeObra(m.demanda_id)}` : ''}</td>
                    <td className="num">{qtd(m.quantidade)} <small>{item[m.item_id]?.unidade}</small></td>
                    <td>{m.motivo || '—'}{m.observacao && <small className="epi-obs"> · {m.observacao}</small>}</td>
                    <td>{m.destino === 'individual'
                      ? (m.ficha_assinada ? <span className="epi-ficha-tag ok">Sim</span>
                        : <button type="button" className="epi-ficha-tag" title="Marcar como assinada" onClick={() => dados.atualizarMovimentoEpi(m.id, { ficha_assinada: true })}>Não · marcar</button>)
                      : '—'}</td>
                    <td>{nomePerfil(m.autor_id)}</td>
                    {pode.admin && <td><BotaoApagar id={m.id} confirmar={confirmar} setConfirmar={setConfirmar} apagar={dados.apagarMovimentoEpi} /></td>}
                  </tr>
                ))}
                {!saidas.length && <tr><td colSpan={9} className="empty">Nenhuma saída neste filtro.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="epi-tabela">
              <thead><tr><th>Data</th><th>Item</th><th>Adicionado por</th><th className="num">Qtd.</th><th>Observação</th>{pode.admin && <th aria-label="Apagar" />}</tr></thead>
              <tbody>
                {entradas.map((m) => (
                  <tr key={m.id}>
                    <td>{fmt(m.dia)}</td>
                    <td><b>{item[m.item_id]?.nome || '?'}</b>{item[m.item_id]?.tamanho ? ` · ${item[m.item_id].tamanho}` : ''}</td>
                    <td>{nomePerfil(m.autor_id)}</td>
                    <td className="num">{m.tipo === 'ajuste' && m.quantidade < 0 ? '' : '+'}{qtd(m.quantidade)} <small>{item[m.item_id]?.unidade}</small></td>
                    <td>{m.observacao || '—'}</td>
                    {pode.admin && <td><BotaoApagar id={m.id} confirmar={confirmar} setConfirmar={setConfirmar} apagar={dados.apagarMovimentoEpi} /></td>}
                  </tr>
                ))}
                {!entradas.length && <tr><td colSpan={6} className="empty">Nenhuma entrada neste filtro.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        {funcId && ver === 'saidas' && <p className="note">Mostrando o que {nomeFunc(funcId)} recebeu no período.</p>}
      </section>
    </>
  );
}

function BotaoApagar({ id, confirmar, setConfirmar, apagar }) {
  if (confirmar === id) {
    return (
      <span className="epi-apagar">
        <button type="button" className="link-btn danger-text" onClick={() => { apagar(id); setConfirmar(null); }}>Apagar</button>
        <button type="button" className="link-btn" onClick={() => setConfirmar(null)}>Não</button>
      </span>
    );
  }
  return <button type="button" className="x-btn" aria-label="Apagar lançamento" title="Apagar lançamento errado (volta o estoque)" onClick={() => setConfirmar(id)}>×</button>;
}
