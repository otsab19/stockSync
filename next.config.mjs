import nextPwa from "@ducanh2912/next-pwa"

const withPWA = nextPwa({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
}

export default withPWA(nextConfig)

