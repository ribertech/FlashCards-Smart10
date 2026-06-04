import { CATEGORIES, createEmptyPhrase } from "./srs.js";

const DB_NAME = "frases-ingles-srs";
const DB_VERSION = 2;
const PHRASES = "phrases";
const META = "meta";
const READINGS = "readings";

const samples = [
  {
    portuguese: "Voce poderia confirmar a reserva?",
    english: "Could you please confirm the booking?",
    category: "Comercio exterior",
    notes: "Pedido educado para confirmar uma reserva ou booking."
  },
  {
    portuguese: "O embarque esta previsto para a proxima semana.",
    english: "The shipment is expected for next week.",
    category: "Comercio exterior",
    notes: "Shipment pode significar embarque ou remessa."
  },
  {
    portuguese: "Eu gostaria de fazer o check-in.",
    english: "I would like to check in.",
    category: "Viagem",
    notes: "Tambem usado em hotel e aeroporto."
  },
  {
    portuguese: "Voce poderia repetir mais devagar?",
    english: "Could you repeat that more slowly?",
    category: "Conversacao",
    notes: "Frase util para conversas reais."
  }
];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHRASES)) {
        const store = db.createObjectStore(PHRASES, { keyPath: "id" });
        store.createIndex("nextReviewAt", "nextReviewAt");
        store.createIndex("category", "category");
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(READINGS)) {
        const store = db.createObjectStore(READINGS, { keyPath: "id" });
        store.createIndex("category", "category");
        store.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runRequest(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => {
      db.close();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function getAllPhrases() {
  const rows = await runRequest(PHRASES, "readonly", (store) => store.getAll());
  return rows.sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
}

export async function savePhrase(phrase) {
  const now = new Date().toISOString();
  const isNew = !phrase.id;
  const dueNow = new Date();
  dueNow.setHours(0, 0, 0, 0);
  const normalized = {
    ...createEmptyPhrase(),
    ...phrase,
    id: phrase.id || makeId(),
    category: phrase.category || CATEGORIES[0],
    createdAt: phrase.createdAt || now,
    updatedAt: now,
    nextReviewAt: isNew ? dueNow.toISOString() : phrase.nextReviewAt || dueNow.toISOString()
  };

  await runRequest(PHRASES, "readwrite", (store) => store.put(normalized));
  return normalized;
}

export async function deletePhrase(id) {
  await runRequest(PHRASES, "readwrite", (store) => store.delete(id));
}

export function createEmptyReading() {
  const now = new Date().toISOString();
  return {
    id: "",
    title: "",
    source: "",
    category: "Leitura em Ingles",
    originalText: "",
    notes: "",
    sentences: [],
    currentIndex: 0,
    createdAt: now,
    updatedAt: now
  };
}

export async function getAllReadings() {
  const rows = await runRequest(READINGS, "readonly", (store) => store.getAll());
  return rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function saveReading(reading) {
  const now = new Date().toISOString();
  const normalized = {
    ...createEmptyReading(),
    ...reading,
    id: reading.id || makeId(),
    sentences: reading.sentences ?? [],
    currentIndex: Math.max(0, reading.currentIndex ?? 0),
    createdAt: reading.createdAt || now,
    updatedAt: now
  };

  await runRequest(READINGS, "readwrite", (store) => store.put(normalized));
  return normalized;
}

export async function deleteReading(id) {
  await runRequest(READINGS, "readwrite", (store) => store.delete(id));
}

export async function getMeta() {
  const row = await runRequest(META, "readonly", (store) => store.get("studyDays"));
  return { studyDays: row?.value ?? [] };
}

export async function recordStudyDay(dayKey) {
  const meta = await getMeta();
  const studyDays = Array.from(new Set([...(meta.studyDays ?? []), dayKey])).sort();
  await runRequest(META, "readwrite", (store) => store.put({ key: "studyDays", value: studyDays }));
}

export async function seedIfNeeded() {
  const rows = await getAllPhrases();
  if (rows.length > 0) return;
  await Promise.all(samples.map((sample) => savePhrase({ ...createEmptyPhrase(), ...sample })));
}

export async function exportRows() {
  const rows = await getAllPhrases();
  return rows.map((row) => ({
    portugues: row.portuguese,
    ingles: row.english,
    categoria: row.category,
    observacao: row.notes,
    proxima_revisao: row.nextReviewAt,
    acertos: row.correctCount,
    erros: row.errorCount,
    facilidade: row.easeFactor,
    ultimo_estudo: row.lastReviewedAt ?? ""
  }));
}

export async function importRows(rows) {
  const normalizedRows = rows
    .map((row) => {
      const portuguese = getValue(row, ["portugues", "português", "pt", "portuguese"]);
      const english = getValue(row, ["ingles", "inglês", "en", "english"]);
      if (!portuguese || !english) return null;
      return {
        ...createEmptyPhrase(),
        portuguese,
        english,
        category: getValue(row, ["categoria", "category"]) || "Vida diaria",
        notes: getValue(row, ["observacao", "observação", "notes", "nota"]) || ""
      };
    })
    .filter(Boolean);

  await Promise.all(normalizedRows.map(savePhrase));
}

function getValue(row, keys) {
  const entries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value]);
  for (const key of keys.map(normalizeKey)) {
    const found = entries.find(([entryKey]) => entryKey === key);
    if (found) return String(found[1] ?? "").trim();
  }
  return "";
}

function normalizeKey(key) {
  return String(key)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
