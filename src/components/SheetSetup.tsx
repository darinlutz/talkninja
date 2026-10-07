'use client';

import { useEffect, useState } from 'react';

// Connects the user's own Google Sheet of vocabulary (or switches back to the
// default one), offering to erase and refill a sheet in the wrong format
export default function SheetSetup() {
  const [sheetLink, setSheetLink] = useState('');
  // Null means the built-in sheet
  const [connectedSheetLink, setConnectedSheetLink] = useState<string | null>(null);
  const [sheetStatus, setSheetStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sheetMessage, setSheetMessage] = useState('');
  // Set when the pasted sheet is in the wrong format, to offer erasing it
  const [sheetResetOffer, setSheetResetOffer] = useState<{
    canReset: boolean;
    serviceAccountEmail: string | null;
  } | null>(null);

  // Shows which sheet is connected when the page loads
  useEffect(() => {
    let isCurrent = true;

    fetch('/api/language/sheet')
      .then((response) => response.json())
      .then((data) => {
        if (isCurrent && typeof data.link === 'string') {
          setConnectedSheetLink(data.link);
          setSheetLink(data.link);
        }
      })
      .catch(() => {
        // The built-in sheet stays in use if this fails
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  // Connecting and resetting share everything but the endpoint
  const connectSheet = async (endpoint: string) => {
    if (!sheetLink.trim()) return;

    setSheetStatus('loading');
    setSheetMessage('');
    setSheetResetOffer(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ link: sheetLink }),
      });

      const data = await response.json();

      if (data.formatError) {
        setSheetResetOffer({
          canReset: !!data.canReset,
          serviceAccountEmail: data.serviceAccountEmail ?? null,
        });
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect the Google Sheet');
      }

      setConnectedSheetLink(data.link);
      setSheetStatus('success');
      setSheetMessage(`Connected. Found ${data.wordCount} vocabulary entries.`);
    } catch (error) {
      setSheetStatus('error');
      setSheetMessage(
        error instanceof Error ? error.message : 'Failed to connect the Google Sheet. Please try again.'
      );
    }
  };

  const handleConnectSheet = () => connectSheet('/api/language/sheet');
  const handleResetSheet = () => connectSheet('/api/language/sheet/reset');

  const handleDisconnectSheet = async () => {
    setSheetStatus('loading');
    setSheetMessage('');
    setSheetResetOffer(null);

    try {
      const response = await fetch('/api/language/sheet', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to disconnect the Google Sheet');
      }

      setConnectedSheetLink(null);
      setSheetLink('');
      setSheetStatus('success');
      setSheetMessage('Disconnected. Using the default vocabulary sheet.');
    } catch (error) {
      setSheetStatus('error');
      setSheetMessage(
        error instanceof Error ? error.message : 'Failed to disconnect the Google Sheet. Please try again.'
      );
    }
  };

  return (
    <div>
      <p className="text-slate-600 mb-6">
        Paste a link to your own Google Sheet of vocabulary to practice with it instead of the
        default sheet. The sheet must be shared as &quot;Anyone with the link&quot; and use the same
        layout as the default sheet.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="sheetLink" className="block text-sm font-medium text-dark-blue mb-2">
            Google Sheet Link
          </label>
          <input
            id="sheetLink"
            name="sheetLink"
            type="url"
            value={sheetLink}
            onChange={(e) => {
              setSheetLink(e.target.value);
              // The erase offer was for the previous link
              setSheetResetOffer(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConnectSheet();
            }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
          />
        </div>

        <p className="text-sm text-slate-600">
          Currently using:{' '}
          {connectedSheetLink ? (
            <a
              href={connectedSheetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-powder-600 underline break-all"
            >
              your Google Sheet
            </a>
          ) : (
            'the default vocabulary sheet'
          )}
        </p>

        {/* Status Message */}
        {sheetMessage && (
          <div
            className={`p-3 rounded-lg text-sm ${
              sheetStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {sheetMessage}
          </div>
        )}

        {/* Offer to erase a wrongly formatted sheet and fill it with samples */}
        {sheetResetOffer && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm space-y-3">
            {sheetResetOffer.canReset ? (
              <>
                <p className="font-semibold">
                  Erase this Google Sheet and fill it with sample words in the right format?
                </p>
                <p>
                  Everything on this tab of the sheet will be permanently deleted. First share the
                  sheet with{' '}
                  <span className="font-mono break-all">{sheetResetOffer.serviceAccountEmail}</span>{' '}
                  as an Editor so the app can change it.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleResetSheet}
                    disabled={sheetStatus === 'loading'}
                    className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Erase Sheet and Add Sample Words
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetResetOffer(null)}
                    disabled={sheetStatus === 'loading'}
                    className="px-4 py-2 bg-white border border-slate-300 text-dark-blue font-bold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <p>
                {sheetResetOffer.serviceAccountEmail
                  ? 'To have the app set this sheet up for you, paste the link from the address bar while editing the sheet (not a "Publish to web" link).'
                  : 'Fix the layout of the sheet, then press Connect Google Sheet again.'}
              </p>
            )}
          </div>
        )}

        <div className="pt-4 space-y-2">
          <button
            type="button"
            onClick={handleConnectSheet}
            disabled={!sheetLink.trim() || sheetStatus === 'loading'}
            className="w-full px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
          >
            {sheetStatus === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Connecting...
              </span>
            ) : (
              'Connect Google Sheet'
            )}
          </button>
          {connectedSheetLink && (
            <button
              type="button"
              onClick={handleDisconnectSheet}
              disabled={sheetStatus === 'loading'}
              className="w-full px-4 py-2 bg-white border border-slate-300 text-dark-blue font-bold rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Use Default Sheet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
