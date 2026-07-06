import { Badge } from "@/components/ui/badge";
import { tagLabel } from "@/lib/tags";

/** Compact topic-tag row for cards; overflow collapses into "+n". */
export function TagBadges({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
        >
          {tagLabel(tag)}
        </Badge>
      ))}
      {hidden > 0 && (
        <span className="text-[11px] text-muted-foreground">+{hidden}</span>
      )}
    </div>
  );
}
