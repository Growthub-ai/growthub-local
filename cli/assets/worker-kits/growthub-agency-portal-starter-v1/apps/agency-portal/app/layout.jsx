import "./globals.css";
const metadata = {
  title: "Agency Portal",
  description: "Composable agency operations portal with thin infrastructure adapters."
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
