import "./globals.css";
import { BrandKitBootstrap } from "./components/BrandKitBootstrap.jsx";
const metadata = {
  title: "Growthub Workspace",
  description: "Configurable governed workspace dashboard builder."
};
function RootLayout({ children }) {
  return <html lang="en">
      <body>
        <BrandKitBootstrap />
        {children}
      </body>
    </html>;
}
export {
  RootLayout as default,
  metadata
};
