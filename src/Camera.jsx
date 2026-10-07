import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Câmera dentro do app: fica aberta, tira várias fotos seguidas e volta com todas.
// onFoto(blob, quando) é chamado a cada clique; previas = miniaturas já tiradas (para mostrar embaixo).
export function CameraContinua({ onFoto, onFechar, previas = [], max = 30, onUsarNativa }) {
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
        <span className="cam-conta">{previas.length} {previas.length === 1 ? 'foto' : 'fotos'}{cheio ? ' · máximo' : ''}</span>
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
