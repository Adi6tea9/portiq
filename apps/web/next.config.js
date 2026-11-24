/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets the Playwright mock server build beside a running dev server without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
}

module.exports = nextConfig
