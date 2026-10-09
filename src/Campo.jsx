import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPRESAS, FOTOS_MAX, TIPOS_RELATORIO, dataLonga, empresaPorId, hoje, mensagemDoDia,
  saudacao, supabase, tipoRelatorio,
  ETAPA_MAX, recomendadas,
} from './lib.js';
import {
  concluirRascunho, configurarEnvio, descartarRascunho, guardarArquivo, importarDoBanco, lerArquivos, lerRascunho,
  ligarEnvio, listarRascunhos, novoId, salvarRascunho, tirarArquivo, useEnvio,
} from './rascunhos.js';
import { montarZip } from './zip.js';
import { VIDEO_MAX_SEG, carimbar, comprimirFoto, conferirVideo, coordTexto, lerExif, linkMapa, tamanho } from './midia.js';
import { CameraContinua, GravadorVideo } from './Camera.jsx';
import { useVoltarFecha } from './rota.js';
import { CAMPOS_RFI, camposIniciais, gerarRfiXlsx } from './rfiExcel.js';

// App do pessoal de campo: uma tela só — saudação, obra do dia e "Novo relatório".
export function AppCampo({ dados, eu, avisar, previa = false }) {
  // campo é sempre no tema claro
  useEffect(() => { document.documentElement.dataset.tema = 'claro'; }, []);
  const dia = hoje();
  const chaveLocal = previa ? 'eql-campo-funcionario-previa' : 'eql-campo-funcionario';
  const [escolhido, setEscolhido] = useState(() => { try { return localStorage.getItem(chaveLocal) || ''; } catch { return ''; } });
  const funcionarios = dados.funcionarios.filter((f) => f.ativo !== false);
  // login individual ligado a um funcionário (Configurações) ou login compartilhado: pergunta no celular
  const fid = eu?.funcionario_id || (funcionarios.some((f) => f.id === escolhido) ? escolhido : '');
  const func = funcionarios.find((f) => f.id === fid);
  const [novo, setNovo] = useState(false);
  const [continuar, setContinuar] = useState(null); // id do relatório em andamento aberto
  const [aberto, setAberto] = useState(null); // relatório de hoje aberto para ver
  // botão voltar do celular fecha a janela aberta (o relatório fica salvo), não o app
  useVoltarFecha(novo, () => setNovo(false));
  useVoltarFecha(!!continuar, () => setContinuar(null));
  useVoltarFecha(!!aberto, () => setAberto(null));
  const envio = useEnvio();

  // fila de envio: liga ao abrir o app e atualiza a lista quando algo sobe
  useEffect(() => {
    configurarEnvio({ depoisDeSalvar: () => dados.recarregarTabela?.('relatorios') });
    ligarEnvio();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // relatórios em andamento guardados neste celular
  const [andamento, setAndamento] = useState([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const rs = await listarRascunhos();
      const lista = [];
      for (const r of rs) {
        const arqs = await lerArquivos(r.id);
        lista.push({ ...r, total: arqs.length, faltam: arqs.filter((a) => !a.enviado).length });
      }
      if (vivo) setAndamento(lista.sort((a, b) => b.criadoEm - a.criadoEm));
    })().catch(() => {});
    return () => { vivo = false; };
  }, [envio.versao, novo, continuar]);
  // em andamento no sistema mas não neste celular (ex.: trocou de celular)
  const noBanco = (dados.relatorios || []).filter((r) => r.status === 'rascunho' && r.autor_id === eu?.id && !andamento.some((a) => a.id === r.id));
  const retomar = async (r) => { await importarDoBanco(r); setContinuar(r.id); };

  const [confirmar, setConfirmar] = useState(null); // funcionário tocado na lista, esperando "sou eu"
  const guardarLocal = (id) => { setEscolhido(id); try { localStorage.setItem(chaveLocal, id); } catch { /* ignora */ } };
  // "Sou eu": liga este login ao funcionário no sistema (fica valendo em qualquer aparelho)
  const escolher = async (f) => {
    setConfirmar(null);
    guardarLocal(f.id);
    if (eu && !eu.funcionario_id && !previa) { // vendo como: não liga o login de verdade
      const ok = await dados.atualizarPerfil(eu.id, { funcionario_id: f.id, nome: f.nome });
      if (ok) avisar(`Pronto, ${f.nome.split(' ')[0]}! Seu acesso já está ligado ao seu nome.`);
    }
  };
  const frasesAtivas = (dados.frases || []).filter((x) => x.ativo !== false).map((x) => x.texto);

  const minhasObras = useMemo(() => {
    const ids = [...new Set(dados.alocacoes.filter((a) => a.funcionario_id === fid && a.dia === dia).map((a) => a.demanda_id))];
    return ids.map((id) => dados.demandas.find((d) => d.id === id)).filter(Boolean);
  }, [dados.alocacoes, dados.demandas, fid, dia]);
  const colegas = (demandaId) => dados.alocacoes
    .filter((a) => a.demanda_id === demandaId && a.dia === dia && a.funcionario_id !== fid)
    .map((a) => dados.funcionarios.find((f) => f.id === a.funcionario_id)?.nome).filter(Boolean);
  const frota = (demandaId) => [...new Set(dados.veiculo_alocacoes
    .filter((a) => a.demanda_id === demandaId && a.dia === dia).map((a) => a.veiculo_id))]
    .map((id) => dados.veiculos.find((v) => v.id === id)).filter(Boolean);
  const fora = dados.ausencias.find((a) => a.funcionario_id === fid && a.dia === dia);
  const relatoriosHoje = (dados.relatorios || []).filter((r) => r.dia === dia && (r.funcionario_id === fid || minhasObras.some((o) => o.id === r.demanda_id)));
  const semBanco = dados.faltando.has('relatorios');


  if (!func) {
    return (
      <div className="campo">
        <TopoCampo previa={previa} />
        <section className="campo-ola">
          <h1>{saudacao()}!</h1>
          <p>{confirmar ? 'Confirme que é você:' : 'Quem é você? Toque no seu nome.'}</p>
        </section>
        {confirmar ? (
          <div className="campo-confirma">
            <strong>{confirmar.nome}</strong>
            <span className="note">Seu acesso vai ficar ligado a este nome. Para trocar depois, só pedindo ao escritório.</span>
            <button type="button" className="campo-novo" onClick={() => escolher(confirmar)}>Sim, sou eu</button>
            <button type="button" className="pill ghost" onClick={() => setConfirmar(null)}>Não, voltar</button>
          </div>
        ) : (
          <div className="campo-quem">
            {funcionarios.map((f) => <button key={f.id} type="button" onClick={() => setConfirmar(f)}>{f.nome}</button>)}
            {!funcionarios.length && <p className="empty">Nenhum funcionário cadastrado ainda.</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="campo">
      <TopoCampo previa={previa} />
      <section className="campo-ola">
        <p className="campo-data">{dataLonga().replace(/^./, (c) => c.toUpperCase())}</p>
        <h1>{saudacao()}, {func.nome.split(' ')[0]}!</h1>
        <p className="campo-frase">{mensagemDoDia(dia, frasesAtivas)}</p>
        {!eu?.funcionario_id && <button type="button" className="link-btn" onClick={() => guardarLocal('')}>Não é você? Trocar</button>}
      </section>

      <section className="campo-obra" aria-label="Sua obra hoje">
        {minhasObras.length ? (
          <>
            <span className="campo-rot">Hoje você está na obra</span>
            {minhasObras.map((o) => {
              const c = colegas(o.id);
              const carros = frota(o.id);
              return (
                <div key={o.id} className="campo-obra-item">
                  <strong>{o.nome}</strong>
                  <span>{[empresaPorId[o.empresa]?.curto, o.grupo].filter(Boolean).join(' · ')}</span>
                  {c.length > 0 && <span>com {c.join(', ')}</span>}
                  <div className={'campo-frota' + (carros.length ? '' : ' sem')}>
                    <span className="campo-rot">Frota</span>
                    {carros.length
                      ? carros.map((v) => <b key={v.id}>{v.nome}{v.placa ? <small> · {v.placa}</small> : null}</b>)
                      : <b>Nenhum veículo definido</b>}
                  </div>
                </div>
              );
            })}
          </>
        ) : fora ? (
          <><span className="campo-rot">Hoje</span><strong className="campo-livre">Você está de {fora.tipo === 'ferias' ? 'férias' : 'folga'}. Descanse!</strong></>
        ) : (
          <><span className="campo-rot">Hoje</span><strong className="campo-livre">Você ainda não está na agenda de nenhuma obra.</strong>
            <span className="note">Se estiver em obra, mande o relatório escolhendo a obra na lista.</span></>
        )}
      </section>

      {andamento.filter((r) => !r.concluir).concat(noBanco.map((r) => ({ ...r, banco: true, total: (r.arquivos || []).length, faltam: 0 }))).map((r) => (
        <section key={r.id} className="campo-andamento">
          <span className="campo-rot">Relatório em andamento</span>
          <strong>{tipoRelatorio[r.tipo]?.nome} · {dados.demandas.find((d) => d.id === r.demanda_id)?.nome || 'obra'}</strong>
          <span className="note">{r.total} {r.total === 1 ? 'arquivo salvo' : 'arquivos salvos'}{r.faltam ? ` · ${r.faltam} subindo` : ''}</span>
          <button type="button" className="campo-novo" onClick={() => (r.banco ? retomar(r) : setContinuar(r.id))}>Continuar relatório</button>
        </section>
      ))}
      {andamento.filter((r) => r.concluir).map((r) => (
        <section key={r.id} className="campo-subindo">
          <strong>{tipoRelatorio[r.tipo]?.nome} concluído</strong>
          <span>{r.faltam ? `Faltam ${r.faltam} ${r.faltam === 1 ? 'arquivo' : 'arquivos'} para subir · ${envio.online ? 'subindo…' : 'esperando sinal'}` : 'Terminando…'}</span>
        </section>
      ))}

      <button type="button" className="campo-novo" onClick={() => setNovo(true)} disabled={semBanco}>
        <span aria-hidden="true">+</span> Novo relatório
      </button>
      {semBanco && <p className="note" style={{ textAlign: 'center' }}>Os relatórios ainda estão sendo liberados. Avise o escritório.</p>}

      <section className="campo-hoje" aria-label="Relatórios de hoje">
        <h2>Seus relatórios de hoje</h2>
        {TIPOS_RELATORIO.filter((t) => t.ativo).map((t) => {
          const feitos = relatoriosHoje.filter((r) => r.tipo === t.id && r.status !== 'rascunho');
          const emAndamento = !feitos.length && (relatoriosHoje.some((r) => r.tipo === t.id) || andamento.some((r) => r.tipo === t.id && r.dia === dia));
          return (
            <div key={t.id} className={'campo-check' + (feitos.length ? ' feito' : '')}>
              <span className="campo-check-ic" aria-hidden="true">{feitos.length ? '✓' : ''}</span>
              <span className="campo-check-nome">{t.nome}</span>
              {emAndamento ? <span className="campo-check-pend andamento">em andamento</span> : feitos.length ? (
                <button type="button" className="link-btn" onClick={() => setAberto(feitos[feitos.length - 1])}>
                  {hora(feitos[feitos.length - 1].criado_em)} · {contagem(feitos[feitos.length - 1])}
                </button>
              ) : <span className="campo-check-pend">pendente</span>}
            </div>
          );
        })}
        {relatoriosHoje.filter((r) => !tipoRelatorio[r.tipo]?.ativo).map((r) => (
          <div key={r.id} className="campo-check feito"><span className="campo-check-ic">✓</span>
            <span className="campo-check-nome">{tipoRelatorio[r.tipo]?.nome}</span><span>{hora(r.criado_em)}</span></div>
        ))}
      </section>

      {novo && (
        <NovoRelatorio dados={dados} func={func} minhasObras={minhasObras} onFechar={() => setNovo(false)} />
      )}
      {continuar && (
        <NovoRelatorio key={continuar} dados={dados} func={func} minhasObras={minhasObras} rascunhoId={continuar} onFechar={() => setContinuar(null)} />
      )}
      {aberto && <VerRelatorio r={aberto} dados={dados} onFechar={() => setAberto(null)} />}
    </div>
  );
}

// Sem botão de sair (o pessoal de campo não saberia entrar de novo).
// Saída escondida para o escritório: tocar 7 vezes seguidas no logo.
function TopoCampo({ previa }) {
  const toques = useRef([]);
  const tocar = () => {
    if (previa) return;
    const agora = Date.now();
    toques.current = [...toques.current.filter((t) => agora - t < 3000), agora];
    if (toques.current.length >= 7) {
      toques.current = [];
      if (window.confirm('Sair da conta neste celular?')) supabase.auth.signOut();
    }
  };
  return (
    <header className="campo-topo">
      <button type="button" className="brand campo-logo" onClick={tocar} aria-label="EQL Group">
        <img className="brand-logo" src="/img/logo-96.png" alt="" width="36" height="36" />
        <span className="brand-name">EQL Group</span>
      </button>
    </header>
  );
}

export const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
export function contagem(r) {
  const fotos = (r.arquivos || []).filter((a) => a.tipo !== 'video').length;
  const videos = (r.arquivos || []).length - fotos;
  return [fotos && `${fotos} ${fotos === 1 ? 'foto' : 'fotos'}`, videos && `${videos} vídeo`].filter(Boolean).join(' + ') || 'sem fotos';
}

// ---------------------------------------------------------------------
// Novo relatório: tipo → obra → fotos. Cada foto fica salva NA HORA (no celular e,
// assim que houver sinal, no Supabase). "Concluir" só marca como enviado.
// escritorio = administrador/gerente lançando um relatório que chegou por WhatsApp.
// ---------------------------------------------------------------------
export function NovoRelatorio({ dados, func, minhasObras = [], onFechar, escritorio = false, diaInicial, obraInicial, tipoInicial, rascunhoId }) {
  const [id] = useState(() => rascunhoId || novoId());
  const [carregado, setCarregado] = useState(!rascunhoId);
  const [dia, setDia] = useState(diaInicial || hoje());
  const [funcId, setFuncId] = useState(func?.id || '');
  const [etapa, setEtapa] = useState(tipoInicial || rascunhoId ? 'form' : 'tipo'); // tipo | form | ok
  const [tipo, setTipo] = useState(tipoInicial || null);
  const [demandaId, setDemandaId] = useState(obraInicial || minhasObras[0]?.id || '');
  const [itens, setItens] = useState([]); // { id, tipo, preview, quando, enviado, duracao }
  const [obs, setObs] = useState('');
  const [processando, setProcessando] = useState(0);
  const [erro, setErro] = useState('');
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [etapaFoto, setEtapaFotoState] = useState(null); // relatório por etapas: etapa que está recebendo fotos agora
  const etapaRef = useRef(null); // o seletor da galeria abre na hora do toque (iPhone exige), então guarda a etapa aqui também
  const setEtapaFoto = (eid) => { etapaRef.current = eid; setEtapaFotoState(eid); };
  const criadoRef = useRef(!!rascunhoId);
  const camRef = useRef(null), galRef = useRef(null), vidRef = useRef(null);
  const [camAberta, setCamAberta] = useState(false);
  const [gravando, setGravando] = useState(false);
  useVoltarFecha(camAberta, () => setCamAberta(false));
  useVoltarFecha(gravando, () => setGravando(false));
  const envio = useEnvio();
  const [pendentesFim, setPendentesFim] = useState(null); // na tela final: quantas faltam subir

  useEffect(() => { configurarEnvio({ depoisDeSalvar: () => dados.recarregarTabela?.('relatorios') }); ligarEnvio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // continuar um relatório em andamento: carrega o que já está salvo
  useEffect(() => {
    if (!rascunhoId) return;
    (async () => {
      const r = await lerRascunho(rascunhoId);
      if (r) {
        setTipo(r.tipo); setDemandaId(r.demanda_id); setDia(r.dia); setFuncId(r.funcionario_id || ''); setObs(r.observacao || '');
        const lista = await lerArquivos(rascunhoId);
        setItens(lista.map((a) => ({
          id: a.id, tipo: a.tipo, enviado: !!a.enviado, quando: a.quando || a.remoto?.quando, duracao: a.duracao || a.remoto?.duracao, etapa: a.etapa || a.remoto?.etapa || null,
          preview: a.tipo === 'video'
            ? (a.blob ? URL.createObjectURL(a.blob) : dados.urlArquivo(a.caminho || a.remoto?.caminho))
            : (a.miniatura ? URL.createObjectURL(a.miniatura) : dados.urlArquivo(a.mini || a.remoto?.miniatura || a.remoto?.caminho)),
        })));
      }
      setCarregado(true);
    })();
  }, [rascunhoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // atualiza o "subiu / aguardando" de cada foto
  useEffect(() => {
    let vivo = true;
    lerArquivos(id).then((l) => {
      if (!vivo) return;
      setItens((xs) => xs.map((x) => { const a = l.find((y) => y.id === x.id); return a ? { ...x, enviado: !!a.enviado } : x; }));
      if (etapa === 'ok') lerRascunho(id).then((r) => vivo && setPendentesFim(r ? l.filter((a) => !a.enviado).length : 0));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [envio.versao, id, etapa]);

  // localização (vai no carimbo das fotos e vídeos tirados na hora). No escritório não usa.
  const posRef = useRef(null);
  const [geo, setGeo] = useState(escritorio ? 'off' : 'buscando');
  const [precisao, setPrecisao] = useState(null);
  const [tentativaGeo, setTentativaGeo] = useState(0);
  useEffect(() => {
    if (escritorio || etapa === 'ok') return undefined;
    if (!navigator.geolocation) { setGeo('indisponivel'); return undefined; }
    setGeo((g) => (g === 'ok' ? g : 'buscando'));
    const w = navigator.geolocation.watchPosition(
      (p) => { posRef.current = { lat: p.coords.latitude, lon: p.coords.longitude, prec: p.coords.accuracy, ts: Date.now() }; setPrecisao(p.coords.accuracy); setGeo('ok'); },
      (e) => setGeo(e.code === 1 ? 'negado' : 'indisponivel'),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, [escritorio, etapa === 'ok', tentativaGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  const posAgora = () => (posRef.current && Date.now() - posRef.current.ts < 5 * 60000 ? posRef.current : null);

  const outras = dados.demandas
    .filter((d) => !d.arquivada && d.empresa !== 'eko' && !minhasObras.some((o) => o.id === d.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const obra = dados.demandas.find((d) => d.id === demandaId);
  const quem = dados.funcionarios.find((f) => f.id === funcId)?.nome;
  const travado = itens.length > 0; // depois da primeira foto, obra e dia não mudam (já estão carimbados)
  const etapas = tipoRelatorio[tipo]?.etapas || null; // RFI e outros relatórios por etapas
  const etapaInfo = (eid) => { const i = (etapas || []).findIndex((e) => e.id === eid); return i < 0 ? null : { ...etapas[i], n: i + 1 }; };

  const linhasCarimbo = (meta) => {
    const q = meta.quando ? new Date(meta.quando) : null;
    const quandoTxt = q
      ? `${q.toLocaleDateString('pt-BR')} ${q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...(meta.segundos ? { second: '2-digit' } : {}) })}`
      : escritorio ? `Relatório de ${new Date(dia + 'T12:00').toLocaleDateString('pt-BR')}` : 'Foto da galeria · sem horário original';
    return [
      quandoTxt,
      [obra?.nome, quem || (escritorio ? 'lançado pelo escritório' : null), tipoRelatorio[tipo]?.nome].filter(Boolean).join(' · '),
      meta.etapa && etapaInfo(meta.etapa) ? `Etapa ${etapaInfo(meta.etapa).n}/${etapas.length}: ${etapaInfo(meta.etapa).nome}` : null,
      meta.lat != null ? `Local: ${coordTexto(meta.lat, meta.lon, meta.prec)}` : null,
    ].filter(Boolean);
  };

  const garantirRascunho = async () => {
    if (criadoRef.current) return;
    criadoRef.current = true;
    await salvarRascunho({
      id, demanda_id: demandaId, tipo, dia, funcionario_id: funcId || null, observacao: obs,
      criadoEm: Date.now(), escritorio, remoto: false, concluir: false,
    });
  };

  // foto pronta (já comprimida e carimbada) → guarda no celular e entra na fila de envio
  const guardarFoto = async (fonte, meta) => {
    const c = await comprimirFoto(fonte);
    const st = await carimbar(c.base, linhasCarimbo(meta));
    const arq = {
      id: novoId(), relatorioId: id, ordem: Date.now() + Math.random(), tipo: 'foto', foto: st.foto, miniatura: st.miniatura,
      origem: meta.origem, quando: meta.quando ? new Date(meta.quando).toISOString() : null, ...(meta.etapa ? { etapa: meta.etapa } : {}),
      ...(meta.lat != null ? { lat: meta.lat, lon: meta.lon, precisao: meta.prec ? Math.round(meta.prec) : null } : {}),
      enviado: false,
    };
    await garantirRascunho();
    await guardarArquivo(arq);
    setItens((xs) => [...xs, { id: arq.id, tipo: 'foto', preview: URL.createObjectURL(st.miniatura), quando: arq.quando, enviado: false, etapa: meta.etapa || null }]);
  };
  // por etapas: até ETAPA_MAX fotos em cada etapa; normal: até FOTOS_MAX no relatório
  const vagas = (eid = etapaFoto) => (etapas
    ? ETAPA_MAX - itens.filter((i) => i.tipo !== 'video' && i.etapa === eid).length - processando
    : FOTOS_MAX - itens.filter((i) => i.tipo !== 'video').length - processando);

  const adicionarFotos = async (lista, origem = 'galeria', eid = etapaRef.current) => {
    const arquivos = [...lista].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || ''));
    const cabem = Math.max(0, vagas(eid));
    const limite = etapas ? `${ETAPA_MAX} fotos por etapa` : `${FOTOS_MAX} fotos`;
    setErro(arquivos.length > cabem ? `O máximo é ${limite}. ${arquivos.length - cabem} ficaram de fora.` : '');
    for (const arq of arquivos.slice(0, cabem)) {
      setProcessando((n) => n + 1);
      try {
        let meta;
        if (origem === 'camera') { const p = posAgora(); meta = { origem, quando: new Date(), lat: p?.lat, lon: p?.lon, prec: p?.prec, etapa: eid }; }
        else { const ex = await lerExif(arq); meta = { origem, quando: ex.quando || null, lat: ex.lat, lon: ex.lon, etapa: eid }; }
        await guardarFoto(arq, meta); // uma por vez: não pesa a memória do celular
      } catch (e) { setErro(e.message || 'Não deu para guardar a foto.'); }
      setProcessando((n) => n - 1);
    }
  };
  const fotoDaCamera = async (blob, quando) => {
    if (vagas() <= 0) return;
    const p = posAgora();
    setProcessando((n) => n + 1);
    try { await guardarFoto(blob, { origem: 'camera', quando, lat: p?.lat, lon: p?.lon, prec: p?.prec, etapa: etapaFoto }); }
    catch (e) { setErro(e.message || 'Não deu para guardar a foto.'); }
    setProcessando((n) => n - 1);
  };

  const guardarVideo = async ({ blob, mime, ext, duracao, quando, origem }) => {
    const p = origem === 'camera' ? posAgora() : null;
    const arq = {
      id: novoId(), relatorioId: id, ordem: Date.now() + Math.random(), tipo: 'video', blob, mime, ext, duracao, origem,
      quando: quando ? new Date(quando).toISOString() : null,
      ...(p ? { lat: p.lat, lon: p.lon, precisao: Math.round(p.prec || 0) || null } : {}), enviado: false,
    };
    await garantirRascunho();
    await guardarArquivo(arq);
    setItens((xs) => [...xs, { id: arq.id, tipo: 'video', preview: URL.createObjectURL(blob), quando: arq.quando, duracao, enviado: false }]);
  };
  const escolherVideo = async (arq) => {
    if (!arq) return;
    try {
      const { duracao } = await conferirVideo(arq);
      const ext = ((arq.name || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      await guardarVideo({ blob: arq, mime: arq.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4'), ext, duracao, quando: arq.lastModified || null, origem: 'galeria' });
      setErro('');
    } catch (e) { setErro(e.message + ' Dica: use "Gravar vídeo", que já sai leve e com os dados.'); }
  };
  const videoGravado = async (g) => {
    setGravando(false);
    if (g) await guardarVideo({ ...g, origem: 'camera' });
  };
  const carimboVideo = (agora) => linhasCarimbo({ quando: agora, segundos: true, ...(() => { const p = posAgora(); return p ? { lat: p.lat, lon: p.lon, prec: p.prec } : {}; })() });

  const tirar = async (it) => {
    setItens((xs) => xs.filter((x) => x.id !== it.id));
    await tirarArquivo(id, it.id);
  };

  // observação e "quem" vão sendo salvos também
  useEffect(() => {
    if (!criadoRef.current) return undefined;
    const t = setTimeout(async () => { const r = await lerRascunho(id); if (r) await salvarRascunho({ ...r, observacao: obs, funcionario_id: funcId || null }); }, 500);
    return () => clearTimeout(t);
  }, [obs, funcId, id]);

  const fotosDaEtapa = (eid) => itens.filter((i) => i.tipo !== 'video' && i.etapa === eid);
  const etapasSemFoto = etapas ? etapas.filter((e) => !fotosDaEtapa(e.id).length) : [];
  const podeConcluir = itens.length > 0 && !etapasSemFoto.length;
  const concluir = async () => {
    if (!podeConcluir || processando) return;
    await concluirRascunho(id, { observacao: obs, funcionario_id: funcId || null });
    setPendentesFim(itens.filter((i) => !i.enviado).length);
    setEtapa('ok');
  };
  const apagar = async () => { await descartarRascunho(id); onFechar(); };

  const fotos = itens.filter((i) => i.tipo !== 'video');
  const videos = itens.filter((i) => i.tipo === 'video');
  const naoSubiram = itens.filter((i) => !i.enviado).length;

  return createPortal(
    <div className="campo-folha" role="dialog" aria-modal="true" aria-label="Relatório">
      <header className="campo-folha-topo">
        {etapa === 'form' && !travado && !rascunhoId ? (
          <button type="button" className="pill ghost" onClick={() => setEtapa('tipo')}>‹ Voltar</button>
        ) : <span />}
        <strong>{etapa === 'tipo' ? 'Novo relatório' : tipoRelatorio[tipo]?.nome}</strong>
        <button type="button" className="pill ghost" onClick={onFechar}>{etapa === 'ok' ? 'Fechar' : travado ? 'Sair (fica salvo)' : 'Fechar'}</button>
      </header>

      {etapa === 'tipo' && (
        <div className="campo-tipos">
          <p className="note">Que relatório você vai mandar?</p>
          {TIPOS_RELATORIO.map((t) => (
            <button key={t.id} type="button" className={'campo-tipo' + (t.ativo ? '' : ' breve')} disabled={!t.ativo}
              onClick={() => { setTipo(t.id); setEtapa('form'); }}>
              <span className="campo-tipo-nome">{t.nome}</span>
              <span className="campo-tipo-desc">{t.ativo ? t.desc : 'em breve'}</span>
            </button>
          ))}
        </div>
      )}

      {etapa === 'form' && carregado && (
        <div className="campo-form">
          <div className="campo-salvo">Cada foto fica salva na hora. Pode fechar o app e continuar depois.</div>
          {travado ? (
            <div className="campo-obra-fixa"><span className="campo-rot">Obra</span><strong>{obra?.nome || '—'}</strong>
              {escritorio && <span className="note"> · {new Date(dia + 'T12:00').toLocaleDateString('pt-BR')}</span>}</div>
          ) : (
            <label className="field"><span>Obra</span>
              <select value={demandaId} onChange={(e) => setDemandaId(e.target.value)}>
                {!demandaId && <option value="">Escolha a obra</option>}
                {minhasObras.length > 0 && (
                  <optgroup label="Sua obra hoje">{minhasObras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</optgroup>
                )}
                {EMPRESAS.filter((e) => e.id !== 'eko').map((e) => {
                  const os = outras.filter((d) => d.empresa === e.id);
                  return os.length ? <optgroup key={e.id} label={e.nome}>{os.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.grupo ? ' · ' + o.grupo : ''}</option>)}</optgroup> : null;
                })}
              </select>
            </label>
          )}
          {escritorio && (
            <div className="campo-linha2">
              {!travado && (
                <label className="field"><span>Dia do relatório</span>
                  <input type="date" value={dia} max={hoje()} onChange={(e) => e.target.value && setDia(e.target.value)} />
                </label>
              )}
              <label className="field"><span>Quem enviou / estava na obra</span>
                <select value={funcId} onChange={(e) => setFuncId(e.target.value)} disabled={travado}>
                  <option value="">Não informado</option>
                  {dados.funcionarios.filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </label>
            </div>
          )}

          {etapas ? (
            <div className="rfi-resumo">
              <div><b>{etapas.length - etapasSemFoto.length} de {etapas.length} etapas com foto</b>
                <span>{fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'} · recomendado {recomendadas(etapas)} · até {ETAPA_MAX} por etapa</span></div>
              <div className="pc-barra"><i style={{ width: `${Math.round(((etapas.length - etapasSemFoto.length) / etapas.length) * 100)}%` }} /></div>
            </div>
          ) : (
            <>
            <div className="campo-fotos-head">
              <strong>Fotos</strong>
              <span className="okk">{fotos.length} de {FOTOS_MAX}</span>
            </div>
            <div className="campo-botoes">
              <button type="button" className="campo-add" onClick={() => setCamAberta(true)} disabled={!demandaId || vagas() <= 0}>
                <b>Tirar fotos</b><span>{demandaId ? 'várias seguidas' : 'escolha a obra antes'}</span>
              </button>
              <button type="button" className="campo-add" onClick={() => galRef.current?.click()} disabled={!demandaId || vagas() <= 0}>
                <b>Galeria</b><span>escolher várias</span>
              </button>
            </div>
            </>
          )}
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { adicionarFotos(e.target.files, 'camera'); e.target.value = ''; }} />
          <input ref={galRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { adicionarFotos(e.target.files); e.target.value = ''; }} />
          {!escritorio && (
            <div className={'campo-geo ' + geo}>
              {geo === 'ok' ? <>Localização ligada{precisao ? ` · ±${Math.round(precisao)} m` : ''}</>
                : geo === 'buscando' ? 'Buscando a localização…'
                : geo === 'negado' ? <>Localização bloqueada: as fotos vão sem o local. <button type="button" className="link-btn" onClick={() => setTentativaGeo((n) => n + 1)}>Tentar de novo</button></>
                : 'Localização indisponível neste celular: as fotos vão sem o local.'}
            </div>
          )}

          {etapas && (
            <div className="rfi-etapas">
              {etapas.map((e, n) => {
                const fs = fotosDaEtapa(e.id);
                const completa = fs.length >= e.rec;
                return (
                  <section key={e.id} className={'rfi-etapa' + (fs.length ? (completa ? ' ok' : ' parcial') : '')} aria-label={`Etapa ${n + 1}: ${e.nome}`}>
                    <div className="rfi-cab">
                      <span className="rfi-n" aria-hidden="true">{completa ? '✓' : n + 1}</span>
                      <div className="rfi-tit"><b>{e.nome}</b>
                        <small>Recomendado: {e.rec} {e.rec === 1 ? 'foto' : 'fotos'} · {fs.length} {fs.length === 1 ? 'tirada' : 'tiradas'}{fs.length >= ETAPA_MAX ? ' · máximo' : ''}</small></div>
                    </div>
                    {(fs.length > 0 || (processando > 0 && etapaFoto === e.id)) && (
                      <div className="campo-grade rfi-grade">
                        {fs.map((it, i) => (
                <div key={it.id} className="campo-mini">
                  <img src={it.preview} alt={`Foto ${i + 1}`} />
                  {it.quando && <span className="campo-mini-hora">{hora(it.quando)}</span>}
                  <span className={'campo-mini-nuvem' + (it.enviado ? ' ok' : '')} title={it.enviado ? 'Salva no sistema' : 'Salva no celular, subindo…'}>{it.enviado ? '✓' : '↑'}</span>
                  <button type="button" aria-label={`Tirar foto ${i + 1}`} onClick={() => tirar(it)}>×</button>
                </div>
              ))}
                        {etapaFoto === e.id && Array.from({ length: processando }, (_, i) => <div key={'p' + i} className="campo-mini carregando" aria-label="preparando foto" />)}
                      </div>
                    )}
                    <div className="rfi-botoes">
                      <button type="button" className="campo-add fino" disabled={!demandaId || vagas(e.id) <= 0} onClick={() => { setEtapaFoto(e.id); setCamAberta(true); }}>
                        <b>Tirar foto</b><span>{demandaId ? (vagas(e.id) <= 0 ? 'máximo atingido' : 'câmera do app') : 'escolha a obra'}</span></button>
                      <button type="button" className="campo-add fino" disabled={!demandaId || vagas(e.id) <= 0} onClick={() => { setEtapaFoto(e.id); galRef.current?.click(); }}>
                        <b>Galeria</b><span>escolher</span></button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {!etapas && (fotos.length > 0 || processando > 0) && (
            <div className="campo-grade">
              {fotos.map((it, i) => (
                <div key={it.id} className="campo-mini">
                  <img src={it.preview} alt={`Foto ${i + 1}`} />
                  {it.quando && <span className="campo-mini-hora">{hora(it.quando)}</span>}
                  <span className={'campo-mini-nuvem' + (it.enviado ? ' ok' : '')} title={it.enviado ? 'Salva no sistema' : 'Salva no celular, subindo…'}>{it.enviado ? '✓' : '↑'}</span>
                  <button type="button" aria-label={`Tirar foto ${i + 1}`} onClick={() => tirar(it)}>×</button>
                </div>
              ))}
              {Array.from({ length: processando }, (_, i) => <div key={'p' + i} className="campo-mini carregando" aria-label="preparando foto" />)}
            </div>
          )}

          <div className="campo-video">
            {videos.map((v) => (
              <div key={v.id} className="campo-video-item">
                <video src={v.preview + '#t=0.1'} muted playsInline preload="metadata" />
                <span>Vídeo{v.duracao ? ` · ${v.duracao}s` : ''} · {v.enviado ? 'salvo ✓' : 'subindo…'}</span>
                <button type="button" className="link-btn" onClick={() => tirar(v)}>Tirar</button>
              </div>
            ))}
            {!videos.length && (
              <div className="campo-video-botoes">
                <button type="button" className="campo-add fino" onClick={() => setGravando(true)} disabled={!demandaId}>
                  <b>Gravar vídeo</b><span>opcional · até {VIDEO_MAX_SEG} s</span>
                </button>
                <button type="button" className="campo-add fino" onClick={() => vidRef.current?.click()} disabled={!demandaId}>
                  <b>Vídeo da galeria</b><span>até {VIDEO_MAX_SEG} s</span>
                </button>
              </div>
            )}
            <input ref={vidRef} type="file" accept="video/*" hidden onChange={(e) => { escolherVideo(e.target.files[0]); e.target.value = ''; }} />
          </div>

          <label className="field"><span>Observação (opcional) · o cliente da obra também vê</span>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Como foi o serviço hoje?" />
          </label>

          {erro && <div className="err" role="alert">{erro}</div>}

          <div className="campo-enviar">
            {itens.length > 0 && (
              <span className="note">{naoSubiram ? `${itens.length - naoSubiram} de ${itens.length} já no sistema · ${envio.online ? 'subindo o resto…' : 'sem sinal: sobe quando voltar'}` : 'Tudo salvo no sistema ✓'}</span>
            )}
            <button type="button" className="campo-novo" disabled={!podeConcluir || !!processando} onClick={concluir}>
              {processando ? 'Preparando foto…' : !demandaId ? 'Escolha a obra' : !itens.length ? 'Tire pelo menos 1 foto'
                : etapasSemFoto.length ? `Falta foto em ${etapasSemFoto.length} ${etapasSemFoto.length === 1 ? 'etapa' : 'etapas'}` : 'Concluir relatório'}
            </button>
            {travado && (confirmarApagar ? (
              <span className="campo-apagar">Apagar este relatório e as fotos?
                <button type="button" className="pill danger" onClick={apagar}>Sim, apagar</button>
                <button type="button" className="link-btn" onClick={() => setConfirmarApagar(false)}>Não</button></span>
            ) : <button type="button" className="link-btn campo-apagar-link" onClick={() => setConfirmarApagar(true)}>Apagar este relatório</button>)}
          </div>
        </div>
      )}

      {gravando && (
        <GravadorVideo max={VIDEO_MAX_SEG} onPronto={videoGravado} onFechar={() => setGravando(false)} carimbo={carimboVideo}
          onUsarNativa={() => { setGravando(false); vidRef.current?.click(); }} />
      )}
      {camAberta && (
        <CameraContinua previas={(etapas ? fotosDaEtapa(etapaFoto) : fotos).map((f) => ({ key: f.id, preview: f.preview }))} max={etapas ? ETAPA_MAX : FOTOS_MAX}
          titulo={etapas && etapaInfo(etapaFoto) ? `${etapaInfo(etapaFoto).n}/${etapas.length} · ${etapaInfo(etapaFoto).nome}` : null}
          recomendado={etapas && etapaInfo(etapaFoto) ? etapaInfo(etapaFoto).rec : null} onFoto={fotoDaCamera} onFechar={() => setCamAberta(false)}
          onUsarNativa={() => { setCamAberta(false); camRef.current?.click(); }} />
      )}

      {etapa === 'ok' && (
        <div className="campo-status">
          <div className="campo-ok" aria-hidden="true">✓</div>
          <strong>Relatório concluído!</strong>
          <p className="note">{tipoRelatorio[tipo]?.nome} · {obra?.nome} · {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}{videos.length ? ' + vídeo' : ''}</p>
          {pendentesFim ? (
            <p className="campo-pend">Faltam {pendentesFim} {pendentesFim === 1 ? 'arquivo' : 'arquivos'} para subir. {envio.online ? 'Subindo agora…' : 'Sem sinal: sobem sozinhos quando o sinal voltar.'} Pode usar o celular normalmente.</p>
          ) : <p className="campo-pend ok">Tudo no sistema ✓</p>}
          <button type="button" className="campo-novo" onClick={onFechar}>Voltar ao início</button>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---------- baixar fotos ----------
const limpar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
const celular = () => window.matchMedia?.('(pointer: coarse)').matches;
async function buscar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Não deu para baixar agora.');
  return r.blob();
}
function salvarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// no celular abre o "Salvar imagem" do próprio celular; no computador baixa o arquivo
async function entregar(arquivos, nomeZip) {
  const files = arquivos.map(({ nome, blob }) => new File([blob], nome, { type: blob.type || 'image/jpeg' }));
  if (celular() && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  if (arquivos.length === 1) salvarArquivo(arquivos[0].blob, arquivos[0].nome);
  else salvarArquivo(await montarZip(arquivos), nomeZip);
}

// Visualizador de um relatório (usado no campo e na visão dos administradores)
export function VerRelatorio({ r, dados, onFechar, onApagar, exportarRfi = false, salvarCampos = null }) {
  const [rfiAberto, setRfiAberto] = useState(false);
  const [foco, setFoco] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [baixando, setBaixando] = useState(null); // texto de progresso
  const obra = dados.demandas.find((d) => d.id === r.demanda_id);
  const quem = dados.funcionarios.find((f) => f.id === r.funcionario_id)?.nome || dados.perfis.find((p) => p.id === r.autor_id)?.nome;
  // relatório por etapas (RFI): fotos na ordem das etapas
  const etapasTipo = tipoRelatorio[r.tipo]?.etapas || null;
  const posEtapa = (eid) => { const i = (etapasTipo || []).findIndex((e) => e.id === eid); return i < 0 ? 999 : i; };
  const brutas = (r.arquivos || []).filter((a) => a.tipo !== 'video');
  const fotos = etapasTipo ? [...brutas].sort((a, b) => posEtapa(a.etapa) - posEtapa(b.etapa) || (a.ordem || 0) - (b.ordem || 0)) : brutas;
  const videos = (r.arquivos || []).filter((a) => a.tipo === 'video');
  const nomeEtapa = (eid) => etapasTipo?.find((e) => e.id === eid)?.nome || null;
  const base = [limpar(obra?.nome || 'obra'), r.dia, limpar(tipoRelatorio[r.tipo]?.nome || r.tipo)].join('_');
  const nomeDe = (a, i) => a.tipo === 'video'
    ? `${base}_video.${(a.caminho.split('.').pop() || 'mp4')}`
    : etapasTipo
      ? `${base}_${String(i + 1).padStart(2, '0')}_${limpar(nomeEtapa(a.etapa) || 'outras')}.jpg`
      : `${base}_${String(i + 1).padStart(2, '0')}${a.quando ? '_' + new Date(a.quando).toTimeString().slice(0, 5).replace(':', 'h') : ''}.jpg`;
  const miniFoto = (a) => {
    const i = fotos.indexOf(a);
    return (
      <button key={a.caminho} type="button" className="rel-foto" onClick={() => setFoco(i)} aria-label={`Abrir foto ${i + 1}`}>
        <img src={dados.urlArquivo(a.miniatura || a.caminho)} alt="" loading="lazy" />
        {a.quando && <span className="rel-foto-hora">{hora(a.quando)}</span>}
      </button>
    );
  };

  const baixar = async (lista) => {
    try {
      const out = [];
      for (const [i, a] of lista.entries()) {
        setBaixando(lista.length > 1 ? `Baixando ${i + 1} de ${lista.length}…` : 'Baixando…');
        out.push({ nome: nomeDe(a, a.tipo === 'video' ? 0 : fotos.indexOf(a)), blob: await buscar(dados.urlArquivo(a.caminho)) });
      }
      setBaixando(lista.length > 1 && !celular() ? 'Montando o arquivo .zip…' : 'Pronto');
      await entregar(out, `${base}.zip`);
      setBaixando(null);
    } catch (e) { setBaixando(e.message || 'Não deu para baixar agora.'); setTimeout(() => setBaixando(null), 4000); }
  };

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') { if (foco != null) setFoco(null); else onFechar(); }
      if (foco != null && e.key === 'ArrowRight') setFoco((f) => Math.min(fotos.length - 1, f + 1));
      if (foco != null && e.key === 'ArrowLeft') setFoco((f) => Math.max(0, f - 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [foco, fotos.length, onFechar]);

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal rel-modal" role="dialog" aria-modal="true" aria-label={`${tipoRelatorio[r.tipo]?.nome}, ${obra?.nome}`}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{tipoRelatorio[r.tipo]?.nome || r.tipo}{r.status === 'rascunho' && <span className="rel-tag-andamento">em andamento · fotos chegando</span>}</span>
            <h2>{obra?.nome || 'Obra apagada'}</h2>
            <p className="note">
              {new Date(r.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {r.status === 'rascunho' ? 'começou' : 'enviado'} às {hora(r.criado_em)}
              {quem ? ` por ${quem}` : ''} · {contagem(r)}
            </p>
          </div>
          <div className="rel-topo-acoes">
            {(r.arquivos || []).length > 0 && (
              <button type="button" className="pill lime" disabled={!!baixando} onClick={() => baixar(r.arquivos)}>
                {baixando || `Baixar ${(r.arquivos || []).length > 1 ? `todas (${(r.arquivos || []).length})` : ''}`}
              </button>
            )}
            {exportarRfi && r.tipo === 'rfi' && fotos.length > 0 && (
              <button type="button" className="pill" onClick={() => setRfiAberto(true)}>RFI no modelo (Excel)</button>
            )}
            <button type="button" className="pill ghost" onClick={onFechar}>Fechar</button>
          </div>
        </div>
        {r.observacao && <p className="rel-obs">“{r.observacao}”</p>}
        {etapasTipo ? (
          <>
            {etapasTipo.map((e, n) => {
              const fs = fotos.filter((a) => a.etapa === e.id);
              return (
                <div key={e.id} className={'rel-etapa' + (fs.length ? '' : ' vazia')}>
                  <h3>{n + 1}. {e.nome}<small>{fs.length ? `${fs.length} de ${e.rec}` : 'sem foto'}</small></h3>
                  {fs.length > 0 && <div className="rel-grade">{fs.map(miniFoto)}</div>}
                </div>
              );
            })}
            {fotos.some((a) => posEtapa(a.etapa) === 999) && (
              <div className="rel-etapa"><h3>Outras fotos</h3><div className="rel-grade">{fotos.filter((a) => posEtapa(a.etapa) === 999).map(miniFoto)}</div></div>
            )}
          </>
        ) : (
          <div className="rel-grade">{fotos.map(miniFoto)}</div>
        )}
        {videos.map((v) => (
          <div key={v.caminho} className="rel-video-box">
            <video className="rel-video" src={dados.urlArquivo(v.caminho)} controls playsInline preload="metadata" />
            <div className="rel-video-info">
              <span>
                Vídeo{v.duracao ? ` · ${v.duracao}s` : ''}
                {v.quando ? ` · gravado ${new Date(v.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                {v.lat != null ? ` · ${coordTexto(v.lat, v.lon, v.precisao)}` : ''}
              </span>
              {v.lat != null && <a className="link-btn" href={linkMapa(v.lat, v.lon)} target="_blank" rel="noreferrer">Ver no mapa</a>}
              <button type="button" className="link-btn" onClick={() => baixar([v])}>Baixar vídeo</button>
            </div>
          </div>
        ))}
        {onApagar && (
          <div className="rel-acoes">
            {confirmar ? (
              <>
                <span className="note">Apagar este relatório e as fotos? Não dá para desfazer.</span>
                <button type="button" className="pill" onClick={() => setConfirmar(false)}>Cancelar</button>
                <button type="button" className="pill danger" onClick={() => { onApagar(r); onFechar(); }}>Apagar</button>
              </>
            ) : <button type="button" className="link-btn danger-text" onClick={() => setConfirmar(true)}>Apagar relatório</button>}
          </div>
        )}
      </div>
      {rfiAberto && <ExportarRfi r={r} obra={obra} dados={dados} etapas={etapasTipo} salvarCampos={salvarCampos} onFechar={() => setRfiAberto(false)} />}
      {foco != null && fotos[foco] && (
        <div className="rel-luz" onClick={(e) => e.target === e.currentTarget && setFoco(null)}>
          <img src={dados.urlArquivo(fotos[foco].caminho)} alt={`Foto ${foco + 1} de ${fotos.length}`} />
          <div className="rel-luz-barra">
            <button type="button" className="pill" disabled={foco === 0} onClick={() => setFoco(foco - 1)} aria-label="Anterior">‹</button>
            <span>{foco + 1} / {fotos.length}{nomeEtapa(fotos[foco].etapa) ? ` · ${nomeEtapa(fotos[foco].etapa)}` : ''}{fotos[foco].quando ? ` · ${new Date(fotos[foco].quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            <button type="button" className="pill" disabled={foco === fotos.length - 1} onClick={() => setFoco(foco + 1)} aria-label="Próxima">›</button>
            {fotos[foco].lat != null && <a className="pill" href={linkMapa(fotos[foco].lat, fotos[foco].lon)} target="_blank" rel="noreferrer">Ver no mapa</a>}
            <button type="button" className="pill" disabled={!!baixando} onClick={() => baixar([fotos[foco]])}>{baixando || 'Baixar'}</button>
            <button type="button" className="pill" onClick={() => setFoco(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// RFI no modelo oficial: confere o cabeçalho e baixa a planilha com as fotos nos lugares
function ExportarRfi({ r, obra, dados, etapas, salvarCampos, onFechar }) {
  const [campos, setCampos] = useState(() => camposIniciais(r, obra));
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  const [fim, setFim] = useState(null);
  const edita = !!salvarCampos;
  const baixar = async () => {
    setErro(''); setFim(null);
    try {
      if (edita && JSON.stringify(campos) !== JSON.stringify(r.campos || {})) await salvarCampos(r.id, campos);
      const res = await gerarRfiXlsx({ r, obra, campos, etapas, urlArquivo: dados.urlArquivo, progresso: setStatus });
      setStatus('');
      await entregar([{ nome: res.nome, blob: res.blob }], res.nome);
      setFim(res);
    } catch (e) { setStatus(''); setErro(e.message || 'Não deu para gerar a planilha.'); }
  };
  const ocupado = !!status;
  return (
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && !ocupado && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="RFI no modelo oficial" style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <div><span className="modal-kicker">RFI no modelo oficial</span><h2>{obra?.nome || 'Obra'}</h2>
            <p className="note">As fotos entram nos lugares do modelo (FOTO 01 a 46), na ordem das etapas.{edita ? ' Confira o cabeçalho: fica salvo neste relatório.' : ''}</p></div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar} disabled={ocupado}>×</button>
        </div>
        <div className="rfi-campos">
          {CAMPOS_RFI.map((f) => (
            <label key={f.id} className={'field' + (f.largo ? ' largo' : '') + (f.curto ? ' curto' : '')}><span>{f.rotulo}</span>
              {f.opcoes
                ? <select value={campos[f.id] || ''} disabled={!edita || ocupado} onChange={(e) => setCampos({ ...campos, [f.id]: e.target.value })}>{f.opcoes.map((o) => <option key={o}>{o}</option>)}</select>
                : <input value={campos[f.id] || ''} disabled={!edita || ocupado} onChange={(e) => setCampos({ ...campos, [f.id]: e.target.value })} />}
            </label>
          ))}
        </div>
        {erro && <div className="err" role="alert">{erro}</div>}
        {fim && <p className="note">Pronto: {fim.colocadas} de {fim.espacos} fotos no modelo.{fim.sobraram ? ` ${fim.sobraram} foto(s) a mais que o modelo não comporta ficaram de fora (use “Baixar todas”).` : ''}</p>}
        <div className="modal-foot">
          <button type="button" className="pill ghost" onClick={onFechar} disabled={ocupado}>Fechar</button>
          <button type="button" className="pill lime" onClick={baixar} disabled={ocupado}>{status || (edita ? 'Salvar e baixar planilha' : 'Baixar planilha')}</button>
        </div>
      </div>
    </div>
  );
}
