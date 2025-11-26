export default function createFetchWithProxyHeader() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? {});

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

