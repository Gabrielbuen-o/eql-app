import { useEffect, useRef, useState } from 'react';
import { desenharCarimbo } from './midia.js';
import { createPortal } from 'react-dom';

// Câmera dentro do app: fica aberta, tira várias fotos seguidas e volta com todas.
// onFoto(blob, quando) é chamado a cada clique; previas = miniaturas já tiradas (para mostrar embaixo).
export function CameraContinua({ onFoto, onFechar, previas = [], max = 30, onUsarNativa, titulo, recomendado }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [estado, setEstado] = useState('abrindo'); // abrindo | pronta | erro
  const [erro, setErro] = useState('');
  const [frente, setFrente] = useState(false);
  const [piscar, setPiscar] = useState(false);
  const [tirando, setTirando] = useState(false);
  const cheio = previas.length >= max;

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado('abrindo');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('sem suporte'), { name: 'NotSupportedError' });
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: frente ? 'user' : 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        const v = videoRef.current;
        v.srcObject = s;
        await v.play().catch(() => {});
        setEstado('pronta');
      } catch (e) {
        if (!vivo) return;
        setErro(e.name === 'NotAllowedError'
          ? 'O celular não deixou o app usar a câmera. Libere a câmera para este site nas configurações do navegador, ou use a câmera do celular.'
          : 'Não deu para abrir a câmera aqui. Use a câmera do celular.');
        setEstado('erro');
      }
    })();
    return () => {
      vivo = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [frente]);

  // trava a rolagem da página por trás
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);

  const clicar = async () => {
    const v = videoRef.current;
    if (!v || estado !== 'pronta' || cheio || tirando || !v.videoWidth) return;
    setTirando(true);
    const quando = new Date();
    setPiscar(true); setTimeout(() => setPiscar(false), 120);
    navigator.vibrate?.(30);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
    setTirando(false);
    if (blob) onFoto(blob, quando);
  };

  return createPortal(
    <div className="cam" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="cam-topo">
        <button type="button" className="cam-btn" onClick={onFechar}>Fechar</button>
        <span className="cam-conta">
          {titulo && <small className="cam-titulo">{titulo}</small>}
          {previas.length}{recomendado ? ` de ${recomendado}` : ''} {previas.length === 1 && !recomendado ? 'foto' : 'fotos'}{cheio ? ' · máximo' : ''}
        </span>
        <button type="button" className="cam-btn" onClick={() => setFrente((f) => !f)} aria-label="Trocar câmera" disabled={estado !== 'pronta'}>↺</button>
      </div>

      <div className="cam-visor">
        <video ref={videoRef} playsInline muted autoPlay className={frente ? 'espelho' : ''} />
        {piscar && <div className="cam-flash" />}
        {estado === 'abrindo' && <p className="cam-msg">Abrindo a câmera…</p>}
        {estado === 'erro' && (
          <div className="cam-msg">
            <p>{erro}</p>
            {onUsarNativa && <button type="button" className="campo-novo" onClick={onUsarNativa}>Usar a câmera do celular</button>}
          </div>
        )}
      </div>

      <div className="cam-base">
        <div className="cam-previas" aria-label="Fotos tiradas">
          {previas.slice(-6).map((p) => <img key={p.key} src={p.preview} alt="" />)}
        </div>
        <button type="button" className="cam-disparo" aria-label="Tirar foto" onClick={clicar} disabled={estado !== 'pronta' || cheio} />
        <button type="button" className="cam-pronto" onClick={onFechar} disabled={!previas.length}>
          Pronto{previas.length ? ` (${previas.length})` : ''}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// Formato de gravação que o aparelho aceita (iPhone grava mp4; Android/Chrome mp4 ou webm)
function formatoVideo() {
  const opcoes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  return opcoes.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

// Gravador dentro do app: até `max` segundos, em 720p e qualidade leve (~8–12 MB por 30 s).
// onPronto({ blob, mime, ext, duracao })
// carimbo(agora) → linhas gravadas em cada quadro do vídeo (data/hora correndo, obra, nome, local)
export function GravadorVideo({ max = 30, onPronto, onFechar, onUsarNativa, carimbo }) {
  const desenhoRef = useRef(null); // { parar() } do desenho no canvas
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const partes = useRef([]);
  const inicio = useRef(0);
  const [estado, setEstado] = useState('abrindo'); // abrindo | pronto | gravando | revisar | erro
  const [erro, setErro] = useState('');
  const [seg, setSeg] = useState(0);
  const [gravado, setGravado] = useState(null); // { blob, url, mime, ext, duracao }

  const abrir = async () => {
    setEstado('abrindo');
    try {
      if (!navigator.mediaDevices?.getUserMedia || formatoVideo() === null) throw Object.assign(new Error(), { name: 'NotSupportedError' });
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          audio: true, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        });
      } catch (e) {
        if (e.name !== 'NotAllowedError') throw e;
        // sem permissão de microfone: grava só a imagem
        s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      }
      streamRef.current = s;
      const v = videoRef.current;
      v.srcObject = s; v.muted = true;
      await v.play().catch(() => {});
      setEstado('pronto');
    } catch (e) {
      setErro(e.name === 'NotAllowedError'
        ? 'O celular não deixou o app usar a câmera. Libere a câmera para este site nas configurações do navegador, ou grave pela câmera do celular.'
        : 'Não deu para gravar por aqui neste celular. Grave pela câmera do celular (até 30 segundos).');
      setEstado('erro');
    }
  };
  const parar = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };
  const desligar = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  useEffect(() => { abrir(); return () => { parar(); desligar(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);
  // contador e parada automática no limite
  useEffect(() => {
    if (estado !== 'gravando') return undefined;
    const t = setInterval(() => {
      const s = (Date.now() - inicio.current) / 1000;
      setSeg(Math.min(max, Math.floor(s)));
      if (s >= max) parar();
    }, 200);
    return () => clearInterval(t);
  }, [estado, max]);

  // grava a imagem da câmera com o carimbo por cima (canvas). Se o aparelho não deixar, grava sem carimbo.
  const streamComCarimbo = (s) => {
    const v = videoRef.current;
    if (!carimbo || !v?.videoWidth) return s;
    const c = document.createElement('canvas');
    if (typeof c.captureStream !== 'function') return s;
    const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * escala); c.height = Math.round(v.videoHeight * escala);
    const ctx = c.getContext('2d');
    let vivo = true, ultimo = 0;
    const quadro = (t) => {
      if (!vivo) return;
      if (t - ultimo >= 30) {
        ultimo = t;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        desenharCarimbo(ctx, c.width, c.height, carimbo(new Date()));
      }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
    const saida = c.captureStream(30);
    s.getAudioTracks().forEach((t) => saida.addTrack(t));
    desenhoRef.current = { parar: () => { vivo = false; saida.getVideoTracks().forEach((t) => t.stop()); } };
    return saida;
  };

  const gravar = () => {
    const bruto = streamRef.current;
    if (!bruto) return;
    let s = bruto;
    try { s = streamComCarimbo(bruto); } catch { s = bruto; }
    const mime = formatoVideo();
    let rec;
    try {
      rec = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 64_000 });
    } catch {
      rec = new MediaRecorder(s);
    }
    partes.current = [];
    rec.ondataavailable = (e) => e.data && e.data.size && partes.current.push(e.data);
    rec.onstop = () => {
      desenhoRef.current?.parar(); desenhoRef.current = null;
      const tipo = (rec.mimeType || mime || 'video/mp4').split(';')[0];
      const blob = new Blob(partes.current, { type: tipo });
      const duracao = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
      setGravado({ blob, url: URL.createObjectURL(blob), mime: tipo, ext: tipo.includes('webm') ? 'webm' : 'mp4', duracao: Math.min(duracao, max), quando: new Date(inicio.current) });
      setEstado('revisar');
    };
    recRef.current = rec;
    inicio.current = Date.now();
    setSeg(0);
    rec.start(1000);
    setEstado('gravando');
    navigator.vibrate?.(40);
  };
  const deNovo = () => { if (gravado) URL.revokeObjectURL(gravado.url); setGravado(null); setEstado('pronto'); };
  const usar = () => { desligar(); const g = gravado; setGravado(null); onPronto(g); };
  const mmss = (n) => `0:${String(n).padStart(2, '0')}`;

  return createPortal(
    <div className="cam" role="dialog" aria-modal="true" aria-label="Gravar vídeo">
      <div className="cam-topo">
        <button type="button" className="cam-btn" onClick={() => { parar(); desligar(); if (gravado) URL.revokeObjectURL(gravado.url); onFechar(); }}>Fechar</button>
        <span className={'cam-conta' + (estado === 'gravando' ? ' rec' : '')}>
          {estado === 'gravando' ? <><i className="cam-rec" /> {mmss(seg)} / {mmss(max)}</> : `Vídeo até ${max} segundos`}
        </span>
        <span style={{ width: 40 }} />
      </div>

      <div className="cam-visor">
        <video ref={videoRef} playsInline muted autoPlay style={{ display: estado === 'revisar' ? 'none' : undefined }} />
        {estado === 'revisar' && gravado && <video key={gravado.url} src={gravado.url} playsInline controls autoPlay />}
        {estado === 'gravando' && <div className="cam-barra"><span style={{ width: `${(seg / max) * 100}%` }} /></div>}
        {carimbo && (estado === 'pronto' || estado === 'gravando') && (
          <div className="cam-carimbo" aria-hidden="true">{carimbo(new Date()).map((l, i) => <span key={i} className={i ? '' : 'l1'}>{l}</span>)}</div>
        )}
        {estado === 'abrindo' && <p className="cam-msg">Abrindo a câmera…</p>}
        {estado === 'erro' && (
          <div className="cam-msg">
            <p>{erro}</p>
            {onUsarNativa && <button type="button" className="campo-novo" onClick={onUsarNativa}>Gravar pela câmera do celular</button>}
          </div>
        )}
      </div>

      <div className="cam-base">
        {estado === 'revisar' ? (
          <>
            <button type="button" className="cam-btn" onClick={deNovo}>Gravar de novo</button>
            <span className="cam-info">{gravado?.duracao}s · {(gravado?.blob.size / 1048576).toFixed(1).replace('.', ',')} MB</span>
            <button type="button" className="cam-pronto" onClick={usar}>Usar vídeo</button>
          </>
        ) : (
          <>
            <span />
            <button type="button" className={'cam-disparo video' + (estado === 'gravando' ? ' gravando' : '')}
              aria-label={estado === 'gravando' ? 'Parar gravação' : 'Começar a gravar'}
              onClick={estado === 'gravando' ? parar : gravar} disabled={estado !== 'pronto' && estado !== 'gravando'} />
            <span />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
