import "server-only";
import { loadFacts, type ContentFacts } from "@/lib/quiz/content";
import type { QuizLang, QuizQuestion } from "@/lib/types";

/**
 * สร้างคำถามปรนัยจากเนื้อหานิทรรศการ
 *
 * ทุกอย่างสุ่มจาก seed ตัวเดียว ชุดคำถามของ seed เดิมจึงออกมาเหมือนเดิมเป๊ะ ๆ เสมอ
 * ข้อนี้สำคัญ เพราะตอนแอปส่งคำตอบกลับมา เซิร์ฟเวอร์จะสร้างชุดเดิมขึ้นมาใหม่จาก seed
 * แล้วตรวจคะแนนเอง ไม่ต้องเชื่อคะแนนที่แอปส่งมา และไม่ต้องเก็บ state ของเกมไว้ฝั่งเซิร์ฟเวอร์
 *
 * ตัวลวงหยิบจากภาพอื่นในชุดเดียวกัน จึงเป็นตัวเลือกที่ดูน่าเชื่อพอ ๆ กับคำตอบจริง
 * ไม่ใช่ตัวเลือกที่ตัดทิ้งได้ตั้งแต่ยังไม่อ่านคำถาม
 */

/** จำนวนข้อต่อหนึ่งเกม ถ้าไม่ระบุมา */
export const DEFAULT_COUNT = 5;
export const MAX_COUNT = 20;
/** ทุกข้อมี 4 ตัวเลือก จึงต้องมีตัวลวงอย่างน้อย 3 ตัวถึงจะออกข้อนั้นได้ */
const CHOICES = 4;

type Phrase = {
  orderToTitle: (order: number) => string;
  titleToMonth: (title: string) => string;
  titleToScene: (title: string) => string;
  sceneToTitle: (scene: string) => string;
  titleToOrder: (title: string) => string;
  monthToTitle: (month: string) => string;
  templeFounder: (temple: string) => string;
  templeFormerName: (temple: string) => string;
  orderValue: (order: number) => string;
  conservation: string;
};

const PHRASES: Record<QuizLang, Phrase> = {
  th: {
    orderToTitle: (order) =>
      `ภาพลำดับที่ ${order} ของชุดจิตรกรรมพระราชพิธีสิบสองเดือน คือพระราชพิธีใด`,
    titleToMonth: (title) => `“${title}” จัดขึ้นในช่วงใด`,
    titleToScene: (title) => `ฉากในภาพ “${title}” คือที่ใด`,
    sceneToTitle: (scene) => `ภาพที่มีฉากเป็น “${scene}” คือพระราชพิธีใด`,
    titleToOrder: (title) => `“${title}” เป็นภาพลำดับที่เท่าไรของชุด`,
    monthToTitle: (month) => `พระราชพิธีใดจัดในช่วง “${month}”`,
    templeFounder: (temple) => `${temple} สถาปนาขึ้นโดยพระมหากษัตริย์พระองค์ใด`,
    templeFormerName: (temple) => `เดิม ${temple} ใช้ชื่อว่าอะไร`,
    orderValue: (order) => `ภาพที่ ${order}`,
    conservation:
      "หลังจากได้รู้จักจิตรกรรมชุดนี้แล้ว อยากให้ภาพเหล่านี้ได้รับการอนุรักษ์ไว้มากแค่ไหน",
  },
  en: {
    orderToTitle: (order) => `Which ceremony is painting ${order} of the twelve-month set?`,
    titleToMonth: (title) => `When is “${title}” held?`,
    titleToScene: (title) => `Which place is shown in “${title}”?`,
    sceneToTitle: (scene) => `Which ceremony is set at “${scene}”?`,
    titleToOrder: (title) => `Where does “${title}” fall in the set?`,
    monthToTitle: (month) => `Which ceremony is held at “${month}”?`,
    templeFounder: (temple) => `Who founded ${temple}?`,
    templeFormerName: (temple) => `What was ${temple} called before?`,
    orderValue: (order) => `Painting ${order}`,
    conservation:
      "Now that you have seen these murals, how much do you want them preserved?",
  },
};

/** คำถามหนึ่งข้อก่อนสลับตัวเลือก */
type Candidate = {
  id: string;
  topic: QuizQuestion["topic"];
  /** ภาพหรือเรื่องที่ข้อนี้ถาม ใช้กันไม่ให้เกมเดียวถามภาพเดิมซ้ำ */
  subject: string;
  prompt: string;
  answer: string;
  pool: string[];
};

// ---------- สุ่มแบบกำหนด seed ได้ ----------

/** mulberry32 — เล็ก เร็ว และให้ผลเหมือนเดิมทุกครั้งที่ seed เท่ากัน */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** หยิบตัวลวงที่ไม่ซ้ำกับคำตอบและไม่ซ้ำกันเอง */
function pickDistractors(pool: string[], answer: string, random: () => number): string[] | null {
  const seen = new Set([answer.trim()]);
  const picked: string[] = [];

  for (const item of shuffled(pool, random)) {
    const value = item.trim();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    picked.push(value);
    if (picked.length === CHOICES - 1) return picked;
  }
  return null;
}

// ---------- รวบรวมคำถามที่เป็นไปได้ทั้งหมด ----------

function buildCandidates(facts: ContentFacts, lang: QuizLang): Candidate[] {
  const phrase = PHRASES[lang];
  const { murals, temple } = facts;
  const candidates: Candidate[] = [];

  const titles = murals.map((mural) => mural.title);
  const months = murals.map((mural) => mural.month).filter((value): value is string => !!value);
  const scenes = murals.map((mural) => mural.scene).filter((value): value is string => !!value);
  const orders = murals
    .map((mural) => mural.order)
    .filter((value): value is number => value !== null)
    .map((order) => phrase.orderValue(order));

  for (const mural of murals) {
    const others = titles.filter((title) => title !== mural.title);

    if (mural.order !== null) {
      candidates.push({
        id: `order-title:${mural.deviceId}`,
        topic: "order-title",
        subject: mural.deviceId,
        prompt: phrase.orderToTitle(mural.order),
        answer: mural.title,
        pool: others,
      });
      candidates.push({
        id: `title-order:${mural.deviceId}`,
        topic: "title-order",
        subject: mural.deviceId,
        prompt: phrase.titleToOrder(mural.title),
        answer: phrase.orderValue(mural.order),
        pool: orders,
      });
    }

    if (mural.month) {
      candidates.push({
        id: `title-month:${mural.deviceId}`,
        topic: "title-month",
        subject: mural.deviceId,
        prompt: phrase.titleToMonth(mural.title),
        answer: mural.month,
        pool: months,
      });
      candidates.push({
        id: `month-title:${mural.deviceId}`,
        topic: "month-title",
        subject: mural.deviceId,
        prompt: phrase.monthToTitle(mural.month),
        answer: mural.title,
        pool: others,
      });
    }

    if (mural.scene) {
      candidates.push({
        id: `title-scene:${mural.deviceId}`,
        topic: "title-scene",
        subject: mural.deviceId,
        prompt: phrase.titleToScene(mural.title),
        answer: mural.scene,
        pool: scenes,
      });
      candidates.push({
        id: `scene-title:${mural.deviceId}`,
        topic: "scene-title",
        subject: mural.deviceId,
        prompt: phrase.sceneToTitle(mural.scene),
        answer: mural.title,
        pool: others,
      });
    }
  }

  if (temple) {
    if (temple.founder && temple.otherMonarchs.length >= CHOICES - 1) {
      candidates.push({
        id: "temple-founder",
        topic: "temple",
        subject: "temple",
        prompt: phrase.templeFounder(temple.title),
        answer: temple.founder,
        pool: temple.otherMonarchs,
      });
    }
    if (temple.formerName && temple.otherTemples.length >= CHOICES - 1) {
      candidates.push({
        id: "temple-former-name",
        topic: "temple",
        subject: "temple",
        prompt: phrase.templeFormerName(temple.title),
        answer: temple.formerName,
        pool: temple.otherTemples,
      });
    }
  }

  return candidates;
}

/**
 * เลือกคำถามโดยพยายามไม่ถามภาพเดิมซ้ำในเกมเดียว
 * ถ้าเนื้อหามีน้อยจนเลือกแบบไม่ซ้ำไม่ครบ ค่อยยอมให้ซ้ำในรอบที่สอง
 */
function selectSpread(candidates: Candidate[], count: number): Candidate[] {
  const chosen: Candidate[] = [];
  const usedSubjects = new Set<string>();
  const leftovers: Candidate[] = [];

  for (const candidate of candidates) {
    if (chosen.length === count) break;
    if (usedSubjects.has(candidate.subject)) {
      leftovers.push(candidate);
      continue;
    }
    usedSubjects.add(candidate.subject);
    chosen.push(candidate);
  }

  for (const candidate of leftovers) {
    if (chosen.length === count) break;
    chosen.push(candidate);
  }

  return chosen;
}

/**
 * ข้อความรู้สึกท้ายเกม — ต่อท้ายทุกชุดเสมอ ไม่เข้าไปปนในการสุ่ม
 *
 * ตัวเลือกเป็นตัวเลข 0–5 ตรง ๆ ทั้งสองภาษา ส่วนคำกำกับปลายสเกล ("ไม่เลย" / "มากที่สุด")
 * อยู่ฝั่งแอป เพราะแอปวาดข้อนี้เป็นแถบให้คะแนนแนวนอน ไม่ใช่รายการตัวเลือกแบบข้ออื่น
 *
 * answerIndex เป็น -1 เพราะไม่มีคำตอบถูก ตัวเลือกที่กดคือค่าที่ต้องการเก็บ
 */
const CONSERVATION_ID = "conservation";

function conservationQuestion(lang: QuizLang): QuizQuestion {
  return {
    id: CONSERVATION_ID,
    topic: "conservation",
    prompt: PHRASES[lang].conservation,
    choices: ["0", "1", "2", "3", "4", "5"],
    answerIndex: -1,
  };
}

export type GeneratedQuiz = {
  seed: number;
  lang: QuizLang;
  questions: QuizQuestion[];
};

/**
 * สร้างชุดคำถามจาก seed
 *
 * เรียกด้วย seed เดิม ภาษาเดิม และจำนวนข้อเดิม จะได้ชุดเดิมทุกอย่าง
 * รวมถึงลำดับตัวเลือกในแต่ละข้อ
 */
export function buildQuiz(lang: QuizLang, count: number, seed: number): GeneratedQuiz {
  const safeCount = Math.min(Math.max(Math.round(count) || DEFAULT_COUNT, 1), MAX_COUNT);
  const random = makeRandom(seed);

  const candidates = buildCandidates(loadFacts(lang), lang);
  const ordered = shuffled(candidates, random);
  const questions: QuizQuestion[] = [];

  for (const candidate of selectSpread(ordered, safeCount)) {
    const distractors = pickDistractors(candidate.pool, candidate.answer, random);
    // ตัวลวงไม่พอ 3 ตัว ข้ามข้อนี้ไป ดีกว่าออกข้อที่มีตัวเลือกไม่ครบ
    if (!distractors) continue;

    const choices = shuffled([candidate.answer, ...distractors], random);
    questions.push({
      id: candidate.id,
      topic: candidate.topic,
      prompt: candidate.prompt,
      choices,
      answerIndex: choices.indexOf(candidate.answer),
    });
  }

  // ต่อท้ายหลังสุ่มเสร็จแล้ว จึงอยู่ท้ายสุดเสมอไม่ว่า seed จะเป็นอะไร
  questions.push(conservationQuestion(lang));

  return { seed, lang, questions };
}

/** seed ใหม่สำหรับเกมหนึ่งรอบ */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export type GradedAnswer = {
  questionId: string;
  topic: QuizQuestion["topic"];
  /** ตัวเลือกที่ผู้เล่นกด -1 = หมดเวลาหรือข้ามไป */
  chosenIndex: number;
  correct: boolean;
};

export type GradedQuiz = {
  /** จำนวนข้อความรู้ ข้อความรู้สึกไม่ถูกนับ */
  total: number;
  correct: number;
  answers: GradedAnswer[];
  /** 0–5 ที่ผู้เล่นเลือกในข้อท้าย หรือ null ถ้าข้ามไป */
  conservation: number | null;
  /** จำนวนข้อทั้งหมดของชุดที่สร้างใหม่ รวมข้อความรู้สึก ใช้เทียบว่าฝั่งแอปส่งมาครบไหม */
  questionCount: number;
};

/**
 * ตรวจคำตอบด้วยการสร้างชุดคำถามเดิมขึ้นมาใหม่จาก seed
 * คะแนนที่บันทึกจึงเป็นคะแนนที่เซิร์ฟเวอร์คิดเอง ไม่ใช่ตัวเลขที่แอปส่งมา
 */
export function gradeQuiz(
  lang: QuizLang,
  count: number,
  seed: number,
  chosen: number[],
): GradedQuiz {
  const { questions } = buildQuiz(lang, count, seed);
  const answers: GradedAnswer[] = [];
  let conservation: number | null = null;

  questions.forEach((question, index) => {
    const chosenIndex = Number.isInteger(chosen[index]) ? chosen[index] : -1;

    // ข้อที่ไม่มีคำตอบถูกไม่เข้าการให้คะแนน เก็บค่าที่กดไว้ต่างหาก
    // ถ้าปล่อยให้ไหลไปรวมกับข้ออื่น คนที่ข้ามข้อนี้ (chosenIndex -1) จะถูกนับว่าตอบถูก
    // เพราะ answerIndex ของข้อนี้ก็เป็น -1 เหมือนกัน
    if (question.answerIndex < 0) {
      if (chosenIndex >= 0 && chosenIndex < question.choices.length) {
        conservation = chosenIndex;
      }
      return;
    }

    answers.push({
      questionId: question.id,
      topic: question.topic,
      chosenIndex,
      correct: chosenIndex === question.answerIndex,
    });
  });

  return {
    total: answers.length,
    correct: answers.filter((answer) => answer.correct).length,
    answers,
    conservation,
    questionCount: questions.length,
  };
}
