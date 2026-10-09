import { useLargura } from './useLargura.js';
import { useEffect, useMemo, useState } from 'react';
import { PainelFinanceiro, useMesFinanceiro, useResumoFinanceiro } from './PainelFinanceiro.jsx';
import { brl } from './custos.js';
import {
  mensagemDoDia, saudacao,
  EMPRESAS, addDias, diaSemana, diffDias, empresaPorId, faseNome, fmt, hoje, inicioSemana, parse, percentual, rotuloPrazo, situacao,
} from './lib.js';

// Painel do Início no computador / modo TV: operação completa, sem valores financeiros.
const PESO = { atrasada: 0, urgente: 1, semana: 2, ok: 3, sem: 4 };
const FASES_ORDEM = [
  { id: 'orcamento', nome: 'Orçamento', cor: 'var(--ph-1)', tinta: 'var(--ph-ink-1)' },
  { id: 'aprovacao', nome: 'Aprovação', cor: 'var(--ph-2)', tinta: 'var(--ph-ink-2)' },
  { id: 'execucao', nome: 'Execução', cor: 'var(--ph-3)', tinta: 'var(--ph-ink-3)' },
  { id: 'entrega', nome: 'Entrega', cor: 'var(--ph-4)', tinta: 'var(--ph-ink-4)' },
  { id: 'estoque', nome: 'Estoque', cor: 'var(--ph-5)', tinta: 'var(--ph-ink-5)' },
];

export function PainelDesktop({ dados, eu, irPara, tv, setTv, pode, porDemanda }) {
  const dia = hoje();
  const agora = useRelogio();
  const abertas = dados.demandas.filter((d) => !d.arquivada);
  const sit = (d) => situacao(d, dia);

  const nomeFunc = Object.fromEntries(dados.funcionarios.map((f) => [f.id, f.nome]));
  const nomeVeic = Object.fromEntries(dados.veiculos.map((v) => [v.id, v.nome]));
  const ativosF = dados.funcionarios.filter((f) => f.ativo);
  const veicAtivos = dados.veiculos.filter((v) => v.ativo);
  const demandaPorId = Object.fromEntries(dados.demandas.map((d) => [d.id, d]));

  // ---------- hoje ----------
  const hojeAloc = dados.alocacoes.filter((a) => a.dia === dia);
  const hojeVeic = dados.veiculo_alocacoes.filter((a) => a.dia === dia);
  const porObra = {};
  hojeAloc.forEach((a) => (porObra[a.demanda_id] ||= { p: [], v: [] }).p.push(nomeFunc[a.funcionario_id] || '?'));
  hojeVeic.forEach((a) => (porObra[a.demanda_id] ||= { p: [], v: [] }).v.push(nomeVeic[a.veiculo_id] || '?'));
  const fora = dados.ausencias.filter((a) => a.dia === dia);
  const idsFora = new Set(fora.map((a) => a.funcionario_id));
  const idsAloc = new Set(hojeAloc.map((a) => a.funcionario_id));
  const livres = ativosF.filter((f) => !idsFora.has(f.id) && !idsAloc.has(f.id));
  const veicUso = new Set(hojeVeic.map((a) => a.veiculo_id));
  const ocupacao = ativosF.length ? Math.round((idsAloc.size / Math.max(1, ativosF.length - idsFora.size)) * 100) : 0;
  const obrasHoje = Object.keys(porObra).map((id) => demandaPorId[id]).filter(Boolean)
    .sort((a, b) => (PESO[sit(a)] - PESO[sit(b)]) || (a.entrega || '9999').localeCompare(b.entrega || '9999'));
  const semNinguem = abertas.filter((d) => d.fase === 'execucao' && d.empresa !== 'eko' && !porObra[d.id])
    .sort((a, b) => PESO[sit(a)] - PESO[sit(b)]);

  // ---------- contagens ----------
  const urgentes = abertas.filter((d) => ['urgente', 'semana'].includes(sit(d)));
  const atrasadas = abertas.filter((d) => sit(d) === 'atrasada');
  const concluidas = dados.demandas.filter((d) => d.arquivada);
  const criticos = [...atrasadas, ...urgentes].sort((a, b) => (PESO[sit(a)] - PESO[sit(b)]) || (a.entrega || '').localeCompare(b.entrega || ''));

  const primeiroNome = (eu?.nome || '').split(' ')[0];
  // visão: 'demandas' (todos) ou 'financeiro' (só administradores)
  const [visaoSalva, setVisaoSalva] = useState(() => { try { return localStorage.getItem('eql-inicio-visao') || 'demandas'; } catch { return 'demandas'; } });
  const visao = pode?.admin && !tv ? visaoSalva : 'demandas';
  const setVisao = (v) => { setVisaoSalva(v); try { localStorage.setItem('eql-inicio-visao', v); } catch { /* ignora */ } };
  const mes = useMesFinanceiro(dia);
  const fin = useResumoFinanceiro(dados, porDemanda, mes.mes, visao === 'financeiro');
  const frases = (dados.frases || []).filter((x) => x.ativo !== false).map((x) => x.texto);
  const atencao = [...atrasadas, ...abertas.filter((d) => sit(d) === 'urgente')];

  return (
    <div className="painel">
      <header className={'hero' + (visao === 'financeiro' ? ' fin' : '')}>
        <div className="hero-txt">
          <p className="hero-data">{agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{saudacao(agora)}{primeiroNome ? `, ${primeiroNome}` : ''}.</h1>
          {visao === 'financeiro' ? (
            <p className="hero-linha">
              {mes.atual ? 'Este mês' : `Em ${mes.nome.toLowerCase()}`} a EQL faturou <b>{brl(fin?.faturado || 0)}</b>
            </p>
          ) : (
            <p className="hero-linha">
              Hoje temos <b>{obrasHoje.length} {obrasHoje.length === 1 ? 'atividade prevista' : 'atividades previstas'}</b>
              {atencao.length > 0 && <> e <b className="hero-alerta">{atencao.length} pedindo atenção</b></>}
            </p>
          )}
          <p className="hero-frase">{mensagemDoDia(dia, frases)}</p>
        </div>
        <div className="hero-lado">
          <div className="hero-acoes">
            {pode?.admin && !tv && (
              <div className="hero-seg" role="group" aria-label="Visão do painel">
                <button type="button" className={visao === 'demandas' ? 'on' : ''} aria-pressed={visao === 'demandas'} onClick={() => setVisao('demandas')}>Demandas</button>
                <button type="button" className={visao === 'financeiro' ? 'on' : ''} aria-pressed={visao === 'financeiro'} onClick={() => setVisao('financeiro')}>Financeiro</button>
              </div>
            )}
            {setTv && (tv
              ? <button type="button" className="hero-btn" onClick={() => { setTv(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }}>Sair do modo TV</button>
              : <button type="button" className="hero-btn" onClick={() => { setTv(true); document.documentElement.requestFullscreen?.().catch(() => {}); }}>Modo TV</button>)}
          </div>
          <div className="painel-clock" aria-label="Hora atual">
            {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            <small>atualiza sozinho</small>
          </div>
          {visao === 'financeiro' && (
            <div className="hero-mes">
              <button type="button" aria-label="Mês anterior" onClick={mes.anterior}>‹</button>
              <span>{mes.nome}</span>
              <button type="button" aria-label="Próximo mês" onClick={mes.proximo} disabled={mes.atual}>›</button>
            </div>
          )}
        </div>
      </header>

      {visao === 'financeiro' ? (
        <>
          <PainelFinanceiro f={fin} dados={dados} mes={mes} irPara={irPara} />
          <h2 className="painel-sec">Operação</h2>
        </>
      ) : (
        <HojeResumo obrasHoje={obrasHoje} porObra={porObra} abertas={abertas} atencao={atencao} sit={sit} dia={dia}
          veicAtivos={veicAtivos} hojeVeic={hojeVeic} demandaPorId={demandaPorId} livres={livres} fora={fora} nomeFunc={nomeFunc} irPara={irPara} />
      )}

      {/* ---------- números ---------- */}
      <div className="kpis">
        <Kpi rotulo="Ativas" valor={abertas.length} dica="em andamento" cor="var(--lav)" onClick={() => irPara('demandas', null)} />
        <Kpi rotulo="Urgentes" valor={urgentes.length} dica="entregar em até 7 dias" cor="var(--yellow)" onClick={() => irPara('demandas', 'semana')} />
        <Kpi rotulo="Atrasadas" valor={atrasadas.length} dica="prazo já passou" cor="var(--red-soft)" onClick={() => irPara('demandas', 'atrasada')} />
        <Kpi rotulo="Concluídas" valor={concluidas.length} dica="arquivadas" cor="#D5DCE4" onClick={() => irPara('demandas', 'concluidas')} />
        <KpiMedidor rotulo="Equipe em campo" valor={`${idsAloc.size}/${Math.max(0, ativosF.length - idsFora.size)}`} pct={ocupacao}
          dica={`${ocupacao}% de ocupação · ${idsFora.size} fora`} />
        <KpiMedidor rotulo="Obras com equipe" valor={obrasHoje.length} pct={abertas.length ? (obrasHoje.length / abertas.length) * 100 : 0}
          dica={`${semNinguem.length} em execução sem ninguém`} />
        <KpiMedidor rotulo="Frota em uso" valor={`${veicUso.size}/${veicAtivos.length}`} pct={veicAtivos.length ? (veicUso.size / veicAtivos.length) * 100 : 0}
          dica={veicAtivos.length ? 'veículos na agenda hoje' : 'cadastre em Frotas'} />
      </div>

      {/* ---------- gráficos ---------- */}
      <div className="painel-grid g-2-1">
        <section className="card stack">
          <TituloGrafico titulo="Entregas por semana" sub="Demandas ativas pela data de entrega máxima" />
          <GraficoEntregas abertas={abertas} dia={dia} />
        </section>
        <section className="card stack">
          <TituloGrafico titulo="Andamento médio" sub="Demandas ativas de cada empresa" />
          <Andamentos abertas={abertas} />
        </section>
      </div>

      <div className="painel-grid g-2-1">
        <section className="card stack">
          <TituloGrafico titulo="Equipe em campo por dia" sub="Pessoas na agenda · últimos dias e o que está planejado" />
          <GraficoOcupacao dados={dados} ativos={ativosF.length} dia={dia} />
        </section>
        <section className="card stack">
          <TituloGrafico titulo="Demandas por fase" sub="Quantas estão em cada etapa" />
          <GraficoFases abertas={abertas} />
        </section>
      </div>

      {/* ---------- hoje + atenção ---------- */}
      <div className="painel-grid g-2-1">
        <section className="card stack" aria-label="Hoje nas obras">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <TituloGrafico titulo={`Hoje nas obras · ${obrasHoje.length}`} sub={`${idsAloc.size} pessoas e ${veicUso.size} veículos em campo`} />
            <button type="button" className="pill ghost" onClick={() => irPara('calendario')}>Abrir calendário</button>
          </div>
          {!obrasHoje.length && <p className="empty">Ninguém foi colocado em obra para hoje na agenda.</p>}
          <div className="today-list painel-today">
            {obrasHoje.map((d) => {
              const s = sit(d), g = porObra[d.id], emp = empresaPorId[d.empresa];
              return (
                <article key={d.id} className={'today-card sit-' + s}>
                  <div className="today-top">
                    <div style={{ minWidth: 0 }}>
                      <div className="today-name"><span className="dot" style={{ background: emp?.cor }} />{d.nome}</div>
                      <div className="today-sub">{[emp?.curto, d.empresa === 'eko' ? d.produto : d.grupo, faseNome[d.fase]].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className={'due ' + s}>{rotuloPrazo(d, dia)}</span>
                  </div>
                  <div className="today-chips">
                    {g.p.map((n, i) => <span key={'p' + i} className="t-chip">{n}</span>)}
                    {g.v.map((n, i) => <span key={'v' + i} className="t-chip veic">{n}</span>)}
                  </div>
                  <div className="prog"><span className="bar"><span style={{ width: percentual(d) + '%' }} /></span><span className="pct">{percentual(d)}%</span></div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="stack">
          <section className="card stack" aria-label="Prazos críticos">
            <TituloGrafico titulo={`Prazos críticos · ${criticos.length}`} sub="Atrasadas e entregas nos próximos 7 dias" />
            {criticos.length ? (
              <ul className="plain-list">
                {criticos.slice(0, 8).map((d) => (
                  <li key={d.id}>
                    <span className="dot" style={{ background: empresaPorId[d.empresa]?.cor }} />
                    <span className="pl-name">{d.nome}<small>{d.grupo} · {percentual(d)}%{porObra[d.id] ? ' · com equipe hoje' : ''}</small></span>
                    <span className={'due ' + sit(d)}>{rotuloPrazo(d, dia)}</span>
                  </li>
                ))}
                {criticos.length > 8 && <li className="note">e mais {criticos.length - 8}…</li>}
              </ul>
            ) : <p className="empty" style={{ padding: 0 }}>Nenhum prazo crítico.</p>}
          </section>

          <section className="card stack" aria-label="Pessoas hoje">
            <TituloGrafico titulo="Pessoas hoje" sub={`${livres.length} livres · ${fora.length} fora`} />
            <div className="today-chips">
              {livres.map((f) => <span key={f.id} className="t-chip livre">{f.nome}</span>)}
              {fora.map((a) => (
                <span key={a.id} className={'t-chip ' + (a.tipo === 'ferias' ? 'ferias' : 'folga')}>
                  {nomeFunc[a.funcionario_id] || '?'} · {a.tipo === 'ferias' ? 'férias' : 'folga'}
                </span>
              ))}
              {!livres.length && !fora.length && <span className="empty" style={{ padding: 0 }}>Todo mundo está em obra.</span>}
            </div>
          </section>

          <section className="card stack" aria-label="Em execução sem ninguém hoje">
            <TituloGrafico titulo={`Em execução sem ninguém hoje · ${semNinguem.length}`} />
            {semNinguem.length ? (
              <div className="today-chips">
                {semNinguem.slice(0, 18).map((d) => (
                  <span key={d.id} className={'t-chip sem sit-' + sit(d)}>{d.nome}</span>
                ))}
                {semNinguem.length > 18 && <span className="note">+{semNinguem.length - 18}</span>}
              </div>
            ) : <p className="empty" style={{ padding: 0 }}>Todas as obras em execução têm alguém hoje.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------- peças ----------
export function useRelogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30000); return () => clearInterval(t); }, []);
  return agora;
}

export function TituloGrafico({ titulo, sub }) {
  return (
    <div>
      <h2 className="card-title">{titulo}</h2>
      {sub && <p className="note" style={{ marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

export function Kpi({ rotulo, valor, dica, cor, onClick }) {
  return (
    <button type="button" className="stat kpi" style={{ background: cor }} onClick={onClick} aria-label={`${rotulo}: ${valor}`}>
      <span className="stat-label">{rotulo}</span>
      <span className="stat-value">{valor}</span>
      <span className="stat-hint">{dica}</span>
    </button>
  );
}

export function KpiMedidor({ rotulo, valor, pct, dica }) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div className="kpi kpi-meter">
      <span className="stat-label kpi-l">{rotulo}</span>
      <span className="kpi-v">{valor}</span>
      <span className="meter" role="img" aria-label={`${p}%`}><span style={{ width: p + '%' }} /></span>
      <span className="kpi-h">{dica}</span>
    </div>
  );
}

export function Legenda({ itens }) {
  return (
    <div className="legenda" aria-hidden="true">
      {itens.map((i) => <span key={i.nome}><i style={{ background: i.cor }} />{i.nome}</span>)}
    </div>
  );
}

// tooltip simples, posicionado sobre o gráfico
export function useTip() {
  const [tip, setTip] = useState(null);
  const mostrar = (e, conteudo) => {
    const box = e.currentTarget.closest('.chart-box').getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, conteudo });
  };
  const el = tip && (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">{tip.conteudo}</div>
  );
  return { mostrar, esconder: () => setTip(null), el };
}

// Barras empilhadas por empresa: atrasadas + próximas 8 semanas
function GraficoEntregas({ abertas, dia }) {
  const tip = useTip();
  const semana0 = inicioSemana(dia);
  const colunas = useMemo(() => {
    const cols = [{ id: 'atr', rotulo: 'Atrasadas', itens: [] }];
    for (let i = 0; i < 8; i++) {
      const ini = addDias(semana0, i * 7);
      cols.push({ id: 's' + i, rotulo: i === 0 ? 'Esta sem.' : i === 1 ? 'Próxima' : fmt(ini), ini, fim: addDias(ini, 6), itens: [] });
    }
    cols.push({ id: 'dep', rotulo: 'Depois', itens: [] });
    abertas.forEach((d) => {
      if (!d.entrega || percentual(d) >= 100 || d.fase === 'estoque') return;
      if (d.entrega < dia) return cols[0].itens.push(d);
      const k = Math.floor(diffDias(d.entrega, semana0) / 7);
      (k >= 0 && k < 8 ? cols[k + 1] : cols[9]).itens.push(d);
    });
    return cols;
  }, [abertas, dia, semana0]);

  const max = Math.max(4, ...colunas.map((c) => c.itens.length));
  const passo = max <= 6 ? 1 : max <= 12 ? 2 : 5;
  const topo = Math.ceil(max / passo) * passo;
  const [caixa, largura] = useLargura(680);
  const W = Math.max(420, largura), H = 230, padL = 28, padB = 30, padT = 18;
  const bw = (W - padL) / colunas.length;
  const y = (v) => H - padB - (v / topo) * (H - padB - padT);
  const sem = abertas.filter((d) => !d.entrega).length;

  return (
    <div className="chart-box" ref={caixa}>
      <Legenda itens={EMPRESAS.map((e) => ({ nome: e.curto, cor: e.cor }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfico de entregas por semana">
        {Array.from({ length: topo / passo + 1 }, (_, i) => i * passo).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            <text x={padL - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {colunas.map((c, i) => {
          const w = Math.min(bw * 0.64, 64), x = padL + i * bw + (bw - w) / 2;
          let acc = 0;
          const segs = EMPRESAS.map((e) => ({ e, n: c.itens.filter((d) => d.empresa === e.id).length })).filter((s) => s.n);
          return (
            <g key={c.id} onMouseEnter={(ev) => tip.mostrar(ev, (
              <>
                <b>{c.id === 'atr' ? 'Atrasadas' : c.id === 'dep' ? 'Depois de 8 semanas' : `${fmt(c.ini)} a ${fmt(c.fim)}`}</b>
                <span>{c.itens.length} {c.itens.length === 1 ? 'entrega' : 'entregas'}</span>
                {segs.map((s) => <span key={s.e.id}><i style={{ background: s.e.cor }} />{s.e.curto}: {s.n}</span>)}
                {c.itens.length > 0 && <small>{c.itens.slice(0, 6).map((d) => d.nome).join(', ')}{c.itens.length > 6 ? '…' : ''}</small>}
              </>
            ))} onMouseLeave={tip.esconder}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              {segs.map((s, j) => {
                const y0 = y(acc), y1 = y(acc + s.n); acc += s.n;
                const topoSeg = j === segs.length - 1;
                const h = Math.max(0, y0 - y1 - (topoSeg ? 0 : 2));
                return topoSeg
                  ? <path key={s.e.id} d={barraArredondada(x, y1, w, y0 - y1, 4)} style={{ fill: s.e.cor }} />
                  : <rect key={s.e.id} x={x} y={y1 + 2} width={w} height={h} style={{ fill: s.e.cor }} />;
              })}
              {c.itens.length > 0 && (
                <text x={x + w / 2} y={y(c.itens.length) - 6} textAnchor="middle" className={'val' + (c.id === 'atr' ? ' val-bad' : '')}>{c.itens.length}</text>
              )}
              <text x={x + w / 2} y={H - 10} textAnchor="middle" className={'axis' + (c.id === 'atr' ? ' axis-bad' : '')}>{c.rotulo}</text>
            </g>
          );
        })}
      </svg>
      {tip.el}
      {sem > 0 && <p className="note">{sem} {sem === 1 ? 'demanda está' : 'demandas estão'} sem prazo e não aparece{sem === 1 ? '' : 'm'} no gráfico.</p>}
    </div>
  );
}

// Pessoas alocadas por dia (seg–sáb): 9 dias para trás, hoje e 10 para frente
function GraficoOcupacao({ dados, ativos, dia }) {
  const tip = useTip();
  const dias = useMemo(() => {
    const util = (d) => parse(d).getDay() !== 0; // sem domingos
    const antes = [], depois = [];
    for (let d = addDias(dia, -1); antes.length < 9; d = addDias(d, -1)) if (util(d)) antes.unshift(d);
    for (let d = addDias(dia, 1); depois.length < 10; d = addDias(d, 1)) if (util(d)) depois.push(d);
    return [...antes, dia, ...depois];
  }, [dia]);
  const porDia = useMemo(() => {
    const m = {};
    dados.alocacoes.forEach((a) => { (m[a.dia] ||= new Set()).add(a.funcionario_id); });
    const f = {};
    dados.ausencias.forEach((a) => { f[a.dia] = (f[a.dia] || 0) + 1; });
    return { m, f };
  }, [dados.alocacoes, dados.ausencias]);

  const vals = dias.map((d) => porDia.m[d]?.size || 0);
  const topo = Math.max(4, ativos, ...vals);
  const [caixa, largura] = useLargura(680);
  const W = Math.max(420, largura), H = 230, padL = 28, padB = 30, padT = 18;
  const bw = (W - padL) / dias.length;
  const y = (v) => H - padB - (v / topo) * (H - padB - padT);
  const passo = topo <= 8 ? 2 : topo <= 20 ? 5 : 10;

  return (
    <div className="chart-box" ref={caixa}>
      <Legenda itens={[{ nome: 'Realizado', cor: 'var(--brand)' }, { nome: 'Planejado', cor: 'var(--brand-plan)' }, { nome: 'Equipe ativa', cor: 'var(--muted)' }]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfico de pessoas em campo por dia">
        {Array.from({ length: Math.floor(topo / passo) + 1 }, (_, i) => i * passo).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            <text x={padL - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {ativos > 0 && (
          <g>
            <line x1={padL} x2={W} y1={y(ativos)} y2={y(ativos)} className="ref" />
            <text x={W - 4} y={y(ativos) - 5} textAnchor="end" className="axis">equipe ativa · {ativos}</text>
          </g>
        )}
        {dias.map((d, i) => {
          const v = vals[i];
          const w = Math.min(bw * 0.6, 40), x = padL + i * bw + (bw - w) / 2;
          const ehHoje = d === dia, futuro = d > dia;
          return (
            <g key={d} onMouseEnter={(ev) => tip.mostrar(ev, (
              <>
                <b>{diaSemana(d)} {fmt(d)}{ehHoje ? ' · hoje' : futuro ? ' · planejado' : ''}</b>
                <span>{v} {v === 1 ? 'pessoa' : 'pessoas'} em obra</span>
                <span>{Math.max(0, ativos - v - (porDia.f[d] || 0))} livres · {porDia.f[d] || 0} fora</span>
              </>
            ))} onMouseLeave={tip.esconder}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              {v > 0 && <path d={barraArredondada(x, y(v), w, y(0) - y(v), 4)} className={futuro ? 'bar-plan' : ehHoje ? 'bar-today' : 'bar-real'} />}
              {(ehHoje || (v > 0 && i % 3 === 0)) && v > 0 && <text x={x + w / 2} y={y(v) - 6} textAnchor="middle" className="val">{v}</text>}
              <text x={x + w / 2} y={H - 10} textAnchor="middle" className={'axis' + (ehHoje ? ' axis-today' : '')}>
                {ehHoje ? 'hoje' : (i % 2 === 0 ? fmt(d) : '')}
              </text>
            </g>
          );
        })}
      </svg>
      {tip.el}
    </div>
  );
}

// Barras horizontais empilhadas por fase, uma por empresa
function GraficoFases({ abertas }) {
  const tip = useTip();
  const linhas = EMPRESAS.map((e) => {
    const ds = abertas.filter((d) => d.empresa === e.id);
    return { e, total: ds.length, segs: FASES_ORDEM.map((f) => ({ f, n: ds.filter((d) => d.fase === f.id).length })).filter((s) => s.n) };
  });
  const usadas = FASES_ORDEM.filter((f) => linhas.some((l) => l.segs.some((s) => s.f.id === f.id)));
  return (
    <div className="chart-box">
      <Legenda itens={usadas.map((f) => ({ nome: f.nome, cor: f.cor }))} />
      <div className="hbars">
        {linhas.map((l) => (
          <div key={l.e.id} className="hbar-row">
            <span className="hbar-label"><span className="dot" style={{ background: l.e.cor }} />{l.e.curto}<b>{l.total}</b></span>
            <div className="hbar">
              {l.segs.map((s) => (
                <span key={s.f.id} className="hseg" style={{ flex: s.n, background: s.f.cor, color: s.f.tinta }}
                  onMouseEnter={(ev) => tip.mostrar(ev, <><b>{l.e.curto} · {s.f.nome}</b><span>{s.n} {s.n === 1 ? 'demanda' : 'demandas'}</span></>)}
                  onMouseLeave={tip.esconder}>
                  {s.n}
                </span>
              ))}
              {!l.total && <span className="empty" style={{ padding: '0 8px' }}>nenhuma</span>}
            </div>
          </div>
        ))}
      </div>
      {tip.el}
    </div>
  );
}

function Andamentos({ abertas }) {
  return (
    <div className="andamentos">
      {EMPRESAS.map((e) => {
        const ds = abertas.filter((d) => d.empresa === e.id);
        const media = ds.length ? Math.round(ds.reduce((t, d) => t + percentual(d), 0) / ds.length) : 0;
        const prontas = ds.filter((d) => percentual(d) >= 80).length;
        return (
          <div key={e.id} className="and-row">
            <div className="and-top">
              <span><span className="dot" style={{ background: e.cor }} />{e.curto}</span>
              <b>{ds.length ? media + '%' : '—'}</b>
            </div>
            <span className="meter big" role="img" aria-label={`${e.curto}: ${media}%`}><span style={{ width: media + '%', background: e.cor }} /></span>
            <span className="note">{ds.length} {ds.length === 1 ? 'ativa' : 'ativas'} · {prontas} com 80% ou mais{e.id === 'eko' ? ' (estoque)' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export function barraArredondada(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// Topo da visão "Demandas": o dia de hoje em cartões (obras, atenção, equipes e frota)
function HojeResumo({ obrasHoje, porObra, abertas, atencao, sit, dia, veicAtivos, hojeVeic, demandaPorId, livres, fora, irPara }) {
  const emExecucao = abertas.filter((d) => d.fase === 'execucao' && d.empresa !== 'eko');
  const destino = {};
  hojeVeic.forEach((a) => (destino[a.veiculo_id] ||= []).push(demandaPorId[a.demanda_id]?.nome || '?'));
  const frota = [...veicAtivos].sort((a, b) => Number(!!destino[b.id]) - Number(!!destino[a.id]));
  return (
    <section className="hoje" aria-label="Hoje">
      <div className="hoje-tiles">
        <button type="button" className="hoje-tile t-agenda" onClick={() => irPara('calendario')}>
          <span className="hoje-tile-l">Obras na agenda hoje</span>
          <span className="hoje-tile-v">{obrasHoje.length}</span>
          <span className="hoje-tile-h">{obrasHoje.length ? obrasHoje.slice(0, 3).map((d) => d.nome).join(', ') + (obrasHoje.length > 3 ? '…' : '') : 'ninguém escalado ainda'}</span>
        </button>
        <button type="button" className="hoje-tile t-ativas" onClick={() => irPara('demandas', null)}>
          <span className="hoje-tile-l">Obras ativas</span>
          <span className="hoje-tile-v">{emExecucao.length}</span>
          <span className="hoje-tile-h">em execução · {Math.max(0, emExecucao.length - obrasHoje.filter((d) => d.fase === 'execucao').length)} sem equipe hoje</span>
        </button>
        <button type="button" className={'hoje-tile t-atencao' + (atencao.length ? ' tem' : '')} onClick={() => irPara('demandas', 'semana')}>
          <span className="hoje-tile-l">Atenção hoje</span>
          <span className="hoje-tile-v">{atencao.length}</span>
          <span className="hoje-tile-h">{atencao.length ? atencao.slice(0, 3).map((d) => d.nome).join(', ') + (atencao.length > 3 ? '…' : '') : 'nenhuma atrasada ou urgente'}</span>
        </button>
        <div className="hoje-tile t-pessoas">
          <span className="hoje-tile-l">Pessoas livres</span>
          <span className="hoje-tile-v">{livres.length}</span>
          <span className="hoje-tile-h">{fora.length ? `${fora.length} de folga/férias` : 'ninguém de folga'}</span>
        </div>
      </div>

      <div className="painel-grid g-2-1">
        <section className="card stack">
          <TituloGrafico titulo="Equipes de hoje" sub="Quem está em cada obra" />
          {obrasHoje.length ? (
            <div className="equipes-hoje">
              {obrasHoje.map((d) => {
                const s = sit(d), g = porObra[d.id];
                return (
                  <div key={d.id} className={'equipe-card sit-' + s}>
                    <div className="equipe-top">
                      <span className="dot" style={{ background: empresaPorId[d.empresa]?.cor }} />
                      <strong>{d.nome}</strong>
                      {(s === 'atrasada' || s === 'urgente') && <span className={'due ' + s}>{rotuloPrazo(d, dia)}</span>}
                    </div>
                    <div className="equipe-chips">
                      {g.p.map((n, i) => <span key={'p' + i} className="eq-chip p">{n}</span>)}
                      {g.v.map((n, i) => <span key={'v' + i} className="eq-chip v">{n}</span>)}
                      {!g.p.length && <span className="eq-chip vazio">sem pessoas</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty">Ninguém foi colocado em obra para hoje. <button type="button" className="link-btn" onClick={() => irPara('calendario')}>Abrir calendário</button></p>}
        </section>
        <section className="card stack">
          <TituloGrafico titulo="Frota hoje" sub={`${Object.keys(destino).length} de ${veicAtivos.length} em uso`} />
          {frota.length ? (
            <ul className="frota-hoje">
              {frota.map((v) => (
                <li key={v.id} className={destino[v.id] ? 'uso' : ''}>
                  <span className="frota-n"><b>{v.nome}</b>{v.placa && <small>{v.placa}</small>}</span>
                  <span className="frota-d">{destino[v.id] ? destino[v.id].join(', ') : 'parado'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Nenhum veículo cadastrado (aba Frotas).</p>}
        </section>
      </div>
    </section>
  );
}
