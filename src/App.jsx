import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SLOGAN, aplicarPrefs, configurado, papelNome, permissoes, supabase } from './lib.js';
import { useData } from './useData.js';
import { useCustos } from './custos.js';
import { Demandas } from './Demandas.jsx';
import { Equipe } from './Equipe.jsx';
import { Frotas } from './Frotas.jsx';
import { Configuracoes } from './Configuracoes.jsx';
import { Avatar } from './Avatar.jsx';
import { Resultados } from './Resultados.jsx';
import { Inicio } from './Inicio.jsx';
import { Fabrica } from './Fabrica.jsx';
import { AppCampo } from './Campo.jsx';
import { Relatorios } from './Relatorios.jsx';
import { CalendarioObras } from './CalendarioObras.jsx';
import { EstoqueEPI } from './EstoqueEPI.jsx';
import { Orcamentos } from './Orcamentos.jsx';
import { PortalCliente } from './PortalCliente.jsx';
import { AbasCelular, GavetaMenu, TopoCelular } from './MenuCelular.jsx';
import { tipoRelatorio } from './lib.js';
import { TITULOS, caminhoDaAba, lerCaminho, navegar, useCaminho } from './rota.js';

// mostrar: quem vê a aba (a partir das permissões)
const ABAS = [
  { id: 'inicio', nome: 'Início', mostrar: (p) => p.verOperacao },
  { id: 'demandas', nome: 'Demandas', mostrar: () => true,
    sub: [{ id: 'obras', nome: 'Obras', mostrar: () => true },
      { id: 'fabrica', nome: 'Fábrica', mostrar: (p) => p.verOperacao }] },
  { id: 'calendario', nome: 'Calendário de obras', mostrar: (p) => p.verOperacao,
    sub: [{ id: 'agenda', nome: 'Agenda', mostrar: () => true },
      { id: 'relatorios', nome: 'Relatórios de obra', mostrar: (p) => p.gestao }] },
  { id: 'orcamentos', nome: 'Orçamentos', mostrar: (p) => p.admin },
  { id: 'equipes', nome: 'Equipes', mostrar: (p) => p.gestao },
  { id: 'frotas', nome: 'Frotas', mostrar: (p) => p.gestao },
  { id: 'epi', nome: 'Estoque de EPI', mostrar: (p) => p.gestao },
  { id: 'financeiro', nome: 'Financeiro', mostrar: (p) => p.verFinanceiro },
  { id: 'rh', nome: 'RH & Ponto', mostrar: (p) => p.admin, breve: 'Cadastro de funcionários, ponto diário e documentos.' },
  { id: 'aquisicao', nome: 'Aquisição', mostrar: (p) => p.admin, breve: 'Canais e funis de aquisição, investimento e retorno por canal.' },
  { id: 'config', nome: 'Configurações', mostrar: () => true },
];

export function App() {
  const [sessao, setSessao] = useState(undefined);

  useEffect(() => {
    aplicarPrefs(lerLocal('eql-prefs'));
    if (!configurado) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configurado) return <SemConfig />;
  if (sessao === undefined) return <div className="login"><p className="empty">Carregando…</p></div>;
  if (!sessao) return <Login />;
  return <Painel usuario={sessao.user} />;
}

function Painel({ usuario }) {
  // a tela vem do endereço (app.eqlgroup.com.br/orcamentos, /calendario/relatorios, /tv/calendario…)
  const caminho = useCaminho();
  const rota = lerCaminho(caminho);
  const aba = rota.aba || 'inicio';
  const tv = rota.tv;
  const setAba = (id) => navegar(caminhoDaAba(id));
  const [toast, setToast] = useState(null);
  const [menuCelular, setMenuCelular] = useState(false);
  const avisar = useCallback((msg) => {
    setToast(msg);
    clearTimeout(window.__eqlToast);
    window.__eqlToast = setTimeout(() => setToast(null), 4500);
  }, []);
  const dados = useData(avisar, usuario.id);
  const euReal = dados.perfis.find((p) => p.id === usuario.id);
  // Antes de rodar o SQL de acessos (sem tabela de perfis), todos continuam com acesso total.
  const papelReal = euReal?.papel || (dados.faltando.has('perfis') ? 'admin' : 'campo');

  // "Ver como" (só administradores): mostra o app como outra pessoa vê. Vale só nesta aba do navegador.
  const [comoId, setComoId] = useState(() => { try { return sessionStorage.getItem('eql-ver-como') || null; } catch { return null; } });
  const como = papelReal === 'admin' && comoId ? perfilComo(comoId, dados.perfis, euReal) : null;
  const verComo = useCallback((id) => {
    try { if (id) sessionStorage.setItem('eql-ver-como', id); else sessionStorage.removeItem('eql-ver-como'); } catch { /* ignora */ }
    setComoId(id || null);
    navegar(id ? '/' : '/configuracoes', { forcar: true });
    window.scrollTo(0, 0);
  }, []);
  const eu = como || euReal;
  const papel = como ? como.papel : papelReal;
  const pode = permissoes(papel);
  const custos = useCustos(dados, pode.admin && !dados.carregando);
  const abas = ABAS.filter((a) => a.mostrar(pode));
  const [abaPrincipal, subAba] = aba.split('/');
  const atual = abas.find((a) => a.id === abaPrincipal) || abas.find((a) => a.id === 'inicio') || abas.find((a) => a.id === 'demandas'); // sem permissão: Início (cliente não tem Início: cai em Demandas)
  // aba com sub-abas abre direto na primeira (Demandas → Obras)
  const sub = atual.sub ? (atual.sub.find((x) => x.id === subAba && x.mostrar(pode)) || atual.sub[0]).id : null;
  const idTela = atual.id + (sub ? '/' + sub : '');
  const base = caminhoDaAba(idTela);
  const resto = rota.aba === idTela || rota.aba === atual.id ? rota.resto : [];
  const setTv = (v) => navegar((v ? '/tv' : '') + base + (resto.length ? '/' + resto.join('/') : ''), { replace: true, forcar: true });
  const irSub = (partes, opc) => navegar(base + (partes ? '/' + partes : ''), opc);

  // endereço vazio, desconhecido ou sem permissão → corrige para a tela certa (sem criar "voltar")
  const certo = (tv ? '/tv' : '') + base + (resto.length ? '/' + resto.join('/') : '');
  useEffect(() => {
    if (dados.carregando || pode.soCliente) return; // o portal do cliente cuida dos próprios endereços
    if (pode.soCampo) { if (caminho !== '/') navegar('/', { replace: true, forcar: true }); return; }
    if (caminho !== certo) navegar(certo, { replace: true, forcar: true });
  }, [caminho, certo, dados.carregando, pode.soCampo, pode.soCliente]);
  useEffect(() => {
    if (pode.soCliente) return;
    document.title = pode.soCampo ? 'EQL Group' : `${TITULOS[idTela] || atual.nome} · EQL Group`;
  }, [idTela, pode.soCampo, pode.soCliente]); // eslint-disable-line react-hooks/exhaustive-deps

  // preferências salvas no perfil valem em qualquer aparelho
  const prefsPerfil = JSON.stringify(euReal?.preferencias || {});
  useEffect(() => {
    const p = JSON.parse(prefsPerfil);
    // pessoal de campo: sempre o tema claro, em qualquer aparelho
    if (euReal?.papel === 'campo') { const claro = { ...(lerLocal('eql-prefs') || {}), ...p, tema: 'claro' }; aplicarPrefs(claro); gravarLocal('eql-prefs', claro); return; }
    if (Object.keys(p).length) { aplicarPrefs(p); gravarLocal('eql-prefs', p); }
  }, [prefsPerfil, euReal?.papel]);
  // vendo como campo/cliente: tema claro só na tela (as suas preferências não mudam); ao sair, volta o seu
  useEffect(() => {
    if (como && (como.papel === 'campo' || como.papel === 'cliente')) document.documentElement.dataset.tema = 'claro';
    else aplicarPrefs(lerLocal('eql-prefs'));
  }, [como?.id, como?.papel]); // eslint-disable-line react-hooks/exhaustive-deps

  // navega para uma aba (e, em Demandas, já com um filtro dos cartões)
  const irPara = (destino, filtro) => {
    try { if (filtro) sessionStorage.setItem('eql-destaque', filtro); else sessionStorage.removeItem('eql-destaque'); } catch { /* ignora */ }
    setAba(destino);
    window.scrollTo(0, 0);
  };

  const salvarPrefs = async (p) => {
    aplicarPrefs(p);
    gravarLocal('eql-prefs', p);
    if (euReal) await dados.atualizarPerfil(euReal.id, { preferencias: p });
  };

  // relatório novo chegando do campo: avisa quem está no escritório
  const vistos = useRef(null);
  useEffect(() => {
    const lista = dados.relatorios || [];
    if (dados.carregando) return;
    // só avisa quando o relatório é concluído (em andamento não conta)
    const chave = (r) => r.id + (r.status === 'rascunho' ? ':r' : '');
    if (!vistos.current) { vistos.current = new Set(lista.map(chave)); return; }
    const novos = lista.filter((r) => r.status !== 'rascunho' && !vistos.current.has(chave(r)));
    lista.forEach((r) => vistos.current.add(chave(r)));
    if (!pode.gestao || !novos.length) return;
    const r = novos[novos.length - 1];
    if (r.autor_id === usuario.id) return;
    const obra = dados.demandas.find((d) => d.id === r.demanda_id)?.nome || 'obra';
    const quem = dados.funcionarios.find((f) => f.id === r.funcionario_id)?.nome;
    avisar(`Novo relatório: ${tipoRelatorio[r.tipo]?.nome || r.tipo} · ${obra}${quem ? ' · ' + quem : ''}`);
  }, [dados.relatorios, dados.carregando]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.classList.toggle('tv', tv);
  }, [tv]);
  // celular: a aba atual aparece na barra de abas (que rola de lado)
  useEffect(() => {
    if (!window.matchMedia?.('(max-width: 899px)').matches) return;
    const el = document.querySelector('.nav button.on, .nav button.parent');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [idTela]);
  // saiu da tela cheia (Esc) → sai do modo TV
  const setTvRef = useRef(setTv); setTvRef.current = setTv;
  useEffect(() => {
    const sair = () => !document.fullscreenElement && document.body.classList.contains('tv') && setTvRef.current(false);
    document.addEventListener('fullscreenchange', sair);
    return () => document.removeEventListener('fullscreenchange', sair);
  }, []);

  // cliente (Help, Ageplan…): portal próprio, sem menu do sistema
  if (pode.soCliente) {
    return (
      <>
        {dados.carregando ? <div className="login"><p className="empty">Carregando…</p></div>
          : <PortalCliente eu={eu} usuario={usuario} grupoComo={como ? como.cliente_grupo || '' : undefined} onSairComo={como ? () => verComo(null) : undefined} />}
        {como && <FaixaComo como={como} sair={() => verComo(null)} />}
      </>
    );
  }

  // pessoal de campo: uma tela só (obra do dia + novo relatório)
  if (pode.soCampo) {
    return (
      <>
        {dados.carregando ? <div className="login"><p className="empty">Carregando…</p></div> : <AppCampo key={como?.id || 'eu'} dados={dados} eu={eu} avisar={avisar} previa={!!como} />}
        {toast && createPortal(<div className="toast" role="status">{toast}</div>, document.body)}
        {como && <FaixaComo como={como} sair={() => verComo(null)} />}
      </>
    );
  }

  return (
    <div className={'page' + (tv ? '' : ' com-abas-celular')}>
      {!tv && (
        <>
          <TopoCelular abas={abas} atual={atual} sub={sub} pode={pode} eu={eu} usuario={usuario} irAba={setAba} abrirMenu={() => setMenuCelular(true)} />
          <AbasCelular abas={abas} atual={atual} irAba={setAba} />
          <GavetaMenu aberto={menuCelular} fechar={() => setMenuCelular(false)} abas={abas} atual={atual} sub={sub} pode={pode} eu={eu} usuario={usuario}
            papelTexto={pode.admin ? papelNome[papel] : (eu?.email || usuario.email)} irAba={setAba} />
        </>
      )}
      <div className="shell">
        {!tv && (
          <nav className="sidebar" aria-label="Menu principal">
            <Marca />
            <div className="nav">
              {abas.map((a) => [
                <button key={a.id} type="button" className={atual.id === a.id ? (sub ? 'parent' : 'on') : ''}
                  aria-current={atual.id === a.id && !sub ? 'page' : undefined}
                  onClick={() => setAba(a.id)}>
                  <span>{a.nome}</span>
                  {a.breve && <span className="soon">em breve</span>}
                </button>,
                atual.id === a.id && a.sub?.filter((x) => x.mostrar(pode)).map((x) => (
                  <button key={a.id + '/' + x.id} type="button" className={'sub' + (sub === x.id ? ' on' : '')}
                    aria-current={sub === x.id ? 'page' : undefined} onClick={() => setAba(a.id + '/' + x.id)}>
                    <span>{x.nome}</span>
                  </button>
                )),
              ])}
            </div>
            {/* celular: as sub-abas (ex.: Obras / Fábrica) ganham uma linha própria embaixo das abas */}
            {atual.sub && (
              <div className="nav-sub" aria-label={`Seções de ${atual.nome}`}>
                {atual.sub.filter((x) => x.mostrar(pode)).map((x) => (
                  <button key={x.id} type="button" className={sub === x.id ? 'on' : ''} aria-current={sub === x.id ? 'page' : undefined}
                    onClick={() => setAba(atual.id + '/' + x.id)}>{x.nome}</button>
                ))}
              </div>
            )}
            <button type="button" className="me" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => setAba('config')}>
              <Avatar perfil={eu} nome={usuario.email} online />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="me-nome">{eu?.nome || usuario.email}</span>
                {/* nível de acesso só aparece para administrador */}
                <span className="me-email">{pode.admin ? papelNome[papel] : eu?.email || usuario.email}</span>
              </div>
            </button>
          </nav>
        )}
        <main className="main">
          <ProtecaoErro chave={idTela}>
          {dados.carregando ? (
            <p className="empty">Carregando dados…</p>
          ) : atual.id === 'demandas' && sub === 'fabrica' ? (
            <Fabrica dados={dados} tv={tv} setTv={setTv} pode={pode} custos={custos.porDemanda} />
          ) : atual.id === 'demandas' ? (
            <Demandas key="obras" modo="obras" dados={dados} tv={tv} setTv={setTv} avisar={avisar} pode={pode} custos={custos.porDemanda} />
          ) : atual.id === 'calendario' && sub === 'relatorios' ? (
            <Relatorios dados={dados} pode={pode} abertoId={resto[0] || null} irSub={irSub} />
          ) : atual.id === 'calendario' ? (
            <CalendarioObras dados={dados} tv={tv} setTv={setTv} avisar={avisar} pode={pode} />
          ) : atual.id === 'equipes' ? (
            <Equipe dados={dados} pode={pode} />
          ) : atual.id === 'orcamentos' ? (
            <Orcamentos dados={dados} eu={eu} pode={pode} avisar={avisar} resto={resto} irSub={irSub} />
          ) : atual.id === 'epi' ? (
            <EstoqueEPI dados={dados} pode={pode} avisar={avisar} />
          ) : atual.id === 'frotas' ? (
            <Frotas dados={dados} />
          ) : atual.id === 'inicio' ? (
            <Inicio dados={dados} eu={eu} irPara={irPara} tv={tv} setTv={setTv} pode={pode} porDemanda={custos.porDemanda} />
          ) : atual.id === 'financeiro' ? (
            <Resultados dados={dados} porDemanda={custos.porDemanda} />
          ) : atual.id === 'config' ? (
            <Configuracoes dados={dados} eu={eu} usuario={usuario} pode={pode} salvarPrefs={salvarPrefs} avisar={avisar} verComo={papelReal === 'admin' && !como ? verComo : null} />
          ) : (
            <>
              <header className="head"><h1>{atual.nome}</h1></header>
              <section className="card placeholder">
                <span className="tag">Módulo previsto</span>
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>{atual.nome}</h2>
                <p>{atual.breve}</p>
              </section>
            </>
          )}
          </ProtecaoErro>
        </main>
      </div>
      {toast && createPortal(<div className="toast" role="status">{toast}</div>, document.body)}
      {como && <FaixaComo como={como} sair={() => verComo(null)} />}
    </div>
  );
}

// "Ver como": um usuário (id) ou um cliente sem usuário ("cliente:Help")
function perfilComo(id, perfis, euReal) {
  if (id.startsWith('cliente:')) {
    const g = id.slice(8);
    return { id, nome: `Cliente ${g}`, email: '', papel: 'cliente', cliente_grupo: g, preferencias: {} };
  }
  if (id === 'campo:compartilhado') return { id, nome: 'Campo', email: '', papel: 'campo', funcionario_id: null, preferencias: {} };
  const p = perfis.find((x) => x.id === id);
  return p && p.id !== euReal?.id ? p : null;
}

// Faixa fixa no topo enquanto o administrador vê o app como outra pessoa (cadeia abaixo).
// Fica acima de tudo e empurra o conteúdo para baixo: não cobre botões nem atrapalha o uso.
function FaixaComo({ como, sair }) {
  useEffect(() => {
    document.body.classList.add('com-faixa');
    return () => document.body.classList.remove('com-faixa');
  }, []);
  const quem = como.nome || como.email;
  const nivel = `${papelNome[como.papel]}${como.papel === 'cliente' && como.cliente_grupo ? ` · ${como.cliente_grupo}` : ''}`;
  return createPortal(
    <div className="faixa-como" role="region" aria-label="Visualização de cadeia abaixo">
      <span className="faixa-como-txt">
        <span className="faixa-como-tag"><span className="faixa-longo">Visualização de </span>cadeia abaixo</span>
        <span><span className="faixa-longo">Você está vendo</span><span className="faixa-curto">Vendo</span> como <b>{quem}</b> ({nivel})<span className="faixa-como-extra"> · não é a sua visão oficial; o que fizer aqui vale de verdade</span></span>
      </span>
      <button type="button" className="faixa-como-btn" onClick={sair}>Voltar para a minha visão</button>
    </div>,
    document.body,
  );
}

function Marca() {
  return (
    <div className="brand">
      <img className="brand-logo" src="/img/logo-96.png" alt="" width="44" height="44" />
      <div>
        <div className="brand-name">EQL Group</div>
        <div className="brand-sub">{SLOGAN}</div>
      </div>
    </div>
  );
}

function Login() {
  // último e-mail usado fica salvo neste aparelho (a senha fica com o gerenciador de senhas do navegador)
  const [email, setEmail] = useState(() => lerLocal('eql-ultimo-email', false) || '');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) { setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message); return; }
    gravarLocal('eql-ultimo-email', email.trim(), false);
    // Chrome/Android: oferece salvar a senha (o app não recarrega a página, então avisamos o navegador)
    try {
      if (window.PasswordCredential && navigator.credentials?.store) {
        await navigator.credentials.store(new window.PasswordCredential({ id: email.trim(), password: senha, name: email.trim() }));
      }
    } catch { /* navegador sem suporte: tudo bem */ }
  };
  return (
    <div className="login">
      <form className="card" id="login" method="post" action="/" onSubmit={entrar} autoComplete="on">
        <Marca />
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Entrar</h1>
        {erro && <div className="err" role="alert">{erro}</div>}
        <label className="field" htmlFor="login-email"><span>E-mail</span>
          <input id="login-email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} />
        </label>
        <label className="field" htmlFor="login-senha"><span>Senha</span>
          <input id="login-senha" name="password" type="password" autoComplete="current-password"
            value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus={!!email} />
        </label>
        <button type="submit" className="pill lime" style={{ minHeight: 48 }} disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

function SemConfig() {
  return (
    <div className="login">
      <div className="card">
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Falta ligar o banco de dados</h1>
        <p className="note">
          Na Netlify, em <b>Site configuration → Environment variables</b>, crie <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b> com os valores do
          Supabase (Project Settings → API) e faça um novo deploy.
        </p>
      </div>
    </div>
  );
}

function lerLocal(k, json = true) {
  try { const v = localStorage.getItem(k); return json ? JSON.parse(v || 'null') : v; } catch { return null; }
}
function gravarLocal(k, v, json = true) {
  try { localStorage.setItem(k, json ? JSON.stringify(v) : v); } catch { /* ignora */ }
}

// Se alguma tela quebrar, mostra um aviso com botão de recarregar em vez da página em branco
class ProtecaoErro extends Component {
  constructor(p) { super(p); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error('[EQL] erro na tela', erro, info); }
  componentDidUpdate(prev) { if (prev.chave !== this.props.chave && this.state.erro) this.setState({ erro: null }); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <section className="card placeholder" role="alert">
        <span className="tag">Algo deu errado nesta tela</span>
        <p>Seus dados estão salvos. Recarregue a página; se continuar, mande um print desta mensagem.</p>
        <p className="note" style={{ fontFamily: 'ui-monospace, monospace' }}>{String(this.state.erro?.message || this.state.erro)}</p>
        <button type="button" className="pill lime" style={{ alignSelf: 'flex-start' }} onClick={() => window.location.reload()}>Recarregar</button>
      </section>
    );
  }
}
