import type { MetadataRoute } from "next";

// No theme_color on purpose: the head script sets <meta name="theme-color">
// from the visitor's saved theme, and a fixed manifest value could disagree
// with it in installed-app chrome. The background matches the light theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mouaz Naji — Developer Portfolio",
    short_name: "Mouaz Naji",
    start_url: "/",
    display: "standalone",
    background_color: "#defaf5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
