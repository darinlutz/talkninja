import CookieSettingsButton from '@/components/CookieSettingsButton';
import { en } from '@/lib/i18n/en';
import type { LegalBlock, LegalDocumentContent } from '@/lib/legal';

const linkPattern = /(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g;

// Turns URLs and email addresses in a sentence into links
function Linked({ text }: { text: string }) {
  const parts = text.split(linkPattern);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part.includes('@') && !part.startsWith('http') ? `mailto:${part}` : part}
            className="text-powder-600 underline underline-offset-2 hover:no-underline break-words"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}

// A Terms of Service, Privacy Policy or Cookie Policy page (src/lib/legal.ts). The document is English only and
// marked translate="no" so the page translator leaves it as written; the notice above it is translated.
export default function LegalDocument({ doc }: { doc: LegalDocumentContent }) {
  const t = en.legal;
  return (
    <section className="py-10 px-4 bg-gradient-to-b from-slate-100 to-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t.englishOnly}</p>
        <article lang="en" translate="no" className="space-y-6 text-dark-blue">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
              {doc.title}
            </h1>
            <p className="text-sm text-slate-500">
              Effective date: {doc.effectiveDate} · Last updated: {doc.lastUpdated}
            </p>
          </header>
          <div className="space-y-4 leading-relaxed">
            {doc.intro.map((block, i) => <Block key={i} block={block} />)}
          </div>
          {doc.sections.map((section) => (
            <section key={section.heading} id={section.id} className="space-y-4 leading-relaxed scroll-mt-24">
              <h2 className="text-xl font-semibold pt-2">{section.heading}</h2>
              {section.blocks.map((block, i) => <Block key={i} block={block} />)}
            </section>
          ))}
        </article>
      </div>
    </section>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p><Linked text={block} /></p>;
  if ('strong' in block) return <p className="font-semibold">{block.strong}</p>;
  if ('subheading' in block) return <h3 className="font-semibold pt-1">{block.subheading}</h3>;
  if ('list' in block) {
    return (
      <ul className="list-disc pl-6 space-y-1">
        {block.list.map((item) => <li key={item}><Linked text={item} /></li>)}
      </ul>
    );
  }
  if ('cookieSettings' in block) {
    return (
      <p>
        <CookieSettingsButton
          label={block.cookieSettings}
          className="px-4 py-2 rounded-lg font-semibold text-powder-600 bg-white border border-powder-500 hover:bg-powder-500/10 transition-colors"
        />
      </p>
    );
  }
  if ('table' in block) {
    // Scrolls sideways on its own on a narrow screen, so the page doesn't
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm text-left">
          <caption className="sr-only">{block.table.caption}</caption>
          <thead className="bg-slate-50">
            <tr>
              {block.table.headers.map((header) => (
                <th key={header} scope="col" className="px-3 py-2 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {block.table.rows.map((row) => (
              <tr key={row[0]} className="align-top">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="px-3 py-2 font-medium break-words max-w-[12rem]">{cell}</th>
                  ) : (
                    <td key={i} className="px-3 py-2"><Linked text={cell} /></td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {block.contact.map((line) => (
        <p key={line.text}>
          {line.label && <>{line.label}: </>}
          {line.href ? (
            <a href={line.href} className="text-powder-600 underline underline-offset-2 hover:no-underline">{line.text}</a>
          ) : (
            <span className="font-semibold">{line.text}</span>
          )}
        </p>
      ))}
    </div>
  );
}
