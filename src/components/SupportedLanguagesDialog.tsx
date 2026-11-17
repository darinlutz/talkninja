'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LANGUAGES, NATIVE_NAMES } from '@/lib/languages';

// The nav bar's "Supported Languages": every language a user can speak or learn, each with its name in its own
// script. In the training hall's dark design (src/app/landing.css, .lang-dialog), five a row so it doesn't scroll.
export default function SupportedLanguagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="landing lang-dialog">
        <div className="lang-dialog-header">
          <span className="eyebrow">{LANGUAGES.length} LANGUAGES</span>
          <DialogTitle asChild>
            <h2>Supported Languages</h2>
          </DialogTitle>
          <DialogDescription>
            Learn any of these languages, starting from any one you speak.
          </DialogDescription>
        </div>

        <ul className="lang-grid">
          {LANGUAGES.map((language) => (
            <li key={language} className="lang-tile">
              {/* dir="auto" lays out Arabic, Persian and Urdu right to left */}
              <span dir="auto" translate="no" className="lang-tile-native" title={NATIVE_NAMES[language]}>
                {NATIVE_NAMES[language]}
              </span>
              <span className="lang-tile-name" title={language}>{language}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
