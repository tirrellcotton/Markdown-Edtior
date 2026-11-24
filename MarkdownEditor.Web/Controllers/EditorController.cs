using Microsoft.AspNetCore.Mvc;
using MarkdownEditor.Models;

namespace MarkdownEditor.Controllers;

public sealed class EditorController : Controller
{
    public IActionResult Index() => View();

    [HttpGet]
    public Task<IActionResult> Viewer(string? markdown)
    {
#if DEBUG
        if (!Request.Query.ContainsKey(nameof(markdown)))
        {
            return ViewSampleAsync();
        }
#endif
        return Task.FromResult<IActionResult>(View(model: markdown ?? string.Empty));
    }

#if DEBUG
    private async Task<IActionResult> ViewSampleAsync()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Documentation", "viewer-sample.md");
        var markdown = await System.IO.File.ReadAllTextAsync(path, HttpContext.RequestAborted);
        return View("Viewer", markdown);
    }
#endif

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(8_388_608)]
    public IActionResult Submit([FromBody] MarkdownSubmission? document)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (document is null)
        {
            return BadRequest(new { message = "A document is required." });
        }

        // Add application-specific persistence here; this endpoint acknowledges receipt only.
        return Ok(new { message = "Document received.", document });
    }

    public IActionResult Error() => Problem("The editor could not be loaded. Please try again.");
}
