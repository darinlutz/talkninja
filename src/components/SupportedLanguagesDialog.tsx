'use client';

import { Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LANGUAGES, NATIVE_NAMES } from '@/lib/languages';

// The nav bar's "Supported Languages": every language a user can speak or
// learn, each with its name in its own script
export default function SupportedLanguagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The close button sits on the blue header, so it's white */}
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border-slate-200 bg-white p-0 gap-0 [&>button]:text-white! [&>button]:bg-transparent!">
        <div className="bg-gradient-to-r from-powder-500 to-powder-600 px-6 py-6 text-white sm:rounded-t-xl">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Globe className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-2xl font-bold text-white">Supported Languages</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-white/85">
                Learn any of these {LANGUAGES.length} languages, starting from any one you speak.
              </DialogDescription>
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-6">
          {LANGUAGES.map((language) => (
            <li
              key={language}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 transition-colors hover:border-powder-500 hover:bg-powder-500/5"
            >
              {/* dir="auto" lays out Arabic, Persian, Urdu and Western Punjabi right to left */}
              <span dir="auto" translate="no" className="block text-lg font-semibold text-dark-blue truncate">
                {NATIVE_NAMES[language]}
              </span>
              <span className="block text-sm text-slate-500 truncate">{language}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
