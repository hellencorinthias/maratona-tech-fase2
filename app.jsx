/*
EmergencyAnonApp - Single-file React prototype (App.jsx)
Designed as a starting point for an anonymous reporting app with:
- SOS (Geolocation) button
- Voice-triggered alert (SpeechRecognition keywords)
- Manual anonymous report form
- Send help messages to trusted contacts (sms/mailto/share)
- Info section about ESI (Educação Sexual Integral)
- Settings (trusted contacts, voice keywords)
- Local history (saved in localStorage; anonymous)

How to run (quick):
1) Create a new Vite React project: `npm create vite@latest emergency-anon -- --template react`
2) Replace src/App.jsx with this file, keep other Vite files.
3) `npm install` then `npm run dev`.

Notes:
- This is a front-end prototype. To actually deliver SMS or store reports centrally you need a backend endpoint (/api/alert) or integration (e.g., Twilio, Firebase). The app intentionally avoids personal identifiers to keep reports anonymous by default.
- Voice trigger uses the Web Speech API (SpeechRecognition) — supported in Chromium-based browsers.
- Geolocation requires HTTPS (localhost OK for dev).
*/

import React, { useEffect, useState, useRef } from 'react';

const DEFAULT_KEYWORDS = ['socorro', 'ajuda', 'emergencia'];

function nowISO() {
  return new Date().toISOString();
}

function saveHistoryItem(item) {
  const h = JSON.parse(localStorage.getItem('ea_history') || '[]');
  h.unshift(item);
  localStorage.setItem('ea_history', JSON.stringify(h.slice(0, 200)));
}

function loadHistory() {
  return JSON.parse(localStorage.getItem('ea_history') || '[]');
}

function loadContacts() {
  return JSON.parse(localStorage.getItem('ea_contacts') || '[]');
}

function saveContacts(list) {
  localStorage.setItem('ea_contacts', JSON.stringify(list));
}

function loadKeywords() {
  return JSON.parse(localStorage.getItem('ea_keywords') || JSON.stringify(DEFAULT_KEYWORDS));
}

function saveKeywords(list) {
  localStorage.setItem('ea_keywords', JSON.stringify(list));
}

export default function App() {
  const [history, setHistory] = useState(loadHistory());
  const [contacts, setContacts] = useState(loadContacts());
  const [keywords, setKeywords] = useState(loadKeywords());
  const [listening, setListening] = useState(false);
  const [lastAlertStatus, setLastAlertStatus] = useState(null);
  const recognitionRef = useRef(null);
  const [manualText, setManualText] = useState('');

  useEffect(() => {
    saveContacts(contacts);
  }, [contacts]);

  useEffect(() => {
    saveKeywords(keywords);
  }, [keywords]);

  useEffect(() => {
    // initialize SpeechRecognition if available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'pt-BR';

    rec.onresult = (e) => {
      const results = Array.from(e.results).map(r => r[0].transcript).join(' ');
      console.log('voice:', results);
      for (const kw of keywords) {
        if (results.toLowerCase().includes(kw.toLowerCase())) {
          triggerSos({source: 'voice', recognized: results});
          break;
        }
      }
    };

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (err) => console.error('SpeechRecognition error', err);

    recognitionRef.current = rec;
  }, [keywords]);

  const startListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return alert('Navegador não suporta SpeechRecognition. Use Chrome/Edge');
    rec.start();
  };
  const stopListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    rec.stop();
  };

  async function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation não disponível'));
      navigator.geolocation.getCurrentPosition(pos => {
        resolve({lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy});
      }, err => reject(err), {enableHighAccuracy: true, timeout: 10000});
    });
  }

  async function triggerSos(meta = {}) {
    const ts = nowISO();
    let loc = null;
    try {
      loc = await getLocation();
    } catch (e) {
      console.warn('Não foi possível obter localização', e);
    }

    const payload = {
      anonymous: true,
      timestamp: ts,
      location: loc, // may be null
      meta,
    };

    // Save locally
    const item = {id: ts, type: 'sos', payload};
    saveHistoryItem(item);
    setHistory(loadHistory());

    // Optionally POST to backend (user must implement /api/alert)
    try {
      await fetch('/api/alert', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
      });
      setLastAlertStatus('enviado-remote');
    } catch (e) {
      console.warn('Falha ao enviar ao servidor (esperado em protótipo)', e);
      setLastAlertStatus('salvo-local');
    }

    // Send messages to trusted contacts (opens SMS/mailto/share links)
    const message = makeAlertMessage(payload);
    for (const c of contacts) {
      if (c.type === 'phone') {
        // open SMS link (best-effort) - varies by platform
        const sms = `sms:${c.value}?body=${encodeURIComponent(message)}`;
        window.open(sms);
      } else if (c.type === 'email') {
        const mail = `mailto:${c.value}?subject=${encodeURIComponent('Alerta de emergência')}&body=${encodeURIComponent(message)}`;
        window.open(mail);
      }
    }

    // For mobile: try navigator.share if available
    if (navigator.share) {
      try { await navigator.share({text: message, title: 'Alerta'}); } catch(e){/*cancel*/}
    }

    alert('Alerta acionado. Confira histórico.');
  }

  function makeAlertMessage(payload) {
    const loc = payload.location ? `Lat:${payload.location.lat.toFixed(5)} Lon:${payload.location.lon.toFixed(5)} (±${payload.location.accuracy}m)` : 'Localização indisponível';
    return `Alerta anônimo enviado em ${payload.timestamp}\n${loc}\nFonte: ${payload.meta.source || 'manual'}\nPor favor, verifique.`;
  }

  function addContact(type, value) {
    const id = Date.now();
    const c = {id, type, value};
    const next = [c, ...contacts];
    setContacts(next);
    saveContacts(next);
  }

  function removeContact(id) {
    const next = contacts.filter(c => c.id !== id);
    setContacts(next);
    saveContacts(next);
  }

  function addKeyword(kw) {
    if (!kw) return;
    const next = [...keywords, kw];
    setKeywords(next);
    saveKeywords(next);
  }

  function removeKeyword(kw) {
    const next = keywords.filter(k => k !== kw);
    setKeywords(next);
    saveKeywords(next);
  }

  function sendManualReport(e) {
    e.preventDefault();
    const ts = nowISO();
    const payload = {anonymous: true, timestamp: ts, text: manualText};
    const item = {id: ts, type: 'report', payload};
    saveHistoryItem(item);
    setHistory(loadHistory());
    setManualText('');
    alert('Denúncia registrada localmente. Implementar /api/alert para envio remoto.');
  }

  return (
    <div style={{fontFamily: 'Inter, system-ui, sans-serif', padding: 20, maxWidth: 1000, margin: '0 auto'}}>
      <header>
        <h1>EmergencyAnonApp</h1>
        <p>App protótipo para denúncias anônimas — SOS por botão, voz ou formulário.</p>
      </header>

      <section style={{display:'flex', gap:20}}>
        <div style={{flex:1}}>
          <div style={{background:'#ffeef0', padding:20, borderRadius:8}}>
            <h2>Botão SOCORRO</h2>
            <p>Ao pressionar, o app tenta obter localização e notifica contatos confiáveis.</p>
            <button style={{fontSize:24, padding:'14px 28px', borderRadius:10, background:'#d32f2f', color:'white', border:'none'}} onClick={() => triggerSos({source:'button'})}>SOCORRO</button>
            <div style={{marginTop:10}}>
              <button onClick={() => { listening ? stopListening() : startListening(); }}>
                {listening ? 'Parar escuta por voz' : 'Ativar escuta por voz (palavras-chave)'}
              </button>
              <div>Palavras-chave: {keywords.join(', ')}</div>
            </div>
            <div style={{marginTop:10}}>
              <strong>Último status:</strong> {lastAlertStatus || '—'}
            </div>
          </div>

          <div style={{marginTop:20, background:'#f1f1f1', padding:20, borderRadius:8}}>
            <h3>Denúncia manual</h3>
            <form onSubmit={sendManualReport}>
              <textarea placeholder="Descreva a situação (opcional, será anônimo)" value={manualText} onChange={e=>setManualText(e.target.value)} style={{width:'100%',height:120}} />
              <div style={{display:'flex', gap:10, marginTop:8}}>
                <button type='submit'>Enviar denúncia</button>
                <button type='button' onClick={()=>{navigator.clipboard?.writeText(manualText); alert('Texto copiado para área de transferência')}}>Copiar texto</button>
              </div>
            </form>
          </div>

          <div style={{marginTop:20, background:'#f9f9ff', padding:20, borderRadius:8}}>
            <h3>Informações sobre ESI</h3>
            <p>A sigla <strong>ESI</strong> costuma se referir a <em>Educação Sexual Integral</em>, um tema abordado em políticas educacionais na América Latina que trata da formação sobre sexualidade, direitos e saúde reprodutiva. (Consulte materiais oficiais para uso local.)</p>
            <details>
              <summary>Quer fontes rápidas?</summary>
              <ul>
                <li>UNFPA — orientações técnicas sobre educação sexual integral (documentos internacionais)</li>
                <li>Documentos e legislações locais sobre ESI (pesquise a norma do seu país/estado)</li>
              </ul>
            </details>
          </div>

        </div>

        <aside style={{width:320}}>
          <div style={{background:'#fffbe6', padding:16, borderRadius:8}}>
            <h3>Contatos confiáveis</h3>
            <small>Adicione telefones (tipo: phone) ou e-mails.</small>
            <ul>
              {contacts.map(c => (
                <li key={c.id} style={{marginTop:8}}>
                  <strong>{c.type}</strong>: {c.value} <button onClick={()=>removeContact(c.id)}>Remover</button>
                </li>
              ))}
            </ul>
            <div style={{marginTop:10}}>
              <AddContactForm onAdd={(t,v)=>addContact(t,v)} />
            </div>
          </div>

          <div style={{marginTop:16, background:'#eef9ff', padding:12, borderRadius:8}}>
            <h4>Palavras-chave de voz</h4>
            <ul>
              {keywords.map(k => (<li key={k}>{k} <button onClick={()=>removeKeyword(k)}>x</button></li>))}
            </ul>
            <AddKeywordForm onAdd={addKeyword} />
          </div>

          <div style={{marginTop:16, background:'#f7f7f7', padding:12, borderRadius:8}}>
            <h4>Histórico (local)</h4>
            <small>Os itens são anônimos e guardados no seu navegador.</small>
            <ol>
              {history.slice(0,10).map(h => (
                <li key={h.id}><strong>{h.type}</strong> — {new Date(h.id).toLocaleString()} {h.payload.location ? ` — ${h.payload.location.lat.toFixed(3)},${h.payload.location.lon.toFixed(3)}` : ''}</li>
              ))}
            </ol>
            <button onClick={()=>{localStorage.removeItem('ea_history'); setHistory([])}}>Limpar histórico</button>
          </div>
        </aside>
      </section>

      <footer style={{marginTop:24, fontSize:13, color:'#666'}}>
        Protótipo — personalize e adicione backend (Twilio, Firebase, ou endpoint próprio em /api/alert).
      </footer>
    </div>
  );
}

function AddContactForm({onAdd}){
  const [type, setType] = useState('phone');
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(e)=>{e.preventDefault(); if(!value) return; onAdd(type,value); setValue('');}}>
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value='phone'>phone</option>
        <option value='email'>email</option>
      </select>
      <input placeholder='Número ou e-mail' value={value} onChange={e=>setValue(e.target.value)} />
      <button type='submit'>Adicionar</button>
    </form>
  );
}

function AddKeywordForm({onAdd}){
  const [kw, setKw] = useState('');
  return (
    <form onSubmit={(e)=>{e.preventDefault(); if(!kw) return; onAdd(kw); setKw('');}}>
      <input placeholder='nova palavra-chave' value={kw} onChange={e=>setKw(e.target.value)} />
      <button>Adicionar</button>
    </form>
  );
}
