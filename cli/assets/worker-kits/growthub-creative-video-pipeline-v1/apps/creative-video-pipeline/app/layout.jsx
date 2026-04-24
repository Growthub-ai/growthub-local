import "./globals.css";
const metadata = {
  title: "Creative Video Pipeline",
  description: "Three-stage creative video pipeline: brief, generative, edit — governed workspace with Growthub bridge and BYOK support."
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
