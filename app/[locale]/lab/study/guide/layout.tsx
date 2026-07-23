// Guide segment layout: KaTeX's stylesheet loads here only, so the math
// pages stay self-hosted (no CDN) without weighing down the rest of the app.
import 'katex/dist/katex.min.css'

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children
}
