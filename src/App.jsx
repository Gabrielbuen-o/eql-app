import { Component, useCallback, useEffect, useState } from 'react';
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

// mostrar: quem vê a aba (a partir das permissões)
const ABAS = [
  { id: 'inicio', nome: 'Início', mostrar: (p) => p.verOperacao },
  { id: 'demandas', nome: 'Demandas', mostrar: () => true,
    sub: [{ id: 'obras', nome: 'Obras', mostrar: () => true }, { id: 'calendario', nome: 'Calendário', mostrar: (p) => p.verOperacao }] },
  { id: 'equipes', nome: 'Equipes', mostrar: (p) => p.gestao },
  { id: 'frotas', nome: 'Frotas', mostrar: (p) => p.gestao },
  { id: 'financeiro', nome: 'Financeiro', mostrar: (p) => p.verFinanceiro },
  { id: 'rh', nome: 'RH & Ponto', mostrar: (p) => p.gestao, breve: 'Cadastro de funcionários, ponto diário e documentos.' },
  { id: 'relatorios', nome: 'Relatórios de obra', mostrar: (p) => p.verOperacao, breve: 'Formulários por etapa com fotos, no padrão exigido pela Help e pela Agplan.' },
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
  const [aba, setAba] = useState('inicio'); // o app sempre abre no Início
  const [tv, setTv] = useState(false);
  const [toast, setToast] = useState(null);
  const avisar = useCallback((msg) => {
    setToast(msg);
    clearTimeout(window.__eqlToast);
    window.__eqlToast = setTimeout(() => setToast(null), 4500);
  }, []);
  const dados = useData(avisar, usuario.id);
  const eu = dados.perfis.find((p) => p.id === usuario.id);
  // Antes de rodar o SQL de acessos (sem tabela de perfis), todos continuam com acesso total.
  const papel = eu?.papel || (dados.faltando.has('perfis') ? 'admin' : 'campo');
  const pode = permissoes(papel);
  const custos = useCustos(dados, pode.admin && !dados.carregando);
  const abas = ABAS.filter((a) => a.mostrar(pode));
  const [abaPrincipal, subAba] = aba.split('/');
  const atual = abas.find((a) => a.id === abaPrincipal) || abas.find((a) => a.id === 'demandas'); // cliente não tem Início: cai em Demandas
  const sub = atual.sub?.find((x) => x.id === subAba && x.mostrar(pode))?.id || null;

  // preferências salvas no perfil valem em qualquer aparelho
  const prefsPerfil = JSON.stringify(eu?.preferencias || {});
  useEffect(() => {
    const p = JSON.parse(prefsPerfil);
    if (Object.keys(p).length) { aplicarPrefs(p); gravarLocal('eql-prefs', p); }
  }, [prefsPerfil]);

  // navega para uma aba (e, em Demandas, já com um filtro dos cartões)
  const irPara = (destino, filtro) => {
    try { if (filtro) sessionStorage.setItem('eql-destaque', filtro); else sessionStorage.removeItem('eql-destaque'); } catch { /* ignora */ }
    setAba(destino);
    window.scrollTo(0, 0);
  };

  const salvarPrefs = async (p) => {
    aplicarPrefs(p);
    gravarLocal('eql-prefs', p);
    if (eu) await dados.atualizarPerfil(eu.id, { preferencias: p });
  };

  useEffect(() => {
    document.body.classList.toggle('tv', tv);
    const sair = () => !document.fullscreenElement && setTv(false);
    document.addEventListener('fullscreenchange', sair);
    return () => document.removeEventListener('fullscreenchange', sair);
  }, [tv]);

  return (
    <div className="page">
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
            <button type="button" className="me" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => setAba('config')}>
              <Avatar perfil={eu} nome={usuario.email} online />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="me-nome">{eu?.nome || usuario.email}</span>
                <span className="me-email">{papelNome[papel]}</span>
              </div>
            </button>
          </nav>
        )}
        <main className="main">
          <ProtecaoErro chave={aba}>
          {dados.carregando ? (
            <p className="empty">Carregando dados…</p>
          ) : atual.id === 'demandas' ? (
            <Demandas key={sub || 'geral'} modo={sub || 'geral'} dados={dados} tv={tv} setTv={setTv} avisar={avisar} pode={pode} custos={custos.porDemanda} />
          ) : atual.id === 'equipes' ? (
            <Equipe dados={dados} pode={pode} />
          ) : atual.id === 'frotas' ? (
            <Frotas dados={dados} />
          ) : atual.id === 'inicio' ? (
            <Inicio dados={dados} eu={eu} irPara={irPara} tv={tv} setTv={setTv} />
          ) : atual.id === 'financeiro' ? (
            <Resultados dados={dados} porDemanda={custos.porDemanda} />
          ) : atual.id === 'config' ? (
            <Configuracoes dados={dados} eu={eu} usuario={usuario} pode={pode} salvarPrefs={salvarPrefs} avisar={avisar} />
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
    </div>
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
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  };
  return (
    <div className="login">
      <form className="card" onSubmit={entrar}>
        <Marca />
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Entrar</h1>
        {erro && <div className="err" role="alert">{erro}</div>}
        <label className="field"><span>E-mail</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field"><span>Senha</span>
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
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
