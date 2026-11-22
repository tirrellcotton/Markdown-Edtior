using System.ComponentModel.DataAnnotations;

namespace MarkdownEditor.Models;

public sealed class MarkdownSubmission
{
    public const int MaxTextLength = 1_048_576;

    [Required(AllowEmptyStrings = true)]
    [StringLength(MaxTextLength)]
    public required string Markdown { get; init; }

    [Required(AllowEmptyStrings = true)]
    [StringLength(MaxTextLength)]
    public required string PlainText { get; init; }

    [Required(AllowEmptyStrings = true)]
    [StringLength(4 * MaxTextLength)]
    public required string Html { get; init; }
}
