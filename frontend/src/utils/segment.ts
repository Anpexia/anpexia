export type TenantSegment = 'CLINICA_OFTALMOLOGICA' | 'CLINICA_GERAL' | 'SALAO_BELEZA' | 'OUTROS';

export function hasSegment(tenant: { segment?: string } | null | undefined, segment: TenantSegment): boolean {
  return tenant?.segment === segment;
}

export function isOftalmologia(tenant: { segment?: string } | null | undefined): boolean {
  return hasSegment(tenant, 'CLINICA_OFTALMOLOGICA');
}
