// Standalone & Master AppRelay Public API HTTP Client

import { ReleaseOpsJobItem, ReleaseOpsWorkerItem } from '../../types/release-ops';

export interface AppRelayOverview {
  totalJobs: number;
  activeJobs: number;
  queuedJobs: number;
  succeededJobs: number;
  failedJobs: number;
  onlineWorkers: number;
}

export interface AppRelayJobListResponse {
  data: ReleaseOpsJobItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AppRelayJobDetailResponse {
  job: ReleaseOpsJobItem;
  events: any[];
  artifact?: any;
  worker?: ReleaseOpsWorkerItem | null;
}

export class AppRelayApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.NEXT_PUBLIC_APPRELAY_API_BASE_URL || '/api/app-relay/v1').replace(/\/$/, '');
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: any;
      token?: string;
      csrfToken?: string;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    if (options.csrfToken) {
      headers['X-CSRF-Token'] = options.csrfToken;
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error?.message || `HTTP ${response.status}: Request failed`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  async getHealth(): Promise<{ status: string; service: string }> {
    return this.request<{ status: string; service: string }>('health');
  }

  async getOverview(token?: string): Promise<AppRelayOverview> {
    return this.request<AppRelayOverview>('overview', { token });
  }

  async getJobs(
    params: { page?: number; pageSize?: number; search?: string } = {},
    token?: string
  ): Promise<AppRelayJobListResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search) query.set('search', params.search);

    const queryString = query.toString();
    const endpoint = queryString ? `jobs?${queryString}` : 'jobs';

    return this.request<AppRelayJobListResponse>(endpoint, { token });
  }

  async createJob(
    payload: {
      playUrl: string;
      locale?: string;
      includeListing?: boolean;
      includeScreenshots?: boolean;
    },
    token?: string,
    csrfToken?: string
  ): Promise<{ job: ReleaseOpsJobItem }> {
    return this.request<{ job: ReleaseOpsJobItem }>('jobs', {
      method: 'POST',
      body: payload,
      token,
      csrfToken,
    });
  }

  async getJobDetail(jobId: string, token?: string): Promise<AppRelayJobDetailResponse> {
    return this.request<AppRelayJobDetailResponse>(`jobs/${jobId}`, { token });
  }

  async getJobEvents(jobId: string, token?: string): Promise<{ data: any[] }> {
    return this.request<{ data: any[] }>(`jobs/${jobId}/events`, { token });
  }

  async cancelJob(jobId: string, token?: string, csrfToken?: string): Promise<{ job: ReleaseOpsJobItem }> {
    return this.request<{ job: ReleaseOpsJobItem }>(`jobs/${jobId}/cancel`, {
      method: 'POST',
      token,
      csrfToken,
    });
  }

  async retryJob(jobId: string, token?: string, csrfToken?: string): Promise<{ job: ReleaseOpsJobItem }> {
    return this.request<{ job: ReleaseOpsJobItem }>(`jobs/${jobId}/retry`, {
      method: 'POST',
      token,
      csrfToken,
    });
  }

  async getArtifactDownloadUrl(
    jobId: string,
    expiresInSeconds = 900,
    token?: string
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    return this.request<{ downloadUrl: string; expiresAt: string }>(`jobs/${jobId}/artifact/download-url`, {
      method: 'POST',
      body: { expiresInSeconds },
      token,
    });
  }

  async deleteArtifact(artifactId: string, token?: string, csrfToken?: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`jobs/${artifactId}/artifact`, {
      method: 'DELETE',
      token,
      csrfToken,
    });
  }

  async getWorkers(token?: string): Promise<{ data: ReleaseOpsWorkerItem[] }> {
    return this.request<{ data: ReleaseOpsWorkerItem[] }>('workers', { token });
  }
}
