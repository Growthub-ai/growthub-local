import type { Kit } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Share2 } from "lucide-react";

interface KitCardProps {
  kit: Kit;
}

const complexityVariant = {
  easy: "easy" as const,
  moderate: "moderate" as const,
  complex: "complex" as const,
};

export function KitCard({ kit }: KitCardProps) {
  const timeAgo = getTimeAgo(kit.publishedAt);

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
            {kit.author.username.charAt(0)}
          </div>
          <span className="text-muted-foreground">
            {kit.author.username}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{kit.type}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{timeAgo}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold leading-tight text-pretty">
          {kit.name}
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={complexityVariant[kit.complexity]} className="capitalize">
            {kit.complexity}
          </Badge>
          {kit.featured && (
            <Badge variant="outline" className="text-xs">
              featured
            </Badge>
          )}
        </div>

        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground text-pretty">
          {kit.description}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="text-xs text-muted-foreground">v{kit.version}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Share2 className="h-4 w-4" />
            <span className="sr-only">Share</span>
          </Button>
          <Button size="sm">View kit</Button>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}
