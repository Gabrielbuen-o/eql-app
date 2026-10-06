import { useMemo, useState } from 'react';
import { EMPRESAS, faseNome, fmt, hoje, ehProducao, ordemGrupo, percentual, resumoProducao, rotuloPrazo, situacao } from './lib.js';
import { DemandaModal } from './DemandaModal.jsx';
import { Agenda } from './Agenda.jsx';

export function Demandas({ dados, tv, setTv, avisar }) {
  const [filtro, setFiltro] = useState('todas');
  const [destaque, setDestaque] = useState(null); // filtro pelos cartões de números
  const [editando, setEditando] = useState(null);
  const dia = hoje();

  const abertas = dados.demandas.filter((d) => !d.arquivada);
  const visiveis = abertas.filter((d) => filtro === 'todas' || d.empresa === filtro);
  const casa = (d, f) => { const s = situacao(d, dia); return f === 'semana' ? s === 'semana' || s === 'urgente' : s === f; };
  const filtradas = destaque ? visiveis.filter((d) => casa(d, destaque)) : visiveis;

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
  ];

  const colunas = EMPRESAS.filter((e) => filtro === 'todas' || e.id === filtro).map((e) => {
    const itens = filtradas.filter((d) => d.empresa === e.id);
    const porGrupo = {};
    itens.forEach((d) => (porGrupo[d.grupo || 'Outros'] ||= []).push(d));
    const gs = Object.keys(porGrupo).sort(ordemGrupo).map((nome) => ({
      nome,
      itens: porGrupo[nome].sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999')),
    }));
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
          <h1>Demandas</h1>
          <p className="date">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="row">
          {[{ id: 'todas', curto: 'Todas' }, ...EMPRESAS].map((e) => (
            <button key={e.id} type="button" className={'pill' + (filtro === e.id ? ' on' : '')} aria-pressed={filtro === e.id}
              onClick={() => setFiltro(e.id)}>{e.curto}</button>
          ))}
          {tv ? (
            <button type="button" className="pill dark" onClick={sairTv}>Sair do modo TV</button>
          ) : (
            <>
              <button type="button" className="pill ghost" onClick={entrarTv}>Modo TV</button>
              <button type="button" className="pill lime" onClick={() => novaDemanda()}>+ Nova demanda</button>
            </>
          )}
        </div>
      </header>

      <div className="stats">
        {stats.map((s) => (
          <button key={s.rotulo} type="button" className="stat" style={{ background: s.cor, outline: destaque === s.id && s.id ? '3px solid #16181D' : 'none' }}
            aria-pressed={destaque === s.id && !!s.id}
            onClick={() => setDestaque(s.id && destaque !== s.id ? s.id : null)}>
            <span className="stat-label">{s.rotulo}</span>
            <span className="stat-value">{s.valor}</span>
            <span className="stat-hint">{destaque === s.id && s.id ? 'filtrando · clique para limpar' : s.dica}</span>
          </button>
        ))}
      </div>

      <div className="board">
        {colunas.map((c) => (
          <section key={c.id} className="card col" aria-label={c.nome}>
            <div className="col-head">
              <div className="col-title"><span className="dot" style={{ background: c.cor }} /><h2>{c.nome}</h2></div>
              <span className="count">{c.total}</span>
            </div>
            {c.grupos.map((g) => (
              <div key={g.nome} className="group">
                <span className="group-name">{g.nome}</span>
                {g.itens.map((d) => <CartaoDemanda key={d.id} d={d} dia={dia} onAbrir={() => !tv && setEditando(d)} />)}
              </div>
            ))}
            {!c.total && <p className="empty">{destaque ? 'Nada neste filtro.' : 'Nenhuma demanda.'}</p>}
            {!tv && <button type="button" className="add-line" onClick={() => novaDemanda(c.id)}>+ Adicionar em {c.curto}</button>}
          </section>
        ))}
      </div>

      {!tv && (
        <Agenda demandas={visiveis} dados={dados} avisar={avisar} />
      )}

      {!tv && <Arquivadas demandas={dados.demandas.filter((d) => d.arquivada)} onAbrir={setEditando} />}

      {editando && (
        <DemandaModal inicial={editando} grupos={grupos} onFechar={() => setEditando(null)}
          onSalvar={dados.salvarDemanda} onExcluir={dados.excluirDemanda} />
      )}
    </>
  );
}

function CartaoDemanda({ d, dia, onAbrir }) {
  const sit = situacao(d, dia);
  const pct = percentual(d);
  const prazo = rotuloPrazo(d, dia);
  const meta = ehProducao(d)
    ? resumoProducao(d, dia)
    : [faseNome[d.fase], d.descricao, d.inicio && d.inicio > dia ? 'começa ' + fmt(d.inicio) : null].filter(Boolean).join(' · ');
  return (
    <button type="button" className={'item sit-' + sit} onClick={onAbrir} aria-label={`${d.nome}, ${prazo}, ${pct}%`}>
      <span className="item-top">
        <span className="item-name">{d.nome}</span>
        <span className={'due ' + sit}>{prazo}</span>
      </span>
      <span className="item-meta">{meta}</span>
      <span className="prog">
        <span className="bar"><span style={{ width: pct + '%' }} /></span>
        <span className="pct">{pct}%</span>
      </span>
    </button>
  );
}

function Arquivadas({ demandas, onAbrir }) {
  const [aberto, setAberto] = useState(false);
  if (!demandas.length) return null;
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAberto((v) => !v)}>
        {aberto ? 'Ocultar' : 'Ver'} demandas concluídas ({demandas.length})
      </button>
      {aberto && (
        <div className="row">
          {demandas.map((d) => (
            <button key={d.id} type="button" className="pill ghost" onClick={() => onAbrir(d)}>{d.nome}</button>
          ))}
        </div>
      )}
    </section>
  );
}
