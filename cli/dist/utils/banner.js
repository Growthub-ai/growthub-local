import pc from "picocolors";
const GROWTHUB_ART = [
    " ██████╗ ██████╗  ██████╗ ██╗    ██╗████████╗██╗  ██╗██╗   ██╗██████╗ ",
    "██╔════╝ ██╔══██╗██╔═══██╗██║    ██║╚══██╔══╝██║  ██║██║   ██║██╔══██╗",
    "██║  ███╗██████╔╝██║   ██║██║ █╗ ██║   ██║   ███████║██║   ██║██████╔╝",
    "██║   ██║██╔══██╗██║   ██║██║███╗██║   ██║   ██╔══██║██║   ██║██╔══██╗",
    "╚██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝   ██║   ██║  ██║╚██████╔╝██████╔╝",
    " ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝    ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ",
];
const TAGLINE = "Growth infrastructure over a stable agentic substrate";
export function printPaperclipCliBanner() {
    const lines = [
        "",
        ...GROWTHUB_ART,
        pc.dim("  ───────────────────────────────────────────────────────"),
        pc.bold(`  ${TAGLINE}`),
        "",
    ];
    console.log(lines.join("\n"));
}
//# sourceMappingURL=banner.js.map