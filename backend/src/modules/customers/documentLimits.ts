// Limites de armazenamento de documentos do paciente (lógica pura, testável).
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo
export const MAX_PATIENT_DOC_BYTES = 50 * 1024 * 1024; // 50 MB por paciente

export interface DocumentLimitError {
  status: number;
  code: string;
  message: string;
}

// Retorna o erro de limite (ou null se estiver ok). `usedBytes` é a soma dos
// documentos já existentes do paciente; `actualBytes` é o tamanho REAL do novo
// arquivo (calculado do base64 no servidor, não confia no cliente).
export function checkDocumentLimits(actualBytes: number, usedBytes: number): DocumentLimitError | null {
  if (actualBytes > MAX_DOC_BYTES) {
    return { status: 413, code: 'DOCUMENT_TOO_LARGE', message: 'Arquivo excede o limite de 10 MB por documento.' };
  }
  if (usedBytes + actualBytes > MAX_PATIENT_DOC_BYTES) {
    const usedMb = (usedBytes / (1024 * 1024)).toFixed(1);
    return {
      status: 413,
      code: 'PATIENT_STORAGE_LIMIT',
      message: `Limite de 50 MB de documentos por paciente atingido (${usedMb} MB em uso). Exclua algum arquivo para adicionar novos.`,
    };
  }
  return null;
}
