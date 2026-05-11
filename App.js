import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from "react-native";
import { WebView } from "react-native-webview";

const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function freqToNote(freq) {
  if (!freq || freq <= 0) return null;
  const n       = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(n);
  const cents   = Math.round((n - rounded) * 100);
  return {
    note:   NOTES[((rounded % 12) + 12) % 12],
    octave: Math.floor(rounded / 12) - 1,
    cents,
    freq:   freq.toFixed(1),
  };
}

// Notas simuladas com frequências reais + desvio proposital para demo
const SIMULATED_NOTES = [
  { label: "E2",  freq: 82.41,   cents: 0,   desc: "afinado" },
  { label: "A2",  freq: 113.5,   cents: 28,  desc: "agudo" },
  { label: "D3",  freq: 143.2,   cents: -12, desc: "grave" },
  { label: "G3",  freq: 196.0,   cents: 3,   desc: "afinado" },
  { label: "B3",  freq: 252.0,   cents: 18,  desc: "agudo" },
  { label: "E4",  freq: 329.63,  cents: 0,   desc: "afinado" },
  { label: "A4",  freq: 440.0,   cents: 0,   desc: "440 Hz" },
];

const BRIDGE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script src="https://cdn.jsdelivr.net/npm/pitchy@4/dist/pitchy.umd.js"><\/script>
<script>
  var PitchDetector = pitchy.PitchDetector;
  var ctx, analyser, stream, detector, raf;
  var running = false;

  function start() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(s) {
      stream   = s;
      ctx      = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      detector = PitchDetector.forFloat32Array(analyser.fftSize);
      running  = true;
      var buf  = new Float32Array(analyser.fftSize);
      (function tick() {
        analyser.getFloatTimeDomainData(buf);
        var result  = detector.findPitch(buf, ctx.sampleRate);
        var pitch   = result[0];
        var clarity = result[1];
        var payload = (clarity > 0.9 && pitch > 55 && pitch < 4200)
          ? { pitch: pitch, clarity: clarity }
          : { pitch: 0, clarity: clarity };
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        if (running) raf = requestAnimationFrame(tick);
      })();
    }).catch(function(err) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ error: err.message }));
    });
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (ctx) ctx.close();
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
  }

  window.addEventListener("message", function(e) {
    if (e.data === "START") start();
    if (e.data === "STOP")  stop();
  });
  document.addEventListener("message", function(e) {
    if (e.data === "START") start();
    if (e.data === "STOP")  stop();
  });
<\/script>
</body>
</html>`;

export default function App() {
  const webViewRef            = useRef(null);
  const [active, setActive]   = useState(false);
  const [note, setNote]       = useState(null);
  const [mode, setMode]       = useState("mic"); // "mic" | "sim"
  const simIntervalRef        = useRef(null);

  // ─── Microfone real ──────────────────────────────────────
  function startMic() {
    webViewRef.current?.postMessage("START");
    setActive(true);
  }
  function stopMic() {
    webViewRef.current?.postMessage("STOP");
    setActive(false);
    setNote(null);
  }

  function onMessage(e) {
    const data = JSON.parse(e.nativeEvent.data);
    if (data.error) return;
    setNote(data.pitch > 0 ? freqToNote(data.pitch) : null);
  }

  // ─── Simulação ───────────────────────────────────────────
  function simulateNote(simItem) {
    if (mode === "mic" && active) stopMic();
    // Monta um noteInfo diretamente, sem passar pelo Pitchy
    setNote({
      note:   freqToNote(simItem.freq)?.note  ?? "?",
      octave: freqToNote(simItem.freq)?.octave ?? 0,
      cents:  simItem.cents,
      freq:   simItem.freq.toFixed(1),
    });
  }

  function clearSim() {
    setNote(null);
  }

  // ─── Cores ───────────────────────────────────────────────
  const inTune = note && Math.abs(note.cents) <= 5;
  const color  = !note              ? "#444"
    : inTune                        ? "#22c55e"
    : Math.abs(note.cents) <= 15   ? "#f59e0b"
    : "#ef4444";

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />

      {/* WebView invisível — Pitchy real */}
      <WebView
        ref={webViewRef}
        source={{ html: BRIDGE_HTML }}
        onMessage={onMessage}
        style={{ width: 0, height: 0, position: "absolute" }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
      />

      <Text style={s.appTitle}>PITCHY TUNER</Text>

      {/* Display principal */}
      <View style={s.display}>
        <Text style={[s.note, { color }]}>
          {note ? `${note.note}${note.octave}` : "–"}
        </Text>
        <Text style={[s.cents, { color }]}>
          {note
            ? inTune ? "✓ afinado" : `${note.cents > 0 ? "+" : ""}${note.cents}¢`
            : mode === "mic" && active ? "ouvindo..." : ""}
        </Text>
        <Text style={s.freq}>{note ? `${note.freq} Hz` : ""}</Text>
      </View>

      {/* Toggle de modo */}
      <View style={s.modeRow}>
        <TouchableOpacity
          style={[s.modeBtn, mode === "mic" && s.modeBtnActive]}
          onPress={() => { setMode("mic"); clearSim(); }}
        >
          <Text style={[s.modeBtnText, mode === "mic" && s.modeBtnTextActive]}>🎙 MICROFONE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === "sim" && s.modeBtnActive]}
          onPress={() => { setMode("sim"); if (active) stopMic(); clearSim(); }}
        >
          <Text style={[s.modeBtnText, mode === "sim" && s.modeBtnTextActive]}>🎛 SIMULAÇÃO</Text>
        </TouchableOpacity>
      </View>

      {/* Modo microfone */}
      {mode === "mic" && (
        <TouchableOpacity
          style={[s.btn, active && s.btnActive]}
          onPress={active ? stopMic : startMic}
        >
          <Text style={[s.btnText, active && s.btnTextActive]}>
            {active ? "PARAR" : "INICIAR"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Modo simulação */}
      {mode === "sim" && (
        <View style={s.simPanel}>
          <Text style={s.simTitle}>Toque uma nota para simular:</Text>
          <View style={s.simGrid}>
            {SIMULATED_NOTES.map((item) => {
              const isActive = note?.freq === item.freq.toFixed(1);
              const itemColor = Math.abs(item.cents) <= 5  ? "#22c55e"
                              : Math.abs(item.cents) <= 15 ? "#f59e0b"
                              : "#ef4444";
              return (
                <TouchableOpacity
                  key={item.label}
                  style={[s.simBtn, isActive && { borderColor: itemColor }]}
                  onPress={() => simulateNote(item)}
                >
                  <Text style={[s.simBtnNote, { color: isActive ? itemColor : "#e0e0e0" }]}>
                    {item.label}
                  </Text>
                  <Text style={[s.simBtnDesc, { color: isActive ? itemColor : "#555" }]}>
                    {item.cents === 0 ? "±0¢" : item.cents > 0 ? `+${item.cents}¢` : `${item.cents}¢`}
                  </Text>
                  <Text style={s.simBtnHz}>{item.freq.toFixed(1)} Hz</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[s.simBtn, s.simBtnClear]} onPress={clearSim}>
              <Text style={s.simBtnNote}>–</Text>
              <Text style={s.simBtnDesc}>limpar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={s.badge}>powered by pitchy · mcleod pitch method</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: "#0d0d0d", alignItems: "center", paddingTop: 60, paddingBottom: 24 },
  appTitle:        { fontFamily: "monospace", fontSize: 11, letterSpacing: 6, color: "#444", marginBottom: 20 },

  // Display
  display:         { alignItems: "center", marginBottom: 24, height: 160, justifyContent: "center" },
  note:            { fontFamily: "monospace", fontSize: 88, fontWeight: "bold", lineHeight: 88 },
  cents:           { fontFamily: "monospace", fontSize: 16, letterSpacing: 2, height: 22, marginTop: 4 },
  freq:            { fontFamily: "monospace", fontSize: 12, color: "#555", height: 18, marginTop: 2 },

  // Toggle de modo
  modeRow:         { flexDirection: "row", gap: 8, marginBottom: 20 },
  modeBtn:         { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: "#2a2a2a" },
  modeBtnActive:   { borderColor: "#22c55e", backgroundColor: "#0f2a1a" },
  modeBtnText:     { fontFamily: "monospace", fontSize: 10, color: "#555", letterSpacing: 2 },
  modeBtnTextActive: { color: "#22c55e" },

  // Botão mic
  btn:             { paddingVertical: 14, paddingHorizontal: 48, borderRadius: 999, backgroundColor: "#22c55e" },
  btnActive:       { backgroundColor: "transparent", borderWidth: 1, borderColor: "#ef4444" },
  btnText:         { fontFamily: "monospace", fontSize: 12, fontWeight: "bold", letterSpacing: 4, color: "#000" },
  btnTextActive:   { color: "#ef4444" },

  // Painel de simulação
  simPanel:        { width: "100%", paddingHorizontal: 16 },
  simTitle:        { fontFamily: "monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 12, textAlign: "center" },
  simGrid:         { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  simBtn:          { width: 90, paddingVertical: 12, alignItems: "center", backgroundColor: "#141414", borderRadius: 10, borderWidth: 1, borderColor: "#252525" },
  simBtnClear:     { borderColor: "#1a1a1a" },
  simBtnNote:      { fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: "#666" },
  simBtnDesc:      { fontFamily: "monospace", fontSize: 10, color: "#444", marginTop: 2 },
  simBtnHz:        { fontFamily: "monospace", fontSize: 9, color: "#333", marginTop: 1 },

  badge:           { position: "absolute", bottom: 16, fontFamily: "monospace", fontSize: 9, color: "#2a2a2a", letterSpacing: 2 },
});