# DataFrame

A knowledge galaxy for becoming a data engineer. DataFrame is a single-page, dependency-free
web app that lays out a full data-engineering and AI-engineering curriculum as an interactive
constellation of lessons. Open any star and it assembles a complete teaching prompt for your
own AI (Claude, ChatGPT, or Claude Code), which then runs the lesson as your professor.

## Highlights

- **Navigable galaxy** of ~70 lessons and projects across 10 constellations, from SQL and
  Python foundations to dbt/SQLMesh, orchestration, an AWS lakehouse, streaming, and advanced
  LLM/AI engineering (RAG, evals, MCP, LLMOps).
- **AI as the professor.** Every star builds a full, structured prompt: a Socratic teaching
  persona, an AI-leverage module, professional-standards enforcement, objectives, a hands-on
  brief, and a definition of done. Copy it, or open Claude/ChatGPT in one click.
- **Portfolio-first.** Eight milestone projects plus a capstone, each specified to ship as a
  standalone, production-ready repository (README, architecture diagram, tests, CI/CD, clean
  commit history).
- **Progress tracking.** Completion, in-progress state, per-lesson checklists and notes are
  saved in your browser. Export to a file or share a progress link.
- **Design.** A monochrome ink star-chart with an animated starfield. No build step, no
  dependencies, no backend, no tracking. Respects reduced-motion.

## Run locally

It is a static site. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

**Option A - deploy from a branch (simplest):**

1. Push this repository to GitHub.
2. Settings -> Pages -> Build and deployment -> Source: "Deploy from a branch".
3. Branch: `main`, folder: `/ (root)`. Save.

The included `.nojekyll` file ensures the site is served as-is.

**Option B - GitHub Actions:** the workflow in `.github/workflows/deploy.yml` publishes the
site on every push to `main`. Enable it under Settings -> Pages -> Source: "GitHub Actions".

## Project structure

```
index.html          markup and load order
css/styles.css      design system and layout
js/curriculum.js    curriculum data (phases and stars)
js/template.js      the standard professor prompt template + assembler
js/store.js         progress persistence (localStorage, export/import, link)
js/starfield.js     animated background
js/graph.js         galaxy rendering, pan/zoom, lock/unlock state
js/panel.js         lesson detail panel
js/app.js           HUD, legend, search, menu, startup
```

## License

MIT. See [LICENSE](LICENSE).
