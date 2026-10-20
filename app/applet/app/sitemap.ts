import { MetadataRoute } from 'next';
import { SA_PROVINCES } from '@/lib/locations';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://searchbiz.co.za';
  const baseRoutes = [
    '',
    '/directory',
    '/categories',
    '/services',
    '/news',
    '/tools',
    '/premium-partners',
    '/posts',
    '/terms',
    '/qa',
    '/ai-chat',
    '/visual-sitemap',
    '/sitemap',
    '/google-business-guide',
    '/how-money-works',
    '/how-business-works',
  ];

  const provinceRoutes = SA_PROVINCES.map((p) => `/${p.slug}`);
  const allPaths = Array.from(new Set([...baseRoutes, ...provinceRoutes]));

  return allPaths.map((path) => {
    return {
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1.0 : 0.8,
    };
  });
}
