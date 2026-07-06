"use client";

import { MAX_TAGS, TOPIC_TAGS } from "@/lib/tags";
import { cn } from "@/lib/utils";

/** Toggleable chips over the fixed topic taxonomy, capped at MAX_TAGS. */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  function toggle(slug: string) {
    if (value.includes(slug)) {
      onChange(value.filter((tag) => tag !== slug));
    } else if (value.length < MAX_TAGS) {
      onChange([...value, slug]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {TOPIC_TAGS.map((tag) => {
        const selected = value.includes(tag.slug);
        const atCap = !selected && value.length >= MAX_TAGS;
        return (
          <button
            key={tag.slug}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(tag.slug)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              selected
                ? "border-transparent bg-primary text-primary-foreground"
                : "text-muted-foreground hover:border-ring/40 hover:text-foreground",
              atCap && "cursor-default opacity-40 hover:border-border hover:text-muted-foreground",
            )}
          >
            {tag.label}
          </button>
        );
      })}
    </div>
  );
}
