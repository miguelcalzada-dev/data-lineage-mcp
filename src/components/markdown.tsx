import { type ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);

  return boldParts.flatMap((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-stone-900 dark:text-stone-100">{part.slice(2, -2)}</strong>;
    }

    const emParts = part.split(/(\*[^*]+\*)/g);
    return emParts.map((seg, j) => {
      if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
        return <em key={`${keyPrefix}-i-${i}-${j}`}>{seg.slice(1, -1)}</em>;
      }
      return seg;
    });
  });
}

export function Markdown({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1 space-y-0.5">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-orange-500" />
              <span>{renderInline(item, `li-${blocks.length}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isBullet =
      trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ');

    if (isBullet) {
      listItems.push(trimmed.slice(2).trim());
    } else {
      flushList();
      if (trimmed.length > 0) {
        blocks.push(
          <p key={`p-${i}`} className="leading-relaxed">
            {renderInline(trimmed, `p-${i}`)}
          </p>
        );
      }
    }
  });

  flushList();

  return <div className="space-y-1.5">{blocks}</div>;
}
