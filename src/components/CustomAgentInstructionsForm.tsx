'use client';

import { useState } from 'react';

// The Account page's "Customize Training Experience": what the user wants
// their training to focus on, which the word picker agent weights toward
export default function CustomAgentInstructionsForm({
  initialInstructions,
  maxLength,
}: {
  initialInstructions: string | null;
  maxLength: number;
}) {
  const [instructions, setInstructions] = useState(initialInstructions ?? '');
  // What's in the database, so the button and status reflect unsaved edits
  const [savedInstructions, setSavedInstructions] = useState(initialInstructions);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const unchanged = instructions.trim() === (savedInstructions ?? '');

  const handleSave = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/account/agent-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save your instructions');
      }

      setSavedInstructions(data.instructions);
      setInstructions(data.instructions ?? '');
      setStatus('success');
      setMessage(
        data.instructions
          ? 'Saved. Your training will lean toward what you described.'
          : 'Instructions removed. Your training is back to a random mix.'
      );
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save your instructions. Please try again.');
    }
  };

  return (
    <div>
      <p className="text-slate-600 mb-6">
        Tell TalkNinja what you want to focus on. Training and tests will still mix in other words and
        sentences, but will pick things related to your focus more often.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="customAgentInstructions" className="block text-sm font-medium text-dark-blue mb-2">
            Instructions
          </label>
          <textarea
            id="customAgentInstructions"
            name="customAgentInstructions"
            rows={4}
            maxLength={maxLength}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="I want to focus on travel so ordering food, asking for directions, and dealing with money"
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-y"
          />
          <p className="mt-1 text-xs text-slate-500 text-right">
            {instructions.length} / {maxLength}
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              status === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={unchanged || status === 'loading'}
          className="w-full px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
        >
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Saving...
            </span>
          ) : savedInstructions ? (
            'Save Instructions'
          ) : (
            'Add Instructions'
          )}
        </button>
      </div>
    </div>
  );
}
