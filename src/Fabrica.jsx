import { listaClientes } from './ClienteCampo.jsx';
import { useMemo, useState } from 'react';
import { PRODUTOS_EKO, dataLonga, diasUteis, fmt, hoje, ordemGrupo, percentual, situacao } from './lib.js';
import { DemandaModal } from './DemandaModal.jsx';
import { resultadoDemanda } from './custos.js';
import { CartaoFabrica } from './Demandas.jsx';

// Aba da fábrica (EQL Eko): pedidos por etapa — orçamento → produção → estoque
const COLUNAS = [
  { id: 'orcamento', nome: 'Orçamento', vazio: 'Nenhum pedido em orçamento.', novo: '+ Novo orçamento' },
  { id: 'execucao', nome: 'Em produção', vazio: 'Nada sendo produzido.', novo: '+ Pedido direto para produção' },
  { id: 'estoque', nome: 'Em estoque', vazio: 'Nenhum pedido pronto.' },
];
const unidadeDe = (d) => d.unidade || PRODUTOS_EKO.find((p) => p.id === d.produto)?.unidade || 'un.';
const ordemProduto = (a, b) => {
  const ia = PRODUTOS_EKO.findIndex((p) => p.id === a), ib = PRODUTOS_EKO.findIndex((p) => p.id === b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
};
const n = (x) => x.toLocaleString('pt-BR');

export function Fabrica({ dados, tv, setTv, pode, custos }) {
  const dia = hoje();
  const [produto, setProduto] = useState('todos');
  const [destaque, setDestaque] = useState(null);
  const [editando, setEditando] = useState(null);

  const eko = dados.demandas.filter((d) => d.empresa === 'eko');
  const doProduto = (d) => produto === 'todos' || (d.produto || 'Outro') === produto;
  const abertos = eko.filter((d) => !d.arquivada && doProduto(d));
  const concluidos = eko.filter((d) => d.arquivada && doProduto(d));
  const pronto = (d) => d.fase === 'estoque' || (d.qtd_total > 0 && percentual(d) >= 100);
  const pendentes = abertos.filter((d) => !pronto(d));
  const casa = (d, f) => { const s = situacao(d, dia); return f === 'semana' ? s === 'semana' || s === 'urgente' : s === f; };
  const produtos = [...new Set(eko.map((d) => d.produto || 'Outro'))].sort(ordemProduto);

  const stats = [
    { id: null, rotulo: 'Pedidos em aberto', valor: pendentes.length, dica: 'orçamento e produção', cor: 'var(--lav)' },
    { id: 'semana', rotulo: 'Entregar em até 7 dias', valor: pendentes.filter((d) => casa(d, 'semana')).length, dica: 'clique para filtrar', cor: 'var(--yellow)' },
    { id: 'atrasada', rotulo: 'Atrasados', valor: pendentes.filter((d) => casa(d, 'atrasada')).length, dica: 'clique para filtrar', cor: 'var(--red-soft)' },
    { id: 'estoque', rotulo: 'Prontos em estoque', valor: abertos.filter(pronto).length, dica: 'clique para filtrar', cor: 'var(--mint)' },
    { id: 'concluidas', rotulo: 'Concluídos', valor: concluidos.length, dica: 'clique para ver', cor: '#D5DCE4' },
  ];
  const filtrados = destaque === 'estoque' ? abertos.filter(pronto)
    : destaque ? pendentes.filter((d) => casa(d, destaque)) : abertos;

  // quanto falta produzir de cada produto (só pedidos em produção)
  const aProduzir = useMemo(() => {
    const m = {};
    eko.filter((d) => !d.arquivada && d.fase === 'execucao' && d.qtd_total > 0).forEach((d) => {
      const falta = Math.max(0, d.qtd_total - (d.qtd_produzida || 0));
      if (!falta) return;
      const p = d.produto || 'Outro';
      const r = (m[p] ||= { produto: p, unidade: unidadeDe(d), falta: 0, porDia: 0, pedidos: 0, proxima: null, vencido: 0 });
      r.falta += falta; r.pedidos += 1;
      if (d.entrega && (!r.proxima || d.entrega < r.proxima)) r.proxima = d.entrega;
      if (d.entrega && d.entrega >= dia) r.porDia += Math.ceil(falta / Math.max(1, diasUteis(dia, d.entrega)));
      else if (d.entrega) r.vencido += falta;
    });
    return Object.values(m).sort((a, b) => ordemProduto(a.produto, b.produto));
  }, [dados.demandas, dia]);

  const coluna = (id) => filtrados
    .filter((d) => (id === 'estoque' ? pronto(d) : !pronto(d) && (d.fase === id || (id === 'execucao' && d.fase !== 'orcamento'))))
    .sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999'));

  const grupos = useMemo(() => {
    const g = {};
    dados.demandas.forEach((d) => d.grupo && (g[d.empresa] ||= new Set()).add(d.grupo));
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v].sort(ordemGrupo)]));
  }, [dados.demandas]);

  const res = (d) => (!tv && pode.admin && custos ? resultadoDemanda(d.id, dados, custos) : null);
  const abrir = (d) => (!tv && pode.editarAndamento ? () => setEditando(d) : null);
  const novo = (fase = 'orcamento') => setEditando({ empresa: 'eko', fase, ...(produto !== 'todos' ? { produto } : {}) });

  const entrarTv = () => { setTv(true); document.documentElement.requestFullscreen?.().catch(() => {}); };
  const sairTv = () => { setTv(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };

  return (
    <>
      <header className="head">
        <div>
          <h1>Fábrica · EQL Eko</h1>
          <p className="date">{dataLonga()}</p>
        </div>
        <div className="row">
          {produtos.length > 1 && [{ id: 'todos', nome: 'Todos' }, ...produtos.map((p) => ({ id: p, nome: p }))].map((p) => (
            <button key={p.id} type="button" className={'pill' + (produto === p.id ? ' on' : '')} aria-pressed={produto === p.id}
              onClick={() => setProduto(p.id)}>{p.nome}</button>
          ))}
          {tv ? (
            <button type="button" className="pill dark" onClick={sairTv}>Sair do modo TV</button>
          ) : (
            <>
              <button type="button" className="pill ghost" onClick={entrarTv}>Modo TV</button>
              {pode.gestao && <button type="button" className="pill lime" onClick={() => novo()}>+ Novo pedido</button>}
            </>
          )}
        </div>
      </header>

      <div className="stats">
        {stats.map((s) => (
          <button key={s.rotulo} type="button" className={'stat' + (destaque === s.id && s.id ? ' on' : '')} style={{ background: s.cor }}
            aria-pressed={destaque === s.id && !!s.id}
            onClick={() => setDestaque(s.id && destaque !== s.id ? s.id : null)}>
            <span className="stat-label">{s.rotulo}</span>
            <span className="stat-value">{s.valor}</span>
            <span className="stat-hint">{destaque === s.id && s.id ? (s.id === 'concluidas' ? 'mostrando · clique para voltar' : 'filtrando · clique para limpar') : s.dica}</span>
          </button>
        ))}
      </div>

      {destaque !== 'concluidas' && aProduzir.length > 0 && (
        <section className="card producao" aria-label="A produzir">
          <div className="col-head">
            <h2>A produzir</h2>
            <span className="note">pedidos em produção · ritmo para cumprir os prazos (seg a sáb)</span>
          </div>
          <div className="producao-lista">
            {aProduzir.map((r) => (
              <div key={r.produto} className="producao-item">
                <span className="producao-nome">{r.produto}</span>
                <span className="producao-num">{n(r.falta)} <small>{r.unidade}</small></span>
                <span className="producao-meta">
                  {r.porDia > 0 && <>≈ <b>{n(r.porDia)}/dia</b> · </>}
                  {r.pedidos} {r.pedidos === 1 ? 'pedido' : 'pedidos'}
                  {r.proxima && <> · próxima entrega {fmt(r.proxima)}</>}
                </span>
                {r.vencido > 0 && <span className="producao-alerta">{n(r.vencido)} {r.unidade} com prazo vencido</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {destaque === 'concluidas' ? (
        <section className="card col">
          <div className="col-head"><h2>Pedidos concluídos</h2><span className="count">{concluidos.length}</span></div>
          <div className="board fab-concluidos">
            {concluidos.sort((a, b) => (b.atualizado_em || '').localeCompare(a.atualizado_em || ''))
              .map((d) => <CartaoFabrica key={d.id} d={d} dia={dia} res={res(d)} onAbrir={abrir(d)} comProduto />)}
          </div>
          {!concluidos.length && <p className="empty">Nenhum pedido concluído.</p>}
        </section>
      ) : (
        <div className="board fab-board">
          {COLUNAS.map((c) => {
            const itens = coluna(c.id);
            return (
              <section key={c.id} className="card col" aria-label={c.nome}>
                <div className="col-head">
                  <div className="col-title"><span className={'dot fase-' + c.id} /><h2>{c.nome}</h2></div>
                  <span className="count">{itens.length}</span>
                </div>
                {itens.map((d) => <CartaoFabrica key={d.id} d={d} dia={dia} res={res(d)} onAbrir={abrir(d)} comProduto />)}
                {!itens.length && <p className="empty">{destaque ? 'Nada neste filtro.' : c.vazio}</p>}
                {!tv && pode.gestao && c.id !== 'estoque' && (
                  <button type="button" className="add-line" onClick={() => novo(c.id)}>{c.novo}</button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editando && (
        <DemandaModal inicial={editando} grupos={grupos} clientes={listaClientes(dados)} criarCliente={pode.gestao && !dados.faltando.has('clientes') ? dados.criarCliente : null} onFechar={() => setEditando(null)}
          onSalvar={dados.salvarDemanda} onExcluir={dados.excluirDemanda}
          limitado={!pode.gestao} perfis={dados.perfis}
          financeiro={pode.admin && custos ? { dados, porDemanda: custos } : null} />
      )}
    </>
  );
}
