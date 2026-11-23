using Microsoft.AspNetCore.Mvc;
using MarkdownEditor.Models;

namespace MarkdownEditor.Controllers;

public sealed class EditorController : Controller
{
    public IActionResult Index() => View();

    [HttpGet]
    public IActionResult Viewer(string? markdown) => View(model: markdown ?? string.Empty);

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
