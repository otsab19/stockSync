import nextPwa from "@ducanh2912/next-pwa"

const withPWA = nextPwa({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  sw: "sw.js",
  publicExcludes: ["!sw.js"],
  buildExcludes: [/middleware-manifest\.json$/],
  fallbacks: {
    document: "/dashboard",
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
}

export default withPWA(nextConfig)

