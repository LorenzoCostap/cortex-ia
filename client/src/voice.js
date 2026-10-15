// Voz no navegador: ditado (reconhecimento de fala) e leitura das respostas (síntese de fala).
// O ditado usa o serviço do próprio navegador (no Chrome/Edge o áudio é processado online).
// A leitura em voz alta usa as vozes instaladas no Windows/macOS e funciona offline.
import { useEffect, useRef, useState } from 'react';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canListen = !!Recognition && typeof window !== 'undefined' && window.isSecureContext;
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Ditado em português. onFinal recebe o texto quando a pessoa para de falar. */
export function useDictation({ onText, onFinal }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const cb = useRef({ onText, onFinal });
  cb.current = { onText, onFinal };
  useEffect(() => () => rec.current?.abort(), []);

  const start = () => {
    if (!canListen || listening) return;
    setError('');
    const r = new Recognition();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      cb.current.onText?.((finalText + interim).trim());
    };
    r.onerror = (e) => setError({ 'not-allowed': 'Permita o uso do microfone no navegador.', 'no-speech': 'Não ouvi nada. Tente de novo.', network: 'O ditado precisa de internet neste navegador.', 'audio-capture': 'Nenhum microfone encontrado.' }[e.error] || `Erro no ditado (${e.error}).`);
    r.onend = () => { setListening(false); rec.current = null; if (finalText.trim()) cb.current.onFinal?.(finalText.trim()); };
    rec.current = r;
    r.start();
    setListening(true);
  };
  const stop = () => rec.current?.stop();
  return { listening, error, start, stop };
}

const clean = (t) => t
  .replace(/\*\*|`/g, '')
  .replace(/^\s*[-•]\s*/gm, '')
  .replace(/R\$\s?([\d.]+),(\d{2})/g, '$1 reais e $2 centavos')
  .replace(/R\$\s?([\d.,]+) mil/g, '$1 mil reais')
  .replace(/R\$\s?([\d.]+)/g, '$1 reais')
  .replace(/−/g, 'menos ')
  .replace(/p\.p\./g, 'pontos percentuais')
  .replace(/\bvs\b/g, 'contra');

function ptVoice() {
  const vs = window.speechSynthesis.getVoices();
  return vs.find((v) => v.lang === 'pt-BR' && /natural|online|google/i.test(v.name)) || vs.find((v) => v.lang === 'pt-BR') || vs.find((v) => v.lang?.startsWith('pt'));
}

export function speak(text, { onEnd } = {}) {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean(text));
  u.lang = 'pt-BR';
  const v = ptVoice();
  if (v) u.voice = v;
  u.rate = 1.05;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  window.speechSynthesis.speak(u);
}
export const stopSpeaking = () => canSpeak && window.speechSynthesis.cancel();
