import { anchorProps } from '@/lib/monitoring/awareness/surfaces';
/** Shared output anchors, grouped to bound DOM work even for thousands of blank lines. */
export function TerminalLines({ output }: { output: string }) {
  const lines = output.slice(-64000).split('\n');
  const chunks = [];
  for (let index = 0; index < lines.length; index += 64) chunks.push(<span key={index} {...anchorProps(`terminal-line:${index}`)} className="block min-h-[1lh]">{lines.slice(index, index + 64).join('\n') || ' '}</span>);
  return chunks;
}
