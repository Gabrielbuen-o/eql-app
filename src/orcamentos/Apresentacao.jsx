import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { brl, fmtM, fmtN } from './muros.js';
import { BENEFICIOS } from './proposta.js';

// Tela para mostrar ao cliente: só a saída comercial (pc). Nenhum custo, margem ou limite chega aqui.
// Dá para ajustar metragem, altura e prazo ao vivo durante o atendimento.
export function Apresentacao({ pc, travado, entrada, mudar, onFechar }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', f);
    const antes = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = antes; };
  }, [onFechar]);
  const unico = entrada.geometria.modo !== 'trechos';
  const L = Number(entrada.geometria.comprimento) || 0;

  return createPortal(
    <div className="apr" role="dialog" aria-modal="true" aria-label="Apresentação da proposta">
      <header className="apr-topo">
        <div className="apr-marca"><img src="/img/logo-96.png" alt="" width="40" height="40" /><div><b>EQL Group</b><span>Muros pré-moldados</span></div></div>
        {!pc.final && <span className="apr-previa">Prévia</span>}
        <button type="button" className="pill" onClick={onFechar}>Sair da apresentação</button>
      </header>

      <div className="apr-corpo">
        <section className="apr-hero">
          <span className="apr-kicker">{[pc.cliente, pc.local].filter(Boolean).join(' · ') || 'Proposta'}</span>
          <h1>{pc.projeto || 'Muro pré-moldado'}</h1>
          <div className="apr-total">
            <span>Investimento</span>
            <b>{brl(pc.total)}</b>
            <small>{brl(pc.porM)} por metro · {brl(pc.porM2)} por m²</small>
          </div>
        </section>

        {!travado && (
          <section className="apr-ajustes" aria-label="Ajustar ao vivo">
            {unico && (
              <div className="apr-aj"><span>Metragem</span>
                <div className="apr-step">
                  <button type="button" onClick={() => mudar('geometria.comprimento', Math.max(1, L - 10))} aria-label="Menos 10 metros">−10</button>
                  <b>{fmtM(L)}</b>
                  <button type="button" onClick={() => mudar('geometria.comprimento', L + 10)} aria-label="Mais 10 metros">+10</button>
                </div></div>
            )}
            <div className="apr-aj"><span>Altura</span>
              <div className="apr-step">{[1.5, 2, 2.5].map((h) => <button key={h} type="button" className={Math.abs(entrada.geometria.altura - h) < 1e-9 ? 'on' : ''} onClick={() => mudar('geometria.altura', h)}>{fmtN(h)} m</button>)}</div></div>
            {pc.temMontagem && (
              <div className="apr-aj"><span>Prazo desejado</span>
                <div className="apr-step">{['', 3, 5, 10].map((d) => <button key={d || 'x'} type="button" className={String(entrada.prazo.dias_desejados || '') === String(d) ? 'on' : ''} onClick={() => mudar('prazo.dias_desejados', d)}>{d ? `${d} dias` : 'livre'}</button>)}</div></div>
            )}
          </section>
        )}

        <section className="apr-grade">
          <Card rot="Extensão" v={fmtM(pc.L)} />
          <Card rot="Altura" v={fmtM(pc.altura)} />
          <Card rot="Área" v={`${fmtN(pc.area)} m²`} />
          <Card rot="Placas" v={pc.placas} sub={pc.placaDesc} />
          <Card rot="Mourões" v={pc.mouroes} sub={pc.mouraoDesc} />
          {pc.dias ? <Card rot="Montagem" v={`${pc.dias} dia${pc.dias > 1 ? 's' : ''}`} sub={`${pc.equipes} equipe${pc.equipes > 1 ? 's' : ''}`} destaque /> : <Card rot="Escopo" v="Material" />}
        </section>

        <section className="apr-dois">
          <div className="apr-card">
            <h2>O que está incluso</h2>
            <p className="apr-escopo">{pc.escopo}</p>
            <table className="apr-tab"><tbody>
              {pc.material.tabela > 0 && <tr><td>Material {pc.placasFornecidas || pc.mouroesFornecidos ? `(${[pc.placasFornecidas ? `${pc.placasFornecidas} placas` : '', pc.mouroesFornecidos ? `${pc.mouroesFornecidos} mourões` : ''].filter(Boolean).join(' e ')})` : ''}</td><td>{brl(pc.material.tabela)}</td></tr>}
              {pc.instalacao.tabela > 0 && <tr><td>Montagem das placas</td><td>{brl(pc.instalacao.tabela)}</td></tr>}
              {pc.adicionais.map((a) => <tr key={a.descricao}><td>{a.descricao}</td><td>{brl(a.valor)}</td></tr>)}
              {pc.desconto > 0 && <tr><td>Desconto</td><td>− {brl(pc.desconto)}</td></tr>}
              <tr className="tot"><td>Total</td><td>{brl(pc.total)}</td></tr>
            </tbody></table>
            {pc.dias && <p className="apr-nota">O prazo é da montagem. Fabricação, entrega, fundações e implantação dos mourões têm cronogramas próprios.</p>}
          </div>
          <div className="apr-card">
            <h2>Por que pré-moldado EQL</h2>
            <ul className="apr-benef">{BENEFICIOS.map((b) => <li key={b}>{b}</li>)}</ul>
            {pc.exclusoes.length > 0 && <><h3>Não incluso</h3><ul className="apr-exc">{pc.exclusoes.map((x) => <li key={x}>{x}</li>)}</ul></>}
            {(pc.pagamento || pc.validade) && <p className="apr-nota">{pc.pagamento && `Pagamento: ${pc.pagamento}. `}{pc.validade && `Proposta válida até ${pc.validade}.`}</p>}
            {!pc.final && <p className="apr-nota previa">Prévia: alguns itens ainda serão confirmados.</p>}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
const Card = ({ rot, v, sub, destaque }) => <div className={'apr-c' + (destaque ? ' destaque' : '')}><span>{rot}</span><b>{v}</b>{sub && <small>{sub}</small>}</div>;
