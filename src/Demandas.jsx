import { useMemo, useState } from 'react';
import { EMPRESAS, PRODUTOS_EKO, faseNome, fmt, hoje, ehProducao, ordemGrupo, percentual, resumoProducao, rotuloPrazo, situacao } from './lib.js';
import { DemandaModal } from './DemandaModal.jsx';
import { brl, resultadoDemanda } from './custos.js';
import { Agenda } from './Agenda.jsx';
import { Planilha } from './Planilha.jsx';

// Obras = Engenharia e Impermeabilização. A fábrica (Eko) tem aba própria (Fabrica.jsx).
const OBRAS = EMPRESAS.filter((e) => e.id !== 'eko');

export function Demandas({ dados, tv, setTv, avisar, pode, custos, modo = 'geral' }) {
  const [visao, setVisaoState] = useState(() => { try { return localStorage.getItem('eql-visao-obras') || 'quadro'; } catch { return 'quadro'; } });
  const setVisao = (v) => { setVisaoState(v); try { localStorage.setItem('eql-visao-obras', v); } catch { /* ignora */ } };
  const titulo = modo === 'obras' ? 'Obras' : modo === 'calendario' ? 'Calendário' : 'Demandas';
  const mostrarQuadro = modo === 'geral' || (modo === 'obras' && visao === 'quadro');
  const mostrarPlanilha = modo === 'obras' && visao === 'planilha';
  const mostrarAgenda = modo === 'geral' || modo === 'calendario';
  const [filtro, setFiltro] = useState('todas');
  const [destaque, setDestaque] = useState(() => { // filtro pelos cartões de números (pode vir do Início)
    try { const v = sessionStorage.getItem('eql-destaque'); sessionStorage.removeItem('eql-destaque'); return v || null; } catch { return null; }
  });
  const [editando, setEditando] = useState(null);
  const dia = hoje();

  const abertas = dados.demandas.filter((d) => !d.arquivada && d.empresa !== 'eko');
  const visiveis = abertas.filter((d) => filtro === 'todas' || d.empresa === filtro);
  const casa = (d, f) => { const s = situacao(d, dia); return f === 'semana' ? s === 'semana' || s === 'urgente' : s === f; };
  const concluidas = dados.demandas.filter((d) => d.arquivada && d.empresa !== 'eko' && (filtro === 'todas' || d.empresa === filtro));
  const vendoConcluidas = destaque === 'concluidas';
  const filtradas = vendoConcluidas ? concluidas : destaque ? visiveis.filter((d) => casa(d, destaque)) : visiveis;

  const grupos = useMemo(() => {
    const g = {};
    dados.demandas.forEach((d) => d.grupo && (g[d.empresa] ||= new Set()).add(d.grupo));
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [...v].sort(ordemGrupo)]));
  }, [dados.demandas]);

  const conta = (s) => visiveis.filter((d) => casa(d, s)).length;
  const stats = [
    { id: null, rotulo: 'Demandas ativas', valor: visiveis.length, dica: 'em andamento', cor: 'var(--lav)' },
    { id: 'semana', rotulo: 'Entregar em até 7 dias', valor: conta('semana'), dica: 'clique para filtrar', cor: 'var(--yellow)' },
    { id: 'atrasada', rotulo: 'Atrasadas', valor: conta('atrasada'), dica: 'clique para filtrar', cor: 'var(--red-soft)' },
    { id: 'sem', rotulo: 'Sem prazo definido', valor: conta('sem'), dica: 'clique para filtrar', cor: 'var(--mint)' },
    { id: 'concluidas', rotulo: 'Concluídas', valor: concluidas.length, dica: 'clique para ver', cor: '#D5DCE4' },
  ];

  const colunas = OBRAS.filter((e) => filtro === 'todas' || e.id === filtro).map((e) => {
    const itens = filtradas.filter((d) => d.empresa === e.id);
    const porGrupo = {};
    // fábrica agrupa por produto; obras agrupam por cliente/grupo
    const chave = (d) => (e.id === 'eko' ? d.produto || 'Outros' : d.grupo || 'Outros');
    itens.forEach((d) => (porGrupo[chave(d)] ||= []).push(d));
    const ordemFase = { execucao: 0, orcamento: 1, estoque: 2 };
    const ordenar = e.id === 'eko'
      ? (a, b) => (ordemFase[a.fase] ?? 0) - (ordemFase[b.fase] ?? 0) || (a.entrega || '9999').localeCompare(b.entrega || '9999')
      : (a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999');
    const ordemChaves = e.id === 'eko'
      ? (a, b) => PRODUTOS_EKO.findIndex((p) => p.id === a) - PRODUTOS_EKO.findIndex((p) => p.id === b)
      : ordemGrupo;
    const gs = Object.keys(porGrupo).sort(ordemChaves).map((nome) => ({ nome, itens: porGrupo[nome].sort(ordenar) }));
    return { ...e, total: itens.length, grupos: gs };
  });

  const novaDemanda = (empresa) => setEditando({ empresa: empresa || (filtro !== 'todas' ? filtro : 'engenharia') });

  const entrarTv = () => {
    setTv(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const sairTv = () => {
    setTv(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>{titulo}</h1>
          <p className="date">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="row">
          {[{ id: 'todas', curto: 'Todas' }, ...OBRAS].map((e) => (
            <button key={e.id} type="button" className={'pill' + (filtro === e.id ? ' on' : '')} aria-pressed={filtro === e.id}
              onClick={() => setFiltro(e.id)}>{e.curto}</button>
          ))}
          {modo === 'obras' && !tv && (
            <div className="seg two view-toggle" role="group" aria-label="Visualização">
              <button type="button" className={visao === 'quadro' ? 'on' : ''} aria-pressed={visao === 'quadro'} onClick={() => setVisao('quadro')}>Quadro</button>
              <button type="button" className={visao === 'planilha' ? 'on' : ''} aria-pressed={visao === 'planilha'} onClick={() => setVisao('planilha')}>Planilha</button>
            </div>
          )}
          {tv ? (
            <button type="button" className="pill dark" onClick={sairTv}>Sair do modo TV</button>
          ) : (
            <>
              <button type="button" className="pill ghost" onClick={entrarTv}>Modo TV</button>
              {pode.gestao && <button type="button" className="pill lime" onClick={() => novaDemanda()}>+ Nova demanda</button>}
            </>
          )}
        </div>
      </header>

      {modo !== 'calendario' && <div className="stats">
        {stats.map((s) => (
          <button key={s.rotulo} type="button" className={'stat' + (destaque === s.id && s.id ? ' on' : '')} style={{ background: s.cor }}
            aria-pressed={destaque === s.id && !!s.id}
            onClick={() => setDestaque(s.id && destaque !== s.id ? s.id : null)}>
            <span className="stat-label">{s.rotulo}</span>
            <span className="stat-value">{s.valor}</span>
            <span className="stat-hint">{destaque === s.id && s.id ? (s.id === 'concluidas' ? 'mostrando · clique para voltar' : 'filtrando · clique para limpar') : s.dica}</span>
          </button>
        ))}
      </div>}

      {mostrarPlanilha && (
        <Planilha demandas={filtradas} dados={dados} pode={pode} custos={custos} avisar={avisar}
          onAbrir={(d) => pode.editarAndamento && setEditando(d)} />
      )}

      {mostrarQuadro && <div className="board">
        {colunas.map((c) => (
          <section key={c.id} className="card col" aria-label={c.nome}>
            <div className="col-head">
              <div className="col-title"><span className="dot" style={{ background: c.cor }} /><h2>{c.nome}</h2></div>
              <span className="count">{c.total}</span>
            </div>
            {c.grupos.map((g) => (
              <div key={g.nome} className="group">
                <span className="group-name">{g.nome}</span>
                {g.itens.map((d) => <CartaoDemanda key={d.id} d={d} dia={dia} res={!tv && pode.admin && custos ? resultadoDemanda(d.id, dados, custos) : null} onAbrir={!tv && pode.editarAndamento ? () => setEditando(d) : null} />)}
              </div>
            ))}
            {!c.total && <p className="empty">{vendoConcluidas ? 'Nenhuma demanda concluída.' : destaque ? 'Nada neste filtro.' : 'Nenhuma demanda.'}</p>}
            {!tv && pode.gestao && !vendoConcluidas && <button type="button" className="add-line" onClick={() => novaDemanda(c.id)}>+ Adicionar em {c.curto}</button>}
          </section>
        ))}
      </div>}

      {mostrarAgenda && pode.verOperacao && (
        // no modo TV a agenda aparece igual, só sem os valores de custo
        <Agenda demandas={visiveis} dados={dados} avisar={avisar} podeEditar={pode.gestao} admin={!tv && pode.admin && !!custos} />
      )}


      {editando && (
        <DemandaModal inicial={editando} grupos={grupos} onFechar={() => setEditando(null)}
          onSalvar={dados.salvarDemanda} onExcluir={dados.excluirDemanda}
          limitado={!pode.gestao} perfis={dados.perfis}
          financeiro={pode.admin && custos ? { dados, porDemanda: custos } : null} />
      )}
    </>
  );
}

function CartaoDemanda({ d, dia, onAbrir, res }) {
  if (d.arquivada && d.empresa !== 'eko') return <CartaoConcluido d={d} onAbrir={onAbrir} res={res} />;
  const sit = situacao(d, dia);
  const pct = percentual(d);
  const prazo = rotuloPrazo(d, dia);
  if (d.empresa === 'eko') return <CartaoFabrica d={d} dia={dia} onAbrir={onAbrir} res={res} />;
  const meta = ehProducao(d)
    ? resumoProducao(d, dia)
    : [faseNome[d.fase], d.descricao, d.inicio && d.inicio > dia ? 'começa ' + fmt(d.inicio) : null].filter(Boolean).join(' · ');
  return (
    <button type="button" className={'item sit-' + sit + (onAbrir ? '' : ' so-ver')} onClick={onAbrir || undefined} aria-label={`${d.nome}, ${prazo}, ${pct}%`}>
      <span className="item-top">
        <span className="item-name">{d.nome}</span>
        <span className={'due ' + sit}>{prazo}</span>
      </span>
      <span className="item-meta">{meta}</span>
      {res && res.temAlgo && <LinhaResultado r={res} />}
      <span className="prog">
        <span className="bar"><span style={{ width: pct + '%' }} /></span>
        <span className="pct">{pct}%</span>
      </span>
    </button>
  );
}


// Cartão da fábrica: cliente, produto, fase e quanto do pedido já está em estoque
export function CartaoFabrica({ d, dia, onAbrir, res, comProduto = false }) {
  const pct = percentual(d);
  const emEstoque = d.fase === 'estoque' || pct >= 100;
  const sit = emEstoque || d.arquivada ? 'ok' : situacao(d, dia);
  const prazo = d.arquivada ? 'Concluída' : emEstoque ? 'Em estoque' : rotuloPrazo(d, dia);
  // o produto já aparece no título do grupo; aqui vai a especificação
  const espec = d.produto === 'Concreto ensacado' || (!d.produto && /saco/i.test(d.nome || '')) ? '20 kg · 30 MPa' : d.especificacao;
  const obs = d.descricao && d.descricao !== espec ? d.descricao : null;
  const produto = comProduto // na aba da fábrica o cartão não fica embaixo do nome do produto, então mostra
    ? [[d.produto, espec].filter(Boolean).join(' · '), obs].filter(Boolean).join(' · obs.: ')
    : [espec, obs].filter(Boolean).join(' · obs.: ') || d.produto;
  return (
    <button type="button" className={'item sit-' + sit + (onAbrir ? '' : ' so-ver')} onClick={onAbrir || undefined}
      aria-label={`${d.nome}, ${produto}, ${prazo}, ${pct}% em estoque`}>
      <span className="item-top">
        <span className="item-name">{d.nome}</span>
        <span className={'due ' + sit}>{prazo}</span>
      </span>
      <span className="item-top" style={{ alignItems: 'center' }}>
        <span className="item-sub">{produto || 'Sem especificação'}</span>
        <span className="tag-fase">{faseNome[d.fase] || d.fase}</span>
      </span>
      <span className="item-meta">{d.qtd_total ? resumoProducao(d, dia) : 'Quantidade a definir'}</span>
      {res && res.temAlgo && <LinhaResultado r={res} />}
      <span className="prog">
        <span className="bar"><span style={{ width: pct + '%' }} /></span>
        <span className="pct">{pct}%</span>
      </span>
    </button>
  );
}

export function LinhaResultado({ r }) {
  if (r.vendido == null) {
    return <span className="item-cost">Custos <b>{brl(r.custos)}</b> · falta o valor vendido</span>;
  }
  return (
    <span className="item-cost">
      Vendido <b>{brl(r.vendido)}</b> · custos {brl(r.custos + r.imposto)} ·{' '}
      <b className={r.resultado >= 0 ? 'pos' : 'bad'}>{r.resultado >= 0 ? 'sobra' : 'prejuízo'} {brl(Math.abs(r.resultado))}</b>
    </span>
  );
}

function CartaoConcluido({ d, onAbrir, res }) {
  const quando = d.atualizado_em ? new Date(d.atualizado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  return (
    <button type="button" className={'item sit-ok' + (onAbrir ? '' : ' so-ver')} onClick={onAbrir || undefined} aria-label={`${d.nome}, concluída`}>
      <span className="item-top">
        <span className="item-name">{d.nome}</span>
        <span className="due concl">Concluída</span>
      </span>
      <span className="item-meta">{[faseNome[d.fase], d.descricao, quando && 'concluída em ' + quando].filter(Boolean).join(' · ')}</span>
      {res && res.temAlgo && <LinhaResultado r={res} />}
    </button>
  );
}
