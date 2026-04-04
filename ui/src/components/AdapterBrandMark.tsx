import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { adapterLabels } from "@/components/agent-config-primitives";
import { adapterBrandLogoSrc } from "@/lib/adapter-brand-logo";
import { cn } from "@/lib/utils";

/** Matches `Settings` / `size="icon-sm"` (h-7 w-7 button) glyphs where applicable. */
export type AdapterBrandMarkSize = "icon-sm" | "icon-md";

const sizeClass: Record<AdapterBrandMarkSize, string> = {
  "icon-sm": "h-3.5 w-3.5",
  "icon-md": "h-4 w-4",
};

/** Logo when a brand asset exists; otherwise the monospace adapter id pill. */
export function AdapterBrandMark({
  adapterType,
  size = "icon-md",
  className,
}: {
  adapterType: string;
  size?: AdapterBrandMarkSize;
  className?: string;
}) {
  const src = adapterBrandLogoSrc(adapterType);
  const label = adapterLabels[adapterType] ?? adapterType;
  const box = sizeClass[size];
  if (src) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center", box, className)} title={label}>
        <img src={src} alt="" className={cn("max-h-full max-w-full object-contain", box)} />
      </span>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-full truncate font-mono tabular-nums",
        size === "icon-sm" ? "text-[10px]" : "text-xs",
        className,
      )}
    >
      {adapterType}
    </Badge>
  );
}

/** Picker grid tiles (GTM agent modal, onboarding): brand marks / icons between toolbar and card hero size. */
const ADAPTER_CARD_GLYPH_CLASS = "h-8 w-8 sm:h-9 sm:w-9";

/** Adapter picker cards: brand image or Lucide icon fallback. */
export function AdapterCardGlyph({
  adapterType,
  Icon,
  className = ADAPTER_CARD_GLYPH_CLASS,
}: {
  adapterType: string;
  Icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  const src = adapterBrandLogoSrc(adapterType);
  if (src) {
    return <img src={src} alt="" className={cn(className, "object-contain")} />;
  }
  return <Icon className={className} />;
}
