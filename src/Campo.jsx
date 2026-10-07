import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPRESAS, FOTOS_MAX, FOTOS_MIN, TIPOS_RELATORIO, dataLonga, empresaPorId, hoje, mensagemDoDia,
  saudacao, supabase, tipoRelatorio,
} from './lib.js';
import { VIDEO_MAX_SEG, carimbar, comprimirFoto, conferirVideo, coordTexto, lerExif, linkMapa, tamanho } from './midia.js';
import { CameraContinua } from './Camera.jsx';

// App do pessoal de campo: uma tela só — saudação, obra do dia e "Novo relatório".
export function AppCampo({ dados, eu, avisar }) {
  const dia = hoje();
  const chaveLocal = 'eql-campo-funcionario';
  const [escolhido, setEscolhido] = useState(() => { try { return localStorage.getItem(chaveLocal) || ''; } catch { return ''; } });
  const funcionarios = dados.funcionarios.filter((f) => f.ativo !== false);
  // login individual ligado a um funcionário (Configurações) ou login compartilhado: pergunta no celular
  const fid = eu?.funcionario_id || (funcionarios.some((f) => f.id === escolhido) ? escolhido : '');
  const func = funcionarios.find((f) => f.id === fid);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState(null); // relatório de hoje aberto para ver

  const [confirmar, setConfirmar] = useState(null); // funcionário tocado na lista, esperando "sou eu"
  const guardarLocal = (id) => { setEscolhido(id); try { localStorage.setItem(chaveLocal, id); } catch { /* ignora */ } };
  // "Sou eu": liga este login ao funcionário no sistema (fica valendo em qualquer aparelho)
  const escolher = async (f) => {
    setConfirmar(null);
    guardarLocal(f.id);
    if (eu && !eu.funcionario_id) {
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

  const sair = () => supabase.auth.signOut();

  if (!func) {
    return (
      <div className="campo">
        <TopoCampo onSair={sair} />
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
      <TopoCampo onSair={sair} />
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

      <button type="button" className="campo-novo" onClick={() => setNovo(true)} disabled={semBanco}>
        <span aria-hidden="true">+</span> Novo relatório
      </button>
      {semBanco && <p className="note" style={{ textAlign: 'center' }}>Os relatórios ainda estão sendo liberados. Avise o escritório.</p>}

      <section className="campo-hoje" aria-label="Relatórios de hoje">
        <h2>Seus relatórios de hoje</h2>
        {TIPOS_RELATORIO.filter((t) => t.ativo).map((t) => {
          const feitos = relatoriosHoje.filter((r) => r.tipo === t.id);
          return (
            <div key={t.id} className={'campo-check' + (feitos.length ? ' feito' : '')}>
              <span className="campo-check-ic" aria-hidden="true">{feitos.length ? '✓' : ''}</span>
              <span className="campo-check-nome">{t.nome}</span>
              {feitos.length ? (
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
        <NovoRelatorio dados={dados} func={func} minhasObras={minhasObras} avisar={avisar}
          onFechar={() => setNovo(false)} />
      )}
      {aberto && <VerRelatorio r={aberto} dados={dados} onFechar={() => setAberto(null)} />}
    </div>
  );
}

function TopoCampo({ onSair }) {
  return (
    <header className="campo-topo">
      <div className="brand">
        <img className="brand-logo" src="/img/logo-96.png" alt="" width="36" height="36" />
        <div className="brand-name">EQL Group</div>
      </div>
      <button type="button" className="pill ghost" onClick={onSair}>Sair</button>
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
// Novo relatório: tipo → fotos (5 a 30, comprimidas no celular) → enviar
// ---------------------------------------------------------------------
// escritorio = administrador/gerente lançando um relatório que chegou por WhatsApp:
// escolhe o dia e quem estava na obra, e pode mandar a partir de 1 foto.
export function NovoRelatorio({ dados, func, minhasObras = [], onFechar, escritorio = false, diaInicial, obraInicial, tipoInicial }) {
  const [dia, setDia] = useState(diaInicial || hoje());
  const [funcId, setFuncId] = useState(func?.id || '');
  const minimo = escritorio ? 1 : FOTOS_MIN;
  const [etapa, setEtapa] = useState(tipoInicial ? 'form' : 'tipo'); // tipo | form | enviando | ok
  const [tipo, setTipo] = useState(tipoInicial || null);
  const [demandaId, setDemandaId] = useState(obraInicial || minhasObras[0]?.id || '');
  const [itens, setItens] = useState([]); // { key, foto, miniatura, preview, original, caminho?, mini? }
  const [video, setVideo] = useState(null); // { arquivo, preview, duracao, caminho? }
  const [obs, setObs] = useState('');
  const [processando, setProcessando] = useState(0);
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const idRef = useRef(null);
  const camRef = useRef(null), galRef = useRef(null), vidRef = useRef(null);
  const [camAberta, setCamAberta] = useState(false);

  // localização (vai no carimbo das fotos tiradas na hora). No escritório não usa.
  const posRef = useRef(null);
  const [geo, setGeo] = useState(escritorio ? 'off' : 'buscando'); // buscando | ok | negado | indisponivel | off
  const [precisao, setPrecisao] = useState(null);
  const [tentativaGeo, setTentativaGeo] = useState(0);
  useEffect(() => {
    if (escritorio || etapa === 'ok') return undefined;
    if (!navigator.geolocation) { setGeo('indisponivel'); return undefined; }
    setGeo((g) => (g === 'ok' ? g : 'buscando'));
    const id = navigator.geolocation.watchPosition(
      (p) => { posRef.current = { lat: p.coords.latitude, lon: p.coords.longitude, prec: p.coords.accuracy, ts: Date.now() }; setPrecisao(p.coords.accuracy); setGeo('ok'); },
      (e) => setGeo(e.code === 1 ? 'negado' : 'indisponivel'),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [escritorio, etapa === 'ok', tentativaGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  const posAgora = () => (posRef.current && Date.now() - posRef.current.ts < 5 * 60000 ? posRef.current : null);

  // libera as pré-visualizações ao sair
  useEffect(() => () => { itens.forEach((i) => URL.revokeObjectURL(i.preview)); if (video) URL.revokeObjectURL(video.preview); }, []); // eslint-disable-line
  // avisa se tentar fechar a página no meio do envio
  useEffect(() => {
    if (etapa !== 'enviando') return undefined;
    const f = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [etapa]);

  const outras = dados.demandas
    .filter((d) => !d.arquivada && d.empresa !== 'eko' && !minhasObras.some((o) => o.id === d.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const obra = dados.demandas.find((d) => d.id === demandaId);

  // origem: 'galeria' (lê a hora e o GPS originais da foto, se tiver) ou 'camera' (hora e local de agora)
  const adicionarFotos = async (lista, origem = 'galeria') => {
    const arquivos = [...lista].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || ''));
    const vagas = FOTOS_MAX - itens.length - processando;
    if (arquivos.length > vagas) setErro(`O máximo é ${FOTOS_MAX} fotos. ${arquivos.length - Math.max(0, vagas)} ficaram de fora.`);
    else setErro('');
    for (const arq of arquivos.slice(0, Math.max(0, vagas))) {
      setProcessando((n) => n + 1);
      try {
        let meta;
        if (origem === 'camera') {
          const p = posAgora();
          meta = { origem, quando: new Date(), lat: p?.lat, lon: p?.lon, prec: p?.prec };
        } else {
          const ex = await lerExif(arq);
          meta = { origem, quando: ex.quando || null, lat: ex.lat, lon: ex.lon };
        }
        const c = await comprimirFoto(arq); // uma por vez: não pesa a memória do celular
        setItens((xs) => [...xs, { key: Math.random().toString(36).slice(2), ...c, ...meta, preview: URL.createObjectURL(c.miniatura) }]);
      } catch (e) { setErro(e.message); }
      setProcessando((n) => n - 1);
    }
  };
  // foto tirada pela câmera do app
  const fotoDaCamera = async (blob, quando) => {
    if (itens.length + processando >= FOTOS_MAX) return;
    const p = posAgora();
    setProcessando((n) => n + 1);
    try {
      const c = await comprimirFoto(blob);
      setItens((xs) => [...xs, { key: Math.random().toString(36).slice(2), ...c, origem: 'camera', quando, lat: p?.lat, lon: p?.lon, prec: p?.prec, preview: URL.createObjectURL(c.miniatura) }]);
    } catch (e) { setErro(e.message); }
    setProcessando((n) => n - 1);
  };
  const quem = dados.funcionarios.find((f) => f.id === funcId)?.nome;
  const linhasCarimbo = (it) => {
    const q = it.quando ? new Date(it.quando) : null;
    const quandoTxt = q
      ? `${q.toLocaleDateString('pt-BR')} ${q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : escritorio ? `Relatório de ${new Date(dia + 'T12:00').toLocaleDateString('pt-BR')}` : 'Foto da galeria · sem horário original';
    return [
      quandoTxt,
      [obra?.nome, quem || (escritorio ? 'lançado pelo escritório' : null), tipoRelatorio[tipo]?.nome].filter(Boolean).join(' · '),
      it.lat != null ? `Local: ${coordTexto(it.lat, it.lon, it.prec)}` : null,
    ].filter(Boolean);
  };
  const tirar = (key) => setItens((xs) => xs.filter((x) => { if (x.key === key) URL.revokeObjectURL(x.preview); return x.key !== key; }));

  const escolherVideo = async (arq) => {
    if (!arq) return;
    try {
      const { duracao } = await conferirVideo(arq);
      if (video) URL.revokeObjectURL(video.preview);
      setVideo({ arquivo: arq, duracao, preview: URL.createObjectURL(arq) });
      setErro('');
    } catch (e) { setErro(e.message); }
  };

  const faltam = Math.max(0, minimo - itens.length);
  const pronto = demandaId && !faltam && !processando;

  const enviar = async () => {
    if (!pronto) return;
    setErro('');
    setEtapa('enviando');
    idRef.current ||= (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const base = `${dia}/${demandaId}/${idRef.current}`;
    // fila: cada foto sobe com a miniatura; vídeo por último
    const tarefas = [];
    itens.forEach((it, i) => {
      if (!it.caminho) tarefas.push(async () => {
        const n = String(i + 1).padStart(2, '0');
        const final = await carimbar(it.base, linhasCarimbo(it)); // data, hora, obra, nome e local na própria foto
        it.bytes = final.foto.size;
        const a = await dados.enviarArquivo(`${base}/foto-${n}.jpg`, final.foto, 'image/jpeg');
        if (!a.ok) throw new Error(a.erro);
        const b = await dados.enviarArquivo(`${base}/foto-${n}-mini.jpg`, final.miniatura, 'image/jpeg');
        if (!b.ok) throw new Error(b.erro);
        it.caminho = `${base}/foto-${n}.jpg`; it.mini = `${base}/foto-${n}-mini.jpg`;
      });
    });
    if (video && !video.caminho) tarefas.push(async () => {
      const ext = (video.arquivo.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const tipoMime = video.arquivo.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4');
      const a = await dados.enviarArquivo(`${base}/video.${ext}`, video.arquivo, tipoMime);
      if (!a.ok) throw new Error(a.erro);
      video.caminho = `${base}/video.${ext}`;
    });
    const total = itens.length + (video ? 1 : 0);
    let feito = total - tarefas.length;
    setProgresso({ feito, total });
    let falha = null;
    const fila = [...tarefas];
    const trabalhador = async () => {
      while (fila.length && !falha) {
        const t = fila.shift();
        try { await t(); feito++; setProgresso({ feito, total }); } catch (e) { falha = e; }
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    if (falha) {
      setErro(`Parou no meio do envio: ${(falha.message || 'erro de conexão').replace(/\.$/, '')}. As fotos que já subiram ficam guardadas; toque em "Tentar de novo".`);
      setEtapa('form');
      return;
    }
    const arquivos = [
      ...itens.map((it) => ({
        tipo: 'foto', caminho: it.caminho, miniatura: it.mini, bytes: it.bytes, origem: it.origem,
        quando: it.quando ? new Date(it.quando).toISOString() : null,
        ...(it.lat != null ? { lat: it.lat, lon: it.lon, precisao: it.prec ? Math.round(it.prec) : null } : {}),
      })),
      ...(video ? [{ tipo: 'video', caminho: video.caminho, bytes: video.arquivo.size, duracao: video.duracao }] : []),
    ];
    const ok = await dados.salvarRelatorio({
      id: idRef.current, demanda_id: demandaId, funcionario_id: funcId || null, dia, tipo, observacao: obs.trim() || null, arquivos,
    });
    if (!ok) { setErro('As fotos subiram, mas o relatório não foi registrado. Toque em "Tentar de novo".'); setEtapa('form'); return; }
    setEtapa('ok');
  };

  const fechar = () => {
    if (etapa === 'enviando') return;
    if (etapa === 'form' && (itens.length || video) && !window.confirm('Descartar este relatório?')) return;
    onFechar();
  };
  const pesoTotal = itens.reduce((s, i) => s + i.base.size * 0.8, 0) + (video?.arquivo.size || 0);
  const pesoOriginal = itens.reduce((s, i) => s + i.original, 0) + (video?.arquivo.size || 0);

  return createPortal(
    <div className="campo-folha" role="dialog" aria-modal="true" aria-label="Novo relatório">
      <header className="campo-folha-topo">
        {etapa === 'form' ? (
          <button type="button" className="pill ghost" onClick={() => (itens.length || video ? fechar() : setEtapa('tipo'))}>‹ Voltar</button>
        ) : <span />}
        <strong>{etapa === 'tipo' ? 'Novo relatório' : tipoRelatorio[tipo]?.nome}</strong>
        {etapa !== 'enviando' ? <button type="button" className="pill ghost" onClick={etapa === 'ok' ? onFechar : fechar}>Fechar</button> : <span />}
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

      {etapa === 'form' && (
        <div className="campo-form">
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
          {escritorio && (
            <div className="campo-linha2">
              <label className="field"><span>Dia do relatório</span>
                <input type="date" value={dia} max={hoje()} onChange={(e) => e.target.value && setDia(e.target.value)} />
              </label>
              <label className="field"><span>Quem enviou / estava na obra</span>
                <select value={funcId} onChange={(e) => setFuncId(e.target.value)}>
                  <option value="">Não informado</option>
                  {dados.funcionarios.filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="campo-fotos-head">
            <strong>Fotos</strong>
            <span className={faltam ? 'falta' : 'okk'}>{itens.length} {itens.length === 1 ? 'foto' : 'fotos'} · mín. {minimo}, máx. {FOTOS_MAX}</span>
          </div>
          <div className="campo-botoes">
            <button type="button" className="campo-add" onClick={() => setCamAberta(true)} disabled={itens.length >= FOTOS_MAX}>
              <b>Tirar fotos</b><span>várias seguidas</span>
            </button>
            <button type="button" className="campo-add" onClick={() => galRef.current?.click()} disabled={itens.length >= FOTOS_MAX}>
              <b>Galeria</b><span>escolher várias</span>
            </button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { adicionarFotos(e.target.files, 'camera'); e.target.value = ''; }} />
          {!escritorio && (
            <div className={'campo-geo ' + geo}>
              {geo === 'ok' ? <>Localização ligada{precisao ? ` · ±${Math.round(precisao)} m` : ''}</>
                : geo === 'buscando' ? 'Buscando a localização…'
                : geo === 'negado' ? <>Localização bloqueada: as fotos vão sem o local. <button type="button" className="link-btn" onClick={() => setTentativaGeo((n) => n + 1)}>Tentar de novo</button></>
                : 'Localização indisponível neste celular: as fotos vão sem o local.'}
            </div>
          )}
          <input ref={galRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { adicionarFotos(e.target.files); e.target.value = ''; }} />

          {(itens.length > 0 || processando > 0) && (
            <div className="campo-grade">
              {itens.map((it, i) => (
                <div key={it.key} className="campo-mini">
                  <img src={it.preview} alt={`Foto ${i + 1}`} />
                  {it.quando && <span className="campo-mini-hora">{new Date(it.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                  <button type="button" aria-label={`Tirar foto ${i + 1}`} onClick={() => tirar(it.key)}>×</button>
                </div>
              ))}
              {Array.from({ length: processando }, (_, i) => <div key={'p' + i} className="campo-mini carregando" aria-label="preparando foto" />)}
            </div>
          )}

          <div className="campo-video">
            {video ? (
              <div className="campo-video-item">
                <video src={video.preview} muted playsInline preload="metadata" />
                <span>Vídeo{video.duracao ? ` · ${video.duracao}s` : ''} · {tamanho(video.arquivo.size)}</span>
                <button type="button" className="link-btn" onClick={() => { URL.revokeObjectURL(video.preview); setVideo(null); }}>Tirar</button>
              </div>
            ) : (
              <button type="button" className="campo-add fino" onClick={() => vidRef.current?.click()}>
                <b>+ Vídeo (opcional)</b><span>até {VIDEO_MAX_SEG} segundos</span>
              </button>
            )}
            <input ref={vidRef} type="file" accept="video/*" hidden onChange={(e) => { escolherVideo(e.target.files[0]); e.target.value = ''; }} />
          </div>

          <label className="field"><span>Observação (opcional)</span>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Algo que o escritório precisa saber?" />
          </label>

          {erro && <div className="err" role="alert">{erro}</div>}

          <div className="campo-enviar">
            {itens.length > 0 && <span className="note">{tamanho(pesoTotal)} para enviar{pesoOriginal > pesoTotal * 1.5 ? ` (reduzido de ${tamanho(pesoOriginal)})` : ''}</span>}
            <button type="button" className="campo-novo" disabled={!pronto} onClick={enviar}>
              {processando ? 'Preparando fotos…' : !demandaId ? 'Escolha a obra' : faltam ? `Faltam ${faltam} ${faltam === 1 ? 'foto' : 'fotos'}` : erro && idRef.current ? 'Tentar de novo' : 'Enviar relatório'}
            </button>
          </div>
        </div>
      )}

      {camAberta && (
        <CameraContinua previas={itens} max={FOTOS_MAX} onFoto={fotoDaCamera} onFechar={() => setCamAberta(false)}
          onUsarNativa={() => { setCamAberta(false); camRef.current?.click(); }} />
      )}

      {etapa === 'enviando' && (
        <div className="campo-status">
          <div className="campo-spin" aria-hidden="true" />
          <strong>Enviando {Math.min(progresso.feito + 1, progresso.total)} de {progresso.total}…</strong>
          <div className="meter"><span style={{ width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%` }} /></div>
          <p className="note">Não feche o app até terminar.</p>
        </div>
      )}

      {etapa === 'ok' && (
        <div className="campo-status">
          <div className="campo-ok" aria-hidden="true">✓</div>
          <strong>Relatório enviado!</strong>
          <p className="note">{tipoRelatorio[tipo]?.nome} · {obra?.nome} · {itens.length} fotos{video ? ' + vídeo' : ''}</p>
          <button type="button" className="campo-novo" onClick={onFechar}>Voltar ao início</button>
        </div>
      )}
    </div>,
    document.body,
  );
}

// Visualizador de um relatório (usado no campo e na visão dos administradores)
export function VerRelatorio({ r, dados, onFechar, onApagar }) {
  const [foco, setFoco] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const obra = dados.demandas.find((d) => d.id === r.demanda_id);
  const quem = dados.funcionarios.find((f) => f.id === r.funcionario_id)?.nome || dados.perfis.find((p) => p.id === r.autor_id)?.nome;
  const fotos = (r.arquivos || []).filter((a) => a.tipo !== 'video');
  const videos = (r.arquivos || []).filter((a) => a.tipo === 'video');

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
            <span className="modal-kicker">{tipoRelatorio[r.tipo]?.nome || r.tipo}</span>
            <h2>{obra?.nome || 'Obra apagada'}</h2>
            <p className="note">
              {new Date(r.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · enviado às {hora(r.criado_em)}
              {quem ? ` por ${quem}` : ''} · {contagem(r)}
            </p>
          </div>
          <button type="button" className="pill ghost" onClick={onFechar}>Fechar</button>
        </div>
        {r.observacao && <p className="rel-obs">“{r.observacao}”</p>}
        <div className="rel-grade">
          {fotos.map((a, i) => (
            <button key={a.caminho} type="button" className="rel-foto" onClick={() => setFoco(i)} aria-label={`Abrir foto ${i + 1}`}>
              <img src={dados.urlArquivo(a.miniatura || a.caminho)} alt="" loading="lazy" />
              {a.quando && <span className="rel-foto-hora">{hora(a.quando)}</span>}
            </button>
          ))}
        </div>
        {videos.map((v) => (
          <video key={v.caminho} className="rel-video" src={dados.urlArquivo(v.caminho)} controls playsInline preload="metadata" />
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
      {foco != null && fotos[foco] && (
        <div className="rel-luz" onClick={(e) => e.target === e.currentTarget && setFoco(null)}>
          <img src={dados.urlArquivo(fotos[foco].caminho)} alt={`Foto ${foco + 1} de ${fotos.length}`} />
          <div className="rel-luz-barra">
            <button type="button" className="pill" disabled={foco === 0} onClick={() => setFoco(foco - 1)}>‹</button>
            <span>{foco + 1} / {fotos.length}{fotos[foco].quando ? ` · ${new Date(fotos[foco].quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            {fotos[foco].lat != null && <a className="pill" href={linkMapa(fotos[foco].lat, fotos[foco].lon)} target="_blank" rel="noreferrer">Ver no mapa</a>}
            <button type="button" className="pill" disabled={foco === fotos.length - 1} onClick={() => setFoco(foco + 1)}>›</button>
            <a className="pill" href={dados.urlArquivo(fotos[foco].caminho)} target="_blank" rel="noreferrer">Abrir</a>
            <button type="button" className="pill" onClick={() => setFoco(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
