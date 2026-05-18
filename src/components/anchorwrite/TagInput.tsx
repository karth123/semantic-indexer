import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function TagInput({ tags, onChange, placeholder, autoFocus, className }: TagInputProps) {
  const [value, setValue] = useState("");

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setValue("");
      return;
    }
    onChange([...tags, t]);
    setValue("");
  };

  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(value);
    } else if (e.key === "Backspace" && !value && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all",
        className,
      )}
    >
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Remove ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => addTag(value)}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
      />
    </div>
  );
}
