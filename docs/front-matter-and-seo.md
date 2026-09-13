# Front-matter & SEO

Every `#+KEYWORD:` line at the top of an `.org` file feeds the generated
`<head>`. The static-HTML output (`templates/default.html`) and the Vue SFC
output share one resolver (`src/renderer/seo.ts`), so the two targets never
drift.

## Core keywords

```org
#+TITLE: My Post
#+SUBTITLE: an optional deck
#+AUTHOR: Ada Lovelace
#+DATE: <2026-07-01 Wed>
#+DESCRIPTION: A one-line summary used for meta description + og:description.
#+KEYWORDS: org-mode, static site, seo
#+LANGUAGE: en
#+FILETAGS: :@work:#release:notes:
```

- `#+TITLE` → `<title>`, `og:title` (fallback), `og:site_name`, JSON-LD `headline`.
- `#+DATE` accepts an Org timestamp (`<2026-07-01 Wed>`), a bare `YYYY-MM-DD`, or
  a freeform date (`May 21, 2026`). It is normalized to an ISO
  `metadata.dateIso` used for `article:published_time` and JSON-LD
  `datePublished`; the raw value stays available for display.
- `#+FILETAGS` tags may contain `@`, `#`, `%` (e.g. `:@work:`), space- or
  colon-separated.

## Rich author (ORCID + affiliation)

```org
#+AUTHOR: Cristian D. Moreno \orcidlink{0009-0006-4459-5538} \affiliation{Kyonax}
```

The display name is cleaned to `Cristian D. Moreno`; the ORCID becomes
`https://orcid.org/0009-0006-4459-5538` (JSON-LD `author.sameAs`) and the
affiliation feeds `author.affiliation`.

## Social cards (Open Graph + Twitter)

```org
#+OG_TITLE: A custom OG title
#+OG_DESCRIPTION: A custom OG description
#+OG_IMAGE: https://example.com/card.png
#+OG_TYPE: article
#+TWITTER_CARD: summary_large_image
#+TWITTER_SITE: @kyonax
#+TWITTER_CREATOR: @kyonax
#+TWITTER_IMAGE: https://example.com/twitter-card.png
```

Open Graph and Twitter tags fall back through `#+OG_*` → title/description →
`#+COVER_IMAGE`. The `article:*` block is emitted only when `og:type` is
`article`. Optional tags (`canonical`, `og:image`, `twitter:site/creator`) are
omitted entirely when absent — no empty `content=""` leaks.

## Canonical, robots, theme-color

```org
#+CANONICAL: https://example.com/my-post
#+ROBOTS: index, follow
#+THEME_COLOR: #FF5114
```

`theme-color` defaults to the O2H signal color `#FF5114`.

## Structured data (JSON-LD)

```org
#+SCHEMA_TYPE: TechArticle
#+JSONLD: {"about":"Org-mode","proficiencyLevel":"Expert"}
```

`#+SCHEMA_TYPE` overrides the default `BlogPosting` `@type`. A raw `#+JSONLD`
object is shallow-merged over the computed blob (a malformed value is ignored).

## Arbitrary head injection

```org
#+HTML_HEAD: <link rel="preload" href="/app.js" as="script">
#+HTML_HEAD_EXTRA: <meta name="referrer" content="no-referrer">
```

Multiple `#+HTML_HEAD` / `#+HTML_HEAD_EXTRA` lines accumulate and are emitted
raw into the `{{headExtra}}` slot. This is trusted-author input — content is not
sanitized, so only use it in files you control.

## Resulting `<head>` (abridged)

```html
<html lang="en">
<head>
  <meta name="theme-color" content="#FF5114">
  <title>My Post</title>
  <meta name="description" content="A one-line summary…">
  <link rel="canonical" href="https://example.com/my-post">
  <meta property="og:type" content="article">
  <meta property="og:title" content="My Post">
  <meta property="article:published_time" content="2026-07-01">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"TechArticle","headline":"My Post",…}
  </script>
  <link rel="preload" href="/app.js" as="script">
</head>
```

Each keyword above is backed by a fixture in `tests/fixtures/`
(`seo-head.org`, `macros-meta.org`) and asserted in `tests/seo-head.test.ts` /
`tests/template.test.ts`.

## Escaping literal characters

To print a structure/markup character literally (so it does not start a heading,
list, table, or emphasis), use its Org entity — the engine emits the character as
plain text:

| Write | Get |
|-------|-----|
| `\ast{}` | `*` |
| `\under{}` | `_` |
| `\tilde{}` | `~` |
| `\equal{}` | `=` |
| `\sol{}` | `/` |
| `\vert{}` | `\|` |
| `\lbrack{}` `\rbrack{}` | `[` `]` |
| `\lbrace{}` `\rbrace{}` | `{` `}` |

So `\ast{}not bold\ast{}` renders `*not bold*` verbatim. Inside a code block, a
line that would look like `#+END` or a headline can be comma-escaped (`,#+END`,
`,*`) — the leading comma is stripped on render. For a raw HTML fragment, use the
export snippet `@@html:<b>x</b>@@`. Backed by `tests/fixtures/literal-escape.org`.
