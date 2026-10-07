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

export const belts = [
  { name: 'White', className: 'belt-white', text: 'Start with the basics.' },
  { name: 'Yellow', className: 'belt-yellow', text: 'Build on what you know.' },
  { name: 'Green', className: 'belt-green', text: 'Keep growing your vocabulary.' },
  { name: 'Blue', className: 'belt-blue', text: 'Take on a new challenge.' },
  { name: 'Black', className: 'belt-black', text: 'Keep reaching for mastery.' },
];
