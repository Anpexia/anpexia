import { useState } from 'react';

interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

export function useCepLookup() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscarCep(cep: string): Promise<EnderecoViaCep | null> {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return null;

    setLoading(true);
    setErro(null);

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();

      if (data.erro) {
        setErro('CEP nao encontrado');
        return null;
      }

      return data;
    } catch {
      setErro('Erro ao buscar CEP');
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { buscarCep, loading, erro };
}

export function formatarCep(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 8);
  return nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums;
}
