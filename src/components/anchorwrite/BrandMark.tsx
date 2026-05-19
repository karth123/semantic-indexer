import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * AnchorWrite brand mark.
 *
 * Renders /icon.png from the public/ directory (drop a file named `icon.png`
 * into the project root's public folder to customize). Falls back to a small
 * "A" tile if the image is missing, so the app never shows a broken image.
 */
export function BrandMark({
  size = 28,
  rounded = "rounded-md",
  className,
}: {
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          rounded,
          "bg-foreground text-background flex items-center justify-center font-semibold",
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
        aria-label="AnchorWrite"
      >
        A
      </div>
    );
  }

  return (
    <img
      src="/icon.png"
      alt="AnchorWrite"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn(rounded, "object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
