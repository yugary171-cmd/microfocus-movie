export interface PlatformRequestOption {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
}

export interface PlatformRequestResponse<T> {
  data: T;
  statusCode: number;
  header: Record<string, string>;
}

export function request<T>(options: PlatformRequestOption): Promise<PlatformRequestResponse<T>> {
  return new Promise((resolve, reject) => {
    const payload = {
      url: options.url,
      method: options.method ?? "GET",
      success: (response: UniNamespace.RequestSuccessCallbackResult) =>
        resolve({
          data: response.data as T,
          statusCode: response.statusCode ?? 0,
          header: (response.header || {}) as Record<string, string>
        }),
      fail: reject
    } as UniNamespace.RequestOptions;
    if (options.data !== undefined) payload.data = options.data as string | AnyObject | ArrayBuffer;
    if (options.header) payload.header = options.header;
    if (options.timeout !== undefined) payload.timeout = options.timeout;
    uni.request(payload);
  });
}
