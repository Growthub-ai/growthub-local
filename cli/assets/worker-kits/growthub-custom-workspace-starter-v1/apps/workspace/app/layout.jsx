import "./globals.css";
import { SwarmCockpit } from "./components/swarm/SwarmCockpit.jsx";
const metadata = {
  title: "Growthub Workspace",
  description: "Configurable governed workspace dashboard builder."
};
function RootLayout({ children }) {
  return <html lang="en">
      <body>
        {children}
        <SwarmCockpit />
      </body>
    </html>;
}
export {
  RootLayout as default,
  metadata
};
