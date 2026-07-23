// Shared inline rich-text tag renderers for next-intl `t.rich`, usable from
// server and client components alike.

export const rich = {
  b: (chunks: React.ReactNode) => <b>{chunks}</b>,
  i: (chunks: React.ReactNode) => <i>{chunks}</i>,
  em: (chunks: React.ReactNode) => <em>{chunks}</em>,
  code: (chunks: React.ReactNode) => <code>{chunks}</code>,
}
