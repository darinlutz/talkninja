// The Admin page sections' message after saving: green when it worked, red
// with the error otherwise
export default function AdminStatusMessage({ message }: { message: { ok: boolean; text: string } }) {
  return (
    <p
      role="status"
      className={`mt-3 p-3 rounded-lg text-sm ${
        message.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
      }`}
    >
      {message.text}
    </p>
  );
}
