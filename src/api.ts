import type { HealthResponse, LaunchProductResponse, ProductPublic, VerifyPurchaseResponse } from './shared/types';
import { defaultConfig } from './shared/config';

const fallbackApiBaseUrl = import.meta.env.DEV ? defaultConfig.apiBaseUrl : '';
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || fallbackApiBaseUrl;

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

export async function fetchProducts(): Promise<ProductPublic[]> {
  const response = await request<{ products: ProductPublic[] }>('/api/products');
  return response.products;
}

export async function launchProduct(formData: FormData): Promise<LaunchProductResponse> {
  return request<LaunchProductResponse>('/api/products', {
    method: 'POST',
    body: formData,
  });
}

export async function verifyPurchase(
  productId: string,
  transactionDigest: string,
  buyerAddress?: string,
): Promise<VerifyPurchaseResponse> {
  return request<VerifyPurchaseResponse>(`/api/products/${productId}/purchases`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ transactionDigest, buyerAddress }),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
