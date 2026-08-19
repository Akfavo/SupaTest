/**
 * LocalStorage state management
 */

const STORAGE_KEYS = {
  PROJECT_CONFIG: 'supatest_project_config',
  PERSONAS: 'supatest_personas',
  ACTIVE_PERSONA_ID: 'supatest_active_persona_id',
  SAVED_REQUESTS: 'supatest_saved_requests',
  HISTORY: 'supatest_history',
  SCHEMA_CACHE: 'supatest_schema_cache'
};

const DEFAULT_PERSONAS = [
  {
    id: 'anon',
    name: 'Visiteur Public',
    role: 'anon',
    type: 'anon',
    email: '',
    password: '',
    token: null,
    avatarColor: '#64748b'
  }
];

export const Storage = {
  getProjectConfig() {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECT_CONFIG);
    if (!raw) {
      return {
        url: '',
        anonKey: '',
        serviceKey: ''
      };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { url: '', anonKey: '', serviceKey: '' };
    }
  },

  saveProjectConfig(config) {
    // Trim trailing slash from url
    if (config.url) {
      config.url = config.url.trim().replace(/\/+$/, '');
    }
    if (config.anonKey) {
      config.anonKey = config.anonKey.trim();
    }
    localStorage.setItem(STORAGE_KEYS.PROJECT_CONFIG, JSON.stringify(config));
  },

  getPersonas() {
    const raw = localStorage.getItem(STORAGE_KEYS.PERSONAS);
    if (!raw) {
      this.savePersonas(DEFAULT_PERSONAS);
      return DEFAULT_PERSONAS;
    }
    try {
      const parsed = JSON.parse(raw);
      // Ensure anon always exists
      if (!parsed.find((p) => p.id === 'anon')) {
        parsed.unshift(DEFAULT_PERSONAS[0]);
        this.savePersonas(parsed);
      }
      return parsed;
    } catch {
      return DEFAULT_PERSONAS;
    }
  },

  savePersonas(personas) {
    localStorage.setItem(STORAGE_KEYS.PERSONAS, JSON.stringify(personas));
  },

  addPersona(persona) {
    const personas = this.getPersonas();
    const newPersona = {
      ...persona,
      id: 'persona_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      token: null,
      cachedUser: null
    };
    personas.push(newPersona);
    this.savePersonas(personas);
    return newPersona;
  },

  updatePersona(id, updates) {
    const personas = this.getPersonas();
    const index = personas.findIndex((p) => p.id === id);
    if (index !== -1) {
      personas[index] = { ...personas[index], ...updates };
      this.savePersonas(personas);
      return personas[index];
    }
    return null;
  },

  deletePersona(id) {
    if (id === 'anon') return false; // cannot delete anon
    let personas = this.getPersonas();
    personas = personas.filter((p) => p.id !== id);
    this.savePersonas(personas);

    if (this.getActivePersonaId() === id) {
      this.setActivePersonaId('anon');
    }
    return true;
  },

  getActivePersonaId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_PERSONA_ID) || 'anon';
  },

  setActivePersonaId(id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PERSONA_ID, id);
  },

  getActivePersona() {
    const activeId = this.getActivePersonaId();
    const personas = this.getPersonas();
    return personas.find((p) => p.id === activeId) || personas[0];
  },

  getSavedRequests() {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_REQUESTS);
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveRequest(req) {
    const list = this.getSavedRequests();
    const item = {
      id: 'req_' + Date.now(),
      createdAt: new Date().toISOString(),
      ...req
    };
    list.unshift(item);
    localStorage.setItem(STORAGE_KEYS.SAVED_REQUESTS, JSON.stringify(list));
    return item;
  },

  deleteSavedRequest(id) {
    let list = this.getSavedRequests();
    list = list.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.SAVED_REQUESTS, JSON.stringify(list));
  },

  getHistory() {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addHistory(entry) {
    const list = this.getHistory();
    list.unshift({
      id: 'hist_' + Date.now(),
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Keep last 30 entries
    if (list.length > 30) list.pop();
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
  },

  clearHistory() {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
  },

  getSchemaCache() {
    const raw = localStorage.getItem(STORAGE_KEYS.SCHEMA_CACHE);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setSchemaCache(schema) {
    localStorage.setItem(STORAGE_KEYS.SCHEMA_CACHE, JSON.stringify(schema));
  },

  exportAllData() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      project: this.getProjectConfig(),
      personas: this.getPersonas().map(p => ({ ...p, token: null })), // Don't export expired tokens
      savedRequests: this.getSavedRequests(),
      schemaCache: this.getSchemaCache()
    };
  },

  importAllData(data) {
    if (data.project) this.saveProjectConfig(data.project);
    if (data.personas && Array.isArray(data.personas)) this.savePersonas(data.personas);
    if (data.savedRequests && Array.isArray(data.savedRequests)) {
      localStorage.setItem(STORAGE_KEYS.SAVED_REQUESTS, JSON.stringify(data.savedRequests));
    }
    if (data.schemaCache && typeof data.schemaCache === 'object') {
      this.setSchemaCache(data.schemaCache);
    }
  }
};
