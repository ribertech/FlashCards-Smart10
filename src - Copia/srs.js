export const CATEGORIES = [
  "Viagem",
  "Restaurante",
  "Aeroporto",
  "Comercio exterior",
  "Reunioes",
  "Vida diaria",
  "Conversacao",
  "Leitura em Ingles"
];

export function createEmptyPhrase() {
  const now = new Date().toISOString();
  const dueNow = new Date();
  dueNow.setHours(0, 0, 0, 0);
  return {
    id: "",
    portuguese: "",
    english: "",
    category: "Vida diaria",
    notes: "",
    createdAt: now,
    updatedAt: now,
    nextReviewAt: dueNow.toISOString(),
    lastReviewedAt: null,
    reviewCount: 0,
    correctCount: 0,
    errorCount: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    correctStreak: 0,
    studyDirection: "pt-en",
    referenceTitle: ""
  };
}

export function isDue(phrase, now = new Date()) {
  if ((phrase.reviewCount ?? 0) === 0) return true;
  return new Date(phrase.nextReviewAt) <= now;
}

export function reviewPhrase(phrase, rating, now = new Date()) {
  const currentInterval = Math.max(phrase.intervalDays || 0, 1);
  let easeFactor = phrase.easeFactor ?? 2.5;
  let intervalDays = phrase.intervalDays ?? 0;
  let correctStreak = phrase.correctStreak ?? 0;
  let correctCount = phrase.correctCount ?? 0;
  let errorCount = phrase.errorCount ?? 0;
  let nextReview = new Date(now);

  if (rating === "again") {
    easeFactor = Math.max(1.3, easeFactor - 0.35);
    intervalDays = 0;
    correctStreak = 0;
    errorCount += 1;
    nextReview = new Date(now.getTime() + 10 * 60 * 1000);
  }

  if (rating === "hard") {
    easeFactor = Math.max(1.3, easeFactor - 0.15);
    correctStreak += 1;
    correctCount += 1;
    intervalDays = phrase.reviewCount === 0 ? 1 : Math.max(1, Math.round(currentInterval * 1.25));
    nextReview.setDate(nextReview.getDate() + intervalDays);
  }

  if (rating === "good") {
    easeFactor = Math.min(3.2, easeFactor + 0.05);
    correctStreak += 1;
    correctCount += 1;
    intervalDays = phrase.reviewCount === 0 ? 3 : Math.max(3, Math.round(currentInterval * easeFactor));
    nextReview.setDate(nextReview.getDate() + intervalDays);
  }

  if (rating === "easy") {
    easeFactor = Math.min(3.5, easeFactor + 0.18);
    correctStreak += 1;
    correctCount += 1;
    intervalDays = phrase.reviewCount === 0 ? 7 : Math.max(7, Math.round(currentInterval * easeFactor * 1.3));
    nextReview.setDate(nextReview.getDate() + intervalDays);
  }

  return {
    ...phrase,
    easeFactor: Number(easeFactor.toFixed(2)),
    intervalDays,
    correctStreak,
    correctCount,
    errorCount,
    reviewCount: (phrase.reviewCount ?? 0) + 1,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReview.toISOString(),
    updatedAt: now.toISOString()
  };
}
