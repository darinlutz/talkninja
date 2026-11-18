'use client';

// Removes a Level 0 language from the user's profile (Account page)
export default function DeleteLanguageButton({ language }: { language: string }) {
  return (
    <form
      action="/api/language/progress/remove"
      method="POST"
      onSubmit={(event) => {
        if (!confirm(`Remove ${language} from your profile?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="language" value={language} />
      <button
        type="submit"
        className="practice-btn-danger practice-btn-xs"
      >
        Delete
      </button>
    </form>
  );
}
