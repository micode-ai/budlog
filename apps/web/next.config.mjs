/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the production Docker image.
  output: 'standalone',
  // Monorepo: trace files from the repo root so standalone includes workspaces.
  outputFileTracingRoot: process.cwd() + '/../../',
};

export default nextConfig;
