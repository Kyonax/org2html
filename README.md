This package transforms Org files into fully-rendered HTML templates or web-framework components. *(Currently supports Vue 3 components and static HTML output.)*

The project is still in active development, evolving toward a framework-agnostic engine capable of generating components for any modern frontend stack. The roadmap includes first-class SEO integration and enhanced pipeline controls, a modular toolchain for developers who build fast and think faster.

A lightweight compiler for the ones who use Org for blogs, websites, and more. The interface is simple — run `org2html --help`. More formats, more targets, more power coming soon.

> [!IMPORTANT]
> This package is not stable yet, is still under develop, however
> if you are interested on support it and contribute you can do it.

# FILE STRUCTURE
```txt
org2html/
├── src/
│   ├── cli/
│   │   ├── index.ts           # CLI entry point
│   │   ├── commands/
│   │   │   ├── build.ts
│   │   │   ├── watch.ts
│   │   │   └── test.ts
│   │   └── utils.ts
│   ├── parser/
│   │   ├── lexer.ts           # Tokenization
│   │   ├── parser.ts          # AST generation
│   │   ├── ast.ts             # AST node types
│   │   └── metadata.ts        # Metadata extraction
│   ├── renderer/
│   │   ├── html-renderer.ts   # AST to HTML
│   │   ├── template.ts        # Template processing
│   │   └── sanitizer.ts       # XSS protection
│   ├── plugins/
│   │   ├── plugin-api.ts      # Plugin system
│   │   ├── code-highlight.ts
│   │   ├── shortcode.ts
│   │   ├── toc.ts
│   │   └── asset-fetcher.ts
│   ├── assets/
│   │   └── asset-handler.ts   # Image/video metadata
│   ├── index.ts               # Main library API
│   └── types.ts               # Shared types
├── templates/
│   └── base.html              # Default HTML template
├── client/
│   └── hydrate.ts             # Vue 3 hydration script
├── tests/
│   ├── fixtures/
│   └── *.test.ts
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

## Installation
```bash
npm install -g org2html
```
