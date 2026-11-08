/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Image optimization (if using next/image)
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.nexusvision.local',
      },
    ],
  },
  
  // Rewrites for API proxy in development
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';
    return {
      // beforeFiles runs ahead of the filesystem, which is the only way to beat
      // next-auth's /api/auth/[...nextauth] catch-all.
      beforeFiles: [
        // FastAPI serves its own auth routes under /api/auth/*, the same prefix
        // next-auth owns here. Hand the six paths the frontend actually calls to
        // the token-injecting proxy; next-auth keeps session/callback/signin/signout.
        { source: '/api/auth/register', destination: '/api/backend/auth/register' },
        { source: '/api/auth/forgot-password', destination: '/api/backend/auth/forgot-password' },
        { source: '/api/auth/reset-password', destination: '/api/backend/auth/reset-password' },
        { source: '/api/auth/verify-email', destination: '/api/backend/auth/verify-email' },
        { source: '/api/auth/users/:path*', destination: '/api/backend/auth/users/:path*' },
        { source: '/api/auth/audit-logs', destination: '/api/backend/auth/audit-logs' },
        // Everything else under /api goes through the same proxy so it reaches
        // FastAPI carrying a backend JWT. `auth` is excluded so next-auth keeps
        // its namespace; `backend` is excluded so the rule cannot match itself.
        { source: '/api/:path((?!backend|auth).*)', destination: '/api/backend/:path' },
      ],
      afterFiles: [
        {
          source: '/stream/:path*',
          destination: `${apiUrl}/stream/:path*`,
        },
        // Backend health endpoints live at the FastAPI root (/healthz, /readyz),
        // outside the /api prefix the auth proxy serves, so they need direct rewrites.
        {
          source: '/healthz',
          destination: `${apiUrl}/healthz`,
        },
        {
          source: '/healthz/deps',
          destination: `${apiUrl}/healthz/deps`,
        },
        {
          source: '/readyz',
          destination: `${apiUrl}/readyz`,
        },
      ],
      fallback: [],
    };
  },
  
  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  
  // Experimental features
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

module.exports = nextConfig;