export type TenantSegment = 'CLINICA_MEDICA' | 'CLINICA_ESTETICA' | 'CLINICA_ODONTOLOGICA' | 'CLINICA_GERAL' | 'CLINICA_OFTALMOLOGICA' | 'SALAO_BELEZA' | 'OUTROS';

export function hasSegment(tenant: { segment?: string } | null | undefined, segment: TenantSegment): boolean {
  return tenant?.segment === segment;
}
