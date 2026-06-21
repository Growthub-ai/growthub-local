import "../styles/tokens.css";
import "./globals.css";
const metadata = {
  title: "Growthub Workspace",
  description: "Configurable governed workspace dashboard builder."
};
function RootLayout({ children }) {
  return <html lang="en">
      <body>{children}</body>
    </html>;
}
export {
  RootLayout as default,
  metadata
};
