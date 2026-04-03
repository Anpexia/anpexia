import { env } from '../../config/env';

interface CosmosProduct {
  description: string;
  brand: string | null;
  category: string | null;
  thumbnail: string | null;
  avgPrice: number | null;
}

export async function getProductByBarcode(barcode: string): Promise<CosmosProduct | null> {
  if (!env.cosmosApiToken) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${barcode}`, {
      headers: {
        'X-Cosmos-Token': env.cosmosApiToken,
        'Content-Type': 'application/json',
        'User-Agent': 'Anpexia/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data: any = await res.json();

    return {
      description: data.description || '',
      brand: data.brand?.name || data.brand || null,
      category: data.ncm?.full_description || data.gpc?.description || null,
      thumbnail: data.thumbnail || null,
      avgPrice: data.avg_price != null ? Number(data.avg_price) : null,
    };
  } catch {
    return null;
  }
}
