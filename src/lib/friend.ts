import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Difficulty, fetchVocabulary, VocabEntry } from './language';
import { Language } from './translate';
import { difficultyGuide, MAX_READING_TEST_DIFFICULTY } from './readingTest';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Pre-made example sentences are excluded so the friend asks about vocabulary
// words rather than quizzing on sentences the user already has memorized.
const EXCLUDED_CATEGORY = 'SENTENCES';
const MAX_VOCAB_WORDS = 40;
// Short, simple questions until the user picks a level
export const DEFAULT_FRIEND_DIFFICULTY = 3;

// Questions follow the same 1-8 scale as the test tabs' sentences
function difficultyInstructions(difficulty: Difficulty): string {
  return (
    `Write every question at difficulty level ${difficulty}/${MAX_READING_TEST_DIFFICULTY} ` +
    `(1 = very easy, ${MAX_READING_TEST_DIFFICULTY} = very hard): ${difficultyGuide(difficulty)}`
  );
}

function sampleVocabulary(entries: VocabEntry[]): VocabEntry[] {
  const pool = entries.filter((entry) => entry.category !== EXCLUDED_CATEGORY);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, MAX_VOCAB_WORDS);
}

function formatVocabularyForPrompt(entries: VocabEntry[]): string {
  return entries.map((entry) => `${entry.vietnamese} (${entry.english})`).join(', ');
}

const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You are a friendly {language}-speaking pen pal helping the user practice conversational ' +
      '{language}. Ask the user questions in {language}, drawing mainly from the vocabulary words ' +
      "listed below. After the user replies, briefly react to their answer (acknowledge it, gently " +
      'correct any mistakes) and then ask a new question on a different topic. Always write every ' +
      'message in {language} only, with correct spelling, diacritics, or script for that language, ' +
      'and keep each message short (1-3 sentences).\n\n{difficultyInstructions}\n\nKnown vocabulary:\n{vocabulary}',
  ],
  new MessagesPlaceholder('history'),
]);

const FriendState = Annotation.Root({
  history: Annotation<ChatMessage[]>,
  difficulty: Annotation<Difficulty>,
  language: Annotation<Language>,
  vocabulary: Annotation<VocabEntry[]>,
  reply: Annotation<string>,
});

type FriendStateType = typeof FriendState.State;

async function fetchVocabularyNode(): Promise<Partial<FriendStateType>> {
  const entries = await fetchVocabulary();
  return { vocabulary: sampleVocabulary(entries) };
}

async function chatNode(state: FriendStateType): Promise<Partial<FriendStateType>> {
  const vocabularyText = formatVocabularyForPrompt(state.vocabulary);
  const history: BaseMessage[] = state.history.map((message) =>
    message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content)
  );

  const model = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.7 });
  const chain = promptTemplate.pipe(model);

  const response = await chain.invoke({
    vocabulary: vocabularyText,
    difficultyInstructions: difficultyInstructions(state.difficulty),
    history,
    language: state.language,
  });
  const reply =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  return { reply };
}

// fetchVocabulary -> chat today; future steps (e.g. tracking which words the
// user struggles with) can be added as additional nodes in this graph.
const graph = new StateGraph(FriendState)
  .addNode('fetchVocabulary', fetchVocabularyNode)
  .addNode('chat', chatNode)
  .addEdge(START, 'fetchVocabulary')
  .addEdge('fetchVocabulary', 'chat')
  .addEdge('chat', END)
  .compile();

export async function chatWithFriend(
  history: ChatMessage[],
  difficulty: Difficulty = DEFAULT_FRIEND_DIFFICULTY,
  language: Language = 'Vietnamese'
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const finalState = await graph.invoke({ history, difficulty, language });

  if (!finalState.reply) {
    throw new Error('Friend chat graph did not return a reply');
  }

  return finalState.reply;
}
