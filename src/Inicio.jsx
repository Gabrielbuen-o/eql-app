import { useEffect, useState } from 'react';
import { PainelDesktop } from './PainelDesktop.jsx';
import { empresaPorId, faseNome, hoje, ordemGrupo, rotuloPrazo, situacao } from './lib.js';

const PESO = { atrasada: 0, urgente: 1, semana: 2, ok: 3, sem: 4 };

// Início: visão rápida da operação de hoje (pensada para o celular)
export function Inicio(props) {
  const grande = useTelaGrande();
  return grande ? <PainelDesktop {...props} /> : <InicioCelular {...props} />;
}

// computador / TV: painel completo; celular e tablet em pé: versão enxuta
function useTelaGrande() {
  const consulta = '(min-width: 1100px)';
  const [ok, setOk] = useState(() => window.matchMedia?.(consulta).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    const f = () => setOk(mq.matches);
    mq?.addEventListener?.('change', f);
    return () => mq?.removeEventListener?.('change', f);
  }, []);
  return ok;
}

function InicioCelular({ dados, eu, irPara }) {
  const dia = hoje();
  const abertas = dados.demandas.filter((d) => !d.arquivada);
  const sit = (d) => situacao(d, dia);
  const urgentes = abertas.filter((d) => ['urgente', 'semana'].includes(sit(d)));
  const atrasadas = abertas.filter((d) => sit(d) === 'atrasada');
  const concluidas = dados.demandas.filter((d) => d.arquivada);

  const nomeFunc = Object.fromEntries(dados.funcionarios.map((f) => [f.id, f.nome]));
  const nomeVeic = Object.fromEntries(dados.veiculos.map((v) => [v.id, v.nome]));
  const ativosF = dados.funcionarios.filter((f) => f.ativo);

  // quem está onde hoje
  const porObra = {};
  const add = (demandaId, tipo, nome) => {
    (porObra[demandaId] ||= { pessoas: [], veiculos: [] })[tipo].push(nome);
  };
  const hojeAloc = dados.alocacoes.filter((a) => a.dia === dia);
  hojeAloc.forEach((a) => add(a.demanda_id, 'pessoas', nomeFunc[a.funcionario_id] || '?'));
  dados.veiculo_alocacoes.filter((a) => a.dia === dia).forEach((a) => add(a.demanda_id, 'veiculos', nomeVeic[a.veiculo_id] || '?'));

  const fora = dados.ausencias.filter((a) => a.dia === dia);
  const idsFora = new Set(fora.map((a) => a.funcionario_id));
  const idsAlocados = new Set(hojeAloc.map((a) => a.funcionario_id));
  const livres = ativosF.filter((f) => !idsFora.has(f.id) && !idsAlocados.has(f.id));
  const emDobro = ativosF.filter((f) => hojeAloc.filter((a) => a.funcionario_id === f.id).length > 1);

  const demandaPorId = Object.fromEntries(dados.demandas.map((d) => [d.id, d]));
  const obrasHoje = Object.keys(porObra).map((id) => demandaPorId[id]).filter(Boolean)
    .sort((a, b) => (PESO[sit(a)] - PESO[sit(b)]) || (a.entrega || '9999').localeCompare(b.entrega || '9999'));
  const semNinguem = abertas
    .filter((d) => d.fase === 'execucao' && d.empresa !== 'eko' && !porObra[d.id])
    .sort((a, b) => (PESO[sit(a)] - PESO[sit(b)]) || ordemGrupo(a.grupo, b.grupo));

  const primeiroNome = (eu?.nome || '').split(' ')[0];
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  const cards = [
    { id: 'ativas', rotulo: 'Ativas', valor: abertas.length, dica: 'em andamento', cor: 'var(--lav)', filtro: null },
    { id: 'urgentes', rotulo: 'Urgentes', valor: urgentes.length, dica: 'entregar em até 7 dias', cor: 'var(--yellow)', filtro: 'semana' },
    { id: 'atrasadas', rotulo: 'Atrasadas', valor: atrasadas.length, dica: 'prazo já passou', cor: 'var(--red-soft)', filtro: 'atrasada' },
    { id: 'concluidas', rotulo: 'Concluídas', valor: concluidas.length, dica: 'arquivadas', cor: '#D5DCE4', filtro: 'concluidas' },
  ];

  return (
    <>
      <header className="head">
        <div>
          <h1>{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
          <p className="date">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="stats home-stats">
        {cards.map((c) => (
          <button key={c.id} type="button" className="stat" style={{ background: c.cor }} onClick={() => irPara('demandas', c.filtro)}
            aria-label={`${c.rotulo}: ${c.valor}. Abrir em Demandas`}>
            <span className="stat-label">{c.rotulo}</span>
            <span className="stat-value">{c.valor}</span>
            <span className="stat-hint">{c.dica}</span>
          </button>
        ))}
      </div>

      <section className="card stack" aria-label="Operação de hoje">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 className="card-title">Hoje</h2>
            <p className="note">
              {obrasHoje.length} {obrasHoje.length === 1 ? 'obra' : 'obras'} com equipe · {idsAlocados.size} {idsAlocados.size === 1 ? 'pessoa' : 'pessoas'} em campo
            </p>
          </div>
          <button type="button" className="pill ghost" onClick={() => irPara('calendario')}>Abrir calendário</button>
        </div>

        {!obrasHoje.length && (
          <p className="empty">Ninguém foi colocado em obra para hoje na agenda.</p>
        )}

        <div className="today-list">
          {obrasHoje.map((d) => {
            const s = sit(d);
            const g = porObra[d.id];
            const emp = empresaPorId[d.empresa];
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
                  {g.pessoas.map((n, i) => <span key={'p' + i} className="t-chip">{n}</span>)}
                  {g.veiculos.map((n, i) => <span key={'v' + i} className="t-chip veic">{n}</span>)}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="home-grid">
        <section className="card stack" aria-label="Fora hoje">
          <h2 className="card-title">Fora hoje <span className="count">{fora.length}</span></h2>
          {fora.length ? (
            <div className="today-chips">
              {fora.map((a) => (
                <span key={a.id} className={'t-chip ' + (a.tipo === 'ferias' ? 'ferias' : 'folga')}>
                  {nomeFunc[a.funcionario_id] || '?'} · {a.tipo === 'ferias' ? 'férias' : 'folga'}
                </span>
              ))}
            </div>
          ) : <p className="empty" style={{ padding: 0 }}>Ninguém de folga ou férias.</p>}
        </section>

        <section className="card stack" aria-label="Livres hoje">
          <h2 className="card-title">Livres hoje <span className="count">{livres.length}</span></h2>
          {livres.length ? (
            <div className="today-chips">{livres.map((f) => <span key={f.id} className="t-chip livre">{f.nome}</span>)}</div>
          ) : <p className="empty" style={{ padding: 0 }}>Todo mundo está alocado ou fora.</p>}
          {emDobro.length > 0 && (
            <p className="note warn-text">Em mais de uma obra hoje: {emDobro.map((f) => f.nome).join(', ')}</p>
          )}
        </section>

        <section className="card stack" aria-label="Em execução sem equipe hoje">
          <h2 className="card-title">Em execução sem ninguém hoje <span className="count">{semNinguem.length}</span></h2>
          {semNinguem.length ? (
            <ul className="plain-list">
              {semNinguem.slice(0, 12).map((d) => (
                <li key={d.id}>
                  <span className="dot" style={{ background: empresaPorId[d.empresa]?.cor }} />
                  <span className="pl-name">{d.nome}<small>{d.grupo}</small></span>
                  <span className={'due ' + sit(d)}>{rotuloPrazo(d, dia)}</span>
                </li>
              ))}
              {semNinguem.length > 12 && <li className="note">e mais {semNinguem.length - 12}…</li>}
            </ul>
          ) : <p className="empty" style={{ padding: 0 }}>Todas as obras em execução têm alguém hoje.</p>}
        </section>
      </div>
    </>
  );
}

