import { useMemo, useState } from 'react';
import { EMPRESAS, addDias, diaSemana, fmt, hoje, inicioSemana, ordemGrupo, situacao } from './lib.js';

const FORA = [
  { id: 'folga', nome: 'Folga' },
  { id: 'ferias', nome: 'Férias' },
];

// Agenda semanal: linhas = "Fora" (folga/férias) + demandas; colunas = dias.
// Arraste funcionários e veículos da paleta para as células; arraste um nome já
// colocado para outra célula (mover) ou para a lixeira (remover).
// No celular também dá para tocar no nome e depois tocar na célula.
export function Agenda({ demandas, dados, avisar }) {
  const [semana, setSemana] = useState(() => inicioSemana(hoje()));
  const [mostrarDomingo, setMostrarDomingo] = useState(false);
  const [selecionado, setSelecionado] = useState(null); // { kind, id } — modo toque
  const [arraste, setArraste] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [lixeiraQuente, setLixeiraQuente] = useState(false);

  const dia0 = hoje();
  const dias = useMemo(
    () => Array.from({ length: mostrarDomingo ? 7 : 6 }, (_, i) => addDias(semana, i)),
    [semana, mostrarDomingo]);

  const funcs = dados.funcionarios.filter((f) => f.ativo);
  const veics = dados.veiculos.filter((v) => v.ativo);
  const nome = {
    func: Object.fromEntries(dados.funcionarios.map((f) => [f.id, f.nome])),
    veic: Object.fromEntries(dados.veiculos.map((v) => [v.id, v.nome])),
  };

  const idx = useMemo(() => {
    const cel = {}, recDia = {}, aus = {}, ausCel = {};
    const push = (k, v) => (cel[k] ||= []).push(v);
    dados.alocacoes.forEach((a) => {
      push(a.demanda_id + '|' + a.dia, { kind: 'func', rec: a.funcionario_id, a });
      const k = 'func|' + a.funcionario_id + '|' + a.dia; recDia[k] = (recDia[k] || 0) + 1;
    });
    dados.veiculo_alocacoes.forEach((a) => {
      push(a.demanda_id + '|' + a.dia, { kind: 'veic', rec: a.veiculo_id, a });
      const k = 'veic|' + a.veiculo_id + '|' + a.dia; recDia[k] = (recDia[k] || 0) + 1;
    });
    dados.ausencias.forEach((a) => {
      aus[a.funcionario_id + '|' + a.dia] = a;
      (ausCel['out:' + a.tipo + '|' + a.dia] ||= []).push(a);
    });
    return { cel, recDia, aus, ausCel };
  }, [dados.alocacoes, dados.veiculo_alocacoes, dados.ausencias]);

  const fora = (funcId, dia) => idx.aus[funcId + '|' + dia];
  const livres = (dia) => funcs.filter((f) => !idx.recDia['func|' + f.id + '|' + dia] && !fora(f.id, dia));

  const secoes = EMPRESAS.map((e) => ({
    ...e,
    linhas: demandas
      .filter((d) => d.empresa === e.id && !d.arquivada)
      .sort((a, b) => ordemGrupo(a.grupo, b.grupo) || (a.entrega || '9999').localeCompare(b.entrega || '9999')),
  })).filter((s) => s.linhas.length);

  // ---------- soltar em uma célula ----------
  const soltar = (c, chave) => {
    const [alvoId, dia] = chave.split('|');
    if (alvoId.startsWith('out:')) {
      const tipo = alvoId.slice(4);
      if (c.kind === 'veic') { avisar('Veículos não entram em folga. Arraste para uma obra ou para a lixeira.'); return; }
      if (c.ausId) {
        const a = dados.ausencias.find((x) => x.id === c.ausId);
        if (a && a.dia !== dia) dados.removerAusencia(c.ausId);
      }
      dados.marcarAusencia(c.id, dia, tipo);
      if (c.alocId) dados.removerAlocacao('func', c.alocId);
      return;
    }
    if (c.alocId) dados.moverAlocacao(c.kind, c.alocId, alvoId, dia);
    else dados.alocar(c.kind, c.id, alvoId, dia);
    if (c.ausId) dados.removerAusencia(c.ausId);
  };
  const descartar = (c) => {
    if (c.alocId) dados.removerAlocacao(c.kind, c.alocId);
    if (c.ausId) dados.removerAusencia(c.ausId);
  };

  // ---------- arrastar (mouse e toque, via pointer events) ----------
  const sob = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return { cel: el?.closest('[data-cel]')?.getAttribute('data-cel') || null, lixeira: !!el?.closest('[data-lixeira]') };
  };

  const iniciar = (e, carga) => {
    if (e.button !== undefined && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ativo = false, pos = { x: sx, y: sy }, timer = null;
    const rolar = () => {
      const m = 70, v = 14;
      if (pos.y > window.innerHeight - m) window.scrollBy(0, v);
      else if (pos.y < m) window.scrollBy(0, -v);
      const wrap = document.querySelector('.grid-wrap');
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        if (pos.x > r.right - m) wrap.scrollLeft += v;
        else if (pos.x < r.left + m + 180 && pos.x > r.left) wrap.scrollLeft -= v;
      }
    };
    const mover = (ev) => {
      pos = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ativo = true;
        timer = setInterval(rolar, 16);
      }
      ev.preventDefault();
      setArraste({ rotulo: carga.rotulo, x: ev.clientX, y: ev.clientY });
      const s = sob(ev.clientX, ev.clientY);
      setAlvo(s.cel); setLixeiraQuente(s.lixeira);
    };
    const fim = () => {
      clearInterval(timer);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', fim);
      setArraste(null); setAlvo(null); setLixeiraQuente(false);
    };
    const up = (ev) => {
      if (ativo) {
        const s = sob(ev.clientX, ev.clientY);
        if (s.cel) soltar(carga, s.cel);
        else if (s.lixeira) descartar(carga);
        setSelecionado(null);
      } else if (carga.aoTocar) carga.aoTocar();
      fim();
    };
    window.addEventListener('pointermove', mover, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', fim);
  };

  const tocarCelula = (chave) => {
    if (!selecionado) return;
    soltar({ kind: selecionado.kind, id: selecionado.id }, chave);
  };
  const alternar = (kind, id) => setSelecionado((s) => (s && s.kind === kind && s.id === id ? null : { kind, id }));

  const repetirSemanaAnterior = async () => {
    const ini = addDias(semana, -7), fim = addDias(ini, 6);
    const abertas = new Set(demandas.filter((d) => !d.arquivada).map((d) => d.id));
    let total = 0;
    for (const [kind, lista, col] of [['func', dados.alocacoes, 'funcionario_id'], ['veic', dados.veiculo_alocacoes, 'veiculo_id']]) {
      const existe = new Set(lista.map((a) => `${a[col]}|${a.demanda_id}|${a.dia}`));
      const novas = lista
        .filter((a) => a.dia >= ini && a.dia <= fim && abertas.has(a.demanda_id))
        .map((a) => ({ [col]: a[col], demanda_id: a.demanda_id, dia: addDias(a.dia, 7) }))
        .filter((a) => !existe.has(`${a[col]}|${a.demanda_id}|${a.dia}`))
        .filter((a) => kind === 'veic' || !fora(a.funcionario_id, a.dia));
      if (novas.length && (await dados.inserirAlocacoes(kind, novas))) total += novas.length;
    }
    avisar(total ? `${total} alocações copiadas da semana anterior.` : 'A semana anterior não tem nada novo para copiar.');
  };

  const estaSemana = semana === inicioSemana(dia0);
  const sel = (kind, id) => selecionado?.kind === kind && selecionado?.id === id;
  const nomeSel = selecionado ? nome[selecionado.kind][selecionado.id] : '';

  // ---------- chip dentro de uma célula ----------
  const ChipCelula = ({ kind, recId, alocId, ausId, dia, extraClasse, aviso }) => {
    const n = nome[kind][recId] || '?';
    return (
      <span className={'chip small ' + extraClasse} title={aviso || n}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => { e.stopPropagation(); iniciar(e, { kind, id: recId, alocId, ausId, rotulo: n }); }}>
        {n}
        <button type="button" className="x" aria-label={`Remover ${n}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); descartar({ kind, alocId, ausId }); }}>×</button>
      </span>
    );
  };

  const celula = (chave, dia, conteudo) => (
    <td key={dia} data-cel={chave}
      className={'cell' + (dia === dia0 ? ' today' : '') + (alvo === chave ? ' hot' : '') + (selecionado ? ' armed' : '')}
      onClick={() => tocarCelula(chave)}>
      <div className="cell-inner">{conteudo}</div>
    </td>
  );

  return (
    <section className="card agenda" aria-label="Agenda das equipes">
      <div className="agenda-head">
        <div>
          <h2>Agenda das equipes</h2>
          <p className="agenda-sub">Arraste funcionários e veículos para a obra e o dia. Quem estiver fora, arraste para Folga ou Férias.</p>
        </div>
        <div className="week-nav">
          <button type="button" className="pill" aria-label="Semana anterior" onClick={() => setSemana(addDias(semana, -7))}>‹</button>
          <span className="week-label">{fmt(dias[0])} a {fmt(dias[dias.length - 1])}</span>
          <button type="button" className="pill" aria-label="Próxima semana" onClick={() => setSemana(addDias(semana, 7))}>›</button>
          {!estaSemana && <button type="button" className="pill" onClick={() => setSemana(inicioSemana(dia0))}>Hoje</button>}
          <button type="button" className="pill ghost" onClick={() => setMostrarDomingo((v) => !v)}>{mostrarDomingo ? 'Ocultar domingo' : 'Mostrar domingo'}</button>
          <button type="button" className="pill dark" onClick={repetirSemanaAnterior}>Repetir semana anterior</button>
        </div>
      </div>

      <div className="palette">
        <div className="palette-group">
          <span className="palette-hint">
            {selecionado ? `Toque nas células para colocar ${nomeSel} · toque no nome de novo para soltar` : 'Funcionários (verde = livre hoje, tracejado = fora hoje):'}
          </span>
          {funcs.map((f) => {
            const aus = fora(f.id, dia0);
            const livre = !aus && !idx.recDia['func|' + f.id + '|' + dia0];
            return (
              <span key={f.id} role="button" tabIndex={0}
                className={'chip' + (sel('func', f.id) ? ' sel' : '') + (livre ? ' free' : '') + (aus ? ' out' : '')}
                title={aus ? `${f.nome} está de ${aus.tipo === 'ferias' ? 'férias' : 'folga'} hoje` : f.nome}
                aria-pressed={sel('func', f.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && alternar('func', f.id)}
                onPointerDown={(e) => iniciar(e, { kind: 'func', id: f.id, rotulo: f.nome, aoTocar: () => alternar('func', f.id) })}>
                {f.nome}
              </span>
            );
          })}
          {!funcs.length && <span className="empty">Cadastre funcionários na aba Equipes.</span>}
        </div>
        <div className="palette-group">
          <span className="palette-hint">Veículos:</span>
          {veics.map((v) => (
            <span key={v.id} role="button" tabIndex={0}
              className={'chip veic' + (sel('veic', v.id) ? ' sel' : '')}
              aria-pressed={sel('veic', v.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && alternar('veic', v.id)}
              onPointerDown={(e) => iniciar(e, { kind: 'veic', id: v.id, rotulo: v.nome, aoTocar: () => alternar('veic', v.id) })}>
              {v.nome}{v.placa ? ' · ' + v.placa : ''}
            </span>
          ))}
          {!veics.length && <span className="empty" style={{ padding: 0 }}>Cadastre os veículos na aba Frotas.</span>}
          <span data-lixeira="1" className={'trash' + (lixeiraQuente ? ' hot' : '')}>Solte aqui para remover</span>
        </div>
      </div>

      <div className="legend" aria-label="Legenda">
        <span><i style={{ background: 'var(--lav)' }} />Funcionário</span>
        <span><i style={{ background: 'var(--mint)' }} />Veículo</span>
        <span><i style={{ background: 'var(--peach)', outline: '1.5px solid var(--late-ink)' }} />Conflito: duas obras no dia ou está de folga</span>
        <span><i style={{ background: 'var(--red)', borderRadius: '50%' }} />Entrega em até 3 dias / atrasada</span>
        <span><i style={{ background: '#E0B000', borderRadius: '50%' }} />Entrega em até 7 dias</span>
      </div>

      <div className="grid-wrap">
        <table className="cal">
          <thead>
            <tr>
              <th className="rowhead" scope="col">Demanda</th>
              {dias.map((d) => {
                const l = livres(d);
                return (
                  <th key={d} scope="col" className={d === dia0 ? 'today' : ''} title={l.length ? 'Livres: ' + l.map((f) => f.nome).join(', ') : 'Ninguém livre'}>
                    <div className="day-name">{diaSemana(d)} {fmt(d)}</div>
                    <div className="day-free">{l.length} {l.length === 1 ? 'livre' : 'livres'}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="sep"><td colSpan={dias.length + 1}>Fora da obra</td></tr>
            {FORA.map((t) => (
              <tr key={t.id} className="out-row">
                <th scope="row" className="rowhead"><div className="n">{t.nome}</div></th>
                {dias.map((dia) => {
                  const chave = 'out:' + t.id + '|' + dia;
                  return celula(chave, dia, (idx.ausCel[chave] || []).map((a) => (
                    <ChipCelula key={a.id} kind="func" recId={a.funcionario_id} ausId={a.id} dia={dia} extraClasse={t.id} />
                  )));
                })}
              </tr>
            ))}
            {secoes.map((s) => [
              <tr key={'sep-' + s.id} className="sep"><td colSpan={dias.length + 1}>{s.nome}</td></tr>,
              ...s.linhas.map((d) => {
                const sit = situacao(d, dia0);
                return (
                  <tr key={d.id}>
                    <th scope="row" className="rowhead">
                      <div className="n">{['atrasada', 'urgente', 'semana'].includes(sit) && <span className={'alert ' + sit} />}{d.nome}</div>
                      <div className="s">{d.grupo}{d.entrega ? ' · até ' + fmt(d.entrega) : ''}</div>
                    </th>
                    {dias.map((dia) => {
                      const chave = d.id + '|' + dia;
                      return celula(chave, dia, (idx.cel[chave] || []).map(({ kind, rec, a }) => {
                        const duplo = idx.recDia[kind + '|' + rec + '|' + dia] > 1;
                        const aus = kind === 'func' && fora(rec, dia);
                        const n = nome[kind][rec] || '?';
                        const aviso = aus ? `${n} está de ${aus.tipo === 'ferias' ? 'férias' : 'folga'} neste dia`
                          : duplo ? `${n} está em mais de uma obra neste dia` : '';
                        return (
                          <ChipCelula key={a.id} kind={kind} recId={rec} alocId={a.id} dia={dia}
                            extraClasse={(kind === 'veic' ? 'veic' : '') + (aviso ? ' conf' : '')} aviso={aviso} />
                        );
                      }));
                    })}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>

      {arraste && <div className="drag-ghost" style={{ left: arraste.x, top: arraste.y }}>{arraste.rotulo}</div>}
    </section>
  );
}
