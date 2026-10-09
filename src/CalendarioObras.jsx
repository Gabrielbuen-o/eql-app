import { useMemo, useState } from 'react';
import { Agenda } from './Agenda.jsx';
import { VerRelatorio } from './Campo.jsx';
import { brl } from './custos.js';
import { EMPRESAS, addDias, diaSemana, fmt, hoje, inicioSemana, iso, parse } from './lib.js';

// Calendário de obras: a agenda das equipes em Dia / Semana / Mês.
// Em cada obra e dia: equipe, frota, se teve relatório e (admin) custo lançado.
const MODOS = [{ id: 'dia', nome: 'Dia' }, { id: 'semana', nome: 'Semana' }, { id: 'mes', nome: 'Mês' }];
const OBRAS = EMPRESAS.filter((e) => e.id !== 'eko');
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function CalendarioObras({ dados, tv, setTv, avisar, pode }) {
  const dia0 = hoje();
  const [modo, setModoState] = useState(() => { try { return localStorage.getItem('eql-cal-modo') || 'semana'; } catch { return 'semana'; } });
  const setModo = (m) => { setModoState(m); try { localStorage.setItem('eql-cal-modo', m); } catch { /* ignora */ } };
  const [ref, setRef] = useState(dia0);
  const [filtro, setFiltro] = useState('todas');
  const [aberto, setAberto] = useState(null);

  const demandas = dados.demandas.filter((d) => d.empresa !== 'eko' && (filtro === 'todas' || d.empresa === filtro));
  const custoModo = tv ? null : pode.admin ? 'ver' : pode.gestao ? 'lancar' : null;

  const andar = (n) => {
    if (modo === 'dia') setRef(addDias(ref, n));
    else if (modo === 'semana') setRef(addDias(ref, 7 * n));
    else { const x = parse(ref); x.setDate(1); x.setMonth(x.getMonth() + n); setRef(iso(x)); }
  };
  const ini = inicioSemana(ref);
  const rotulo = cap(modo === 'dia'
    ? parse(ref).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : modo === 'semana' ? `${fmt(ini)} a ${fmt(addDias(ini, 5))}`
      : parse(ref).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const ehAtual = modo === 'dia' ? ref === dia0 : modo === 'semana' ? ini === inicioSemana(dia0) : ref.slice(0, 7) === dia0.slice(0, 7);

  const entrarTv = () => { setTv(true); document.documentElement.requestFullscreen?.().catch(() => {}); };
  const sairTv = () => { setTv(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };

  return (
    <>
      <header className="head">
        <div>
          <h1>Calendário de obras</h1>
          <p className="date">Equipe, frota, relatórios{pode.admin ? ' e custos' : ''} de cada obra, dia a dia</p>
        </div>
        <div className="row">
          {[{ id: 'todas', curto: 'Todas' }, ...OBRAS].map((e) => (
            <button key={e.id} type="button" className={'pill' + (filtro === e.id ? ' on' : '')} aria-pressed={filtro === e.id}
              onClick={() => setFiltro(e.id)}>{e.curto}</button>
          ))}
          {tv ? <button type="button" className="pill dark" onClick={sairTv}>Sair do modo TV</button>
            : <button type="button" className="pill ghost" onClick={entrarTv}>Modo TV</button>}
        </div>
      </header>

      <div className="rel-barra">
        <div className="seg three rel-modos" role="group" aria-label="Visualização">
          {MODOS.map((m) => (
            <button key={m.id} type="button" className={modo === m.id ? 'on' : ''} aria-pressed={modo === m.id} onClick={() => setModo(m.id)}>{m.nome}</button>
          ))}
        </div>
        <div className="rel-nav">
          <button type="button" className="pill" aria-label="Anterior" onClick={() => andar(-1)}>‹</button>
          <span className="rel-rotulo">{rotulo}</span>
          <button type="button" className="pill" aria-label="Próximo" onClick={() => andar(1)}>›</button>
          {!ehAtual && <button type="button" className="pill ghost" onClick={() => setRef(dia0)}>Hoje</button>}
        </div>
        <div className="rel-legenda" aria-label="Legenda">
          <span><i className="lg-chip func" /> equipe</span>
          <span><i className="lg-chip veic" /> frota</span>
          <span><i className="pin-rel ok lg" /> teve relatório</span>
          <span><i className="pin-rel faltou lg" /> sem relatório</span>
          {pode.admin && <span><i className="cost-chip has lg" /> custo</span>}
        </div>
      </div>

      {modo === 'mes' ? (
        <MesObras refIso={ref} hojeIso={dia0} dados={dados} demandas={demandas} verCusto={pode.admin && !tv}
          onDia={(d) => { setRef(d); setModo('dia'); }} />
      ) : (
        <Agenda demandas={demandas} dados={dados} avisar={avisar} podeEditar={pode.gestao && !tv}
          custoModo={custoModo} modo={modo} refDia={ref} setRefDia={setRef} onRelatorio={setAberto} />
      )}

      {aberto && (
        <VerRelatorio r={aberto} dados={dados} onFechar={() => setAberto(null)}
          onApagar={pode.gestao ? (r) => dados.apagarRelatorio(r) : null}
          exportarRfi salvarCampos={pode.gestao ? dados.salvarCamposRelatorio : null} />
      )}
    </>
  );
}

function MesObras({ refIso, hojeIso, dados, demandas, verCusto, onDia }) {
  const ids = useMemo(() => new Set(demandas.map((d) => d.id)), [demandas]);
  const porDia = useMemo(() => {
    const m = {};
    const get = (dia) => (m[dia] ||= { obras: new Set(), pessoas: new Set(), veics: new Set(), rels: new Set(), custo: 0 });
    dados.alocacoes.forEach((a) => { if (ids.has(a.demanda_id)) { const x = get(a.dia); x.obras.add(a.demanda_id); x.pessoas.add(a.funcionario_id); } });
    dados.veiculo_alocacoes.forEach((a) => { if (ids.has(a.demanda_id)) get(a.dia).veics.add(a.veiculo_id); });
    (dados.relatorios || []).forEach((r) => { if (ids.has(r.demanda_id)) get(r.dia).rels.add(r.demanda_id); });
    (dados.custos_lancamentos || []).forEach((l) => { if (ids.has(l.demanda_id)) get(l.dia).custo += Number(l.valor || 0); });
    return m;
  }, [dados.alocacoes, dados.veiculo_alocacoes, dados.relatorios, dados.custos_lancamentos, ids]);

  const p = parse(refIso);
  const primeiro = iso(new Date(p.getFullYear(), p.getMonth(), 1));
  const ultimo = iso(new Date(p.getFullYear(), p.getMonth() + 1, 0));
  const dias = [];
  for (let d = inicioSemana(primeiro); d <= ultimo || dias.length % 7; d = addDias(d, 1)) dias.push(d);

  return (
    <div className="card rel-mes cal-mes">
      {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((n) => <span key={n} className="rel-mes-dow">{n}</span>)}
      {dias.map((d) => {
        const fora = d < primeiro || d > ultimo;
        const x = !fora && porDia[d];
        const comRel = x ? [...x.obras].filter((o) => x.rels.has(o)).length : 0;
        const semRel = x && d <= hojeIso ? x.obras.size - comRel : 0;
        return (
          <button key={d} type="button" className={'rel-mes-dia' + (fora ? ' fora' : '') + (d === hojeIso ? ' hoje' : '')}
            disabled={fora} onClick={() => onDia(d)}
            aria-label={`${diaSemana(d)} ${fmt(d)}${x ? `: ${x.obras.size} obras com equipe, ${x.pessoas.size} pessoas, ${x.veics.size} veículos` : ''}`}>
            <span className="rel-mes-num">{Number(d.slice(8))}</span>
            {x && (x.obras.size > 0 || x.rels.size > 0) && (
              <span className="cal-mes-pins">
                {x.obras.size > 0 && <span className="cm obra"><b>{x.obras.size}</b> {x.obras.size === 1 ? 'obra' : 'obras'}</span>}
                {x.pessoas.size > 0 && <span className="cm func"><b>{x.pessoas.size}</b> {x.pessoas.size === 1 ? 'pessoa' : 'pessoas'}</span>}
                {x.veics.size > 0 && <span className="cm veic"><b>{x.veics.size}</b> {x.veics.size === 1 ? 'carro' : 'carros'}</span>}
                {(comRel > 0 || semRel > 0) && (
                  <span className={'cm ' + (semRel && d < hojeIso ? 'faltou' : 'rel')}>
                    relat. <b>{comRel}/{x.obras.size || comRel}</b>
                  </span>
                )}
                {verCusto && x.custo > 0 && <span className="cm custo">{brl(x.custo)}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
