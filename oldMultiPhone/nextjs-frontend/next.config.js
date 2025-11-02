module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['example.com'], // Add your image domains here
  },
  env: {
    CUSTOM_API_URL: process.env.CUSTOM_API_URL, // Example of using environment variables
  },
};