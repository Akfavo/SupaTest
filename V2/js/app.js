/**
 * Main Application Orchestrator - SupaTest
 */

import { Storage } from './storage.js';
import { SupabaseEngine } from './supabase.js';
import { UI } from './ui.js';
import { parseJwt } from './jwt.js';

class App {
  constructor() {
    this.projectConfig = Storage.getProjectConfig();
    this.personas = Storage.getPersonas();
    this.activePersona = Storage.getActivePersona();
    this.activeAuthState = { token: null, claims: null, user: null };
    this.schemaData = Storage.getSchemaCache() || { tables: [] };
    this.currentView = 'playground';
  }

  async init() {
    this.setupEventListeners();
    this.renderInitialState();

    // Check project configuration
    if (!this.projectConfig.url || !this.projectConfig.anonKey) {
      UI.openModal('projectModal');
    } else {
      // Connect to active persona and introspect schema in background
      await this.switchPersona(this.activePersona);
      this.refreshSchema(false);
    }
  }

  renderInitialState() {
    // Project info in sidebar
    const urlEl = document.getElementById('projectUrlDisplay');
    if (urlEl) {
      urlEl.textContent = this.projectConfig.url || 'Aucun projet configuré';
    }

    // Personas list
    this.renderPersonas();

    // Favorites list
    this.renderFavorites();

    // Table datalist
    this.populateTableDatalist();

    // Add initial filter row in playground
    const filterContainer = document.getElementById('filterRowsContainer');
    if (filterContainer && filterContainer.children.length === 0) {
      UI.addFilterRow(filterContainer);
    }

    // Populate schema explorer
    this.renderSchemaExplorer();
    this.updateColumnPills();
  }

  renderFavorites() {
    const favorites = Storage.getSavedRequests();
    UI.renderFavoritesList(
      favorites,
      (fav) => this.loadFavoriteQuery(fav),
      (fav) => this.deleteFavoriteQuery(fav)
    );
  }

  saveCurrentQueryToFavorites() {
    try {
      const config = this.getQueryConfigFromUI();
      if (!config.table) {
        UI.showToast('Veuillez spécifier au moins une table à enregistrer.', 'warning');
        return;
      }

      const defaultTitle = `${config.method} ${config.table}`;
      const title = prompt('Titre de ce favori de test :', defaultTitle);
      if (title === null) return;

      const favItem = {
        title: title.trim() || defaultTitle,
        ...config,
        personaId: this.activePersona.id
      };

      Storage.saveRequest(favItem);
      this.renderFavorites();
      UI.showToast(`Requête "${favItem.title}" enregistrée dans vos favoris !`, 'success');
    } catch (err) {
      UI.showToast(`Erreur lors de la sauvegarde : ${err.message}`, 'error');
    }
  }

  loadFavoriteQuery(fav) {
    if (!fav) return;

    // Set method
    const methodSelect = document.getElementById('queryMethodSelect');
    if (methodSelect) {
      methodSelect.value = fav.method || 'GET';
      methodSelect.dispatchEvent(new Event('change'));
    }

    // Set table
    const tableInput = document.getElementById('queryTableInput');
    if (tableInput) {
      tableInput.value = fav.table || '';
    }

    // Set select
    const selectInput = document.getElementById('querySelectInput');
    if (selectInput) {
      selectInput.value = fav.select || '*';
    }

    // Set order, limit, offset
    const orderInput = document.getElementById('queryOrderInput');
    if (orderInput) orderInput.value = fav.order || '';
    const limitInput = document.getElementById('queryLimitInput');
    if (limitInput) limitInput.value = fav.limit || '';
    const offsetInput = document.getElementById('queryOffsetInput');
    if (offsetInput) offsetInput.value = fav.offset || '';

    // Clear and restore filters
    const filterContainer = document.getElementById('filterRowsContainer');
    if (filterContainer) {
      filterContainer.innerHTML = '';
      if (fav.filters && fav.filters.length > 0) {
        fav.filters.forEach(f => UI.addFilterRow(filterContainer, f));
      } else {
        UI.addFilterRow(filterContainer);
      }
    }

    // Set body if POST / PATCH
    const bodyInput = document.getElementById('queryBodyInput');
    if (bodyInput && fav.body) {
      bodyInput.value = typeof fav.body === 'string' ? fav.body : JSON.stringify(fav.body, null, 2);
    }

    this.updateAvailableColumnsDatalist();
    this.updateColumnPills();
    this.switchTab('playground');
    UI.showToast(`Favori "${fav.title || fav.table}" chargé dans le Playground`, 'info');
  }

  deleteFavoriteQuery(fav) {
    if (confirm(`Supprimer le favori "${fav.title || fav.table}" ?`)) {
      Storage.deleteSavedRequest(fav.id);
      this.renderFavorites();
      UI.showToast('Favori supprimé.', 'info');
    }
  }

  renderSchemaExplorer() {
    UI.renderSchemaExplorer(
      this.schemaData.tables || [],
      (tableName) => {
        // Jump to playground
        const tableInput = document.getElementById('queryTableInput');
        if (tableInput) {
          tableInput.value = tableName;
        }
        this.updateAvailableColumnsDatalist();
        this.updateColumnPills();
        this.switchTab('playground');
        UI.showToast(`Table "${tableName}" prête pour vos tests dans le Playground`, 'info');
      },
      (tableName) => {
        // Delete manual table
        if (this.schemaData.tables) {
          this.schemaData.tables = this.schemaData.tables.filter(t => t.name !== tableName);
          Storage.setSchemaCache(this.schemaData);
          this.renderSchemaExplorer();
          this.populateTableDatalist();
          UI.showToast(`Table "${tableName}" retirée de la liste.`, 'info');
        }
      }
    );
  }

  renderPersonas() {
    UI.renderPersonas(
      this.personas,
      this.activePersona.id,
      (p) => this.switchPersona(p),
      (p) => this.openEditPersonaModal(p),
      (p) => this.deletePersona(p)
    );
  }

  async switchPersona(persona) {
    this.activePersona = persona;
    Storage.setActivePersonaId(persona.id);
    this.renderPersonas();

    if (persona.id === 'anon' || persona.type === 'anon') {
      this.activeAuthState = { token: null, claims: null, user: null };
      UI.renderHud(persona, this.activeAuthState);
      UI.renderJwtInspector(null, null);
      UI.showToast(`Passage au rôle : ${persona.name} (Anonyme)`, 'info');
      return;
    }

    try {
      UI.showToast(`Connexion en cours (${persona.email})...`, 'info', 1500);
      const authRes = await SupabaseEngine.authenticatePersona(this.projectConfig, persona);
      
      // Cache token on persona
      Storage.updatePersona(persona.id, {
        token: authRes.token,
        cachedUser: authRes.user
      });
      this.personas = Storage.getPersonas();

      this.activeAuthState = {
        token: authRes.token,
        claims: authRes.claims,
        user: authRes.user
      };

      UI.renderHud(persona, this.activeAuthState);
      UI.renderJwtInspector(authRes.claims, authRes.token);
      UI.showToast(`Connecté avec succès en tant que : ${persona.name}`, 'success');
    } catch (err) {
      this.activeAuthState = { token: null, claims: null, user: null };
      UI.renderHud(persona, this.activeAuthState);
      UI.renderJwtInspector(null, null);
      UI.showToast(`Erreur d'authentification : ${err.message}`, 'error', 5000);
    }
  }

  async refreshSchema(showNotification = true) {
    if (!this.projectConfig.url || !this.projectConfig.anonKey) return;

    if (showNotification) {
      UI.showToast('Découverte du schéma en cours...', 'info', 1500);
    }

    const res = await SupabaseEngine.introspectSchema(this.projectConfig, this.activeAuthState.token);
    if (res.success && res.tables && res.tables.length > 0) {
      // Preserve existing / learned tables
      const existingTables = this.schemaData.tables || [];
      const combinedTables = [...res.tables];
      
      existingTables.forEach(ex => {
        if (!combinedTables.some(t => t.name === ex.name)) {
          combinedTables.push(ex);
        }
      });

      this.schemaData = { tables: combinedTables };
      Storage.setSchemaCache(this.schemaData);
      this.renderSchemaExplorer();
      this.populateTableDatalist();

      if (showNotification) {
        UI.showToast(`Schéma actualisé : ${combinedTables.length} table(s) disponible(s)`, 'success');
      }
    } else {
      // If OpenAPI root is restricted on this Supabase tier, use learned tables
      this.renderSchemaExplorer();
      this.populateTableDatalist();
      if (showNotification) {
        const count = (this.schemaData.tables || []).length;
        if (count > 0) {
          UI.showToast(`Schéma : ${count} table(s) enregistrée(s) (Découverte active)`, 'info');
        } else {
          UI.showToast(`OpenAPI racine restreint par Supabase. Vos tables seront apprises lors de vos requêtes ou ajoutées via '+ Ajouter une Table'.`, 'info', 4500);
        }
      }
    }
  }

  addManualTablePrompt() {
    const tableName = prompt('Entrez le nom de la table Supabase (ex: commentaire, profil, commande, users, lecon) :');
    if (!tableName || !tableName.trim()) return;

    const cleanName = tableName.trim().toLowerCase();
    const columnsStr = prompt('Colonnes connues séparées par des virgules (ex: id, user_id, contenu, created_at) [Optionnel] :', 'id, user_id, created_at');
    
    let columns = [];
    if (columnsStr) {
      columns = columnsStr.split(',').map(c => c.trim()).filter(Boolean).map(colName => ({
        name: colName,
        type: colName === 'id' ? 'integer' : (colName.includes('user_id') ? 'uuid' : 'string'),
        required: colName === 'id'
      }));
    }

    const newTable = {
      name: cleanName,
      isManual: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      description: 'Table ajoutée manuellement',
      columns
    };

    if (!this.schemaData.tables) this.schemaData.tables = [];
    // Remove if already exists
    this.schemaData.tables = this.schemaData.tables.filter(t => t.name !== cleanName);
    this.schemaData.tables.unshift(newTable);
    Storage.setSchemaCache(this.schemaData);

    this.renderSchemaExplorer();
    this.populateTableDatalist();

    const tableInput = document.getElementById('queryTableInput');
    if (tableInput) tableInput.value = cleanName;
    this.updateAvailableColumnsDatalist();
    this.updateColumnPills();
    UI.showToast(`Table "${cleanName}" ajoutée avec succès !`, 'success');
  }

  addBatchTablesPrompt() {
    const raw = prompt(
      'Collez la liste de vos tables Supabase (séparées par des virgules ou retours à la ligne) :\nExemple : lecon, cours, profils, utilisateurs, commentaires, modules'
    );
    if (!raw || !raw.trim()) return;

    const names = raw
      .split(/[\n,;]+/)
      .map(n => n.trim().toLowerCase())
      .filter(n => n.length > 0);

    if (names.length === 0) return;

    if (!this.schemaData.tables) this.schemaData.tables = [];

    let addedCount = 0;
    names.forEach(name => {
      const exists = this.schemaData.tables.some(t => t.name === name);
      if (!exists) {
        this.schemaData.tables.push({
          name,
          methods: ['GET', 'POST', 'PATCH', 'DELETE'],
          description: 'Importée en lot',
          columns: [
            { name: 'id', type: 'integer', required: true },
            { name: 'created_at', type: 'timestamp', required: false }
          ]
        });
        addedCount++;
      }
    });

    Storage.setSchemaCache(this.schemaData);
    this.renderSchemaExplorer();
    this.populateTableDatalist();

    if (names[0]) {
      const tableInput = document.getElementById('queryTableInput');
      if (tableInput) tableInput.value = names[0];
      this.updateAvailableColumnsDatalist();
      this.updateColumnPills();
    }

    UI.showToast(`${addedCount} table(s) ajoutée(s) avec succès !`, 'success');
  }

  populateTableDatalist() {
    const datalist = document.getElementById('tablesDatalist');
    const filterColDatalist = document.getElementById('filterColDatalist');
    if (!datalist) return;

    datalist.innerHTML = '';
    (this.schemaData.tables || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      datalist.appendChild(opt);
    });

    this.updateAvailableColumnsDatalist();
    this.updateColumnPills();
  }

  updateAvailableColumnsDatalist() {
    const tableInput = document.getElementById('queryTableInput');
    const filterColDatalist = document.getElementById('filterColDatalist');
    if (!tableInput || !filterColDatalist) return;

    const currentTable = tableInput.value.trim();
    filterColDatalist.innerHTML = '';

    const tableObj = (this.schemaData.tables || []).find(t => t.name === currentTable);
    if (tableObj && tableObj.columns) {
      tableObj.columns.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col.name;
        opt.label = `${col.type} ${col.required ? '(Requis)' : ''}`;
        filterColDatalist.appendChild(opt);
      });
    }
  }

  updateColumnPills() {
    const tableInput = document.getElementById('queryTableInput');
    const container = document.getElementById('columnPillsContainer');
    const countEl = document.getElementById('columnsDetectedCount');
    const jsonEditor = document.getElementById('queryBodyInput');
    if (!tableInput || !container) return;

    const currentTable = tableInput.value.trim();
    const tableObj = (this.schemaData.tables || []).find(t => t.name === currentTable);
    const columns = tableObj?.columns || [];

    let currentObj = {};
    if (jsonEditor && jsonEditor.value.trim()) {
      try {
        currentObj = JSON.parse(jsonEditor.value.trim());
      } catch {
        currentObj = {};
      }
    }

    UI.renderColumnPills(
      container,
      countEl,
      columns,
      currentObj,
      (col, isPresent) => this.toggleColumnInJson(col, isPresent)
    );
  }

  toggleColumnInJson(col, isPresent) {
    const jsonEditor = document.getElementById('queryBodyInput');
    if (!jsonEditor) return;

    let obj = {};
    const raw = jsonEditor.value.trim();
    if (raw) {
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = {};
      }
    }

    if (isPresent) {
      // Remove column from JSON
      delete obj[col.name];
      UI.showToast(`Colonne "${col.name}" retirée du JSON`, 'info', 1500);
    } else {
      // Add column with smart default value
      let defaultVal = '';
      if (col.name.includes('user_id') || col.name.includes('author_id') || col.name.includes('uid')) {
        defaultVal = this.activeAuthState.claims?.userId || 'auth.uid()';
      } else if (col.type === 'integer' || col.type === 'number') {
        defaultVal = 1;
      } else if (col.type === 'boolean') {
        defaultVal = true;
      } else if (col.type === 'array') {
        defaultVal = [];
      } else if (col.type === 'object' || col.type === 'json' || col.type === 'jsonb') {
        defaultVal = {};
      } else if (col.name === 'id' && col.type === 'uuid') {
        defaultVal = 'uuid-ici';
      } else {
        defaultVal = 'valeur';
      }

      obj[col.name] = defaultVal;
      UI.showToast(`Colonne "${col.name}" ajoutée au JSON`, 'success', 1500);
    }

    jsonEditor.value = JSON.stringify(obj, null, 2);
    this.updateColumnPills();
  }

  addAllColumnsToJson() {
    const tableInput = document.getElementById('queryTableInput');
    const jsonEditor = document.getElementById('queryBodyInput');
    if (!tableInput || !jsonEditor) return;

    const currentTable = tableInput.value.trim();
    const tableObj = (this.schemaData.tables || []).find(t => t.name === currentTable);
    const columns = tableObj?.columns || [];

    if (columns.length === 0) {
      UI.showToast('Aucune colonne détectée pour cette table.', 'warning');
      return;
    }

    const obj = {};
    columns.forEach(col => {
      let defaultVal = '';
      if (col.name.includes('user_id') || col.name.includes('author_id') || col.name.includes('uid')) {
        defaultVal = this.activeAuthState.claims?.userId || 'auth.uid()';
      } else if (col.type === 'integer' || col.type === 'number') {
        defaultVal = 1;
      } else if (col.type === 'boolean') {
        defaultVal = true;
      } else if (col.type === 'array') {
        defaultVal = [];
      } else if (col.type === 'object' || col.type === 'json' || col.type === 'jsonb') {
        defaultVal = {};
      } else if (col.name === 'id' && col.type === 'uuid') {
        defaultVal = 'uuid-ici';
      } else {
        defaultVal = 'valeur';
      }
      obj[col.name] = defaultVal;
    });

    jsonEditor.value = JSON.stringify(obj, null, 2);
    this.updateColumnPills();
    UI.showToast(`${columns.length} colonnes insérées dans le JSON !`, 'success');
  }

  clearJson() {
    const jsonEditor = document.getElementById('queryBodyInput');
    if (jsonEditor) {
      jsonEditor.value = '{\n\n}';
      this.updateColumnPills();
      UI.showToast('JSON réinitialisé.', 'info', 1500);
    }
  }

  generateSampleJson() {
    this.addAllColumnsToJson();
  }

  getQueryConfigFromUI() {
    const method = document.getElementById('queryMethodSelect').value;
    const table = document.getElementById('queryTableInput').value.trim();
    const select = document.getElementById('querySelectInput').value.trim() || '*';
    const order = document.getElementById('queryOrderInput').value.trim();
    const limit = document.getElementById('queryLimitInput').value.trim();
    const offset = document.getElementById('queryOffsetInput').value.trim();
    const filterContainer = document.getElementById('filterRowsContainer');
    let filters = UI.getFiltersFromContainer(filterContainer);
    const bodyRaw = document.getElementById('queryBodyInput').value.trim();

    let body = null;
    if (method === 'POST' || method === 'PATCH') {
      if (bodyRaw) {
        try {
          body = JSON.parse(bodyRaw);
        } catch {
          throw new Error('Le corps de la requête (Body JSON) contient une erreur de syntaxe.');
        }
      }

      // Smart PATCH helper: if user specified an ID in the JSON body and didn't set manual filters, target that ID automatically
      if (method === 'PATCH' && body && typeof body === 'object' && body.id && filters.length === 0) {
        filters = [{ column: 'id', op: 'eq', value: String(body.id) }];
      }
    }

    return {
      method,
      table,
      select,
      filters,
      order,
      limit,
      offset,
      body
    };
  }

  async executeCurrentQuery() {
    try {
      const queryConfig = this.getQueryConfigFromUI();
      if (!queryConfig.table) {
        UI.showToast('Veuillez renseigner le nom d\'une table.', 'warning');
        return;
      }

      // Safety check for unconditioned DELETE
      if (queryConfig.method === 'DELETE' && (!queryConfig.filters || queryConfig.filters.length === 0)) {
        const confirmDeleteAll = confirm(
          `⚠️ ATTENTION : SUPPRESSION TOTALE\n\n` +
          `Vous êtes sur le point d'exécuter une requête DELETE sur la table "${queryConfig.table}" SANS AUCUN FILTRE (WHERE).\n\n` +
          `Cette action va supprimer TOUTES les lignes de la table autorisées par votre rôle RLS.\n\n` +
          `Êtes-vous certain de vouloir continuer ?`
        );
        if (!confirmDeleteAll) return;
      }

      // Check if active persona token is needed
      if (this.activePersona.id !== 'anon' && !this.activeAuthState.token) {
        await this.switchPersona(this.activePersona);
      }

      UI.showToast(`Exécution [${queryConfig.method}] sur "${queryConfig.table}"...`, 'info', 1000);

      const result = await SupabaseEngine.executeQuery({
        ...queryConfig,
        projectConfig: this.projectConfig,
        token: this.activeAuthState.token
      });

      UI.renderQueryResult(result);

      // Automatically learn table schema and columns from returned data
      if (result.success && result.data) {
        this.learnSchemaFromResponse(queryConfig.table, result.data);
      }

      // Save to history
      Storage.addHistory({
        method: queryConfig.method,
        table: queryConfig.table,
        personaName: this.activePersona.name,
        role: this.activeAuthState.claims?.role || this.activePersona.role || 'anon',
        status: result.status,
        timestamp: new Date().toISOString()
      });

      this.renderHistory();

      if (result.success) {
        UI.showToast(`Succès (${result.status}) - ${result.latency} ms`, 'success');
      } else {
        UI.showToast(`Réponse : ${result.status} ${result.statusText}`, result.status === 403 || result.status === 401 ? 'warning' : 'error');
      }
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }

  /**
   * Learn table columns automatically from successful query responses
   */
  learnSchemaFromResponse(tableName, data) {
    if (!tableName || !data) return;
    const sample = Array.isArray(data) ? data[0] : (typeof data === 'object' ? data : null);
    if (!sample || typeof sample !== 'object') return;

    const detectedColumns = Object.entries(sample).map(([key, val]) => {
      let type = typeof val;
      if (val === null) type = 'string';
      else if (Array.isArray(val)) type = 'array';
      else if (type === 'number') type = Number.isInteger(val) ? 'integer' : 'number';
      else if (typeof val === 'string') {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
          type = 'uuid';
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
          type = 'timestamp';
        }
      }

      return {
        name: key,
        type,
        required: key === 'id'
      };
    });

    if (!this.schemaData.tables) this.schemaData.tables = [];

    const existingIdx = this.schemaData.tables.findIndex(t => t.name === tableName);
    if (existingIdx !== -1) {
      // Merge columns
      const existingCols = this.schemaData.tables[existingIdx].columns || [];
      const colMap = new Map(existingCols.map(c => [c.name, c]));
      detectedColumns.forEach(c => colMap.set(c.name, c));
      this.schemaData.tables[existingIdx].columns = Array.from(colMap.values());
    } else {
      this.schemaData.tables.push({
        name: tableName,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        description: 'Détectée automatiquement via vos requêtes',
        columns: detectedColumns
      });
    }

    Storage.setSchemaCache(this.schemaData);
    this.renderSchemaExplorer();
    this.populateTableDatalist();
  }

  async executeMatrixTest() {
    try {
      const queryConfig = this.getQueryConfigFromUI();
      if (!queryConfig.table) {
        UI.showToast('Veuillez renseigner le nom d\'une table pour la matrice.', 'warning');
        return;
      }

      UI.showToast(`Test RLS multi-rôles en cours sur "${queryConfig.table}"...`, 'info', 2000);

      const matrixResults = await SupabaseEngine.runMatrixTest({
        projectConfig: this.projectConfig,
        personas: this.personas,
        queryConfig
      });

      // Switch to matrix tab
      this.switchTab('matrix');
      UI.renderMatrixResults(matrixResults);

      // Store for Markdown report export and show export button
      this.lastMatrixResults = {
        queryConfig,
        results: matrixResults,
        timestamp: new Date().toISOString()
      };
      const reportBtn = document.getElementById('exportMatrixReportBtn');
      if (reportBtn) reportBtn.style.display = 'inline-flex';

      // Cache refreshed persona tokens in storage
      matrixResults.forEach(res => {
        if (res.authSuccess && res.token && res.persona?.id !== 'anon') {
          Storage.updatePersona(res.persona.id, {
            token: res.token,
            cachedUser: res.user
          });
        }
      });
      this.personas = Storage.getPersonas();
      this.renderPersonas();

      UI.showToast('Matrice multi-rôles générée avec succès !', 'success');
    } catch (err) {
      UI.showToast(err.message, 'error');
    }
  }

  exportMatrixReport() {
    if (!this.lastMatrixResults || !this.lastMatrixResults.results) {
      UI.showToast('Aucun résultat de matrice à exporter. Exécutez d\'abord un test.', 'warning');
      return;
    }

    const { queryConfig, results, timestamp } = this.lastMatrixResults;
    const dateStr = new Date(timestamp).toLocaleString('fr-FR');

    let md = `# 🛡️ Rapport d'Audit de Sécurité RLS — SupaTest\n\n`;
    md += `* **Date du test :** ${dateStr}\n`;
    md += `* **Projet Supabase :** \`${this.projectConfig.url || 'Non configuré'}\`\n`;
    md += `* **Endpoint testé :** \`${queryConfig.method} /rest/v1/${queryConfig.table}\`\n\n`;

    md += `## 📊 Matrice d'Accès par Rôle (RBAC & RLS)\n\n`;
    md += `| Persona / Profil | Rôle JWT | Statut HTTP | Verdict Sécurité | Lignes Reçues |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    results.forEach(res => {
      const persona = res.persona;
      const qRes = res.queryResult;
      const role = persona.role || 'anon';
      
      let httpStatus = 'Erreur Auth';
      let verdictTitle = res.authError || 'Échec de connexion';
      let rowCount = '0';

      if (res.authSuccess && qRes) {
        httpStatus = `${qRes.status} ${qRes.statusText || ''}`;
        verdictTitle = qRes.rlsAnalysis?.title || 'OK';
        if (Array.isArray(qRes.data)) {
          rowCount = String(qRes.data.length);
        } else if (qRes.data) {
          rowCount = '1 objet';
        }
      }

      md += `| **${persona.name}** | \`${role}\` | \`${httpStatus}\` | ${verdictTitle} | ${rowCount} |\n`;
    });

    md += `\n## 📝 Paramètres de la Requête\n\n`;
    md += `\`\`\`json\n${JSON.stringify(queryConfig, null, 2)}\n\`\`\`\n\n`;
    md += `*Rapport généré automatiquement par SupaTest — RLS & RBAC Tester.*\n`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-audit-rls-${queryConfig.table}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    UI.showToast('Rapport d\'audit Markdown téléchargé !', 'success');
  }

  updateQosQueryPreview() {
    const method = document.getElementById('queryMethodSelect')?.value || 'GET';
    const table = document.getElementById('queryTableInput')?.value.trim() || 'nom_de_la_table';
    const methodBadge = document.getElementById('qosMethodBadge');
    const targetDisplay = document.getElementById('qosTargetDisplay');
    const personaDisplay = document.getElementById('qosPersonaDisplay');

    if (methodBadge) {
      methodBadge.className = `method-badge method-${method}`;
      methodBadge.textContent = method;
    }
    if (targetDisplay) {
      targetDisplay.textContent = `/rest/v1/${table}`;
    }
    if (personaDisplay) {
      personaDisplay.textContent = `${this.activePersona?.name || 'Visiteur Public'} (${this.activePersona?.role || 'anon'})`;
    }
  }

  async executeQosTest() {
    try {
      const queryConfig = this.getQueryConfigFromUI();
      if (!queryConfig.table) {
        UI.showToast('Veuillez renseigner le nom d\'une table dans le Playground avant de lancer le test QoS.', 'warning');
        return;
      }

      const repeatInput = document.getElementById('qosRepeatInput');
      let reps = parseInt(repeatInput?.value || '20', 10);
      if (isNaN(reps) || reps < 1) reps = 1;
      if (reps > 100) reps = 100;
      if (repeatInput) repeatInput.value = reps;

      const startBtn = document.getElementById('startQosTestBtn');
      const resultsContainer = document.getElementById('qosResultsContainer');
      const exportBtn = document.getElementById('exportQosReportBtn');

      if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = `⏳ Test en cours (0/${reps})...`;
      }

      UI.showToast(`Lancement du test QoS (${reps} requêtes consécutives sur "${queryConfig.table}")...`, 'info', 2000);

      const runs = [];

      for (let i = 1; i <= reps; i++) {
        if (startBtn) startBtn.textContent = `⏳ Exécution ${i}/${reps}...`;

        const res = await SupabaseEngine.executeQuery({
          projectConfig: this.projectConfig,
          token: this.activeAuthState.token,
          ...queryConfig
        });

        const isSuccess = res.success && res.status >= 200 && res.status < 300;
        runs.push({
          iteration: i,
          status: res.status,
          statusText: res.statusText || (isSuccess ? 'OK' : 'Erreur'),
          latency: res.latency,
          success: isSuccess,
          verdict: res.rlsAnalysis?.title || (isSuccess ? 'Succès (Données reçues)' : 'Erreur')
        });
      }

      // Compute statistics
      const latencies = runs.map(r => r.latency);
      const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);

      const sortedLatencies = [...latencies].sort((a, b) => a - b);
      const p95Index = Math.min(Math.floor(0.95 * sortedLatencies.length), sortedLatencies.length - 1);
      const p95Latency = sortedLatencies[p95Index];

      const successCount = runs.filter(r => r.success).length;
      const successRate = Math.round((successCount / runs.length) * 100);

      // Render statistics cards
      const avgEl = document.getElementById('qosStatAvg');
      if (avgEl) avgEl.textContent = `${avgLatency} ms`;

      const minMaxEl = document.getElementById('qosStatMinMax');
      if (minMaxEl) minMaxEl.textContent = `${minLatency} ms / ${maxLatency} ms`;

      const p95El = document.getElementById('qosStatP95');
      if (p95El) p95El.textContent = `${p95Latency} ms`;

      const successRateEl = document.getElementById('qosStatSuccessRate');
      if (successRateEl) {
        successRateEl.textContent = `${successRate}% (${successCount}/${reps})`;
        successRateEl.style.color = successRate === 100 ? 'var(--status-success)' : (successRate >= 80 ? 'var(--status-warning)' : 'var(--status-danger)');
      }

      // Render detail table
      const tableBody = document.getElementById('qosTableBody');
      if (tableBody) {
        tableBody.innerHTML = runs.map(r => `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:600; color:var(--text-dim);">#${r.iteration}</td>
            <td>
              <span class="badge ${r.success ? 'badge-success' : 'badge-danger'}">${r.status} ${r.statusText}</span>
            </td>
            <td style="font-family:var(--font-mono); font-weight:600; color:var(--text-main);">${r.latency} ms</td>
            <td style="font-size:0.75rem; color:var(--text-muted);">${r.verdict}</td>
          </tr>
        `).join('');
      }

      if (resultsContainer) resultsContainer.style.display = 'block';
      if (exportBtn) exportBtn.style.display = 'inline-flex';

      // Save for report export
      this.lastQosResults = {
        queryConfig,
        reps,
        persona: this.activePersona,
        runs,
        stats: {
          avgLatency,
          minLatency,
          maxLatency,
          p95Latency,
          successCount,
          successRate
        },
        timestamp: new Date().toISOString()
      };

      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '🚀 Lancer le test de charge';
      }

      UI.showToast(`Test QoS terminé ! Latence moyenne : ${avgLatency} ms (Succès : ${successRate}%)`, 'success');
    } catch (err) {
      const startBtn = document.getElementById('startQosTestBtn');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '🚀 Lancer le test de charge';
      }
      UI.showToast(`Erreur lors du test QoS : ${err.message}`, 'error');
    }
  }

  exportQosReport() {
    if (!this.lastQosResults || !this.lastQosResults.runs) {
      UI.showToast('Aucun résultat de test QoS à exporter. Exécutez d\'abord un test.', 'warning');
      return;
    }

    const { queryConfig, reps, persona, runs, stats, timestamp } = this.lastQosResults;
    const dateStr = new Date(timestamp).toLocaleString('fr-FR');

    let md = `# 📊 Rapport de Test de Performance & QoS — SupaTest\n\n`;
    md += `* **Date du test :** ${dateStr}\n`;
    md += `* **Projet Supabase :** \`${this.projectConfig.url || 'Non configuré'}\`\n`;
    md += `* **Endpoint testé :** \`${queryConfig.method} /rest/v1/${queryConfig.table}\`\n`;
    md += `* **Persona actif :** **${persona?.name || 'Visiteur Public'}** (\`${persona?.role || 'anon'}\`)\n`;
    md += `* **Nombre de répétitions :** ${reps}\n\n`;

    md += `## 📈 Résumé des Métriques de Performance\n\n`;
    md += `* **Latence moyenne :** \`${stats.avgLatency} ms\`\n`;
    md += `* **Latence min / max :** \`${stats.minLatency} ms\` / \`${stats.maxLatency} ms\`\n`;
    md += `* **p95 (95e percentile) :** \`${stats.p95Latency} ms\` *(95% des requêtes ont répondu sous cette durée)*\n`;
    md += `* **Taux de succès :** \`${stats.successRate}%\` (${stats.successCount}/${reps} requêtes 2xx)\n\n`;

    md += `## 📋 Détail des ${reps} Exécutions\n\n`;
    md += `| Itération | Statut HTTP | Latence | Verdict |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;

    runs.forEach(r => {
      md += `| #${r.iteration} | \`${r.status} ${r.statusText}\` | ${r.latency} ms | ${r.verdict} |\n`;
    });

    md += `\n## 📝 Paramètres de la Requête Testée\n\n`;
    md += `\`\`\`json\n${JSON.stringify(queryConfig, null, 2)}\n\`\`\`\n\n`;
    md += `*Rapport généré automatiquement par SupaTest — RLS & Performance Tester.*\n`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `rapport-qos-${queryConfig.table}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    UI.showToast('Rapport QoS Markdown téléchargé !', 'success');
  }

  copyAsCurl() {
    try {
      const config = this.getQueryConfigFromUI();
      if (!config.table) {
        UI.showToast('Veuillez renseigner le nom d\'une table avant de copier en cURL.', 'warning');
        return;
      }

      const projectUrl = this.projectConfig.url || 'https://votre-projet.supabase.co';
      const anonKey = this.projectConfig.anonKey || 'VOTRE_CLE_ANON';
      const token = this.activeAuthState.token || anonKey;

      const queryParams = new URLSearchParams();
      if (config.method === 'GET' && config.select) {
        queryParams.set('select', config.select.trim());
      }
      if (Array.isArray(config.filters)) {
        for (const filter of config.filters) {
          if (filter.column && filter.op && filter.value !== undefined && filter.value !== '') {
            queryParams.set(filter.column.trim(), `${filter.op}.${filter.value.trim()}`);
          }
        }
      }
      if (config.order) queryParams.set('order', config.order.trim());
      if (config.limit) queryParams.set('limit', String(config.limit));
      if (config.offset) queryParams.set('offset', String(config.offset));

      const queryString = queryParams.toString();
      const endpointUrl = `${projectUrl}/rest/v1/${config.table}${queryString ? '?' + queryString : ''}`;

      let curlCmd = `curl -X ${config.method} '${endpointUrl}' \\\n`;
      curlCmd += `  -H 'apikey: ${anonKey}' \\\n`;
      curlCmd += `  -H 'Authorization: Bearer ${token}'`;

      if (config.method === 'POST' || config.method === 'PATCH') {
        curlCmd += ` \\\n  -H 'Content-Type: application/json'`;
        curlCmd += ` \\\n  -H 'Prefer: return=representation'`;
        if (config.body) {
          const bodyStr = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
          curlCmd += ` \\\n  -d '${bodyStr.replace(/'/g, "'\\''")}'`;
        }
      } else if (config.method === 'GET') {
        curlCmd += ` \\\n  -H 'Prefer: count=exact'`;
      } else if (config.method === 'DELETE') {
        curlCmd += ` \\\n  -H 'Prefer: return=representation'`;
      }

      const btn = document.getElementById('copyCurlBtn');
      const originalText = btn ? btn.innerHTML : '📋 Copier en cURL';

      navigator.clipboard.writeText(curlCmd).then(() => {
        if (btn) {
          btn.innerHTML = '✅ Copié !';
          setTimeout(() => {
            btn.innerHTML = originalText;
          }, 2000);
        }
        UI.showToast('Commande cURL copiée dans le presse-papier !', 'success', 2000);
      }).catch(() => {
        prompt('Copiez votre commande cURL ci-dessous :', curlCmd);
      });
    } catch (err) {
      UI.showToast(`Erreur lors de la génération cURL : ${err.message}`, 'error');
    }
  }

  openEditPersonaModal(persona = null) {
    const modalTitle = document.getElementById('personaModalTitle');
    const idInput = document.getElementById('personaIdInput');
    const nameInput = document.getElementById('personaNameInput');
    const emailInput = document.getElementById('personaEmailInput');
    const passInput = document.getElementById('personaPasswordInput');
    const roleInput = document.getElementById('personaRoleInput');
    const colorInput = document.getElementById('personaColorInput');

    if (persona) {
      if (modalTitle) modalTitle.textContent = 'Modifier le Persona';
      if (idInput) idInput.value = persona.id;
      if (nameInput) nameInput.value = persona.name || '';
      if (emailInput) emailInput.value = persona.email || '';
      if (passInput) passInput.value = persona.password || '';
      if (roleInput) roleInput.value = persona.role || 'authenticated';
      if (colorInput) colorInput.value = persona.avatarColor || '#10b981';
    } else {
      if (modalTitle) modalTitle.textContent = 'Nouveau Persona / Utilisateur';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (emailInput) emailInput.value = '';
      if (passInput) passInput.value = '';
      if (roleInput) roleInput.value = 'authenticated';
      if (colorInput) colorInput.value = '#' + Math.floor(Math.random()*16777215).toString(16);
    }

    UI.openModal('personaModal');
  }

  savePersonaFromModal() {
    const id = document.getElementById('personaIdInput').value;
    const name = document.getElementById('personaNameInput').value.trim();
    const email = document.getElementById('personaEmailInput').value.trim();
    const password = document.getElementById('personaPasswordInput').value;
    const role = document.getElementById('personaRoleInput').value.trim() || 'authenticated';
    const avatarColor = document.getElementById('personaColorInput').value;

    if (!name) {
      UI.showToast('Veuillez donner un nom à ce persona (ex: Admin, Client 1).', 'warning');
      return;
    }

    if (!email || !password) {
      UI.showToast('L\'email et le mot de passe sont requis pour l\'authentification.', 'warning');
      return;
    }

    if (id) {
      // Update existing
      Storage.updatePersona(id, { name, email, password, role, avatarColor, token: null });
      UI.showToast(`Persona "${name}" mis à jour.`, 'success');
    } else {
      // Create new
      const created = Storage.addPersona({ name, email, password, role, avatarColor, type: 'user' });
      UI.showToast(`Persona "${name}" ajouté !`, 'success');
    }

    this.personas = Storage.getPersonas();
    this.renderPersonas();
    UI.closeModal('personaModal');
  }

  deletePersona(persona) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le persona "${persona.name}" ?`)) {
      Storage.deletePersona(persona.id);
      this.personas = Storage.getPersonas();
      this.activePersona = Storage.getActivePersona();
      this.renderPersonas();
      UI.showToast(`Persona "${persona.name}" supprimé.`, 'info');
    }
  }

  switchTab(tabName) {
    this.currentView = tabName;
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tabContent-${tabName}`);
    });

    if (tabName === 'qos') {
      this.updateQosQueryPreview();
    }
  }

  renderHistory() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;

    const history = Storage.getHistory();
    if (history.length === 0) {
      listEl.innerHTML = '<div style="padding:1rem; color:var(--text-dim); text-align:center; font-size:0.8rem;">Aucune requête dans l\'historique</div>';
      return;
    }

    listEl.innerHTML = history.slice(0, 15).map(h => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); margin-bottom:0.35rem; font-size:0.75rem;">
        <div style="display:flex; align-items:center; gap:0.4rem;">
          <span class="method-badge method-${h.method}" style="font-size:0.65rem; padding:0.1rem 0.35rem;">${h.method}</span>
          <strong style="color:var(--text-main); font-family:var(--font-mono);">${h.table}</strong>
          <span style="color:var(--text-dim);">(${h.personaName})</span>
        </div>
        <span class="badge ${h.status >= 200 && h.status < 300 ? 'badge-success' : 'badge-danger'}">${h.status}</span>
      </div>
    `).join('');
  }

  setupEventListeners() {
    // Sidebar Project Card opens project modal
    const openProjectModal = () => {
      document.getElementById('projUrlInput').value = this.projectConfig.url || '';
      document.getElementById('projAnonKeyInput').value = this.projectConfig.anonKey || '';
      UI.openModal('projectModal');
    };

    document.getElementById('editProjectCard')?.addEventListener('click', openProjectModal);

    // Save project modal
    document.getElementById('saveProjectBtn')?.addEventListener('click', async () => {
      const url = document.getElementById('projUrlInput').value.trim();
      const anonKey = document.getElementById('projAnonKeyInput').value.trim();

      if (!url || !anonKey) {
        UI.showToast('Veuillez renseigner l\'URL et l\'Anon Key de votre projet Supabase.', 'warning');
        return;
      }

      // Check if user accidentally pasted a service_role key
      const keyClaims = parseJwt(anonKey);
      if (keyClaims && keyClaims.role === 'service_role') {
        const confirmUse = confirm(
          '⚠️ ALERTE DE SÉCURITÉ :\n\n' +
          'Vous venez de renseigner une clé "service_role" (secrète et administrative).\n\n' +
          'Pour tester vos politiques RLS, vous devez impérativement utiliser la clé "anon" (publique), car la clé service_role contourne TOUTES les sécurités.\n\n' +
          'Voulez-vous quand même continuer (déconseillé) ?'
        );
        if (!confirmUse) return;
      }

      this.projectConfig = { url, anonKey };
      Storage.saveProjectConfig(this.projectConfig);

      const urlEl = document.getElementById('projectUrlDisplay');
      if (urlEl) urlEl.textContent = url;

      UI.closeModal('projectModal');
      UI.showToast('Configuration Supabase enregistrée !', 'success');

      // Refresh schema & reconnect
      await this.switchPersona(this.activePersona);
      this.refreshSchema(true);
    });

    // Add Persona button
    document.getElementById('addPersonaBtn')?.addEventListener('click', () => {
      this.openEditPersonaModal();
    });

    // Toggle password visibility button
    document.getElementById('togglePersonaPasswordBtn')?.addEventListener('click', () => {
      const passInput = document.getElementById('personaPasswordInput');
      const toggleBtn = document.getElementById('togglePersonaPasswordBtn');
      if (passInput) {
        const isPassword = passInput.type === 'password';
        passInput.type = isPassword ? 'text' : 'password';
        if (toggleBtn) toggleBtn.textContent = isPassword ? '🔒' : '👁️';
      }
    });

    // Save Persona modal
    document.getElementById('savePersonaBtn')?.addEventListener('click', () => {
      this.savePersonaFromModal();
    });

    // Close modals on cancel or background click
    document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
      });
    });

    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // Add Filter Row button
    document.getElementById('addFilterRowBtn')?.addEventListener('click', () => {
      const filterContainer = document.getElementById('filterRowsContainer');
      UI.addFilterRow(filterContainer);
    });

    // Method selector changes
    const methodSelect = document.getElementById('queryMethodSelect');
    const bodySection = document.getElementById('queryBodySection');
    const getParamsSection = document.getElementById('queryGetParamsSection');
    const formSectionTitle = document.getElementById('formSectionTitle');

    methodSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'POST' || val === 'PATCH') {
        if (bodySection) bodySection.style.display = 'block';
        if (getParamsSection) getParamsSection.style.display = 'none'; // Pas besoin de filtre pour POST et PATCH
        if (formSectionTitle) {
          formSectionTitle.textContent = val === 'POST' ? '📦 Données à insérer (POST / INSERT)' : '✏️ Données à modifier (PATCH / UPDATE)';
        }
        this.updateColumnPills();
      } else {
        if (bodySection) bodySection.style.display = 'none';
        if (getParamsSection) getParamsSection.style.display = 'block';
      }
    });

    // Table input listener
    document.getElementById('queryTableInput')?.addEventListener('input', () => {
      this.updateAvailableColumnsDatalist();
      this.updateColumnPills();
    });

    // Textarea JSON input listener (updates active pills as user types)
    document.getElementById('queryBodyInput')?.addEventListener('input', () => {
      this.updateColumnPills();
    });

    // Add all columns button
    document.getElementById('addAllColumnsJsonBtn')?.addEventListener('click', () => {
      this.addAllColumnsToJson();
    });

    // Clear JSON button
    document.getElementById('clearJsonBtn')?.addEventListener('click', () => {
      this.clearJson();
    });

    // Schema refresh button
    document.getElementById('refreshSchemaBtn')?.addEventListener('click', () => {
      this.refreshSchema(true);
    });

    document.getElementById('schemaRefreshTabBtn')?.addEventListener('click', () => {
      this.refreshSchema(true);
    });

    document.getElementById('schemaAddManualTableBtn')?.addEventListener('click', () => {
      this.addManualTablePrompt();
    });

    document.getElementById('schemaBatchImportBtn')?.addEventListener('click', () => {
      this.addBatchTablesPrompt();
    });

    // Execute button
    document.getElementById('executeQueryBtn')?.addEventListener('click', () => {
      this.executeCurrentQuery();
    });

    // Matrix test button
    document.getElementById('executeMatrixBtn')?.addEventListener('click', () => {
      this.executeMatrixTest();
    });

    // Response view toggles (Raw JSON vs Table View)
    document.getElementById('viewRawToggle')?.addEventListener('click', (e) => {
      document.querySelectorAll('.toggle-btn').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('resCodeViewer').style.display = 'block';
      document.getElementById('resTableWrapper').style.display = 'none';
    });

    document.getElementById('viewTableToggle')?.addEventListener('click', (e) => {
      document.querySelectorAll('.toggle-btn').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('resCodeViewer').style.display = 'none';
      document.getElementById('resTableWrapper').style.display = 'block';
    });

    // Save query to favorites button
    document.getElementById('saveFavoriteBtn')?.addEventListener('click', () => {
      this.saveCurrentQueryToFavorites();
    });

    // Matrix report export button
    document.getElementById('exportMatrixReportBtn')?.addEventListener('click', () => {
      this.exportMatrixReport();
    });

    // QoS test button & report export
    document.getElementById('startQosTestBtn')?.addEventListener('click', () => {
      this.executeQosTest();
    });

    document.getElementById('exportQosReportBtn')?.addEventListener('click', () => {
      this.exportQosReport();
    });

    // Copy as cURL button
    document.getElementById('copyCurlBtn')?.addEventListener('click', () => {
      this.copyAsCurl();
    });

    // Open SQL RLS CheatSheet modal button
    document.getElementById('openSqlCheatSheetBtn')?.addEventListener('click', () => {
      UI.openModal('sqlCheatSheetModal');
    });

    // Open PostgREST / Postgres Error Codes modal button
    document.getElementById('openErrorCodesBtn')?.addEventListener('click', () => {
      UI.openModal('errorCodesModal');
    });

    // Copy SQL from CheatSheet cards
    document.querySelectorAll('.copy-sql-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sql = btn.dataset.sql;
        if (sql) {
          navigator.clipboard.writeText(sql);
          UI.showToast('Modèle SQL copié dans le presse-papier !', 'success');
        }
      });
    });

    // Insert UID token into inputs helper
    document.querySelectorAll('.insert-uid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = this.activeAuthState.claims?.userId;
        if (uid) {
          navigator.clipboard.writeText(uid);
          UI.showToast(`auth.uid() (${uid}) copié !`, 'info');
        } else {
          UI.showToast('Aucun auth.uid() actif (Session Anonyme).', 'warning');
        }
      });
    });

    // Export/Import backup
    document.getElementById('exportDataBtn')?.addEventListener('click', () => {
      const data = Storage.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `supatest-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.showToast('Export JSON téléchargé !', 'success');
    });

    document.getElementById('importDataInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          Storage.importAllData(parsed);
          UI.showToast('Données importées avec succès ! Rechargement...', 'success');
          setTimeout(() => window.location.reload(), 800);
        } catch {
          UI.showToast('Fichier JSON d\'import invalide.', 'error');
        }
      };
      reader.readAsText(file);
    });
  }
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
