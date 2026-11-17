'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Check, CheckCircle2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import LearningPreview from '@/components/LearningPreview';
import { belts } from '@/lib/landingSamples';
import mascot from '@/assets/ninja-mascot.jpg';
import vocabulary from '@/assets/vocabulary-sync.jpg';
import readingWriting from '@/assets/reading-writing.jpg';
import training from '@/assets/training.jpg';
import testing from '@/assets/testing.jpg';

// The three ways every belt is earned, each with its picture (from color-belt-lingo, 2026-11-16)
const DISCIPLINES = [
  {
    img: readingWriting,
    label: '01 / READING & WRITING',
    title: 'Read it. Write it.',
    text: 'Study real sentences, then write your answers and get instant feedback.',
    alt: 'Ninja writing with a brush beside an open scroll in a lantern-lit study',
  },
  {
    img: training,
    label: '02 / TRAINING',
    title: 'Train every day.',
    text: 'Color-matched words and native voices build instinct, rep after rep.',
    alt: 'Ninja in a training stance surrounded by glowing words in a night dojo',
  },
  {
    img: testing,
    label: '03 / TESTING',
    title: 'Earn the next belt.',
    text: 'Pass your tests and step up to a new rank when you are ready.',
    alt: 'Student kneeling before a master as a yellow belt is presented',
  },
];

// The home page, brought over from color-belt-lingo. Its styles are in
// src/app/landing.css, scoped under .landing. Pricing is its own page (src/app/pricing), in the same design.
export default function LandingPage() {
  const [dialog, setDialog] = useState<'belts' | null>(null);

  return (
    <div className="landing">
      <header className="hero">
        <div className="container-wide hero-grid">
          <div>
            <div className="hero-label">
              <span className="status-dot" /> A NEW LANGUAGE. A NEW SUPERPOWER.
            </div>
            <h1>
              <span>TalkNinja.</span>
              <span>New language.</span>
              <span className="text-primary">Next belt.</span>
            </h1>
            <p className="hero-copy">
              Start with the language you know. Learn the one you love. Connect the words, find your voice, and
              earn your progress—one belt at a time.
            </p>
            {/* The app's own button styles (like "Get Started" and "Logout"
                in the nav bar), rather than the landing design's */}
            <div className="hero-actions">
              <a
                href="#training"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-powder-500 to-powder-600 text-white font-semibold hover:shadow-lg hover:shadow-powder-500/50 transition-all"
              >
                Begin your white belt path <ArrowRight className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setDialog('belts')}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-powder-600 text-powder-600 font-semibold hover:bg-powder-600 hover:text-white transition-colors"
              >
                View the belt path
              </button>
            </div>
            <p className="hero-note">
              <CheckCircle2 size={14} /> Your language. Your pace. Your own little victories.
            </p>
          </div>
          <div className="hero-art">
            <Image
              src={mascot}
              alt="Hooded TalkNinja warrior in navy gear with a white belt, holding a scroll"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        </div>
      </header>

      <section id="disciplines" className="disciplines-section">
        <div className="container-wide">
          <div className="section-heading">
            <span className="eyebrow">THE THREE DISCIPLINES</span>
            <h2>Read. Train. Prove it.</h2>
            <p>Every belt is earned the same way.</p>
          </div>
          <div className="disciplines-grid">
            {DISCIPLINES.map((d) => (
              <article className="discipline-card" key={d.label}>
                <Image src={d.img} alt={d.alt} sizes="(max-width: 900px) 100vw, 33vw" />
                <div className="discipline-body">
                  <span className="eyebrow">{d.label}</span>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="training" className="training-section">
        <div className="container-wide">
          <div className="section-heading">
            <span className="eyebrow">LESS MEMORIZING. MORE CONNECTING.</span>
            <h2>See it. Say it. Make it yours.</h2>
            <p>Words that belong together, in colors that bring them together.</p>
          </div>
          <LearningPreview onBelts={() => setDialog('belts')} />
        </div>
      </section>

      <section id="vocabulary" className="vocabulary-section">
        <div className="container-wide vocabulary-grid">
          <Image
            src={vocabulary}
            alt="Illustration of colorful vocabulary rows moving from a spreadsheet to a language-learning phone"
          />
          <div className="vocabulary-copy">
            <span className="eyebrow">YOUR WORDS. YOUR WORLD.</span>
            <h2>
              Bring your own
              <br />
              vocabulary.
            </h2>
            <p>
              The best words to learn are the ones you’ll actually use. Add your own words to Google Sheets and
              make them part of your training.
            </p>
            <ul>
              <li>
                <Check /> Words for your work, travels, and everyday life
              </li>
              <li>
                <Check /> Practice built around your vocabulary
              </li>
              <li>
                <Check /> Listen with male and female voices
              </li>
            </ul>
          </div>
        </div>
      </section>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        {/* The dialog renders outside the page, so it needs .landing for the page's fonts and colors */}
        {/* Scrolls on short screens, since the belt path has 8 belts */}
        <DialogContent className="landing max-h-[90vh] overflow-y-auto">
          {dialog === 'belts' ? (
            <>
              <GraduationCap className="text-primary" size={28} />
              <DialogTitle>Your path, one belt at a time.</DialogTitle>
              <DialogDescription>
                Start at white and work up to black. Each belt is Training, a Reading Test and a Writing Test,
                with longer, richer sentences than the last. Score 80% on the Writing Test to earn the belt.
              </DialogDescription>
              <div className="belt-dialog-list">
                {belts.map((belt) => (
                  <div className="belt-dialog-item" key={belt.name}>
                    <span className={`belt ${belt.className}`} />
                    <div>
                      <h3>
                        {belt.name} belt <span className="belt-dialog-level">Level {belt.level}</span>
                      </h3>
                      <p>{belt.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="ninja" asChild onClick={() => setDialog(null)}>
                <a href="#training">
                  Explore the dojo <ArrowRight />
                </a>
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
