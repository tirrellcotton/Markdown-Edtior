# Repository Guidelines

## Project Structure & Module Organization

The root `MarkdownEditor.slnx` contains `MarkdownEditor.Web/`, an ASP.NET Core MVC 10 project. Within that project, keep HTTP endpoints in `Controllers/` and Razor markup in `Views/`. Store all TypeScript, including test helpers, in `Scripts/`. Place BEM styles in `wwwroot/css/`; compiled JavaScript and copied third-party assets belong in `wwwroot/js/` and `wwwroot/lib/`. Keep browser tests in `Scripts/tests/`.

## Build, Test, and Development Commands

Run npm and npx commands from `MarkdownEditor.Web/`; run the dotnet commands below from the repository root. Keep npm manifests, frontend build configuration, and `node_modules/` inside the web project.

- `npm ci`: install the frontend dependencies from the lockfile.
- `npm run build`: type-check TypeScript, bundle the editor, and copy Bootstrap Icons locally.
- `dotnet build`: compile the MVC application and rebuild frontend assets.
- `dotnet run --project MarkdownEditor.Web`: start the application locally.
- `npm test`: run browser integration tests. Install the test browser with `npx playwright install chromium` first.

Use Node.js and an SDK capable of targeting .NET 10. Rebuild frontend assets after changing TypeScript or dependencies.

## Coding Style & Naming Conventions

Use four spaces for C# and two spaces for TypeScript, CSS, and configuration. Use PascalCase for C# types and methods, camelCase for TypeScript functions and variables, and descriptive file names. CSS follows BEM: `editor__pane` and `toolbar__button--primary`.

Keep functions focused and control flow straightforward. Prefer guard clauses and cohesive helpers; aim for cyclomatic complexity of 5–10 or less. Add a documentation comment immediately before every TypeScript function, method, constructor, and callback. Enable strict TypeScript checking and avoid untyped DOM access.

## Documentation Guidelines

Update both `README.md` and `Documentation/architecture.md` in the same change whenever features, configuration, dependencies, setup/build/test commands, or project structure change.

Keep README usage instructions and examples current. Keep the architectural document's component responsibilities, data flows, security boundaries, source map, and diagrams aligned with the implementation. Before finishing, review both documents and verify that affected descriptions, commands, examples, and file links match the final code.

## Testing Guidelines

Use Playwright integration tests named `*.spec.ts` for live rendering, formatting, keyboard interaction, persistence, and unsafe Markdown. No numeric coverage target is established. Verify changed behavior and responsive layout before submitting changes.

## Commit & Pull Request Guidelines

Create each feature branch from the latest `origin/development`: run `git fetch origin` followed by `git switch --no-track -c feature/<name> origin/development`. Target feature pull requests at `development` and include its current commits before merging. Promote changes to `main` through a pull request from this repository's `development` branch; use `main` to `development` pull requests when synchronizing release history.

No Git history was available when this guide was created. Use short imperative commit subjects, such as `Add Markdown link dialog`. Pull requests should explain the behavior changed, reference relevant issues, list validation performed, and include screenshots for UI changes.

## Security & Configuration

Sanitize generated HTML before inserting previews into the DOM. Keep draft content in the browser and secrets outside tracked configuration. Preserve the toolbar-only interface without File, Edit, or View menus.
