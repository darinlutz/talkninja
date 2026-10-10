// The reasons a subscriber can pick when cancelling (the My Account
// page's Cancel Subscription modal). The label is what's shown and what's
// saved in "CancellationReason". Dependency-free so the modal and the
// cancel route can share it.
export const CANCELLATION_REASONS = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'not_using', label: 'Not using it enough' },
  { value: 'not_helpful', label: 'Training and tests weren’t helpful' },
  { value: 'missing_feature', label: 'Missing a language or feature I need' },
  { value: 'technical_problems', label: 'Technical problems' },
  { value: 'other', label: 'Other' },
] as const;

export type CancellationReasonValue = (typeof CANCELLATION_REASONS)[number]['value'];

export const MAX_CANCELLATION_NOTES_LENGTH = 1000;

// The label for a submitted reason, or null if it isn't one of the list
export function cancellationReasonLabel(value: unknown): string | null {
  return CANCELLATION_REASONS.find((reason) => reason.value === value)?.label ?? null;
}
