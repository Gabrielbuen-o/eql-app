import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDias, diaSemana, fmt, hoje, saudacao, supabase, tipoRelatorio } from './lib.js';
import { VerRelatorio, contagem, hora } from './Campo.jsx';
import { navegar, useCaminho } from './rota.js';

// Portal do cliente (Help, Ageplan…): só as obras do grupo dele, a equipe e os relatórios concluídos.
// Nenhum valor, custo, faturamento, frota ou dado de outro cliente — o banco já entrega só isso (portal_cliente).
// Endereços: /inicio · /obras/<id> · /relatorios/<id>

const FASE = {
  orcamento: { nome: 'Planejada', cls: 'plan' },
  aprovacao: { nome: 'Planejada', cls: 'plan' },
  execucao: { nome: 'Em execução', cls: 'exec' },
  entrega: { nome: 'Entregue', cls: 'ok' },
};
const faseDe = (o) => (o.arquivada ? { nome: 'Concluída', cls: 'ok' } : FASE[o.fase] || { nome: o.fase, cls: 'plan' });
const urlArquivo = (c) => (c ? supabase.storage.from('relatorios').getPublicUrl(c).data.publicUrl : '');
const dataBonita = (d) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const primeiro = (s) => (s || '').trim().split(/\s+/)[0];

export function PortalCliente({ eu, usuario, grupoComo, onSairComo }) {
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const caminho = useCaminho();
  const partes = caminho.split('/').filter(Boolean);
  const dentro = useRef(false); // navegou dentro do portal (o "voltar" fica no app)

  const carregar = useCallback(async () => {
    // administrador vendo como cliente usa a versão "como" (só administradores podem chamar)
    const { data, error } = grupoComo !== undefined
      ? await supabase.rpc('portal_cliente_como', { p_grupo: grupoComo })
      : await supabase.rpc('portal_cliente');
    if (error) setErro(/portal_cliente|function/i.test(error.message) ? `O portal ainda não foi liberado no banco (arquivo ${grupoComo !== undefined ? '17_ver_como.sql' : '15_portal_cliente.sql'}).` : error.message);
    else { setErro(''); setP(data); }
  }, [grupoComo]);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000); // relatório novo aparece sozinho
    const vis = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [carregar]);

  // endereço desconhecido → início
  const rotaOk = partes.length === 0 || (partes[0] === 'inicio' && partes.length === 1) || (['obras', 'relatorios'].includes(partes[0]) && partes.length === 2);
  useEffect(() => { if (!rotaOk) navegar('/inicio', { replace: true, forcar: true }); }, [rotaOk]);
  useEffect(() => { document.title = `Portal ${p?.grupo || 'do cliente'} · EQL Group`; }, [p?.grupo]);

  const ir = (c) => { dentro.current = true; navegar(c); window.scrollTo(0, 0); };
  const voltar = (fallback) => { if (dentro.current) window.history.back(); else navegar(fallback, { replace: true }); };

  const d = useMemo(() => {
    if (!p) return null;
    const obras = p.obras || [];
    const porId = Object.fromEntries(obras.map((o) => [o.id, o]));
    const funcionarios = [...new Map((p.equipe || []).map((e) => [e.funcionario_id, { id: e.funcionario_id, nome: e.nome, funcao: e.funcao }])).values()];
    (p.relatorios || []).forEach((r) => { if (r.funcionario_id && !funcionarios.some((f) => f.id === r.funcionario_id)) funcionarios.push({ id: r.funcionario_id, nome: r.funcionario }); });
    // o visualizador de relatório usa o mesmo formato do resto do app
    const dadosRel = { demandas: obras, funcionarios, perfis: [], urlArquivo };
    return { obras, porId, dadosRel, equipe: p.equipe || [], relatorios: p.relatorios || [] };
  }, [p]);

  const relAberto = partes[0] === 'relatorios' && d ? d.relatorios.find((r) => r.id === partes[1]) : null;

  return (
    <div className="pc">
      <header className="pc-topo">
        <button type="button" className="pc-marca" onClick={() => ir('/inicio')}>
          <img src="/img/logo-96.png?v=2" alt="" width="36" height="36" />
          <span><b>EQL Group</b><small>Portal {p?.grupo || 'do cliente'}</small></span>
        </button>
        <div className="pc-conta">
          <span className="pc-quem">{eu?.nome || usuario.email}</span>
          <button type="button" className="pill ghost" onClick={() => (onSairComo ? onSairComo() : window.confirm('Sair da sua conta?') && supabase.auth.signOut())}>Sair</button>
        </div>
      </header>

      <main className="pc-main">
        {erro ? <section className="card"><p>{erro}</p></section>
          : !d ? <p className="empty">Carregando…</p>
          : !p.grupo ? (
            <section className="card pc-vazio">
              <h2>Seu acesso ainda não está ligado a uma empresa</h2>
              <p className="note">Peça para a EQL vincular o seu usuário (Help, Ageplan…). Assim que fizer, as suas obras aparecem aqui.</p>
            </section>
          ) : partes[0] === 'obras' ? (
            d.porId[partes[1]]
              ? <PaginaObra o={d.porId[partes[1]]} d={d} ir={ir} voltar={() => voltar('/inicio')} />
              : <section className="card pc-vazio"><h2>Obra não encontrada</h2><button type="button" className="pill" onClick={() => ir('/inicio')}>Ver minhas obras</button></section>
          ) : (
            <Inicio p={p} d={d} eu={eu} ir={ir} />
          )}
      </main>

      {relAberto && <VerRelatorio r={relAberto} dados={d.dadosRel} onFechar={() => voltar('/inicio')} exportarRfi />}
    </div>
  );
}

function Inicio({ p, d, eu, ir }) {
  const h = hoje();
  const ativas = d.obras.filter((o) => !o.arquivada && o.fase !== 'entrega');
  const concluidas = d.obras.filter((o) => o.arquivada || o.fase === 'entrega');
  const equipeHoje = d.equipe.filter((e) => e.dia === h);
  const obrasHoje = [...new Set(equipeHoje.map((e) => e.demanda_id))].map((id) => d.porId[id]).filter(Boolean);
  const relHoje = d.relatorios.filter((r) => r.dia === h);
  const [qtd, setQtd] = useState(8);
  const [verConcluidas, setVerConcluidas] = useState(false);
  const nome = primeiro(eu?.nome);

  return (
    <>
      <header className="hero pc-hero">
        <div className="hero-txt">
          <p className="hero-data">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{saudacao()}{nome ? `, ${nome}` : ''}.</h1>
          <p className="hero-linha">
            {obrasHoje.length
              ? <>Hoje a EQL está em <b>{obrasHoje.length} {obrasHoje.length === 1 ? 'obra' : 'obras'}</b> da {p.grupo}.</>
              : <>Nenhuma equipe da EQL em obras da {p.grupo} hoje.</>}
          </p>
        </div>
        <div className="pc-kpis">
          <div><b>{ativas.length}</b><span>em andamento</span></div>
          <div><b>{relHoje.length}</b><span>{relHoje.length === 1 ? 'relatório hoje' : 'relatórios hoje'}</span></div>
          <div><b>{concluidas.length}</b><span>{concluidas.length === 1 ? 'concluída' : 'concluídas'}</span></div>
        </div>
      </header>

      {obrasHoje.length > 0 && (
        <section className="pc-sec">
          <h2 className="pc-h2">Equipes em campo hoje</h2>
          <div className="pc-hoje">
            {obrasHoje.map((o) => (
              <button key={o.id} type="button" className="pc-hoje-card" onClick={() => ir('/obras/' + o.id)}>
                <span className="pc-hoje-obra">{o.nome}</span>
                <span className="pc-pessoas">{equipeHoje.filter((e) => e.demanda_id === o.id).map((e) => <Pessoa key={e.funcionario_id} e={e} />)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="pc-colunas">
        <section className="pc-sec">
          <h2 className="pc-h2">Últimos relatórios</h2>
          {d.relatorios.length === 0 && <p className="card note">Os relatórios das suas obras (início do dia, fim do dia, limpeza…) aparecem aqui assim que a equipe enviar.</p>}
          <div className="pc-feed">
            {d.relatorios.slice(0, qtd).map((r) => <CartaoRel key={r.id} r={r} obra={d.porId[r.demanda_id]} onAbrir={() => ir('/relatorios/' + r.id)} />)}
          </div>
          {d.relatorios.length > qtd && <button type="button" className="pill pc-mais" onClick={() => setQtd(qtd + 12)}>Mostrar mais relatórios</button>}
        </section>

        <section className="pc-sec">
          <h2 className="pc-h2">Suas obras</h2>
          <div className="pc-obras">
            {ativas.map((o) => <CartaoObra key={o.id} o={o} d={d} onAbrir={() => ir('/obras/' + o.id)} />)}
            {!ativas.length && <p className="card note">Nenhuma obra em andamento no momento.</p>}
          </div>
          {concluidas.length > 0 && (
            <>
              <button type="button" className="link-btn pc-mais" onClick={() => setVerConcluidas(!verConcluidas)}>
                {verConcluidas ? 'Esconder concluídas' : `Ver ${concluidas.length} ${concluidas.length === 1 ? 'obra concluída' : 'obras concluídas'}`}
              </button>
              {verConcluidas && <div className="pc-obras">{concluidas.map((o) => <CartaoObra key={o.id} o={o} d={d} onAbrir={() => ir('/obras/' + o.id)} />)}</div>}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function PaginaObra({ o, d, ir, voltar }) {
  const h = hoje();
  const f = faseDe(o);
  const rels = d.relatorios.filter((r) => r.demanda_id === o.id);
  const porDia = [...new Set(rels.map((r) => r.dia))].map((dia) => [dia, rels.filter((r) => r.dia === dia)]);
  const eq = d.equipe.filter((e) => e.demanda_id === o.id);
  const proximos = [...new Set(eq.filter((e) => e.dia >= h && e.dia <= addDias(h, 14)).map((e) => e.dia))].sort();
  const ultimos = [...new Map(eq.filter((e) => e.dia < h).sort((a, b) => b.dia.localeCompare(a.dia)).map((e) => [e.funcionario_id, e])).values()];
  const pct = Math.max(0, Math.min(100, Number(o.percentual) || 0));

  return (
    <>
      <button type="button" className="pill ghost pc-voltar" onClick={voltar}>‹ Voltar</button>
      <section className="card pc-obra-topo">
        <div className="pc-obra-tit">
          <span className={'pc-fase ' + f.cls}>{f.nome}</span>
          <h1>{o.nome}</h1>
          <p className="note">
            {o.inicio ? `Início ${fmt(o.inicio)}` : ''}{o.inicio && o.entrega ? ' · ' : ''}{o.entrega ? `${f.cls === 'ok' ? 'Entrega' : 'Previsão de entrega'} ${fmt(o.entrega)}` : ''}
          </p>
        </div>
        <div className="pc-prog" aria-label={`Andamento ${pct}%`}>
          <div className="pc-prog-num"><b>{pct}%</b><span>concluído</span></div>
          <div className="pc-barra"><i style={{ width: pct + '%' }} /></div>
        </div>
      </section>

      <div className="pc-colunas obra">
        <section className="pc-sec">
          <h2 className="pc-h2">Relatórios da obra <small>{rels.length}</small></h2>
          {!rels.length && <p className="card note">Nenhum relatório enviado ainda para esta obra.</p>}
          {porDia.map(([dia, rs]) => (
            <div key={dia} className="pc-dia">
              <h3>{dia === h ? 'Hoje' : dia === addDias(h, -1) ? 'Ontem' : dataBonita(dia)}</h3>
              <div className="pc-feed">{rs.map((r) => <CartaoRel key={r.id} r={r} onAbrir={() => ir('/relatorios/' + r.id)} />)}</div>
            </div>
          ))}
        </section>

        <aside className="pc-sec">
          <h2 className="pc-h2">Equipe</h2>
          <div className="card stack pc-equipe">
            {proximos.length ? proximos.map((dia) => (
              <div key={dia} className="pc-eq-dia">
                <span className="pc-eq-data">{dia === h ? 'Hoje' : dia === addDias(h, 1) ? 'Amanhã' : `${diaSemana(dia)} ${fmt(dia)}`}</span>
                <span className="pc-pessoas">{eq.filter((e) => e.dia === dia).map((e) => <Pessoa key={e.funcionario_id} e={e} />)}</span>
              </div>
            )) : <p className="note">Sem equipe programada para os próximos dias.</p>}
            {ultimos.length > 0 && (
              <div className="pc-eq-dia passado">
                <span className="pc-eq-data">Já trabalharam aqui</span>
                <span className="pc-pessoas">{ultimos.map((e) => <Pessoa key={e.funcionario_id} e={e} />)}</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function CartaoObra({ o, d, onAbrir }) {
  const f = faseDe(o);
  const pct = Math.max(0, Math.min(100, Number(o.percentual) || 0));
  const ultimo = d.relatorios.find((r) => r.demanda_id === o.id);
  const hojeEq = d.equipe.filter((e) => e.demanda_id === o.id && e.dia === hoje());
  return (
    <button type="button" className="card pc-obra" onClick={onAbrir}>
      <div className="pc-obra-l1"><b>{o.nome}</b><span className={'pc-fase ' + f.cls}>{f.nome}</span></div>
      <div className="pc-barra fina"><i style={{ width: pct + '%' }} /></div>
      <div className="pc-obra-l2">
        <span>{pct}%{o.entrega ? ` · ${f.cls === 'ok' ? 'entregue' : 'previsão'} ${fmt(o.entrega)}` : ''}</span>
        <span>{hojeEq.length ? `${hojeEq.length} ${hojeEq.length === 1 ? 'pessoa' : 'pessoas'} hoje` : ultimo ? `último relatório ${fmt(ultimo.dia)}` : 'sem relatórios'}</span>
      </div>
    </button>
  );
}

function CartaoRel({ r, obra, onAbrir }) {
  const fotos = (r.arquivos || []).filter((a) => a.tipo !== 'video');
  const tem = (r.arquivos || []).length;
  return (
    <button type="button" className="card pc-rel" onClick={onAbrir}>
      <div className="pc-rel-mini">
        {fotos.slice(0, 3).map((a) => <img key={a.caminho} src={urlArquivo(a.miniatura || a.caminho)} alt="" loading="lazy" />)}
        {!fotos.length && <span className="pc-rel-semfoto">{tem ? 'vídeo' : 'sem fotos'}</span>}
        {tem > 3 && <span className="pc-rel-mais">+{tem - 3}</span>}
      </div>
      <div className="pc-rel-txt">
        <span className="pc-rel-tipo">{tipoRelatorio[r.tipo]?.nome || r.tipo}</span>
        {obra && <b>{obra.nome}</b>}
        <span className="note">{fmt(r.dia)} · {hora(r.criado_em)}{r.funcionario ? ` · ${primeiro(r.funcionario)}` : ''} · {contagem(r)}</span>
      </div>
    </button>
  );
}

const Pessoa = ({ e }) => (
  <span className="pc-pessoa" title={e.funcao || ''}>
    <i>{(e.nome || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</i>{e.nome}{e.funcao ? <small> · {e.funcao}</small> : null}
  </span>
);
