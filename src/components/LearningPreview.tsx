'use client';

import { useState } from 'react';
import { ArrowRight, Check, ChevronRight, Headphones, Send, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NinjaSymbol from '@/components/NinjaSymbol';
import { samples, wordColors, type SampleLanguage } from '@/lib/landingSamples';

// The home page's "look inside the dojo": a color-connected sample sentence,
// a sample Friend conversation and the belt path, all browser-only
export default function LearningPreview({ onBelts }: { onBelts: () => void }) {
  const [language, setLanguage] = useState<SampleLanguage>('Vietnamese');
  const [index, setIndex] = useState(0);
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [voiceMessage, setVoiceMessage] = useState('');
  const sample = samples[language].sentences[index % 2] ?? samples.Vietnamese.sentences[0];
  // Japanese puts the object before the verb
  const ordered = language === 'Japanese' ? [0, 1, 3, 2] : [0, 1, 2, 3];

  // Reads the sentence with one of the browser's voices for the language
  const playVoice = (variant: number) => {
    if (!('speechSynthesis' in window)) {
      setVoiceMessage('Audio preview is not available in this browser.');
      return;
    }
    const languagePrefix = samples[language].code.split('-')[0];
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith(languagePrefix));
    if (!voices.length) {
      setVoiceMessage(`No ${language} preview voice is installed in this browser.`);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(ordered.map((i) => sample.words[i]).join(' '));
    utterance.lang = samples[language].code;
    utterance.voice = voices[variant % voices.length] ?? null;
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceMessage(
      voices.length < 2 ? 'This browser has one voice available for this language.' : 'Playing browser audio preview.'
    );
  };

  const dimmed = (i: number) => (activeWord !== null && activeWord !== i ? 'word-dimmed' : '');

  return (
    <div className="learning-preview">
      <div className="preview-toolbar">
        <div className="language-controls">
          <div className="language-select">
            <span>I speak</span>
            <span className="font-semibold">English</span>
          </div>
          <ArrowRight size={16} className="text-muted-foreground" />
          <label className="language-select">
            <span>I’m learning</span>
            <select
              aria-label="Preview learning language"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as SampleLanguage);
                setIndex(0);
                setVoiceMessage('');
              }}
            >
              {Object.keys(samples).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="preview-tag">
          <span className="status-dot" /> A look inside the dojo
        </span>
      </div>

      <div className="preview-body">
        <div className="section-label-row">
          <span className="eyebrow">01 / CONNECT THE WORDS</span>
          <span className="text-xs text-muted-foreground">{(index % 2) + 1} / 2</span>
        </div>
        <div className="sentence-preview">
          <div className="sentence-top">
            <span className="sentence-language">{language}</span>
            <div className="flex gap-2">
              <Button variant="paper" size="icon" title="Audio preview · voice 1" aria-label="Play first voice" onClick={() => playVoice(0)}>
                <Volume2 />
              </Button>
              <Button variant="paper" size="icon" title="Audio preview · voice 2" aria-label="Play second voice" onClick={() => playVoice(1)}>
                <Headphones />
              </Button>
            </div>
          </div>
          {/* The sample sentences stay as written (not shown in the user's
              "I speak" language), like the practice content they preview */}
          <div className="colored-sentence" translate="no">
            {ordered.map((i) => (
              <span
                key={i}
                className={`${wordColors[i]} ${dimmed(i)}`}
                onMouseEnter={() => setActiveWord(i)}
                onMouseLeave={() => setActiveWord(null)}
              >
                {sample.words[i]}{' '}
              </span>
            ))}
          </div>
          <div className="translation-sentence" translate="no">
            {sample.meanings.map((word, i) => (
              <span key={i} className={`${wordColors[i]} ${dimmed(i)}`}>
                {word}{' '}
              </span>
            ))}
          </div>
          <div className="sentence-bottom">
            <span>
              <span className="color-dots">
                <i />
                <i />
                <i />
                <i />
              </span>
              Different languages. Same meaning.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIndex(index + 1);
                setVoiceMessage('');
              }}
            >
              Next sentence <ArrowRight />
            </Button>
          </div>
          {voiceMessage && (
            <p className="audio-message" role="status">
              {voiceMessage}
            </p>
          )}
        </div>

        <div className="preview-bottom-grid">
          <div id="friend" className="friend-preview">
            <div className="section-label-row">
              <span className="eyebrow">02 / MEET YOUR FRIEND</span>
              <span className="text-xs text-muted-foreground">Sample conversation</span>
            </div>
            <div className="chat-line">
              <NinjaSymbol />
              <div className="friend-message" translate="no">
                <p>{sample.question}</p>
                <p className="message-translation">{sample.translation}</p>
              </div>
            </div>
            <div className="chat-line user-line">
              <div className="user-message" translate="no">
                {sample.reply}
              </div>
              <span className="user-avatar">You</span>
            </div>
            <div className="sample-composer">
              <input aria-label="Example reply" readOnly value={sample.reply} />
              <Button
                variant="ninja"
                size="icon"
                title="Next conversation example"
                aria-label="Next conversation example"
                onClick={() => setIndex(index + 1)}
              >
                <Send />
              </Button>
            </div>
            <p className="friend-caption">A little conversation. A little more confidence.</p>
          </div>

          <aside className="belt-preview" id="belts">
            <div className="section-label-row">
              <span className="eyebrow">YOUR NEXT CHAPTER</span>
            </div>
            <h3>Every belt tells a story.</h3>
            <div className="belt-row">
              <span className="belt belt-white" />
              <span>White belt</span>
              <Check size={14} className="text-muted-foreground" />
            </div>
            <div className="belt-row">
              <span className="belt belt-green" />
              <span>Green belt</span>
              <Check size={14} className="text-muted-foreground" />
            </div>
            <div className="belt-row current-belt">
              <span className="belt belt-yellow" />
              <span>Yellow belt</span>
              <span className="rank-label">NEXT UP</span>
            </div>
            <div className="belt-row future-belt">
              <span className="belt belt-orange" />
              <span>Orange belt</span>
            </div>
            <Button variant="paper" className="w-full mt-5" onClick={onBelts}>
              Explore the belt path <ChevronRight />
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
