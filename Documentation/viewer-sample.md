# Markdown viewer sample

This document exercises the **read-only viewer** with *formatted text*, ~~strikethrough~~, and `inline code`.

## Lists

- Headings and paragraphs
- Tables and code blocks
- Links and quotations

1. Open the viewer.
2. Read the formatted document.
3. Resize the window to check the layout.

### Task list

- [x] Render Markdown as formatted content
- [x] Keep checkboxes read only
- [ ] Add your own sample content

## Quotation and link

> The reader fills its container and scrolls when the document is longer than the available space.

Visit [the Markdown Guide](https://www.markdownguide.org/) for Markdown examples.

## Table

| Feature | Expected result |
| --- | --- |
| Bold and italic | Formatted text |
| Fenced code | Highlighted code |
| Task list | Disabled checkboxes |
| Small screens | Content stays inside the viewer |

## Code blocks

```csharp
public sealed record Article(string Title, string Markdown);
```

```typescript
const greeting = 'Hello, Markdown!';
console.log(greeting);
```

```json
{
  "title": "Read-only document",
  "editable": false
}
```

---

End of the sample document.
