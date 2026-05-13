import "./globals.css";
import { WorkspaceStyleHydrator } from "./workspace-style-hydrator.jsx";
const metadata = {
  title: "Growthub Workspace",
  description: "Configurable governed workspace dashboard builder."
};
function RootLayout({ children }) {
  return <html lang="en">
      <body>
        <WorkspaceStyleHydrator />
        {children}
      </body>
    </html>;
}
export {
  RootLayout as default,
  metadata
};
