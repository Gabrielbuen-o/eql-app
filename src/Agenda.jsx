import { useMemo, useRef, useState } from 'react';
import { EMPRESAS, addDias, diaSemana, fmt, hoje, inicioSemana, ordemGrupo } from './lib.js';

// Agenda semanal: linhas = demandas, colunas = dias (seg–sáb).
// Arraste um funcionário da paleta para uma célula; arraste um nome já alocado
// para outra célula (mover) ou para a lixeira (remover).
// No celular também dá para tocar no nome e depois tocar na célula.
export function Agenda({ demandas, funcionarios, alocacoes, acoes, avisar }) {
  const [semana, setSemana] = useState(() => inicioSemana(hoje()));
  const [mostrarDomingo, setMostrarDomingo] = useState(false);
  const [selecionado, setSelecionado] = useState(null); // modo toque
  const [arraste, setArraste] = useState(null); // { rotulo, x, y }
  const [alvo, setAlvo] = useState(null); // célula sob o dedo/mouse
  const [lixeiraQuente, setLixeiraQuente] = useState(false);
  const dragRef = useRef(null);

  const dia0 = hoje();
  const dias = useMemo(
    () => Array.from({ length: mostrarDomingo ? 7 : 6 }, (_, i) => addDias(semana, i)),
    [semana, mostrarDomingo]);

  const ativos = funcionarios.filter((f) => f.ativo);
  const nomeFunc = Object.fromEntries(funcionarios.map((f) => [f.id, f.nome]));

  // índice: "demanda|dia" -> alocações
  const porCelula = useMemo(() => {
    const m = {};
    alocacoes.forEach((a) => { (m[a.demanda_id + '|' + a.dia] ||= []).push(a); });
    return m;
  }, [alocacoes]);
  // quantas obras cada funcionário tem em cada dia (para avisar conflito)
  const porFuncDia = useMemo(() => {
    const m = {};
    alocacoes.forEach((a) => { const k = a.funcionario_id + '|' + a.dia; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [alocacoes]);
  const livres = (dia) => ativos.filter((f) => !porFuncDia[f.id + '|' + dia]);

  // linhas agrupadas por empresa
  const secoes = EMPRESAS.map((e) => ({
    ...e,
    linhas: demandas
      .filter((d) => d.empresa === e.id && !d.arquivada)
      .sort((a, b) => ordemGrupo(a.grupo, b.grupo) || (a.entrega || '9999').localeCompare(b.entrega || '9999')),
  })).filter((s) => s.linhas.length);

  // ---------- arrastar (mouse e toque, via pointer events) ----------
  const celulaEm = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return { cel: el?.closest('[data-cel]')?.getAttribute('data-cel') || null, lixeira: !!el?.closest('[data-lixeira]') };
  };

  const iniciar = (e, carga) => {
    if (e.button !== undefined && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ativo = false;
    let pos = { x: sx, y: sy };
    let timer = null;
    // rola a página/tabela sozinho quando o dedo/mouse chega perto da borda
    const rolar = () => {
      const m = 70, v = 14;
      if (pos.y > window.innerHeight - m) window.scrollBy(0, v);
      else if (pos.y < m) window.scrollBy(0, -v);
      const wrap = document.querySelector('.grid-wrap');
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        if (pos.x > r.right - m) wrap.scrollLeft += v;
        else if (pos.x < r.left + m + 180) wrap.scrollLeft -= v;
      }
    };
    const mover = (ev) => {
      pos = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ativo = true;
        dragRef.current = carga;
        timer = setInterval(rolar, 16);
      }
      ev.preventDefault();
      setArraste({ rotulo: carga.rotulo, x: ev.clientX, y: ev.clientY });
      const { cel, lixeira } = celulaEm(ev.clientX, ev.clientY);
      setAlvo(cel); setLixeiraQuente(lixeira);
    };
    const soltar = (ev) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      if (ativo) {
        const { cel, lixeira } = celulaEm(ev.clientX, ev.clientY);
        if (cel) {
          const [demanda_id, dia] = cel.split('|');
          if (carga.alocacaoId) acoes.moverAlocacao(carga.alocacaoId, demanda_id, dia);
          else acoes.alocar(carga.funcId, demanda_id, dia);
        } else if (lixeira && carga.alocacaoId) {
          acoes.removerAlocacao(carga.alocacaoId);
        }
        setSelecionado(null);
      } else if (carga.aoTocar) {
        carga.aoTocar();
      }
      fim();
    };
    const cancelar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      fim();
    };
    const fim = () => { clearInterval(timer); dragRef.current = null; setArraste(null); setAlvo(null); setLixeiraQuente(false); };
    window.addEventListener('pointermove', mover, { passive: false });
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
  };

  const tocarCelula = (demanda_id, dia) => {
    if (!selecionado) return;
    acoes.alocar(selecionado, demanda_id, dia);
  };

  const repetirSemanaAnterior = async () => {
    const anterior = addDias(semana, -7);
    const fimAnt = addDias(anterior, 6);
    const abertas = new Set(demandas.filter((d) => !d.arquivada).map((d) => d.id));
    const existe = new Set(alocacoes.map((a) => `${a.funcionario_id}|${a.demanda_id}|${a.dia}`));
    const novas = alocacoes
      .filter((a) => a.dia >= anterior && a.dia <= fimAnt && abertas.has(a.demanda_id))
      .map((a) => ({ funcionario_id: a.funcionario_id, demanda_id: a.demanda_id, dia: addDias(a.dia, 7) }))
      .filter((a) => !existe.has(`${a.funcionario_id}|${a.demanda_id}|${a.dia}`));
    if (!novas.length) { avisar('A semana anterior não tem nada novo para copiar.'); return; }
    const n = await acoes.inserirAlocacoes(novas);
    if (n) avisar(`${n} alocações copiadas da semana anterior.`);
  };

  const rotuloSemana = `${fmt(dias[0])} a ${fmt(dias[dias.length - 1])}`;
  const estaSemana = semana === inicioSemana(dia0);

  return (
    <section className="card agenda" aria-label="Agenda das equipes">
      <div className="agenda-head">
        <div>
          <h2>Agenda das equipes</h2>
          <p className="agenda-sub">Arraste os funcionários para a obra e o dia. Tudo atualiza na hora para todo mundo.</p>
        </div>
        <div className="week-nav">
          <button type="button" className="pill" aria-label="Semana anterior" onClick={() => setSemana(addDias(semana, -7))}>‹</button>
          <span className="week-label">{rotuloSemana}</span>
          <button type="button" className="pill" aria-label="Próxima semana" onClick={() => setSemana(addDias(semana, 7))}>›</button>
          {!estaSemana && <button type="button" className="pill" onClick={() => setSemana(inicioSemana(dia0))}>Hoje</button>}
          <button type="button" className="pill ghost" onClick={() => setMostrarDomingo((v) => !v)}>{mostrarDomingo ? 'Ocultar domingo' : 'Mostrar domingo'}</button>
          <button type="button" className="pill dark" onClick={repetirSemanaAnterior}>Repetir semana anterior</button>
        </div>
      </div>

      <div className="palette">
        <span className="palette-hint">{selecionado ? `Toque nas células para alocar ${nomeFunc[selecionado]} · toque no nome de novo para soltar` : 'Funcionários (bolinha verde = livre hoje):'}</span>
        {ativos.map((f) => {
          const livre = !porFuncDia[f.id + '|' + dia0];
          return (
            <span key={f.id} role="button" tabIndex={0}
              className={'chip' + (selecionado === f.id ? ' sel' : '') + (livre ? ' free' : '')}
              aria-pressed={selecionado === f.id}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelecionado((s) => (s === f.id ? null : f.id))}
              onPointerDown={(e) => iniciar(e, { funcId: f.id, rotulo: f.nome, aoTocar: () => setSelecionado((s) => (s === f.id ? null : f.id)) })}>
              {f.nome}
            </span>
          );
        })}
        {!ativos.length && <span className="empty">Cadastre funcionários na aba Equipes.</span>}
        <span data-lixeira="1" className={'trash' + (lixeiraQuente ? ' hot' : '')}>Solte aqui para remover</span>
      </div>

      <div className="grid-wrap">
        <table className="cal">
          <thead>
            <tr>
              <th className="rowhead" scope="col">Demanda</th>
              {dias.map((d) => {
                const l = livres(d);
                return (
                  <th key={d} scope="col" className={d === dia0 ? 'today' : ''} title={l.length ? 'Livres: ' + l.map((f) => f.nome).join(', ') : 'Todos alocados'}>
                    <div className="day-name">{diaSemana(d)} {fmt(d)}</div>
                    <div className="day-free">{l.length} {l.length === 1 ? 'livre' : 'livres'}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {secoes.map((s) => [
              <tr key={'sep-' + s.id} className="sep"><td colSpan={dias.length + 1}>{s.nome}</td></tr>,
              ...s.linhas.map((d) => (
                <tr key={d.id}>
                  <th scope="row" className="rowhead">
                    <div className="n">{d.nome}</div>
                    <div className="s">{d.grupo}{d.entrega ? ' · até ' + fmt(d.entrega) : ''}</div>
                  </th>
                  {dias.map((dia) => {
                    const chave = d.id + '|' + dia;
                    const lista = porCelula[chave] || [];
                    return (
                      <td key={dia} data-cel={chave}
                        className={'cell' + (dia === dia0 ? ' today' : '') + (alvo === chave ? ' hot' : '') + (selecionado ? ' armed' : '')}
                        onClick={() => tocarCelula(d.id, dia)}>
                        <div className="cell-inner">
                          {lista.map((a) => {
                            const conflito = porFuncDia[a.funcionario_id + '|' + a.dia] > 1;
                            const nome = nomeFunc[a.funcionario_id] || '?';
                            return (
                              <span key={a.id} className={'chip small' + (conflito ? ' conf' : '')}
                                title={conflito ? `${nome} está em mais de uma obra neste dia` : nome}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => { e.stopPropagation(); iniciar(e, { alocacaoId: a.id, rotulo: nome }); }}>
                                {nome}
                                <button type="button" className="x" aria-label={`Remover ${nome}`}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); acoes.removerAlocacao(a.id); }}>×</button>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      {arraste && <div className="drag-ghost" style={{ left: arraste.x, top: arraste.y }}>{arraste.rotulo}</div>}
    </section>
  );
}
