import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smyst",
    short_name: "Smyst",
    description: "Secure digital AI twins built from human knowledge, memories, documents, and media.",
    start_url: "/en",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f1",
    theme_color: "#0c6b57",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
