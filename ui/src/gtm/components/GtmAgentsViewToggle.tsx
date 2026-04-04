import { PaperclipViewLayoutToggle, PAPERCLIP_VIEW_LAYOUT_ICONS } from "@/components/PaperclipViewLayoutToggle";
import type { GtmAgentsLayout } from "@/gtm/lib/gtm-agents-layout";

const AGENT_VIEWS = [
  { id: "list" as const, label: "List", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.list },
  { id: "kanban" as const, label: "Kanban", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.kanban },
  { id: "table" as const, label: "Table", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.table },
];

export function GtmAgentsViewToggle(props: {
  value: GtmAgentsLayout;
  onValueChange: (layout: GtmAgentsLayout) => void;
  favoriteLayout: GtmAgentsLayout | null;
  onFavoriteToggle: (layout: GtmAgentsLayout) => void;
  className?: string;
}) {
  return (
    <PaperclipViewLayoutToggle
      views={AGENT_VIEWS}
      value={props.value}
      onValueChange={props.onValueChange}
      favoriteLayout={props.favoriteLayout}
      onFavoriteToggle={props.onFavoriteToggle}
      className={props.className}
    />
  );
}
