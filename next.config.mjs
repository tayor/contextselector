import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': __dirname,
    };

    // Enable WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Add WebAssembly MIME type
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    return config;
  },
};

export default nextConfig;
