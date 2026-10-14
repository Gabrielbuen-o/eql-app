import { useMemo, useState } from 'react';
import { listaClientes } from './ClienteCampo.jsx';
import { EMPRESAS, PRODUTOS_EKO, dataLonga, hoje, ordemGrupo, percentual, situacao } from './lib.js';
import { DemandaModal } from './DemandaModal.jsx';
import { resultadoDemanda } from './custos.js';
import { CartaoDemanda, CartaoFabrica } from './Demandas.jsx';

// Demandas · Geral: obras (Engenharia e Impermeabilização) e fábrica (Eko) numa tela só.
// Cada coluna mantém o jeito da sua aba: obras agrupadas por cliente; fábrica por etapa do pedido.
const ETAPAS_FAB = [
  { id: 'orcamento', nome: 'Orçamento' },
  { id: 'execucao', nome: 'Em produção' },
  { id: 'estoque', nome: 'Em estoque' },
];
const prontoFab = (d) => d.fase === 'estoque' || (d.qtd_total > 0 && percentual(d) >= 100);
const ordemProduto = (a, b) => {
  const ia = PRODUTOS_EKO.findIndex((p) => p.id === a), ib = PRODUTOS_EKO.findIndex((p) => p.id === b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
};

export function DemandasGeral({ dados, tv, setTv, pode, custos, irSub }) {
  const dia = hoje();
  const [filtro, setFiltro] = useState('todas');
  const [destaque, setDestaque] = useState(() => { // filtro pelos cartões de números (pode vir do Início)
    try { const v = sessionStorage.getItem('eql-destaque'); sessionStorage.removeItem('eql-destaque'); return v || null; } catch { return null; }
  });
  const [editando, setEditando] = useState(null);

  const empresas = EMPRESAS.filter((e) => e.id !== 'eko' || pode.verOperacao);
  const daEmpresa = (d) => (filtro === 'todas' || d.empresa === filtro) && empresas.some((e) => e.id === d.empresa);
  const abertas = dados.demandas.filter((d) => !d.arquivada && daEmpresa(d));
  const concluidas = dados.demandas.filter((d) => d.arquivada && daEmpresa(d));
  // pedido da fábrica que já está pronto em estoque não conta como pendente
  const pendentes = abertas.filter((d) => d.empresa !== 'eko' || !prontoFab(d));
  const casa = (d, f) => { const s = situacao(d, dia); return f === 'semana' ? s === 'semana' || s === 'urgente' : s === f; };
  const conta = (f) => pendentes.filter((d) => casa(d, f)).length;
  const nObras = abertas.filter((d) => d.empresa !== 'eko').length;
  const nPedidos = abertas.filter((d) => d.empresa === 'eko').length;

  const stats = [
    { id: null, rotulo: 'Demandas ativas', valor: abertas.length, dica: `${nObras} ${nObras === 1 ? 'obra' : 'obras'} · ${nPedidos} ${nPedidos === 1 ? 'pedido' : 'pedidos'} da fábrica`, cor: 'var(--lav)' },
    { id: 'semana', rotulo: 'Entregar em até 7 dias', valor: conta('semana'), dica: 'clique para filtrar', cor: 'var(--yellow)' },
    { id: 'atrasada', rotulo: 'Atrasadas', valor: conta('atrasada'), dica: 'clique para filtrar', cor: 'var(--red-soft)' },
    { id: 'sem', rotulo: 'Sem prazo definido', valor: conta('sem'), dica: 'clique para filtrar', cor: 'var(--mint)' },
    { id: 'concluidas', rotulo: 'Concluídas', valor: concluidas.length, dica: 'clique para ver', cor: '#D5DCE4' },
  ];
  const vendoConcluidas = destaque === 'concluidas';
  const lista = vendoConcluidas ? concluidas : destaque ? pendentes.filter((d) => casa(d, destaque)) : abertas;
  const porEntrega = (a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999');

  const colunas = empresas.filter((e) => filtro === 'todas' || e.id === filtro).map((e) => {
    const itens = lista.filter((d) => d.empresa === e.id);
    let grupos;
    if (vendoConcluidas) {
      grupos = [{ nome: null, itens: [...itens].sort((a, b) => (b.atualizado_em || '').localeCompare(a.atualizado_em || '')) }];
    } else if (e.id === 'eko') {
      // fábrica: por etapa do pedido (orçamento → produção → estoque)
      grupos = ETAPAS_FAB.map((f) => ({
        nome: f.nome, fase: f.id,
        itens: itens.filter((d) => (f.id === 'estoque' ? prontoFab(d) : !prontoFab(d) && (d.fase === f.id || (f.id === 'execucao' && d.fase !== 'orcamento'))))
          .sort((a, b) => ordemProduto(a.produto, b.produto) || porEntrega(a, b)),
      })).filter((g) => g.itens.length);
    } else {
      // obras: por cliente; atrasadas e urgentes primeiro dentro do cliente
      const pg = {};
      itens.forEach((d) => (pg[d.grupo || 'Outros'] ||= []).push(d));
      const pri = (d) => ({ atrasada: 0, urgente: 1 }[situacao(d, dia)] ?? 2);
      grupos = Object.keys(pg).sort(ordemGrupo).map((nome) => ({ nome, itens: pg[nome].sort((a, b) => pri(a) - pri(b) || porEntrega(a, b)) }));
    }
    return { ...e, total: itens.length, grupos, atrasadas: itens.filter((d) => !d.arquivada && situacao(d, dia) === 'atrasada' && !(d.empresa === 'eko' && prontoFab(d))).length };
  });

  const gruposCli = useMemo(() => {
    const g = {};
    dados.demandas.forEach((d) => d.grupo && (g[d.empresa] ||= new Set()).add(d.grupo));
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v].sort(ordemGrupo)]));
  }, [dados.demandas]);

  const res = (d) => (!tv && pode.admin && custos ? resultadoDemanda(d.id, dados, custos) : null);
  const abrir = (d) => (!tv && pode.editarAndamento ? () => setEditando(d) : null);
  const novo = (empresa) => setEditando(empresa === 'eko' ? { empresa: 'eko', fase: 'orcamento' } : { empresa: empresa || 'engenharia' });
  const entrarTv = () => { setTv(true); document.documentElement.requestFullscreen?.().catch(() => {}); };
  const sairTv = () => { setTv(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };

  return (
    <>
      <header className="head">
        <div>
          <h1>Demandas</h1>
          <p className="date">{dataLonga()} · obras e fábrica</p>
        </div>
        <div className="row">
          {[{ id: 'todas', curto: 'Todas' }, ...empresas].map((e) => (
            <button key={e.id} type="button" className={'pill' + (filtro === e.id ? ' on' : '')} aria-pressed={filtro === e.id}
              onClick={() => setFiltro(e.id)}>{e.curto}</button>
          ))}
          {tv ? (
            <button type="button" className="pill dark" onClick={sairTv}>Sair do modo TV</button>
          ) : (
            <>
              <button type="button" className="pill ghost" onClick={entrarTv}>Modo TV</button>
              {pode.gestao && <button type="button" className="pill lime" onClick={() => novo(filtro !== 'todas' ? filtro : null)}>+ Nova demanda</button>}
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

      <div className={'board geral-board n' + colunas.length}>
        {colunas.map((c) => (
          <section key={c.id} className={'card col geral-col emp-' + c.id} aria-label={c.nome}>
            <div className="col-head">
              <div className="col-title">
                <span className="dot" style={{ background: c.cor }} />
                <div>
                  <h2>{c.nome}</h2>
                  <span className="geral-tipo">{c.id === 'eko' ? 'Fábrica · pedidos por etapa' : 'Obras · por cliente'}</span>
                </div>
              </div>
              <span className="count">{c.total}</span>
            </div>
            {c.atrasadas > 0 && !vendoConcluidas && <span className="geral-alerta">{c.atrasadas} {c.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>}
            {c.grupos.map((g, i) => (
              <div key={g.nome || i} className="group">
                {g.nome && (
                  <span className={'group-name' + (g.fase ? ' geral-etapa fase-' + g.fase : '')}>
                    {g.fase && <span className={'dot fase-' + g.fase} />}{g.nome}{g.fase ? ` · ${g.itens.length}` : ''}
                  </span>
                )}
                {g.itens.map((d) => (d.empresa === 'eko'
                  ? <CartaoFabrica key={d.id} d={d} dia={dia} res={res(d)} onAbrir={abrir(d)} comProduto />
                  : <CartaoDemanda key={d.id} d={d} dia={dia} res={res(d)} onAbrir={abrir(d)} />))}
              </div>
            ))}
            {!c.total && <p className="empty">{vendoConcluidas ? 'Nada concluído.' : destaque ? 'Nada neste filtro.' : c.id === 'eko' ? 'Nenhum pedido em aberto.' : 'Nenhuma obra em aberto.'}</p>}
            {!tv && (
              <div className="geral-pe">
                {pode.gestao && !vendoConcluidas && <button type="button" className="add-line" onClick={() => novo(c.id)}>{c.id === 'eko' ? '+ Novo pedido' : `+ Adicionar em ${c.curto}`}</button>}
                {irSub && <button type="button" className="link-btn" onClick={() => irSub(c.id === 'eko' ? 'fabrica' : 'obras')}>{c.id === 'eko' ? 'Abrir Fábrica ›' : 'Abrir Obras ›'}</button>}
              </div>
            )}
          </section>
        ))}
      </div>

      {editando && (
        <DemandaModal inicial={editando} grupos={gruposCli} clientes={listaClientes(dados)} criarCliente={pode.gestao && !dados.faltando.has('clientes') ? dados.criarCliente : null} onFechar={() => setEditando(null)}
          onSalvar={dados.salvarDemanda} onExcluir={dados.excluirDemanda}
          limitado={!pode.gestao} perfis={dados.perfis}
          financeiro={pode.admin && custos ? { dados, porDemanda: custos } : null}
          admin={pode.admin} gerente={pode.papel === 'gerente'} dados={dados} />
      )}
    </>
  );
}
