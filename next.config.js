/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // The Baileys worker is a separate Docker/Node service and is not part of the Netlify dashboard build.
    // Its TypeScript is checked independently in worker/.
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
