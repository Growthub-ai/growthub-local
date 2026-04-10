# Growthub Agent Worker Kit Browser

Public-facing marketplace for browsing and discovering Growthub Agent Worker Kits.

## Features

- **Modular Components**: Reusable `KitCard`, `FilterBar`, `Button`, `Badge`, `Input` components
- **Advanced Filtering**: Filter by complexity (easy/moderate/complex), type (worker/workflow), and featured status
- **Search**: Full-text search across kit name, description, and tags
- **Sorting**: Sort by newest, oldest, popularity, or complexity
- **Responsive Design**: Mobile-first design with dark mode support
- **Scalable Architecture**: Built with Next.js 16 App Router for performance

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

Open [http://localhost:3000](http://localhost:3000) to view the kit browser.

## Architecture

```
kit-browser/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with fonts
│   │   ├── page.tsx            # Main browse page
│   │   └── globals.css         # Tailwind + design tokens
│   ├── components/
│   │   ├── ui/                 # Reusable UI primitives
│   │   │   ├── button.tsx
│   │   │   ├── badge.tsx
│   │   │   └── input.tsx
│   │   ├── kit-card.tsx        # Kit display card
│   │   └── filter-bar.tsx      # Filtering controls
│   └── lib/
│       ├── types.ts            # TypeScript types
│       ├── data.ts             # Mock kit data
│       └── utils.ts            # Utility functions
```

## Design System

- **Colors**: Monochromatic grayscale with semantic design tokens
- **Typography**: Geist Sans (body) + Geist Mono (monospace)
- **Spacing**: Tailwind spacing scale
- **Components**: shadcn/ui-inspired primitives

## Extending

### Adding Real Data

Replace `mockKits` in `src/lib/data.ts` with API calls to your kit registry:

\`\`\`typescript
export async function getKits(): Promise<Kit[]> {
  const response = await fetch('/api/kits');
  return response.json();
}
\`\`\`

### Adding Kit Detail Pages

Create `src/app/kits/[id]/page.tsx`:

\`\`\`typescript
export default async function KitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Fetch and display kit details
}
\`\`\`

## License

MIT
