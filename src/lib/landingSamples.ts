// Sample content for the home page's learning preview (browser-only demo data)

export const samples = {
  Vietnamese: {
    code: 'vi-VN',
    sentences: [
      { words: ['Hôm nay,', 'tôi', 'ăn', 'phở bò.'], meanings: ['Today,', 'I', 'eat', 'beef noodle soup.'], question: 'Bạn thích ăn gì?', translation: 'What do you like to eat?', reply: 'Tôi thích phở bò.' },
      { words: ['Mỗi ngày,', 'tôi', 'uống', 'trà.'], meanings: ['Every day,', 'I', 'drink', 'tea.'], question: 'Bạn thích uống gì?', translation: 'What do you like to drink?', reply: 'Tôi thích trà.' },
    ],
  },
  Japanese: {
    code: 'ja-JP',
    sentences: [
      { words: ['今日、', '私は', '食べます。', 'りんごを'], meanings: ['Today,', 'I', 'eat', 'an apple.'], question: '何を飲みたいですか？', translation: 'What would you like to drink?', reply: '水を飲みたいです。' },
      { words: ['毎日、', '私は', '飲みます。', 'お茶を'], meanings: ['Every day,', 'I', 'drink', 'tea.'], question: 'お茶が好きですか？', translation: 'Do you like tea?', reply: 'はい、お茶が好きです。' },
    ],
  },
  Spanish: {
    code: 'es-ES',
    sentences: [
      { words: ['Hoy,', 'yo', 'como', 'una manzana.'], meanings: ['Today,', 'I', 'eat', 'an apple.'], question: '¿Qué te gusta comer?', translation: 'What do you like to eat?', reply: 'Me gustan las manzanas.' },
      { words: ['Cada día,', 'yo', 'bebo', 'té.'], meanings: ['Every day,', 'I', 'drink', 'tea.'], question: '¿Qué te gusta beber?', translation: 'What do you like to drink?', reply: 'Me gusta el té.' },
    ],
  },
  French: {
    code: 'fr-FR',
    sentences: [
      { words: ['Aujourd’hui,', 'je', 'mange', 'une pomme.'], meanings: ['Today,', 'I', 'eat', 'an apple.'], question: 'Qu’est-ce que tu aimes manger ?', translation: 'What do you like to eat?', reply: 'J’aime les pommes.' },
      { words: ['Chaque jour,', 'je', 'bois', 'du thé.'], meanings: ['Every day,', 'I', 'drink', 'tea.'], question: 'Qu’est-ce que tu aimes boire ?', translation: 'What do you like to drink?', reply: 'J’aime le thé.' },
    ],
  },
};

export type SampleLanguage = keyof typeof samples;

// Time, person, action, object: the same color marks the same role in both languages
export const wordColors = ['word-time', 'word-person', 'word-action', 'word-object'];

// The 8 belts in order (see "BeltLevelKey" in users.ts). Each description
// follows that level's sentence difficulty (DIFFICULTY_GUIDE in readingTest.ts).
export const belts = [
  {
    level: 1,
    name: 'White',
    className: 'belt-white',
    text: 'Your first words. Greetings, numbers and everyday basics in short sentences of 3–5 words.',
  },
  {
    level: 2,
    name: 'Green',
    className: 'belt-green',
    text: 'Grow your vocabulary and say simple things about yourself and your day, 4–7 words at a time.',
  },
  {
    level: 3,
    name: 'Yellow',
    className: 'belt-yellow',
    text: 'Start talking about what happened. Simple present and past tense sentences of 6–9 words.',
  },
  {
    level: 4,
    name: 'Orange',
    className: 'belt-orange',
    text: 'Add when and where. Sentences of 8–12 words with time and place phrases, joined with words like “and” and “but”.',
  },
  {
    level: 5,
    name: 'Blue',
    className: 'belt-blue',
    text: 'Move between past, present and future, and join two ideas into one sentence of 10–15 words.',
  },
  {
    level: 6,
    name: 'Red',
    className: 'belt-red',
    text: 'Less common vocabulary and sentences built around clauses like “because” and “when”, 13–18 words long.',
  },
  {
    level: 7,
    name: 'Brown',
    className: 'belt-brown',
    text: 'Conditionals, comparisons and everyday idioms. Sentences of 16–24 words with several clauses, close to how natives talk.',
  },
  {
    level: 8,
    name: 'Black',
    className: 'belt-black',
    text: 'Mastery. Advanced vocabulary, nested clauses and formal, nuanced speech in sentences of up to 32 words.',
  },
];
