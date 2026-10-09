import { useMemo, useState } from 'react';
import { EMPRESAS, TIPOS_RELATORIO, addDias, diaSemana, empresaPorId, fmt, hoje, inicioSemana, iso, parse, tipoRelatorio } from './lib.js';
import { NovoRelatorio, VerRelatorio, contagem, hora } from './Campo.jsx';
import { useVoltarFecha } from './rota.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Relatórios de obra (administradores e gerente): calendário dia / semana / mês.
// Em cada dia: primeiro as obras com gente operando, depois as sem equipe.
const DIARIOS = TIPOS_RELATORIO.filter((t) => t.ativo); // esperados todo dia em obra com equipe
const MODOS = [{ id: 'dia', nome: 'Dia' }, { id: 'semana', nome: 'Semana' }, { id: 'mes', nome: 'Mês' }];
const OBRAS = EMPRESAS.filter((e) => e.id !== 'eko');

export function Relatorios({ dados, pode, abertoId = null, irSub }) {
  const dia0 = hoje();
  const [modo, setModoState] = useState(() => { try { return localStorage.getItem('eql-rel-modo') || 'semana'; } catch { return 'semana'; } });
  const setModo = (m) => { setModoState(m); try { localStorage.setItem('eql-rel-modo', m); } catch { /* ignora */ } };
  const [ref, setRef] = useState(dia0);
  const [filtro, setFiltro] = useState('todas');
  // o relatório aberto fica no endereço: /calendario/relatorios/<id> (dá para mandar o link)
  const aberto = abertoId ? (dados.relatorios || []).find((r) => r.id === abertoId) || null : null;
  const setAberto = (r) => irSub?.(r ? r.id : null);
  const [novo, setNovo] = useState(null); // { dia, obra }
  useVoltarFecha(!!novo, () => setNovo(null));
  const [soRel, setSoRelState] = useState(() => { try { return localStorage.getItem('eql-rel-so') === '1'; } catch { return false; } });
  const setSoRel = (v) => { setSoRelState(v); try { localStorage.setItem('eql-rel-so', v ? '1' : '0'); } catch { /* ignora */ } };
  const [status, setStatus] = useState('todos'); // todos | andamento | entregues
  const relatorios = dados.relatorios || [];

  // índices por "demanda|dia"
  const idx = useMemo(() => {
    const pessoas = {}, rels = {};
    dados.alocacoes.forEach((a) => (pessoas[a.demanda_id + '|' + a.dia] ||= []).push(a.funcionario_id));
    relatorios.forEach((r) => (rels[r.demanda_id + '|' + r.dia] ||= []).push(r));
    Object.values(rels).forEach((l) => l.sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || '')));
    return { pessoas, rels };
  }, [dados.alocacoes, relatorios]);

  const obras = dados.demandas.filter((d) => d.empresa !== 'eko' && (filtro === 'todas' || d.empresa === filtro));
  const nomeFunc = (id) => dados.funcionarios.find((f) => f.id === id)?.nome || '?';

  // o que aconteceu em cada obra num dia
  const doDia = (dia) => {
    const linhas = obras.map((d) => {
      const k = d.id + '|' + dia;
      const pessoas = [...new Set(idx.pessoas[k] || [])];
      return { d, pessoas, rels: idx.rels[k] || [] };
    });
    const operando = linhas.filter((l) => l.pessoas.length)
      .sort((a, b) => b.pessoas.length - a.pessoas.length || a.d.nome.localeCompare(b.d.nome, 'pt-BR'));
    const parados = linhas.filter((l) => !l.pessoas.length && (!l.d.arquivada || l.rels.length))
      .sort((a, b) => b.rels.length - a.rels.length || a.d.nome.localeCompare(b.d.nome, 'pt-BR'));
    const esperado = dia <= dia0 ? operando.length * DIARIOS.length : 0;
    const feitos = operando.reduce((s, l) => s + DIARIOS.filter((t) => l.rels.some((r) => r.tipo === t.id && r.status !== 'rascunho')).length, 0);
    return { operando, parados, esperado, feitos, total: linhas.reduce((s, l) => s + l.rels.length, 0) };
  };

  // "Somente relatórios": os relatórios do dia, do mais recente para o mais antigo
  const idsObras = new Set(obras.map((d) => d.id));
  const casaStatus = (r) => status === 'todos' || (status === 'andamento' ? r.status === 'rascunho' : r.status !== 'rascunho');
  const relsDoDia = (dia) => relatorios
    .filter((r) => r.dia === dia && idsObras.has(r.demanda_id) && casaStatus(r))
    .sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''));

  // período visível
  const semanaIni = inicioSemana(ref);
  const temDomingo = (d) => dados.alocacoes.some((a) => a.dia === d) || relatorios.some((r) => r.dia === d);
  const diasSemana = Array.from({ length: 7 }, (_, i) => addDias(semanaIni, i)).filter((d, i) => i < 6 || temDomingo(d));
  const andar = (n) => {
    if (modo === 'dia') setRef(addDias(ref, n));
    else if (modo === 'semana') setRef(addDias(ref, 7 * n));
    else { const x = parse(ref); x.setDate(1); x.setMonth(x.getMonth() + n); setRef(iso(x)); }
  };
  const rotulo = cap(modo === 'dia'
    ? parse(ref).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : modo === 'semana' ? `${fmt(diasSemana[0])} a ${fmt(diasSemana[diasSemana.length - 1])}`
      : parse(ref).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const ehAtual = modo === 'dia' ? ref === dia0 : modo === 'semana' ? semanaIni === inicioSemana(dia0) : ref.slice(0, 7) === dia0.slice(0, 7);

  const abrirDia = (d) => { setRef(d); setModo('dia'); };

  return (
    <>
      <header className="head">
        <div>
          <h1>Relatórios de obra</h1>
          <p className="date">Fotos enviadas pela equipe em campo · obras com gente operando aparecem primeiro</p>
        </div>
        <div className="row">
          {[{ id: 'todas', curto: 'Todas' }, ...OBRAS].map((e) => (
            <button key={e.id} type="button" className={'pill' + (filtro === e.id ? ' on' : '')} aria-pressed={filtro === e.id}
              onClick={() => setFiltro(e.id)}>{e.curto}</button>
          ))}
          <button type="button" className={'pill' + (soRel ? ' on' : '')} aria-pressed={soRel} onClick={() => setSoRel(!soRel)}>Somente relatórios</button>
          {pode.gestao && !dados.faltando.has('relatorios') && (
            <button type="button" className="pill lime" onClick={() => setNovo({ dia: modo === 'dia' && ref <= dia0 ? ref : dia0 })}>+ Adicionar relatório</button>
          )}
        </div>
      </header>

      {dados.faltando.has('relatorios') && (
        <section className="card aviso-banco" role="status">
          <strong>Falta liberar os relatórios no banco.</strong>
          <span>Rode o arquivo <b>09_relatorios_de_obra.sql</b> no SQL Editor do Supabase (igual aos outros). Depois disso, o pessoal de campo já consegue enviar.</span>
        </section>
      )}

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
        {soRel ? (
          <div className="seg three rel-status" role="group" aria-label="Situação dos relatórios">
            {[['todos', 'Todos'], ['andamento', 'Em andamento'], ['entregues', 'Entregues']].map(([id, nome]) => (
              <button key={id} type="button" className={status === id ? 'on' : ''} aria-pressed={status === id} onClick={() => setStatus(id)}>{nome}</button>
            ))}
          </div>
        ) : <Legenda />}
      </div>

      {soRel && modo === 'semana' && (
        <div className="rel-semana" style={{ '--n': diasSemana.length }}>
          {diasSemana.map((d) => {
            const rs = relsDoDia(d);
            return (
              <section key={d} className={'card rel-col' + (d === dia0 ? ' hoje' : '')} aria-label={fmt(d)}>
                <button type="button" className="rel-col-head" onClick={() => abrirDia(d)} title="Ver o dia">
                  <span className="rel-dia">{cap(diaSemana(d))} {fmt(d)}{d === dia0 && <em> · hoje</em>}</span>
                  <ContaRel rs={rs} />
                </button>
                {rs.map((r) => <CartaoRel key={r.id} r={r} dados={dados} nomeFunc={nomeFunc} onAbrir={setAberto} compacto />)}
                {!rs.length && <p className="empty">Nenhum relatório.</p>}
              </section>
            );
          })}
        </div>
      )}
      {soRel && modo === 'dia' && (() => {
        const rs = relsDoDia(ref);
        return (
          <>
            <div className="rel-dia-resumo"><ContaRel rs={rs} grande /></div>
            {rs.length ? (
              <div className="rel-grade-dia">
                {rs.map((r) => <CartaoRel key={r.id} r={r} dados={dados} nomeFunc={nomeFunc} onAbrir={setAberto} />)}
              </div>
            ) : <p className="empty card">Nenhum relatório neste dia.</p>}
          </>
        );
      })()}
      {soRel && modo === 'mes' && <Mes refIso={ref} hojeIso={dia0} doDia={doDia} onDia={abrirDia} relsDoDia={relsDoDia} />}

      {!soRel && modo === 'semana' && (
        <div className="rel-semana" style={{ '--n': diasSemana.length }}>
          {diasSemana.map((d) => {
            const x = doDia(d);
            return (
              <section key={d} className={'card rel-col' + (d === dia0 ? ' hoje' : '')} aria-label={fmt(d)}>
                <button type="button" className="rel-col-head" onClick={() => abrirDia(d)} title="Ver o dia">
                  <span className="rel-dia">{cap(diaSemana(d))} {fmt(d)}{d === dia0 && <em> · hoje</em>}</span>
                  <Resumo x={x} dia={d} hojeIso={dia0} />
                </button>
                {x.operando.length > 0 && <span className="rel-sec">Operando · {x.operando.length}</span>}
                {x.operando.map((l) => (
                  <CartaoObra key={l.d.id} l={l} dia={d} hojeIso={dia0} nomeFunc={nomeFunc} onAbrir={setAberto} compacto />
                ))}
                {!x.operando.length && <p className="empty">Ninguém escalado.</p>}
                {x.parados.length > 0 && (
                  <details className="rel-parados" open>
                    <summary>Sem equipe · {x.parados.length}</summary>
                    {x.parados.map((l) => <LinhaParada key={l.d.id} l={l} onAbrir={setAberto} />)}
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}

      {!soRel && modo === 'dia' && (() => {
        const x = doDia(ref);
        return (
          <>
            <div className="rel-dia-resumo"><Resumo x={x} dia={ref} hojeIso={dia0} grande /></div>
            <h2 className="rel-h2">Operando · {x.operando.length}</h2>
            {x.operando.length ? (
              <div className="rel-grade-dia">
                {x.operando.map((l) => <CartaoObra key={l.d.id} l={l} dia={ref} hojeIso={dia0} nomeFunc={nomeFunc} onAbrir={setAberto} dados={dados} onNovo={pode.gestao && !dados.faltando.has('relatorios') ? setNovo : null} />)}
              </div>
            ) : <p className="empty card">Ninguém escalado neste dia.</p>}
            <h2 className="rel-h2">Sem equipe · {x.parados.length}</h2>
            <div className="card rel-parados-dia">
              {x.parados.map((l) => <LinhaParada key={l.d.id} l={l} onAbrir={setAberto} />)}
              {!x.parados.length && <p className="empty">Todas as obras tinham equipe.</p>}
            </div>
          </>
        );
      })()}

      {!soRel && modo === 'mes' && <Mes refIso={ref} hojeIso={dia0} doDia={doDia} onDia={abrirDia} />}

      {novo && (
        <NovoRelatorio dados={dados} escritorio diaInicial={novo.dia} obraInicial={novo.obra} tipoInicial={novo.tipo} onFechar={() => setNovo(null)} />
      )}
      {aberto && (
        <VerRelatorio r={aberto} dados={dados} onFechar={() => setAberto(null)}
          onApagar={pode.gestao ? (r) => dados.apagarRelatorio(r) : null}
          exportarRfi salvarCampos={pode.gestao ? dados.salvarCamposRelatorio : null} />
      )}
    </>
  );
}

function Legenda() {
  return (
    <div className="rel-legenda" aria-label="Legenda">
      <span><i className="rel-pill enviado" /> enviado</span>
      <span><i className="rel-pill andamento" /> em andamento</span>
      <span><i className="rel-pill pendente" /> ainda não chegou</span>
      <span><i className="rel-pill faltou" /> não foi enviado</span>
    </div>
  );
}

function Resumo({ x, dia, hojeIso, grande }) {
  if (dia > hojeIso) return <span className="rel-resumo">{x.operando.length} {x.operando.length === 1 ? 'obra' : 'obras'} na agenda</span>;
  const pct = x.esperado ? Math.round((x.feitos / x.esperado) * 100) : 0;
  return (
    <span className={'rel-resumo' + (grande ? ' grande' : '')}>
      <span>{x.operando.length} operando · <b>{x.feitos}/{x.esperado}</b> relatórios</span>
      {x.esperado > 0 && <span className={'meter' + (dia < hojeIso && pct < 100 ? ' ruim' : '')}><span style={{ width: pct + '%' }} /></span>}
    </span>
  );
}

// Situação de cada tipo de relatório na obra/dia
function estado(l, t, dia, hojeIso) {
  const rs = l.rels.filter((r) => r.tipo === t.id);
  if (rs.length) return { cls: rs.some((r) => r.status !== 'rascunho') ? 'enviado' : 'andamento', rs };
  if (dia > hojeIso || !l.pessoas.length) return null;
  return { cls: dia < hojeIso ? 'faltou' : 'pendente', rs };
}

function CartaoObra({ l, dia, hojeIso, nomeFunc, onAbrir, compacto, dados, onNovo }) {
  const extras = l.rels.filter((r) => !tipoRelatorio[r.tipo]?.ativo);
  const emp = empresaPorId[l.d.empresa];
  if (compacto) {
    return (
      <div className="rel-obra">
        <div className="rel-obra-top">
          <span className="dot" style={{ background: emp?.cor }} aria-hidden="true" />
          <strong title={l.d.nome}>{l.d.nome}</strong>
        </div>
        <span className="rel-pessoas" title={l.pessoas.map(nomeFunc).join(', ')}>{l.pessoas.map(nomeFunc).join(', ')}</span>
        {dia <= hojeIso && (
          <div className="rel-pills">
            {DIARIOS.map((t) => {
              const e = estado(l, t, dia, hojeIso);
              if (!e) return null;
              return e.rs.length ? (
                <button key={t.id} type="button" className={'rel-pill ' + e.cls} title={(e.cls === 'andamento' ? 'Em andamento · ' : '') + `${t.nome}: ${hora(e.rs[0].criado_em)} · ${contagem(e.rs[0])}`}
                  onClick={() => onAbrir(e.rs[e.rs.length - 1])}>{t.curto}{e.rs.length > 1 ? ` ×${e.rs.length}` : ''}</button>
              ) : <span key={t.id} className={'rel-pill ' + e.cls} title={`${t.nome}: ${e.cls === 'faltou' ? 'não foi enviado' : 'ainda não chegou'}`}>{t.curto}</span>;
            })}
            {extras.map((r) => <button key={r.id} type="button" className={'rel-pill ' + (r.status === 'rascunho' ? 'andamento' : 'enviado')} onClick={() => onAbrir(r)}>{tipoRelatorio[r.tipo]?.curto}</button>)}
          </div>
        )}
      </div>
    );
  }
  return (
    <section className="card rel-obra-g">
      <div className="rel-obra-top">
        <span className="dot" style={{ background: emp?.cor }} aria-hidden="true" />
        <div>
          <h3>{l.d.nome}</h3>
          <span className="note">{[emp?.curto, l.d.grupo].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div className="rel-chips">{l.pessoas.map((p) => <span key={p} className="chip">{nomeFunc(p)}</span>)}</div>
      {dia <= hojeIso && [...DIARIOS, ...TIPOS_RELATORIO.filter((t) => !t.ativo && l.rels.some((r) => r.tipo === t.id))].map((t) => {
        const e = estado(l, t, dia, hojeIso);
        if (!e) return null;
        return (
          <div key={t.id} className={'rel-linha ' + e.cls}>
            <div className="rel-linha-top">
              <span className={'rel-pill ' + e.cls}>{t.nome}</span>
              <span className="note">{e.rs.length ? e.rs.map((r) => `${hora(r.criado_em)} · ${contagem(r)}`).join(' | ') : e.cls === 'faltou' ? 'não foi enviado' : 'ainda não chegou'}</span>
              {!e.rs.length && onNovo && <button type="button" className="link-btn rel-add" onClick={() => onNovo({ dia, obra: l.d.id, tipo: t.id })}>+ adicionar</button>}
            </div>
            {e.rs.map((r) => {
              const fotos = (r.arquivos || []).filter((a) => a.tipo !== 'video');
              const mostra = fotos.slice(0, 6);
              return (
                <button key={r.id} type="button" className="rel-tira" onClick={() => onAbrir(r)} aria-label={`Ver ${t.nome}`}>
                  {mostra.map((a) => <img key={a.caminho} src={dados.urlArquivo(a.miniatura || a.caminho)} alt="" loading="lazy" />)}
                  {fotos.length > mostra.length && <span className="rel-mais">+{fotos.length - mostra.length}</span>}
                  {r.observacao && <span className="rel-tira-obs">“{r.observacao}”</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function LinhaParada({ l, onAbrir }) {
  return (
    <div className="rel-parada">
      <span className="dot" style={{ background: empresaPorId[l.d.empresa]?.cor }} aria-hidden="true" />
      <span className="rel-parada-nome" title={l.d.nome}>{l.d.nome}</span>
      {l.rels.map((r) => (
        <button key={r.id} type="button" className={'rel-pill ' + (r.status === 'rascunho' ? 'andamento' : 'enviado')} onClick={() => onAbrir(r)}>{tipoRelatorio[r.tipo]?.curto}</button>
      ))}
    </div>
  );
}

function Mes({ refIso, hojeIso, doDia, onDia, relsDoDia }) {
  const p = parse(refIso);
  const primeiro = iso(new Date(p.getFullYear(), p.getMonth(), 1));
  const ultimo = iso(new Date(p.getFullYear(), p.getMonth() + 1, 0));
  const ini = inicioSemana(primeiro);
  const dias = [];
  for (let d = ini; d <= ultimo || dias.length % 7; d = addDias(d, 1)) dias.push(d);
  return (
    <div className="card rel-mes">
      {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((n) => <span key={n} className="rel-mes-dow">{n}</span>)}
      {dias.map((d) => {
        const fora = d < primeiro || d > ultimo;
        if (relsDoDia) {
          const rs = fora ? [] : relsDoDia(d);
          const and = rs.filter((r) => r.status === 'rascunho').length;
          return (
            <button key={d} type="button" className={'rel-mes-dia' + (fora ? ' fora' : '') + (d === hojeIso ? ' hoje' : '')}
              disabled={fora} onClick={() => onDia(d)} aria-label={`${fmt(d)}: ${rs.length} relatórios`}>
              <span className="rel-mes-num">{Number(d.slice(8))}</span>
              {rs.length > 0 && <span className="cal-mes-pins">
                {rs.length - and > 0 && <span className="cm rel"><b>{rs.length - and}</b> {rs.length - and === 1 ? 'entregue' : 'entregues'}</span>}
                {and > 0 && <span className="cm andamento"><b>{and}</b> em andamento</span>}
              </span>}
            </button>
          );
        }
        const x = fora ? null : doDia(d);
        const pct = x?.esperado ? Math.round((x.feitos / x.esperado) * 100) : 0;
        const ruim = x && d < hojeIso && x.esperado && pct < 100;
        return (
          <button key={d} type="button" className={'rel-mes-dia' + (fora ? ' fora' : '') + (d === hojeIso ? ' hoje' : '') + (ruim ? ' ruim' : '')}
            disabled={fora} onClick={() => onDia(d)} aria-label={`${fmt(d)}${x ? `, ${x.operando.length} obras operando, ${x.feitos} de ${x.esperado} relatórios` : ''}`}>
            <span className="rel-mes-num">{Number(d.slice(8))}</span>
            {x && x.operando.length > 0 && (
              <>
                <span className="rel-mes-info">{x.operando.length} {x.operando.length === 1 ? 'obra' : 'obras'}</span>
                {d <= hojeIso && <span className="rel-mes-info"><b>{x.feitos}/{x.esperado}</b> relat.</span>}
                {d <= hojeIso && <span className="meter"><span style={{ width: pct + '%' }} /></span>}
              </>
            )}
            {x && !x.operando.length && x.total > 0 && <span className="rel-mes-info">{x.total} relat.</span>}
          </button>
        );
      })}
    </div>
  );
}

function ContaRel({ rs, grande }) {
  const and = rs.filter((r) => r.status === 'rascunho').length;
  return (
    <span className={'rel-resumo' + (grande ? ' grande' : '')}>
      <span><b>{rs.length}</b> {rs.length === 1 ? 'relatório' : 'relatórios'}{and ? ` · ${and} em andamento` : ''}</span>
    </span>
  );
}

// Cartão de um relatório (visão "Somente relatórios")
function CartaoRel({ r, dados, nomeFunc, onAbrir, compacto }) {
  const obra = dados.demandas.find((d) => d.id === r.demanda_id);
  const fotos = (r.arquivos || []).filter((a) => a.tipo !== 'video');
  const andamento = r.status === 'rascunho';
  const mostra = fotos.slice(0, compacto ? 4 : 8);
  return (
    <button type="button" className={'rel-card' + (compacto ? ' compacto' : '') + (andamento ? ' andamento' : '')} onClick={() => onAbrir(r)}>
      <span className="rel-card-top">
        <span className={'rel-pill ' + (andamento ? 'andamento' : 'enviado')}>{andamento ? 'Em andamento' : 'Entregue'}</span>
        <span className="rel-card-hora">{hora(r.criado_em)}</span>
      </span>
      <span className="rel-card-obra"><span className="dot" style={{ background: empresaPorId[obra?.empresa]?.cor }} />{obra?.nome || 'Obra apagada'}</span>
      <span className="rel-card-sub">{tipoRelatorio[r.tipo]?.nome}{r.funcionario_id ? ` · ${nomeFunc(r.funcionario_id)}` : ''} · {contagem(r)}</span>
      {mostra.length > 0 && (
        <span className="rel-card-fotos">
          {mostra.map((a) => <img key={a.caminho} src={dados.urlArquivo(a.miniatura || a.caminho)} alt="" loading="lazy" />)}
          {fotos.length > mostra.length && <span className="rel-mais">+{fotos.length - mostra.length}</span>}
        </span>
      )}
      {!compacto && r.observacao && <span className="rel-tira-obs">“{r.observacao}”</span>}
    </button>
  );
}
