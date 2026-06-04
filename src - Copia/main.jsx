import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Bold,
  Brush,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Flame,
  Headphones,
  Home,
  Import,
  Layers,
  Moon,
  Pencil,
  Pause,
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
  deleteReading,
  exportRows,
  getAllPhrases,
  getAllReadings,
  getMeta,
  importRows,
  recordStudyDay,
  saveReading,
  savePhrase,
  seedIfNeeded,
  createEmptyReading
} from "./storage.js";
import { CATEGORIES, createEmptyPhrase, isDue, reviewPhrase } from "./srs.js";
import { downloadBlob, parseCsv, rowsToCsv } from "./utils.js";

const APP_NAME = "Smart English Cards";
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

  function speak(text, mode = "normal", options = {}) {
    if (!("speechSynthesis" in window)) {
      alert("Seu navegador nao suporta audio por Web Speech API.");
      return;
    }

    window.speechSynthesis.cancel();
    const repeat = mode === "repeat" ? 2 : 1;
    const rate = options.rate ?? (mode === "slow" ? 0.72 : 0.95);

    for (let index = 0; index < repeat; index += 1) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = rate;
      utterance.pitch = 1;
      if (preferredVoice) utterance.voice = preferredVoice;
      if (index === repeat - 1 && options.onEnd) utterance.onend = options.onEnd;
      window.speechSynthesis.speak(utterance);
    }
  }

  function stop() {
    window.speechSynthesis?.cancel();
  }

  return { speak, stop, preferredVoice, englishVoices, voiceChoice, setVoiceChoice };
}

function App() {
  const [phrases, setPhrases] = useState([]);
  const [readings, setReadings] = useState([]);
  const [meta, setMeta] = useState({ studyDays: [] });
  const [view, setView] = useState("home");
  const [editing, setEditing] = useState(null);
  const [editingReading, setEditingReading] = useState(null);
  const [activeReadingId, setActiveReadingId] = useState("");
  const [studyQueue, setStudyQueue] = useState([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [audioMode, setAudioMode] = useState("normal");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || "light");
  const { speak, stop, preferredVoice, englishVoices, voiceChoice, setVoiceChoice } = useSpeech();

  async function refresh() {
    await seedIfNeeded();
    setPhrases(await getAllPhrases());
    setReadings(await getAllReadings());
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

  async function handleSaveReading(reading) {
    const sentences = buildSentences(reading.originalText, reading.sentences);
    const saved = await saveReading({
      ...reading,
      sentences,
      currentIndex: Math.min(reading.currentIndex ?? 0, Math.max(sentences.length - 1, 0))
    });
    setEditingReading(null);
    setActiveReadingId(saved.id);
    await refresh();
    setView("reader");
  }

  async function handleDeleteReading(id) {
    const confirmed = window.confirm("Excluir este texto?");
    if (!confirmed) return;
    await deleteReading(id);
    await refresh();
    setView("readings");
  }

  async function updateReading(reading) {
    const saved = await saveReading(reading);
    setReadings((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    setActiveReadingId(saved.id);
    return saved;
  }

  async function saveReadingFlashcard(reading, sentence, selectedText = "") {
    const english = selectedText.trim() || sentence.english;
    await savePhrase({
      ...createEmptyPhrase(),
      english,
      portuguese: sentence.translation || "",
      category: "Leitura em Ingles",
      notes: `Referencia: ${reading.title}`,
      studyDirection: "en-pt",
      referenceTitle: reading.title
    });
    await refresh();
    alert("Flashcard salvo para revisao.");
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
        <div className="brand-lockup">
          <img src={`${import.meta.env.BASE_URL}icons/logo.svg`} alt="" className="app-logo" />
          <div>
            <p className="eyebrow">PWA pessoal</p>
            <h1>{APP_NAME}</h1>
          </div>
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

      {view === "readings" && (
        <ReadingsLibrary
          readings={readings}
          onNew={() => {
            setEditingReading(createEmptyReading());
            setView("readingForm");
          }}
          onEdit={(reading) => {
            setEditingReading(reading);
            setView("readingForm");
          }}
          onDelete={handleDeleteReading}
          onOpen={(reading) => {
            setActiveReadingId(reading.id);
            setView("reader");
          }}
        />
      )}

      {view === "readingForm" && (
        <ReadingForm
          reading={editingReading ?? createEmptyReading()}
          onCancel={() => setView("readings")}
          onSave={handleSaveReading}
        />
      )}

      {view === "reader" && (
        <ReaderView
          reading={readings.find((item) => item.id === activeReadingId)}
          onBack={() => setView("readings")}
          onEdit={(reading) => {
            setEditingReading(reading);
            setView("readingForm");
          }}
          onUpdate={updateReading}
          onSaveFlashcard={saveReadingFlashcard}
          speak={speak}
          stop={stop}
        />
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
        <button className={view === "readings" || view === "reader" || view === "readingForm" ? "active" : ""} onClick={() => setView("readings")}>
          <FileText size={20} /> Leitura
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
        <h2 className={`study-prompt ${answerVisible ? "answered" : ""}`}>
          {renderFormattedText(card.studyDirection === "en-pt" ? card.english : card.portuguese)}
        </h2>

        {!answerVisible ? (
          <button className="primary-action wide" onClick={() => setAnswerVisible(true)}>
            Mostrar resposta
          </button>
        ) : (
          <div className="answer">
            <p className="answer-text">
              {renderFormattedText(card.studyDirection === "en-pt" ? card.portuguese : card.english)}
            </p>
            {card.studyDirection === "en-pt" ? (
              <button className="listen-button" onClick={() => speak(card.english, audioMode)}>
                <Volume2 size={20} /> Ouvir ingles
              </button>
            ) : (
              <AudioControls
                text={card.english}
                speak={speak}
                mode={audioMode}
                setMode={setAudioMode}
                voiceChoice={voiceChoice}
                setVoiceChoice={setVoiceChoice}
                voices={voices}
              />
            )}
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
              <h3>{renderFormattedText(phrase.portuguese)}</h3>
              <p>{renderFormattedText(phrase.english)}</p>
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
  const portugueseRef = React.useRef(null);
  const englishRef = React.useRef(null);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function applyHighlight(field, ref, type) {
    const target = ref.current;
    if (!target) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const selected = draft[field].slice(start, end);
    if (!selected) {
      alert("Selecione uma palavra ou expressao no campo antes de destacar.");
      return;
    }

    const wrapped = wrapHighlight(selected, type);
    const nextValue = `${draft[field].slice(0, start)}${wrapped}${draft[field].slice(end)}`;
    update(field, nextValue);
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(start, start + wrapped.length);
    });
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
          <textarea ref={portugueseRef} value={draft.portuguese} onChange={(event) => update("portuguese", event.target.value)} rows={3} />
          <HighlightToolbar onApply={(type) => applyHighlight("portuguese", portugueseRef, type)} />
        </label>
        <label>
          Ingles
          <textarea ref={englishRef} value={draft.english} onChange={(event) => update("english", event.target.value)} rows={3} />
          <HighlightToolbar onApply={(type) => applyHighlight("english", englishRef, type)} />
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

function HighlightToolbar({ onApply }) {
  return (
    <div className="highlight-toolbar" aria-label="Destaques do texto">
      <button type="button" onClick={() => onApply("bold")} title="Negrito">
        <Bold size={16} /> Negrito
      </button>
      <button type="button" className="swatch blue" onClick={() => onApply("blue")} title="Azul">
        <Brush size={16} /> Azul
      </button>
      <button type="button" className="swatch amber" onClick={() => onApply("amber")} title="Dourado">
        Dourado
      </button>
      <button type="button" className="swatch green" onClick={() => onApply("green")} title="Verde">
        Verde
      </button>
    </div>
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

function ReadingsLibrary({ readings, onNew, onEdit, onDelete, onOpen }) {
  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{readings.length} textos</p>
          <h2>Leitura em Ingles</h2>
        </div>
        <button className="icon-button filled" onClick={onNew} aria-label="Novo texto" title="Novo texto">
          <Plus size={22} />
        </button>
      </div>

      <div className="tip-box">
        <FileText size={20} />
        <p>Cadastre apenas textos proprios, trechos autorizados ou obras em dominio publico.</p>
      </div>

      <div className="phrase-list">
        {readings.map((reading) => {
          const total = reading.sentences?.length ?? 0;
          const readCount = reading.sentences?.filter((sentence) => sentence.read).length ?? 0;
          const percent = total === 0 ? 0 : Math.round((readCount / total) * 100);
          return (
            <article className="reading-card" key={reading.id}>
              <button className="reading-main" onClick={() => onOpen(reading)}>
                <span>{reading.category}</span>
                <h3>{reading.title}</h3>
                <p>{reading.source || "Sem autor/fonte"}</p>
                <div className="progress-track">
                  <div style={{ width: `${percent}%` }} />
                </div>
                <small>{readCount}/{total} frases lidas - {percent}% concluido</small>
              </button>
              <div className="phrase-actions">
                <button onClick={() => onEdit(reading)} aria-label="Editar" title="Editar"><Pencil size={18} /></button>
                <button onClick={() => onDelete(reading.id)} aria-label="Excluir" title="Excluir"><Trash2 size={18} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReadingForm({ reading, onCancel, onSave }) {
  const [draft, setDraft] = useState(reading);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.originalText.trim()) {
      alert("Preencha titulo e texto em ingles.");
      return;
    }
    onSave(draft);
  }

  return (
    <section className="screen">
      <div className="section-heading">
        <h2>{draft.id ? "Editar leitura" : "Nova leitura"}</h2>
        <button className="icon-button" onClick={onCancel} aria-label="Cancelar" title="Cancelar">
          <X size={22} />
        </button>
      </div>

      <form className="phrase-form" onSubmit={submit}>
        <label>
          Titulo
          <input value={draft.title} onChange={(event) => update("title", event.target.value)} />
        </label>
        <label>
          Autor ou fonte
          <input value={draft.source} onChange={(event) => update("source", event.target.value)} />
        </label>
        <label>
          Categoria
          <input value={draft.category} onChange={(event) => update("category", event.target.value)} />
        </label>
        <label>
          Texto original em ingles
          <textarea value={draft.originalText} onChange={(event) => update("originalText", event.target.value)} rows={10} />
        </label>
        <label>
          Observacoes pessoais
          <textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={3} />
        </label>
        <button className="primary-action wide" type="submit">
          <Save size={20} /> Salvar leitura
        </button>
      </form>
    </section>
  );
}

function ReaderView({ reading, onBack, onEdit, onUpdate, onSaveFlashcard, speak, stop }) {
  const [translation, setTranslation] = useState("");
  const [rate, setRate] = useState(1);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [selection, setSelection] = useState("");

  const sentences = reading?.sentences ?? [];
  const currentIndex = Math.min(reading?.currentIndex ?? 0, Math.max(sentences.length - 1, 0));
  const sentence = sentences[currentIndex];

  useEffect(() => {
    setTranslation(sentence?.translation ?? "");
    setSelection("");
    setIsPlaying(false);
  }, [sentence?.id]);

  if (!reading || !sentence) {
    return (
      <section className="screen empty-state">
        <FileText size={42} />
        <h2>Nenhum texto aberto</h2>
        <button className="primary-action" onClick={onBack}>Voltar</button>
      </section>
    );
  }

  async function persistSentence(patch = {}) {
    const nextSentences = sentences.map((item, index) =>
      index === currentIndex ? { ...item, translation, read: true, ...patch } : item
    );
    await onUpdate({ ...reading, sentences: nextSentences, currentIndex });
  }

  async function translateCurrentSentence() {
    setIsTranslating(true);
    try {
      const translated = await translateToPortuguese(sentence.english);
      setTranslation(translated);
      await persistSentence({ translation: translated, read: true });
    } catch (error) {
      alert("Nao consegui traduzir automaticamente agora. Voce ainda pode preencher a traducao manualmente.");
    } finally {
      setIsTranslating(false);
    }
  }

  async function translateMissingSentences() {
    const confirmed = window.confirm("Traduzir automaticamente as frases sem traducao? Em textos longos isso pode demorar e a API gratuita pode limitar requisicoes.");
    if (!confirmed) return;

    setIsTranslating(true);
    try {
      const nextSentences = [];
      for (const item of sentences) {
        if (item.translation?.trim()) {
          nextSentences.push(item);
        } else {
          const translated = await translateToPortuguese(item.english);
          nextSentences.push({ ...item, translation: translated });
          await wait(450);
        }
      }
      await onUpdate({ ...reading, sentences: nextSentences, currentIndex });
    } catch (error) {
      alert("A traducao automatica parou antes do fim. Algumas frases podem ter ficado sem traducao.");
    } finally {
      setIsTranslating(false);
    }
  }

  async function move(delta) {
    await persistSentence();
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), sentences.length - 1);
    await onUpdate({ ...reading, sentences: sentences.map((item, index) => index === currentIndex ? { ...item, translation, read: true } : item), currentIndex: nextIndex });
  }

  function playCurrent() {
    if (isPlaying) {
      stop();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    speak(sentence.english, "normal", {
      rate,
      onEnd: async () => {
        setIsPlaying(false);
        await persistSentence();
        if (autoAdvance && currentIndex < sentences.length - 1) {
          await onUpdate({
            ...reading,
            sentences: sentences.map((item, index) => index === currentIndex ? { ...item, translation, read: true } : item),
            currentIndex: currentIndex + 1
          });
        }
      }
    });
  }

  const readCount = sentences.filter((item) => item.read).length;
  const percent = Math.round((readCount / sentences.length) * 100);

  return (
    <section className="screen reader-screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{currentIndex + 1} de {sentences.length}</p>
          <h2>{reading.title}</h2>
        </div>
        <button className="icon-button" onClick={() => onEdit(reading)} aria-label="Editar texto" title="Editar texto">
          <Pencil size={22} />
        </button>
      </div>

      <div className="progress-track">
        <div style={{ width: `${percent}%` }} />
      </div>

      <article className={`reader-card ${isPlaying ? "playing" : ""}`}>
        <p
          className="reader-sentence"
          onMouseUp={() => setSelection(window.getSelection()?.toString() ?? "")}
          onTouchEnd={() => setSelection(window.getSelection()?.toString() ?? "")}
        >
          {sentence.english}
        </p>
        <label className="voice-picker">
          Traducao em portugues
          <textarea value={translation} onChange={(event) => setTranslation(event.target.value)} rows={4} />
        </label>
        <div className="translation-actions">
          <button onClick={translateCurrentSentence} disabled={isTranslating}>
            {isTranslating ? "Traduzindo..." : "Traduzir frase"}
          </button>
          <button onClick={translateMissingSentences} disabled={isTranslating}>
            Traduzir texto
          </button>
        </div>
        <p className="translation-note">A traducao automatica usa uma API publica gratuita quando disponivel. Revise o resultado antes de transformar em flashcard.</p>
      </article>

      <div className="reader-controls">
        <button onClick={() => move(-1)} disabled={currentIndex === 0}>
          <ChevronLeft size={20} /> Voltar
        </button>
        <button className="listen-button" onClick={playCurrent}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />} {isPlaying ? "Pausar" : "Play"}
        </button>
        <button onClick={() => move(1)} disabled={currentIndex === sentences.length - 1}>
          Avancar <ChevronRight size={20} />
        </button>
      </div>

      <div className="reading-options">
        {[0.75, 1, 1.25, 1.5].map((value) => (
          <button key={value} className={rate === value ? "selected" : ""} onClick={() => setRate(value)}>
            {value}x
          </button>
        ))}
        <label>
          <input type="checkbox" checked={autoAdvance} onChange={(event) => setAutoAdvance(event.target.checked)} />
          Avancar ao terminar
        </label>
      </div>

      <div className="data-actions">
        <button onClick={() => persistSentence()}><Save size={20} /> Salvar traducao</button>
        <button onClick={() => onSaveFlashcard(reading, { ...sentence, translation })}>
          <Plus size={20} /> Salvar frase
        </button>
        <button onClick={() => onSaveFlashcard(reading, { ...sentence, translation }, selection)} disabled={!selection.trim()}>
          <Plus size={20} /> Salvar selecao
        </button>
      </div>

      <button className="secondary-link" onClick={onBack}>Voltar para biblioteca</button>
    </section>
  );
}

function buildSentences(text, existingSentences = []) {
  const translations = new Map(existingSentences.map((sentence) => [sentence.english, sentence]));
  const parts = text
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];

  return parts
    .map((part, index) => part.trim())
    .filter(Boolean)
    .map((english, index) => {
      const previous = translations.get(english);
      return {
        id: previous?.id || `${index}-${english.slice(0, 24)}`,
        english,
        translation: previous?.translation || "",
        read: previous?.read || false
      };
    });
}

async function translateToPortuguese(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("translation request failed");
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("empty translation");
  return decodeHtml(translated);
}

function decodeHtml(text) {
  const parser = new DOMParser();
  return parser.parseFromString(text, "text/html").documentElement.textContent || text;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapHighlight(text, type) {
  if (type === "bold") return `**${text}**`;
  return `[${type}]${text}[/${type}]`;
}

function renderFormattedText(text = "") {
  const nodes = [];
  const pattern = /(\*\*[^*]+\*\*|\[(blue|amber|green)\][\s\S]*?\[\/\2\])/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-bold`}>{token.slice(2, -2)}</strong>);
    } else {
      const color = match[2];
      const content = token.replace(new RegExp(`^\\[${color}\\]|\\[/${color}\\]$`, "g"), "");
      nodes.push(<mark key={`${match.index}-${color}`} className={`text-highlight ${color}`}>{content}</mark>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : text;
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
