/**
 * Supabase Engine: Auth, PostgREST CRUD, OpenAPI Introspection & RLS Matrix Runner
 */
import { parseJwt } from './jwt.js';

export class SupabaseEngine {
  /**
   * Authenticate a persona with Supabase Auth
   */
  static async authenticatePersona(projectConfig, persona) {
    if (!projectConfig?.url || !projectConfig?.anonKey) {
      throw new Error('Configuration du projet incomplète (URL ou Anon Key manquante).');
    }

    if (persona.type === 'anon' || persona.id === 'anon') {
      return {
        success: true,
        token: null,
        user: null,
        role: 'anon',
        claims: null
      };
    }

    // Check if current cached token is still valid
    if (persona.token) {
      const parsed = parseJwt(persona.token);
      if (parsed && !parsed.isExpired) {
        return {
          success: true,
          token: persona.token,
          user: persona.cachedUser,
          role: parsed.role,
          claims: parsed
        };
      }
    }

    // Authenticate via Email & Password
    if (!persona.email || !persona.password) {
      throw new Error(`Email ou mot de passe manquant pour le persona "${persona.name}".`);
    }

    const authUrl = `${projectConfig.url}/auth/v1/token?grant_type=password`;
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'apikey': projectConfig.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: persona.email,
        password: persona.password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error_description || data.msg || data.message || `Erreur Auth (${response.status})`;
      throw new Error(errorMsg);
    }

    const token = data.access_token;
    const claims = parseJwt(token);

    return {
      success: true,
      token,
      refreshToken: data.refresh_token,
      user: data.user,
      role: claims?.role || 'authenticated',
      claims
    };
  }

  /**
   * Introspect project schema from PostgREST OpenAPI endpoint
   */
  static async introspectSchema(projectConfig, token = null) {
    if (!projectConfig?.url || !projectConfig?.anonKey) {
      return { success: false, error: 'URL ou Anon Key manquante dans la configuration' };
    }

    const cleanUrl = projectConfig.url.trim().replace(/\/+$/, '');
    const anonKey = projectConfig.anonKey.trim();

    // Verify if Anon Key is a well-formed JWT
    const anonClaims = parseJwt(anonKey);
    if (!anonClaims) {
      return {
        success: false,
        error: 'La clé Anon Key renseignée n\'est pas un JWT Supabase valide (vérifiez votre clé dans ⚙️ Projet Supabase).'
      };
    }

    // Try multiple endpoint & header strategies, always prioritizing the official Anon Key
    const strategies = [
      {
        name: 'Anon Key OpenAPI standard',
        url: `${cleanUrl}/rest/v1/`,
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Accept': 'application/openapi+json'
        }
      },
      {
        name: 'Anon Key Standard JSON',
        url: `${cleanUrl}/rest/v1/`,
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Accept': 'application/json, */*'
        }
      },
      {
        name: 'Anon Key Direct Headers',
        url: `${cleanUrl}/rest/v1/`,
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      },
      {
        name: 'Anon Key Query Parameter',
        url: `${cleanUrl}/rest/v1/?apikey=${encodeURIComponent(anonKey)}`,
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Accept': 'application/openapi+json, application/json, */*'
        }
      }
    ];

    // If a custom active user token is valid and provided, add it as fallback
    if (token && token !== anonKey) {
      strategies.push({
        name: 'User Token OpenAPI',
        url: `${cleanUrl}/rest/v1/`,
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/openapi+json, application/json, */*'
        }
      });
    }

    let lastError = null;
    let openApi = null;
    let successStatus = null;

    for (const strat of strategies) {
      try {
        const response = await fetch(strat.url, {
          method: 'GET',
          headers: strat.headers
        });

        const rawText = await response.text();

        if (response.ok) {
          try {
            openApi = JSON.parse(rawText);
            if (openApi && (openApi.paths || openApi.definitions || openApi.components?.schemas)) {
              successStatus = response.status;
              break;
            }
          } catch {
            lastError = `Réponse non-JSON reçue (${response.status})`;
          }
        } else {
          let errorDetail = '';
          try {
            const errJson = JSON.parse(rawText);
            errorDetail = errJson.message || errJson.msg || errJson.error_description || errJson.hint || '';
          } catch {
            errorDetail = rawText;
          }

          if (response.status === 401) {
            lastError = `Erreur 401 (Non autorisé) : ${errorDetail || 'La clé Anon Key n\'est pas reconnue par ce projet Supabase.'}`;
          } else {
            lastError = `HTTP ${response.status} ${response.statusText} ${errorDetail ? '(' + errorDetail + ')' : ''}`;
          }
        }
      } catch (err) {
        lastError = `Erreur Réseau/CORS : ${err.message}`;
      }
    }

    if (!openApi) {
      return {
        success: false,
        error: lastError || 'Impossible de récupérer la spécification OpenAPI.',
        diagnostics: `URL: ${cleanUrl}/rest/v1/`
      };
    }

    const tablesMap = new Map();

    const paths = openApi.paths || {};
    const definitions = openApi.definitions || openApi.components?.schemas || {};

    // 1. Extract tables from Definitions (Swagger 2.0 / OpenAPI 3)
    for (const [defKey, defObj] of Object.entries(definitions)) {
      const cleanName = defKey.replace(/^public\./, '');
      const properties = defObj.properties || {};
      const required = defObj.required || [];

      const columns = Object.entries(properties).map(([colName, colMeta]) => ({
        name: colName,
        type: colMeta.type || colMeta.format || 'string',
        format: colMeta.format || '',
        description: colMeta.description || '',
        required: required.includes(colName)
      }));

      tablesMap.set(cleanName, {
        name: cleanName,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        description: defObj.description || '',
        columns
      });
    }

    // 2. Extract and merge tables from Paths
    for (const [pathKey, pathObj] of Object.entries(paths)) {
      if (pathKey === '/' || pathKey.startsWith('/rpc/')) continue;
      const tableName = pathKey.replace(/^\//, '').replace(/^public\./, '');

      const methods = Object.keys(pathObj)
        .filter(m => ['get', 'post', 'patch', 'delete', 'put'].includes(m.toLowerCase()))
        .map(m => m.toUpperCase());

      if (tablesMap.has(tableName)) {
        const existing = tablesMap.get(tableName);
        if (methods.length > 0) existing.methods = methods;
      } else {
        // Find definition if available
        const def = definitions[tableName] || definitions[`public.${tableName}`] || {};
        const properties = def.properties || {};
        const required = def.required || [];

        const columns = Object.entries(properties).map(([colName, colMeta]) => ({
          name: colName,
          type: colMeta.type || colMeta.format || 'string',
          format: colMeta.format || '',
          description: colMeta.description || '',
          required: required.includes(colName)
        }));

        tablesMap.set(tableName, {
          name: tableName,
          methods: methods.length > 0 ? methods : ['GET', 'POST', 'PATCH', 'DELETE'],
          description: pathObj.get?.description || '',
          columns
        });
      }
    }

    const tables = Array.from(tablesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      tables,
      raw: openApi,
      status: successStatus
    };
  }

  /**
   * Execute REST CRUD query with active credentials and return full diagnostic data
   */
  static async executeQuery({
    projectConfig,
    token = null,
    method = 'GET',
    table,
    select = '*',
    filters = [], // array of { column, op, value }
    order = '',
    limit = null,
    offset = null,
    body = null,
    preferReturn = true,
    customHeaders = {}
  }) {
    if (!projectConfig?.url || !projectConfig?.anonKey) {
      throw new Error('Configuration du projet manquante.');
    }
    if (!table) {
      throw new Error('Veuillez sélectionner ou renseigner une table.');
    }

    const queryParams = new URLSearchParams();

    // Query parameters for GET / PATCH / DELETE
    if (method === 'GET' && select) {
      queryParams.set('select', select.trim());
    }

    // Apply PostgREST filters
    if (Array.isArray(filters)) {
      for (const filter of filters) {
        if (filter.column && filter.op && filter.value !== undefined && filter.value !== '') {
          queryParams.set(filter.column.trim(), `${filter.op}.${filter.value.trim()}`);
        }
      }
    }

    if (order) {
      queryParams.set('order', order.trim());
    }
    if (limit !== null && limit !== '' && !isNaN(Number(limit))) {
      queryParams.set('limit', String(limit));
    }
    if (offset !== null && offset !== '' && !isNaN(Number(offset))) {
      queryParams.set('offset', String(offset));
    }

    const queryString = queryParams.toString();
    const endpointUrl = `${projectConfig.url}/rest/v1/${table.trim()}${queryString ? '?' + queryString : ''}`;

    const headers = {
      'apikey': projectConfig.anonKey,
      'Authorization': `Bearer ${token || projectConfig.anonKey}`,
      'Content-Type': 'application/json',
      ...customHeaders
    };

    if (method === 'GET') {
      headers['Prefer'] = 'count=exact';
    } else if (preferReturn && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
      headers['Prefer'] = 'return=representation';
    }

    const options = {
      method,
      headers
    };

    if ((method === 'POST' || method === 'PATCH') && body) {
      if (typeof body === 'string') {
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    const startTime = performance.now();
    let response;
    let rawText = '';
    let parsedData = null;
    let error = null;

    try {
      response = await fetch(endpointUrl, options);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      rawText = await response.text();

      try {
        parsedData = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsedData = rawText;
      }

      // Format response headers
      const responseHeaders = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      // Extract total row count from content-range if available (e.g. "0-19/42")
      const contentRange = response.headers.get('content-range') || responseHeaders['content-range'] || '';
      let totalCount = null;
      if (contentRange && contentRange.includes('/')) {
        const parsed = parseInt(contentRange.split('/')[1], 10);
        if (!isNaN(parsed)) {
          totalCount = parsed;
        }
      }

      // Analyze RLS outcome
      const rlsAnalysis = this.analyzeRlsResult({
        status: response.status,
        method,
        data: parsedData,
        isTokenProvided: Boolean(token),
        totalCount
      });

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: parsedData,
        totalCount,
        rawText,
        latency,
        headers: responseHeaders,
        url: endpointUrl,
        method,
        rlsAnalysis
      };
    } catch (err) {
      const endTime = performance.now();
      return {
        success: false,
        status: 0,
        statusText: 'Network / CORS Error',
        data: null,
        totalCount: null,
        rawText: err.message,
        latency: Math.round(endTime - startTime),
        headers: {},
        url: endpointUrl,
        method,
        error: err.message,
        rlsAnalysis: {
          verdict: 'error',
          badgeClass: 'badge-danger',
          title: 'Erreur Réseau ou CORS',
          message: `Impossible de contacter Supabase (${err.message}). Vérifiez l'URL du projet.`
        }
      };
    }
  }

  /**
   * Evaluates if a response is an RLS restriction, permission denial, or success
   */
  static analyzeRlsResult({ status, method, data, isTokenProvided, totalCount = null }) {
    if (status === 200 || status === 206) {
      if (Array.isArray(data)) {
        if (data.length === 0) {
          if (totalCount !== null && totalCount > 0) {
            return {
              verdict: 'rls_empty',
              badgeClass: 'badge-warning',
              title: `0 ligne retournée (sur ${totalCount} existante${totalCount > 1 ? 's' : ''})`,
              message: 'La table contient des données en base, mais vos règles RLS SELECT en bloquent la visibilité pour ce rôle.'
            };
          }
          return {
            verdict: 'rls_empty',
            badgeClass: 'badge-warning',
            title: totalCount === 0 ? 'Table vide (0 ligne en base)' : '0 ligne retournée',
            message: totalCount === 0 ? 'La table ne contient aucun enregistrement en base.' : 'Requête autorisée par l\'API, mais aucune ligne reçue. Si la table contient des données, la policy SELECT restreint l\'accès pour ce rôle.'
          };
        }

        const countInfo = (totalCount !== null && totalCount > data.length) ? ` (sur ${totalCount} au total)` : '';
        return {
          verdict: 'success',
          badgeClass: 'badge-success',
          title: `${data.length} enregistrement(s) retourné(s)${countInfo}`,
          message: 'Policy RLS validée : les données ont été retournées avec succès.'
        };
      }
      return {
        verdict: 'success',
        badgeClass: 'badge-success',
        title: 'Opération réussie (200 OK)',
        message: 'Données reçues sans restriction.'
      };
    }

    if (status === 201) {
      return {
        verdict: 'success',
        badgeClass: 'badge-success',
        title: 'Insertion réussie (201 Created)',
        message: 'Policy INSERT accordée pour ce rôle.'
      };
    }

    if (status === 204) {
      return {
        verdict: 'success',
        badgeClass: 'badge-success',
        title: 'Succès sans contenu (204 No Content)',
        message: 'L\'opération s\'est exécutée sans retour de représentation.'
      };
    }

    if (status === 401) {
      return {
        verdict: 'unauthorized',
        badgeClass: 'badge-danger',
        title: 'Non Authentifié (401 Unauthorized)',
        message: isTokenProvided ? 'Token JWT invalide ou expiré.' : 'Accès refusé pour les utilisateurs anonymes (nécessite une session authentifiée).'
      };
    }

    if (status === 403) {
      return {
        verdict: 'forbidden',
        badgeClass: 'badge-danger',
        title: 'Accès Interdit par RLS (403 Forbidden)',
        message: 'La politique de sécurité (RLS) bloque strictement cette opération pour ce rôle.'
      };
    }

    if (status === 404) {
      return {
        verdict: 'not_found',
        badgeClass: 'badge-warning',
        title: 'Introuvable (404 Not Found)',
        message: 'Table ou ressource introuvable dans le schéma Supabase.'
      };
    }

    if (status === 409) {
      return {
        verdict: 'conflict',
        badgeClass: 'badge-warning',
        title: 'Conflit / Contrainte (409 Conflict)',
        message: data?.message || 'Violation d\'une contrainte unique ou clé étrangère.'
      };
    }

    return {
      verdict: 'other',
      badgeClass: 'badge-secondary',
      title: `Statut ${status}`,
      message: data?.message || data?.hint || 'Réponse reçue.'
    };
  }

  /**
   * Run the same query across all configured personas in parallel for RLS matrix comparison
   */
  static async runMatrixTest({ projectConfig, personas, queryConfig }) {
    const promises = personas.map(async (persona) => {
      let token = null;
      let user = null;
      let authError = null;

      try {
        const authRes = await this.authenticatePersona(projectConfig, persona);
        token = authRes.token;
        user = authRes.user;
      } catch (err) {
        authError = err.message;
      }

      if (authError) {
        return {
          persona,
          token: null,
          user: null,
          authSuccess: false,
          authError,
          queryResult: null
        };
      }

      const queryResult = await this.executeQuery({
        ...queryConfig,
        projectConfig,
        token
      });

      return {
        persona,
        token,
        user,
        authSuccess: true,
        authError: null,
        queryResult
      };
    });

    return await Promise.all(promises);
  }
}
