import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // /learn was retired in favor of posts; the lessons live on as the
    // seeded official posts (fixed ids — see supabase/seed.sql).
    return [
      {
        source: "/learn/depth-first-search",
        destination: "/posts/00000000-0000-0000-0001-000000000001",
        permanent: true,
      },
      {
        source: "/learn/breadth-first-search",
        destination: "/posts/00000000-0000-0000-0001-000000000002",
        permanent: true,
      },
      {
        source: "/learn/dijkstra",
        destination: "/posts/00000000-0000-0000-0001-000000000003",
        permanent: true,
      },
      { source: "/learn/:slug", destination: "/posts", permanent: true },
      { source: "/learn", destination: "/posts", permanent: true },
    ];
  },
};

export default nextConfig;
