// An app's README.md as sanitized markdown (US-STORE-06): no raw HTML, links open in a new tab without a handle back
// to hlabs. Loaded only for apps that have a README.
import Markdown from 'react-markdown';

export default function Readme({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-3 text-body text-ink-muted [&_a]:text-accent [&_h1]:m-0 [&_h1]:text-title-2 [&_h1]:text-ink [&_h2]:m-0 [&_h2]:text-headline [&_h2]:text-ink [&_p]:m-0 [&_ul]:m-0 [&_ul]:pl-5">
      <Markdown
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
