const API_BASE = '/api';

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('cc_auth_token');
  }

  public setToken(token: string | null) {
    if (token) {
      localStorage.setItem('cc_auth_token', token);
    } else {
      localStorage.removeItem('cc_auth_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      // Trigger re-auth event if needed
      window.dispatchEvent(new Event('cc_unauthorized'));
    }

    if (!response.ok) {
      let errorMessage = `Server returned status ${response.status} (${response.statusText})`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch {
        // Fallback to text or status
      }
      throw new Error(errorMessage);
    }

    // Check if JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text() as unknown as T;
  }

  // ==========================================
  // Auth
  // ==========================================
  async login(credentials: { username_or_email: string; password: string }) {
    const res = await this.request<{ access_token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(res.access_token);
    return res;
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // ==========================================
  // Dashboard
  // ==========================================
  async getDashboardMetrics() {
    return this.request<any>('/dashboard/metrics');
  }

  // ==========================================
  // Applications
  // ==========================================
  async listApplications(env?: string, status?: string, search?: string) {
    const params = new URLSearchParams();
    if (env && env !== 'all') params.append('environment', env);
    if (status && status !== 'all') params.append('status', status);
    if (search) params.append('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/applications${query}`);
  }

  async getApplication(id: string) {
    return this.request<any>(`/applications/${id}`);
  }

  async createApplication(data: any) {
    return this.request<any>('/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateApplication(id: string, data: any) {
    return this.request<any>(`/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async executeAppAction(id: string, action: string) {
    return this.request<any>(`/applications/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async toggleMaintenance(id: string, enabled: boolean, reason: string, durationMinutes: number = 60) {
    return this.request<any>(`/applications/${id}/maintenance`, {
      method: 'POST',
      body: JSON.stringify({ enabled, reason, expected_duration_minutes: durationMinutes }),
    });
  }

  async getAppLogs(id: string, limit: number = 50) {
    return this.request<any[]>(`/applications/${id}/logs?limit=${limit}`);
  }

  // ==========================================
  // Servers
  // ==========================================
  async listServers() {
    return this.request<any[]>('/servers');
  }

  async getServer(id: string) {
    return this.request<any>(`/servers/${id}`);
  }

  async createServer(data: any) {
    return this.request<any>('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getServerMetrics(id: string, limit: number = 24) {
    return this.request<any[]>(`/servers/${id}/metrics?limit=${limit}`);
  }

  async getServerProcesses(id: string) {
    return this.request<any[]>(`/servers/${id}/processes`);
  }

  async executeServerCommand(id: string, action: string, confirmation?: string, serviceName?: string) {
    return this.request<any>(`/servers/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ action, confirmation, service_name: serviceName }),
    });
  }

  async testServerConnection(id: string) {
    return this.request<{
      success: boolean;
      server_id: string;
      connection_type: string;
      latency_ms: number;
      banner?: string;
      message: string;
      status: string;
    }>(`/servers/${id}/connect/test`, { method: 'POST' });
  }

  async configureServerConnection(id: string, data: {
    ssh_user: string;
    ssh_port: number;
    ssh_auth_type: string;
    ssh_key?: string;
    ssh_password?: string;
    connection_type: string;
  }) {
    return this.request<any>(`/servers/${id}/connect/configure`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async executeTerminalCommand(id: string, command: string, workingDir?: string) {
    return this.request<{
      success: boolean;
      command: string;
      stdout: string;
      stderr: string;
      exit_code: number;
      duration_ms: number;
      timestamp: string;
    }>(`/servers/${id}/terminal/exec`, {
      method: 'POST',
      body: JSON.stringify({ command, working_dir: workingDir }),
    });
  }

  async getTerminalHistory(id: string) {
    return this.request<any[]>(`/servers/${id}/terminal/history`);
  }

  async getAgentInstallScript(id: string) {
    return this.request<string>(`/servers/${id}/agent/install-script`);
  }

  // ==========================================
  // Monitoring
  // ==========================================
  async getMonitoringSummary(period: string = '24h') {
    return this.request<any>(`/monitoring/summary?range_period=${period}`);
  }

  async triggerMonitoringNow() {
    return this.request<any>('/monitoring/trigger-now', { method: 'POST' });
  }

  async listIncidents(status?: string) {
    const q = status ? `?status=${status}` : '';
    return this.request<any[]>(`/monitoring/incidents${q}`);
  }

  // ==========================================
  // Domains
  // ==========================================
  async listDomains() {
    return this.request<any[]>('/domains');
  }

  async createDomain(data: any) {
    return this.request<any>('/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyDomainSsl(id: string) {
    return this.request<any>(`/domains/${id}/verify-ssl`, { method: 'POST' });
  }

  // ==========================================
  // Deployments & Git
  // ==========================================
  async listDeployments(appId?: string, env?: string) {
    const params = new URLSearchParams();
    if (appId) params.append('application_id', appId);
    if (env && env !== 'all') params.append('environment', env);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/deployments${q}`);
  }

  async triggerDeployment(data: { application_id: string; environment: string; branch: string; commit_hash?: string; run_tests: boolean; create_backup: boolean }) {
    return this.request<any>('/deployments/trigger', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async triggerRollback(data: { deployment_id: string; reason: string; confirmation: string }) {
    return this.request<any>('/deployments/rollback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGitStatus(appId: string) {
    return this.request<any>(`/git/status/${appId}`);
  }

  async pullGitChanges(appId: string) {
    return this.request<any>(`/git/pull/${appId}`, { method: 'POST' });
  }

  // ==========================================
  // Licenses
  // ==========================================
  async listLicenses(status?: string, product?: string) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (product) params.append('product', product);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/licenses${q}`);
  }

  async getLicenseMetrics() {
    return this.request<any>('/licenses/metrics');
  }

  async getPublicKey() {
    return this.request<{ public_key_pem: string }>('/licenses/public-key');
  }

  async createLicense(data: any) {
    return this.request<any>('/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async revokeLicense(id: string) {
    return this.request<any>(`/licenses/${id}/revoke`, { method: 'POST' });
  }

  async renewLicense(id: string, additionalDays: number = 365) {
    return this.request<any>(`/licenses/${id}/renew?additional_days=${additionalDays}`, { method: 'POST' });
  }

  // ==========================================
  // Logs
  // ==========================================
  async searchLogs(params: { category?: string; severity?: string; appId?: string; serverId?: string; search?: string; limit?: number }) {
    const sp = new URLSearchParams();
    if (params.category && params.category !== 'all') sp.append('category', params.category);
    if (params.severity && params.severity !== 'all') sp.append('severity', params.severity);
    if (params.appId) sp.append('application_id', params.appId);
    if (params.serverId) sp.append('server_id', params.serverId);
    if (params.search) sp.append('search', params.search);
    if (params.limit) sp.append('limit', params.limit.toString());
    const q = sp.toString() ? `?${sp.toString()}` : '';
    return this.request<any[]>(`/logs${q}`);
  }

  // ==========================================
  // Backups, Alerts, Admin, Topology, Search, Health
  // ==========================================
  async listBackups(serverId?: string) {
    const q = serverId ? `?server_id=${serverId}` : '';
    return this.request<any[]>(`/backups${q}`);
  }

  async createDatabaseBackup(data: {
    server_id: string;
    database_type: string;
    database_name: string;
    application_id?: string;
    retention_days?: number;
  }) {
    return this.request<any>('/backups/database', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteBackup(id: string) {
    return this.request<any>(`/backups/${id}`, { method: 'DELETE' });
  }

  async triggerBackup(appId?: string, serverId?: string) {
    const sp = new URLSearchParams();
    if (appId) sp.append('application_id', appId);
    if (serverId) sp.append('server_id', serverId);
    const q = sp.toString() ? `?${sp.toString()}` : '';
    return this.request<any>(`/backups/trigger${q}`, { method: 'POST' });
  }

  async verifyBackup(id: string) {
    return this.request<any>(`/backups/${id}/verify`, { method: 'POST' });
  }

  async listAlerts(resolved?: boolean, severity?: string) {
    const sp = new URLSearchParams();
    if (resolved !== undefined) sp.append('resolved', resolved.toString());
    if (severity && severity !== 'all') sp.append('severity', severity);
    const q = sp.toString() ? `?${sp.toString()}` : '';
    return this.request<any[]>(`/alerts${q}`);
  }

  async acknowledgeAlert(id: string) {
    return this.request<any>(`/alerts/${id}/acknowledge`, { method: 'POST' });
  }

  async resolveAlert(id: string) {
    return this.request<any>(`/alerts/${id}/resolve`, { method: 'POST' });
  }

  async listAlertRules() {
    return this.request<any[]>('/alerts/rules');
  }

  async createAlertRule(data: any) {
    return this.request<any>('/alerts/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listUsers() {
    return this.request<any[]>('/admin/users');
  }

  async createUser(data: any) {
    return this.request<any>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUserRole(userId: string, role: string) {
    return this.request<any>(`/admin/users/${userId}/role?role=${role}`, { method: 'PUT' });
  }

  async listApiKeys() {
    return this.request<any[]>('/admin/api-keys');
  }

  async createApiKey(name: string, role: string) {
    return this.request<any>('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, role }),
    });
  }

  async revokeApiKey(id: string) {
    return this.request<any>(`/admin/api-keys/${id}`, { method: 'DELETE' });
  }

  async listAuditLogs(action?: string, username?: string, entityType?: string) {
    const sp = new URLSearchParams();
    if (action) sp.append('action', action);
    if (username) sp.append('username', username);
    if (entityType && entityType !== 'all') sp.append('entity_type', entityType);
    const q = sp.toString() ? `?${sp.toString()}` : '';
    return this.request<any[]>(`/admin/audit${q}`);
  }

  async getTopology() {
    return this.request<any>('/topology');
  }

  async globalSearch(query: string) {
    return this.request<any[]>(`/search?q=${encodeURIComponent(query)}`);
  }

  async getSystemHealth() {
    return this.request<any>('/system-health');
  }
}

export const api = new ApiClient();
