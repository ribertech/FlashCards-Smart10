import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CalendarCheck,
  Download,
  Flame,
  Headphones,
  Home,
  Import,
  Layers,
  Moon,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sun,
  Trash2,
  Upload,
  Volume2,
  X
} from "lucide-react";
import "./styles.css";
import {
  deletePhrase,
  exportRows,
  getAllPhrases,
  getMeta,
  importRows,
  recordStudyDay,
  savePhrase,
  seedIfNeeded
} from "./storage.js";
import { CATEGORIES, createEmptyPhrase, isDue, reviewPhrase } from "./srs.js";
import { downloadBlob, parseCsv, rowsToCsv } from "./utils.js";

const todayKey = () => new Date().toISOString().slice(0, 10);
const VOICE_STORAGE_KEY = "frases-ingles-voice-choice";
const THEME_STORAGE_KEY = "frases-ingles-theme";
const MALE_VOICE_PATTERN = /alex|daniel|david|fred|guy|mark|tom|aaron|arthur|brian|christopher|eric|george|liam|oliver|ryan/i;
const FEMALE_VOICE_PATTERN = /samantha|karen|susan|victoria|zira|jenny|aria|ava|emma|joanna|salli|serena/i;

function useSpeech() {
  const [voices, setVoices] = useState([]);
  const [voiceChoice, setVoiceChoice] = useState(() => localStorage.getItem(VOICE_STORAGE_KEY) || "auto");

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis?.getVoices?.() ?? []);
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    localStorage.setItem(VOICE_STORAGE_KEY, voiceChoice);
  }, [voiceChoice]);

  const englishVoices = useMemo(() => {
    const enUs = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en-us"));
    return enUs.length > 0 ? enUs : voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  }, [voices]);

  const preferredVoice = useMemo(() => {
    if (voiceChoice.startsWith("voice:")) {
      const voiceURI = voiceChoice.replace("voice:", "");
      return englishVoices.find((voice) => voice.voiceURI === voiceURI || voice.name === voiceURI);
    }

    if (voiceChoice === "male") {
      return (
        englishVoices.find((voice) => MALE_VOICE_PATTERN.test(voice.name)) ||
        englishVoices.find((voice) => !FEMALE_VOICE_PATTERN.test(voice.name)) ||
        englishVoices[0]
      );
    }

    if (voiceChoice === "samantha") {
      return (
        englishVoices.find((voice) => /samantha/i.test(voice.name)) ||
        englishVoices.find((voice) => FEMALE_VOICE_PATTERN.test(voice.name)) ||
        englishVoices[0]
      );
    }

    return (
      englishVoices.find((voice) => /natural|premium|samantha|google|microsoft/i.test(voice.name)) ||
      englishVoices[0] ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith("en"))
    );
  }, [englishVoices, voiceChoice, voices]);

  function speak(text, mode = "normal") {
    if (!("speechSynthesis" in window)) {
      alert("Seu navegador nao suporta audio por Web Speech API.");
      return;
    }

    window.speechSynthesis.cancel();
    const repeat = mode === "repeat" ? 2 : 1;
    const rate = mode === "slow" ? 0.72 : 0.95;

    for (let index = 0; index < repeat; index += 1) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = rate;
      utterance.pitch = 1;
      if (preferredVoice) utterance.voice = preferredVoice;
      window.speechSynthesis.speak(utterance);
    }
  }

  return { speak, preferredVoice, englishVoices, voiceChoice, setVoiceChoice };
}

function App() {
  const [phrases, setPhrases] = useState([]);
  const [meta, setMeta] = useState({ studyDays: [] });
  const [view, setView] = useState("home");
  const [editing, setEditing] = useState(null);
  const [studyQueue, setStudyQueue] = useState([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [audioMode, setAudioMode] = useState("normal");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || "light");
  const { speak, preferredVoice, englishVoices, voiceChoice, setVoiceChoice } = useSpeech();

  async function refresh() {
    await seedIfNeeded();
    setPhrases(await getAllPhrases());
    setMeta(await getMeta());
  }

  useEffect(() => {
    refresh();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const stats = useMemo(() => {
    const due = phrases.filter(isDue);
    const newCount = phrases.filter((phrase) => phrase.reviewCount === 0).length;
    return {
      total: phrases.length,
      due: due.length,
      newCount,
      streak: calculateStreak(meta.studyDays ?? [])
    };
  }, [phrases, meta]);

  const filteredPhrases = useMemo(() => {
    return phrases.filter((phrase) => {
      const inCategory = categoryFilter === "Todas" || phrase.category === categoryFilter;
      const text = `${phrase.portuguese} ${phrase.english} ${phrase.notes} ${phrase.category}`.toLowerCase();
      return inCategory && text.includes(query.toLowerCase());
    });
  }, [phrases, categoryFilter, query]);

  const currentCard = studyQueue[studyIndex];

  function startStudy() {
    const due = phrases
      .filter(isDue)
      .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));

    setStudyQueue(due);
    setStudyIndex(0);
    setAnswerVisible(false);
    setView("study");
  }

  async function handleSave(phrase) {
    await savePhrase(phrase);
    setEditing(null);
    await refresh();
    setView("library");
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("Excluir esta frase?");
    if (!confirmed) return;
    await deletePhrase(id);
    await refresh();
  }

  async function grade(rating) {
    const reviewed = reviewPhrase(currentCard, rating);
    await savePhrase(reviewed);
    await recordStudyDay(todayKey());
    await refresh();

    const nextIndex = studyIndex + 1;
    setAnswerVisible(false);
    if (nextIndex >= studyQueue.length) {
      setStudyQueue([]);
      setStudyIndex(0);
      setView("home");
    } else {
      setStudyIndex(nextIndex);
    }
  }

  async function handleExport(type) {
    const rows = await exportRows();
    if (type === "json") {
      downloadBlob("frases-ingles.json", JSON.stringify(rows, null, 2), "application/json");
    } else {
      downloadBlob("frases-ingles.csv", rowsToCsv(rows), "text/csv;charset=utf-8");
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = file.name.endsWith(".json") ? JSON.parse(text) : parseCsv(text);
    await importRows(rows);
    event.target.value = "";
    await refresh();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PWA pessoal</p>
          <h1>Frases em Ingles</h1>
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          >
            {theme === "dark" ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <button className="icon-button" onClick={() => setView("home")} aria-label="Inicio" title="Inicio">
            <Home size={22} />
          </button>
        </div>
      </header>

      {view === "home" && (
        <HomeView stats={stats} startStudy={startStudy} setView={setView} preferredVoice={preferredVoice} />
      )}

      {view === "study" && (
        <StudyView
          card={currentCard}
          answerVisible={answerVisible}
          setAnswerVisible={setAnswerVisible}
          speak={speak}
          audioMode={audioMode}
          setAudioMode={setAudioMode}
          voiceChoice={voiceChoice}
          setVoiceChoice={setVoiceChoice}
          voices={englishVoices}
          grade={grade}
          remaining={studyQueue.length - studyIndex}
          goHome={() => setView("home")}
        />
      )}

      {view === "library" && (
        <LibraryView
          phrases={filteredPhrases}
          allCount={phrases.length}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          query={query}
          setQuery={setQuery}
          onNew={() => {
            setEditing(createEmptyPhrase());
            setView("form");
          }}
          onEdit={(phrase) => {
            setEditing(phrase);
            setView("form");
          }}
          onDelete={handleDelete}
          speak={speak}
        />
      )}

      {view === "form" && (
        <PhraseForm
          phrase={editing ?? createEmptyPhrase()}
          onCancel={() => {
            setEditing(null);
            setView("library");
          }}
          onSave={handleSave}
        />
      )}

      {view === "data" && (
        <DataView onExport={handleExport} onImport={handleImport} />
      )}

      <nav className="bottom-nav" aria-label="Navegacao principal">
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>
          <Home size={20} /> Inicio
        </button>
        <button className={view === "study" ? "active" : ""} onClick={startStudy}>
          <BookOpen size={20} /> Estudar
        </button>
        <button className={view === "library" || view === "form" ? "active" : ""} onClick={() => setView("library")}>
          <Layers size={20} /> Frases
        </button>
        <button className={view === "data" ? "active" : ""} onClick={() => setView("data")}>
          <Upload size={20} /> Dados
        </button>
      </nav>
    </main>
  );
}

function HomeView({ stats, startStudy, setView, preferredVoice }) {
  return (
    <section className="screen">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">Revisao de hoje</p>
          <strong>{stats.due}</strong>
          <span>frases prontas para estudar</span>
        </div>
        <button className="primary-action" onClick={startStudy} disabled={stats.due === 0}>
          <Play size={22} /> Estudar agora
        </button>
      </div>

      <div className="stat-grid">
        <Metric icon={<Layers />} label="Cadastradas" value={stats.total} />
        <Metric icon={<CalendarCheck />} label="Para hoje" value={stats.due} />
        <Metric icon={<BookOpen />} label="Novas" value={stats.newCount} />
        <Metric icon={<Flame />} label="Sequencia" value={`${stats.streak}d`} />
      </div>

      <div className="quick-actions">
        <button onClick={() => setView("library")}>
          <Plus size={20} /> Nova frase
        </button>
        <button onClick={() => setView("data")}>
          <Download size={20} /> Exportar
        </button>
      </div>

      <p className="voice-note">
        <Headphones size={18} />
        Voz preferida: {preferredVoice?.name ?? "a melhor voz en-US disponivel no navegador"}
      </p>
    </section>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      {React.cloneElement(icon, { size: 22 })}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StudyView({
  card,
  answerVisible,
  setAnswerVisible,
  speak,
  audioMode,
  setAudioMode,
  voiceChoice,
  setVoiceChoice,
  voices,
  grade,
  remaining,
  goHome
}) {
  if (!card) {
    return (
      <section className="screen empty-state">
        <CalendarCheck size={42} />
        <h2>Nada para revisar agora</h2>
        <p>Volte mais tarde ou cadastre novas frases para continuar estudando.</p>
        <button className="primary-action" onClick={goHome}>Voltar ao inicio</button>
      </section>
    );
  }

  return (
    <section className="screen study-screen">
      <div className="study-progress">{remaining} restantes</div>
      <article className="study-card">
        <p className="eyebrow">{card.category}</p>
        <h2>{card.portuguese}</h2>

        {!answerVisible ? (
          <button className="primary-action wide" onClick={() => setAnswerVisible(true)}>
            Mostrar resposta
          </button>
        ) : (
          <div className="answer">
            <p>{card.english}</p>
            <AudioControls
              text={card.english}
              speak={speak}
              mode={audioMode}
              setMode={setAudioMode}
              voiceChoice={voiceChoice}
              setVoiceChoice={setVoiceChoice}
              voices={voices}
            />
            {card.notes && <div className="notes">{card.notes}</div>}
            <div className="grade-grid">
              <button className="again" onClick={() => grade("again")}>Errei</button>
              <button className="hard" onClick={() => grade("hard")}>Dificil</button>
              <button className="good" onClick={() => grade("good")}>Bom</button>
              <button className="easy" onClick={() => grade("easy")}>Facil</button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

function AudioControls({ text, speak, mode, setMode, voiceChoice, setVoiceChoice, voices }) {
  return (
    <div className="audio-controls">
      <div className="segmented">
        <button className={mode === "normal" ? "selected" : ""} onClick={() => setMode("normal")}>Normal</button>
        <button className={mode === "slow" ? "selected" : ""} onClick={() => setMode("slow")}>Lenta</button>
        <button className={mode === "repeat" ? "selected" : ""} onClick={() => setMode("repeat")}>Repetir</button>
      </div>
      <label className="voice-picker">
        Voz
        <select value={voiceChoice} onChange={(event) => setVoiceChoice(event.target.value)}>
          <option value="auto">Automatica</option>
          <option value="male">Masculina</option>
          <option value="samantha">Samantha / feminina</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI || voice.name} value={`voice:${voice.voiceURI || voice.name}`}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </label>
      <button className="listen-button" onClick={() => speak(text, mode)}>
        <Volume2 size={20} /> Ouvir
      </button>
    </div>
  );
}

function LibraryView({
  phrases,
  allCount,
  categoryFilter,
  setCategoryFilter,
  query,
  setQuery,
  onNew,
  onEdit,
  onDelete,
  speak
}) {
  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{allCount} frases</p>
          <h2>Biblioteca</h2>
        </div>
        <button className="icon-button filled" onClick={onNew} aria-label="Nova frase" title="Nova frase">
          <Plus size={22} />
        </button>
      </div>

      <label className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar frase" />
      </label>

      <div className="category-row">
        {["Todas", ...CATEGORIES].map((category) => (
          <button
            key={category}
            className={categoryFilter === category ? "selected" : ""}
            onClick={() => setCategoryFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="phrase-list">
        {phrases.map((phrase) => (
          <article className="phrase-card" key={phrase.id}>
            <div>
              <span>{phrase.category}</span>
              <h3>{phrase.portuguese}</h3>
              <p>{phrase.english}</p>
            </div>
            <div className="phrase-actions">
              <button onClick={() => speak(phrase.english)} aria-label="Ouvir" title="Ouvir"><Volume2 size={18} /></button>
              <button onClick={() => onEdit(phrase)} aria-label="Editar" title="Editar"><Pencil size={18} /></button>
              <button onClick={() => onDelete(phrase.id)} aria-label="Excluir" title="Excluir"><Trash2 size={18} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PhraseForm({ phrase, onCancel, onSave }) {
  const [draft, setDraft] = useState(phrase);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!draft.portuguese.trim() || !draft.english.trim()) {
      alert("Preencha a frase em portugues e em ingles.");
      return;
    }
    onSave(draft);
  }

  return (
    <section className="screen">
      <div className="section-heading">
        <h2>{draft.id ? "Editar frase" : "Nova frase"}</h2>
        <button className="icon-button" onClick={onCancel} aria-label="Cancelar" title="Cancelar">
          <X size={22} />
        </button>
      </div>

      <form className="phrase-form" onSubmit={submit}>
        <label>
          Portugues
          <textarea value={draft.portuguese} onChange={(event) => update("portuguese", event.target.value)} rows={3} />
        </label>
        <label>
          Ingles
          <textarea value={draft.english} onChange={(event) => update("english", event.target.value)} rows={3} />
        </label>
        <label>
          Categoria
          <select value={draft.category} onChange={(event) => update("category", event.target.value)}>
            {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Observacao ou exemplo
          <textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={3} />
        </label>
        <button className="primary-action wide" type="submit">
          <Save size={20} /> Salvar
        </button>
      </form>
    </section>
  );
}

function DataView({ onExport, onImport }) {
  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Backup local</p>
          <h2>Importar e exportar</h2>
        </div>
      </div>

      <div className="data-actions">
        <button onClick={() => onExport("csv")}><Download size={20} /> Exportar CSV</button>
        <button onClick={() => onExport("json")}><Download size={20} /> Exportar JSON</button>
        <label className="file-button">
          <Import size={20} /> Importar CSV/JSON
          <input type="file" accept=".csv,.json,text/csv,application/json" onChange={onImport} />
        </label>
      </div>

      <div className="tip-box">
        <RotateCcw size={20} />
        <p>Os dados ficam no navegador deste aparelho. Exporte um backup antes de limpar dados do Safari ou trocar de celular.</p>
      </div>
    </section>
  );
}

function calculateStreak(days) {
  const set = new Set(days);
  let streak = 0;
  const cursor = new Date();

  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

createRoot(document.getElementById("root")).render(<App />);
