/** Provider metadata visible to the webview. */
export interface ProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
}

// ---- Requests: webview → host ----

/** Base for all request messages. */
export interface WebviewRequest {
  requestId: string;
}

/** Fetch the list of active providers. */
export interface GetProvidersRequest extends WebviewRequest {
  type: 'getProviders';
}

/** Add a new provider. */
export interface AddProviderRequest extends WebviewRequest {
  type: 'addProvider';
  name: string;
  baseUrl: string;
  apiKey: string;
}

/** Edit an existing provider. */
export interface EditProviderRequest extends WebviewRequest {
  type: 'editProvider';
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

/** Remove a provider (soft-delete). */
export interface RemoveProviderRequest extends WebviewRequest {
  type: 'removeProvider';
  id: string;
}

/** Reset all settings (clear DB + secrets). */
export interface ResetSettingsRequest extends WebviewRequest {
  type: 'resetSettings';
}

/** Union of all webview → host messages. */
export type WebviewCommand =
  | GetProvidersRequest
  | AddProviderRequest
  | EditProviderRequest
  | RemoveProviderRequest
  | ResetSettingsRequest;

// ---- Responses: host → webview ----

/** Base for all response messages. */
export interface HostResponse {
  requestId: string;
}

/** Response to GetProvidersRequest. */
export interface GetProvidersResponse extends HostResponse {
  type: 'getProvidersResult';
  providers: ProviderInfo[];
}

/** Response to AddProviderRequest. */
export interface AddProviderResponse extends HostResponse {
  type: 'addProviderResult';
  success: boolean;
  provider?: ProviderInfo;
  error?: string;
}

/** Response to EditProviderRequest. */
export interface EditProviderResponse extends HostResponse {
  type: 'editProviderResult';
  success: boolean;
  provider?: ProviderInfo;
  error?: string;
}

/** Response to RemoveProviderRequest. */
export interface RemoveProviderResponse extends HostResponse {
  type: 'removeProviderResult';
  success: boolean;
  error?: string;
}

/** Response to ResetSettingsRequest. */
export interface ResetSettingsResponse extends HostResponse {
  type: 'resetSettingsResult';
  success: boolean;
  error?: string;
}

/** Union of all host → webview messages. */
export type HostMessage =
  | GetProvidersResponse
  | AddProviderResponse
  | EditProviderResponse
  | RemoveProviderResponse
  | ResetSettingsResponse;
