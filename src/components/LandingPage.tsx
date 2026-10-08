'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Check, CheckCircle2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import LearningPreview from '@/components/LearningPreview';
import PricingPlans from '@/components/PricingPlans';
import { belts } from '@/lib/landingSamples';
import type { PlanPrices } from '@/lib/planPrices';
import mascot from '@/assets/ninja-mascot.jpg';
import vocabulary from '@/assets/vocabulary-sync.jpg';

// The home page, brought over from color-belt-lingo. Its styles are in
// src/app/landing.css, scoped under .landing.
export default function LandingPage({
  prices,
  accountStatus,
}: {
  // For the plans (#plans): each plan's Stripe price, and the signed-in
  // user's account status (null when signed out)
  prices: PlanPrices;
  accountStatus: string | null;
}) {
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
            <div className="hero-actions">
              <Button variant="ninja" size="hero" asChild>
                <a href="#training">
                  Begin your white belt path <ArrowRight />
                </a>
              </Button>
              <Button variant="paper" size="hero" onClick={() => setDialog('belts')}>
                View the belt path
              </Button>
            </div>
            <p className="hero-note">
              <CheckCircle2 size={14} /> Your language. Your pace. Your own little victories.
            </p>
          </div>
          <div className="hero-art">
            <Image
              src={mascot}
              alt="Friendly blue TalkNinja character wearing a white belt and holding a vocabulary scroll"
              loading="eager"
              fetchPriority="high"
            />
            <div className="mascot-note">
              <span className="belt belt-white" />
              <div>
                <strong>Every ninja starts somewhere.</strong>
                <p>Your white belt is waiting.</p>
              </div>
            </div>
          </div>
        </div>
      </header>

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

      <section id="plans" className="pricing-section">
        <div className="container-wide">
          <div className="section-heading">
            <span className="eyebrow">COMMIT TO YOUR NEXT CHAPTER</span>
            <h2>Choose your path to mastery.</h2>
            <p>A little practice today. A whole new world tomorrow.</p>
          </div>
          <PricingPlans prices={prices} accountStatus={accountStatus} />
          <p className="pricing-note">Same curiosity. Two ways to keep it going.</p>
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
