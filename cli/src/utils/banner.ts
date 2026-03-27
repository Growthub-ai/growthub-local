import pc from "picocolors";

const GROWTHUB_ART = [
  " ██████╗ ██████╗  ██████╗ ██╗    ██╗████████╗██╗  ██╗██╗   ██╗██████╗ ",
  "██╔════╝ ██╔══██╗██╔═══██╗██║    ██║╚══██╔══╝██║  ██║██║   ██║██╔══██╗",
  "██║  ███╗██████╔╝██║   ██║██║ █╗ ██║   ██║   ███████║██║   ██║██████╔╝",
  "██║   ██║██╔══██╗██║   ██║██║███╗██║   ██║   ██╔══██║██║   ██║██╔══██╗",
  "╚██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝   ██║   ██║  ██║╚██████╔╝██████╔╝",
  " ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝    ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ",
] as const;

const TAGLINE = "Growth infrastructure over a stable agentic substrate";

export function printPaperclipCliBanner(): void {
  const lines = [
    "",
    ...GROWTHUB_ART.map((line) => pc.cyan(line)),
    pc.blue("  ───────────────────────────────────────────────────────"),
    pc.bold(pc.white(`  ${TAGLINE}`)),
    "",
  ];

  console.log(lines.join("\n"));
}
