// One review comment on the field guide, as stored in
// src/guide/review/comments.json. The file is a plain JSON array, 2-space
// indented, sorted by createdAt, and it exists to be read: the author leaves
// comments while reading the guide on a dev server, and a coding agent picks
// the file up afterwards and acts on them.
//
// An entry looks like this:
//
//   {
//     "id": "c20260916T1412-9f3a",
//     "locale": "en",
//     "key": "sec.method.lead.p1",
//     "quote": "the words it is reaching for",
//     "body": "this sentence claims more than the chart shows",
//     "createdAt": "2026-09-16T14:12:07.412Z",
//     "resolved": false
//   }
//
// `key` is the dotted path under Study.guide in messages/<locale>.json, so
// the string a comment is about is always one lookup away. `quote` is the
// text that was selected, empty when the comment is about the whole string.
// Resolved comments stay in the file; they are hidden in the reading UI.

export interface GuideReviewComment {
  id: string
  locale: string
  key: string
  quote: string
  body: string
  createdAt: string
  resolved: boolean
}
