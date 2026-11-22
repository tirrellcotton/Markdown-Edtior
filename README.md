# Markdown Editor

A toolbar-only, two-pane Markdown editor built with **ASP.NET Core MVC 10**, **TypeScript**, and **BEM CSS**. Write Markdown on the left and see a sanitized, rendered preview on the right. The compact toolbar and link dialog follow the supplied Word reference, without File, Edit, or View menus.

## Run locally

Install a .NET SDK that supports .NET 10 and Node.js 22 or newer. From the repository root:

```powershell
npm.cmd ci
dotnet build MarkdownEditor.slnx
dotnet run --project MarkdownEditor.Web
```

Open **http://localhost:5100**. On macOS/Linux, use `npm` instead of `npm.cmd`. `dotnet build` and `dotnet run` rebuild frontend assets automatically; restore npm dependencies first. `npm run build` performs a standalone TypeScript check and frontend build.

Open `MarkdownEditor.slnx` in a current Visual Studio or Rider version for solution-based development.

## Project layout

```text
MarkdownEditor.slnx
MarkdownEditor.Web/
  MarkdownEditor.Web.csproj
  Controllers/               MVC endpoint
  Views/Editor/Index.cshtml   Host page with CSS/JS references
  Views/Shared/_MarkdownEditor.cshtml  Reusable editor partial
  Scripts/                   TypeScript entry point and editor coordinator
    editing/                 Formatting, history, and code block insertion
    tables/                  Table parsing, operations, picker, and dialog
    rendering/               Preview, highlighting, and content extraction
    persistence/             Browser drafts and server submission
    tests/                   Playwright browser scenarios
  wwwroot/css/               BEM styles
  wwwroot/js/                Generated editor bundle
  wwwroot/lib/               Generated local Bootstrap Icons assets
```

The root `package.json`, `tsconfig.json`, and `build.mjs` manage frontend dependencies and compile the web project's TypeScript. Generated assets are ignored by Git and rebuilt for .NET builds and publishing.

## Embed in another MVC view

Render the shared partial wherever an editor is needed:

```cshtml
<partial name="_MarkdownEditor" />
```

Load these references once in the host view or its layout, as shown in `Views/Editor/Index.cshtml`:

```cshtml
<link rel="stylesheet" href="~/lib/bootstrap-icons/bootstrap-icons.css" asp-append-version="true" />
<link rel="stylesheet" href="~/css/editor.css" asp-append-version="true" />
<script type="module" src="~/js/editor.js" asp-append-version="true"></script>
```

The partial supplies the toolbar, panes, file input, and dialogs; the host supplies its surrounding page and resources. Give the containing element a height to control the editor's size. Editor styles are scoped to the component, and the partial generates unique IDs for its labels and dialogs. Each instance maintains its own undo history and controls.

Set `ViewData["MarkdownEditorStorageKey"]` before rendering to choose a stable draft key. Use a distinct key for each editor when rendering multiple instances:

```cshtml
@{
    ViewData["MarkdownEditorStorageKey"] = "article-description-draft";
}
<partial name="_MarkdownEditor" />
```

Server-rendered partials initialize automatically. After dynamically adding partial markup, call the bundle's exported `initializeMarkdownEditors(container)` function. Repeated initialization preserves existing instances.

## Editing

- Heading levels, bold, italic, strikethrough, lists, tasks, quotes, links, code, and dividers.
- The **Code block** dropdown inserts a fenced block for one of 29 common languages and formats, including C#, TypeScript, JavaScript, SQL, Python, JSON, PowerShell, and Dockerfile. Existing selected text becomes the code body; otherwise, an editable placeholder is selected. Each insertion supports undo.
- Table toolbar with a 5×5 size picker. Place the source cursor in a table, then choose **Edit table** for **Insert**, **Select**, or **Delete** options. Insert columns left/right or rows above/below the current cell; select or delete the table, current column, or current row.
- **Edit cell contents** opens a visual grid. Select actions highlight the requested region in this grid. Edit cell Markdown or change structure, then save as one undoable change; Cancel discards changes. Row counts include the required Markdown header. Deleting a header promotes the next row; deleting the final row or column removes the table.
- Undo/redo, `.md` file import (up to 1 MB), and UTF-8 Markdown download.
- `Ctrl+B`, `Ctrl+I`, `Ctrl+K`, `Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`, and `Ctrl+S`; Command shortcuts also work on macOS.
- Draft recovery in this browser's local storage. Saving status reports unavailable storage; download files for a durable copy. Undo history is limited to 200 states and resets on reload.
- Equal-width desktop panes with independent scrolling; stacked panes on small phone screens.

Markdown is rendered with Marked and sanitized with DOMPurify. Drafts and imported files stay in the browser until **Send to server** is clicked. Referenced external images may still load from their specified URLs. Bootstrap Icons, Axios, the renderer, and the sanitizer are bundled locally, with no runtime CDN requirement.

The preview follows NovarisAI's light-mode palette and typography. As in that project, fenced code keeps a dark background with pink/blue/green/gold syntax highlighting; inline code uses a light bordered surface. Highlight.js is bundled locally with its common languages plus PowerShell, Dart, and Dockerfile. All code-dropdown options support highlighting. Fences can specify a language such as `csharp`, `typescript`, `json`, or `powershell`; unlabelled blocks use automatic detection, while unknown languages remain readable plain text.

## Submit content to a controller

Click **Send to server** (the cloud-upload toolbar icon) to post JSON with Axios to `EditorController.Submit` at `/Editor/Submit`:

```json
{
  "markdown": "# Hello\n\nSome **bold** text.",
  "plainText": "Hello\n\nSome bold text.",
  "html": "<h1>Hello</h1>\n<p>Some <strong>bold</strong> text.</p>\n"
}
```

All three strings are generated from the same Markdown snapshot. Plain text preserves paragraph breaks, code whitespace, image descriptions, and tab-separated table columns. HTML includes sanitized markup and syntax-highlighting spans; use the preview CSS when displaying it.

The action binds JSON to `Models/MarkdownSubmission.cs`, validates the request and anti-forgery token, and returns `{ "message": "Document received.", "document": { ... } }`. Add your persistence logic in this action; the example acknowledges receipt without saving to a database. Client-supplied HTML remains untrusted on the server: sanitize or regenerate it before later rendering it.

Set `ViewData["MarkdownEditorPostUrl"] = Url.Action("YourAction", "YourController")` before rendering the partial to target another same-origin action. That action should accept the same model and validate the `X-CSRF-TOKEN` header. The partial supplies the token automatically. The endpoint accepts empty documents, limits Markdown/plain text to 1,048,576 characters each and HTML to 4,194,304 characters, and caps request bodies at 8 MiB.

Host scripts can also use the bundle's API:

```javascript
import { getEditorContent, submitEditorContent } from '/js/editor.js';

const editor = document.querySelector('[data-markdown-editor]');
const content = getEditorContent(editor); // { markdown, plainText, html }
const receipt = await submitEditorContent(editor);
```

Toolbar submissions dispatch a bubbling `markdown-editor:submitted` event on their editor root with the controller response in `event.detail`. Duplicate clicks are blocked while a request is pending; request failures appear in the footer and leave the document intact.

## Verify

```powershell
npx.cmd playwright install chromium
npm.cmd test
```

Tests start the MVC app automatically and cover live rendering, draft recovery, formatting, history, links, unsafe HTML, import/export, and responsive layout. Desktop and phone screenshots are saved under `test-results/`. There is no numeric coverage threshold.
