/**
 * UI Renderer & DOM Controllers
 */
import { formatTimeRemaining } from './jwt.js';

export const UI = {
  /**
   * Toast notification system
   */
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },

  /**
   * Modal management
   */
  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  },

  /**
   * Render Top HUD active identity
   */
  renderHud(activePersona, authState = {}) {
    const roleBadge = document.getElementById('hudRoleBadge');
    const roleName = document.getElementById('hudRoleName');
    const rolePill = document.getElementById('hudRolePill');
    const emailVal = document.getElementById('hudEmail');
    const uidVal = document.getElementById('hudUid');
    const expVal = document.getElementById('hudExp');
    const copyTokenBtn = document.getElementById('hudCopyTokenBtn');

    // Manage live countdown timer for expiration
    if (this._expIntervalId) {
      clearInterval(this._expIntervalId);
      this._expIntervalId = null;
    }

    if (activePersona.type === 'anon' || activePersona.id === 'anon') {
      if (roleBadge) roleBadge.style.backgroundColor = '#64748b';
      if (roleName) roleName.innerHTML = '👤 ANON (Public)';
      if (rolePill) rolePill.style.borderColor = '#334155';
      if (emailVal) {
        emailVal.textContent = 'Visiteur Public';
        emailVal.title = 'Visiteur non authentifié';
      }
      if (uidVal) uidVal.textContent = 'null (auth.uid())';
      if (expVal) {
        expVal.textContent = 'Illimité';
        expVal.style.color = 'var(--text-main)';
      }
      if (copyTokenBtn) copyTokenBtn.style.display = 'none';
      return;
    }

    // Role formatting with appropriate icon
    const resolvedRole = authState.claims?.role || activePersona.role || 'authenticated';
    let roleIcon = '🧑';
    const lowerRole = resolvedRole.toLowerCase();
    if (lowerRole.includes('admin')) roleIcon = '👑';
    else if (lowerRole.includes('manager') || lowerRole.includes('lead')) roleIcon = '👔';
    else if (lowerRole.includes('editor') || lowerRole.includes('writer')) roleIcon = '✍️';
    else if (lowerRole.includes('guest') || lowerRole.includes('viewer')) roleIcon = '👁️';

    if (roleBadge) roleBadge.style.backgroundColor = activePersona.avatarColor || '#10b981';
    if (roleName) {
      roleName.innerHTML = `${roleIcon} ${resolvedRole.toUpperCase()}`;
      roleName.title = `Rôle détecté: ${resolvedRole} (JWT: ${authState.claims?.jwtRole || 'authenticated'}, App: ${authState.claims?.appRole || 'none'})`;
    }
    if (rolePill) {
      rolePill.style.borderColor = activePersona.avatarColor || '#10b981';
      rolePill.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
    }

    if (emailVal) {
      const email = authState.claims?.email || activePersona.email || '';
      emailVal.textContent = activePersona.name || 'Persona';
      emailVal.title = email ? `Email de connexion: ${email}` : activePersona.name;
    }

    if (uidVal) {
      const uid = authState.claims?.userId || 'N/A';
      uidVal.textContent = uid;
      uidVal.title = `auth.uid() = ${uid} (cliquer pour copier)`;
      uidVal.style.cursor = 'pointer';
      uidVal.onclick = () => {
        if (uid !== 'N/A') {
          navigator.clipboard.writeText(uid);
          this.showToast(`auth.uid() copié : ${uid}`, 'info');
        }
      };
    }

    // Start active real-time countdown
    if (expVal) {
      const expDate = authState.claims?.exp;
      if (expDate) {
        const updateTimer = () => {
          const formatted = formatTimeRemaining(expDate);
          if (formatted === 'Expiré') {
            expVal.innerHTML = '<span style="color:var(--status-danger); font-weight:700;">⚠️ Expiré</span>';
            if (this._expIntervalId) {
              clearInterval(this._expIntervalId);
              this._expIntervalId = null;
            }
          } else {
            expVal.textContent = formatted;
            expVal.style.color = 'var(--text-main)';
          }
        };

        updateTimer();
        this._expIntervalId = setInterval(updateTimer, 1000);
      } else {
        expVal.textContent = 'N/A';
      }
    }

    if (copyTokenBtn) {
      copyTokenBtn.style.display = authState.token ? 'inline-flex' : 'none';
      copyTokenBtn.onclick = () => {
        if (authState.token) {
          navigator.clipboard.writeText(authState.token);
          this.showToast('Token Bearer JWT copié dans le presse-papier !', 'success');
        }
      };
    }
  },

  /**
   * Render Personas sidebar list
   */
  renderPersonas(personas, activeId, onSelect, onEdit, onDelete) {
    const listEl = document.getElementById('personasSidebarList');
    if (!listEl) return;

    listEl.innerHTML = '';

    personas.forEach((p) => {
      const item = document.createElement('div');
      item.className = `persona-item ${p.id === activeId ? 'active' : ''}`;
      
      const isAnon = p.id === 'anon' || p.type === 'anon';
      const initial = isAnon ? '?' : (p.name ? p.name.charAt(0).toUpperCase() : 'U');
      const roleText = isAnon ? 'role: anon' : (p.email ? p.email : `role: ${p.role}`);

      item.innerHTML = `
        <div class="persona-info">
          <div class="persona-avatar" style="background-color: ${p.avatarColor || '#10b981'}">${initial}</div>
          <div class="persona-details">
            <div class="persona-name">${p.name}</div>
            <div class="persona-role-label">${roleText}</div>
          </div>
        </div>
        <div class="persona-actions">
          ${!isAnon ? `
            <button class="btn btn-ghost btn-sm btn-icon edit-persona-btn" title="Modifier">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon delete-persona-btn" title="Supprimer">🗑️</button>
          ` : ''}
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.edit-persona-btn') || e.target.closest('.delete-persona-btn')) return;
        onSelect(p);
      });

      const editBtn = item.querySelector('.edit-persona-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onEdit(p);
        });
      }

      const delBtn = item.querySelector('.delete-persona-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onDelete(p);
        });
      }

      listEl.appendChild(item);
    });
  },

  /**
   * Render Favorites List in Sidebar
   */
  renderFavoritesList(favorites = [], onSelect = null, onDelete = null) {
    const listEl = document.getElementById('favoritesSidebarList');
    const countEl = document.getElementById('favoritesCount');
    if (!listEl) return;

    if (countEl) countEl.textContent = favorites.length;
    listEl.innerHTML = '';

    if (favorites.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-dim); font-size:0.75rem; text-align:center; padding:0.5rem 0;">Aucun favori enregistré (cliquez sur ⭐)</div>';
      return;
    }

    favorites.forEach(fav => {
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.title = `Charger la requête [${fav.method}] sur "${fav.table}"`;

      item.innerHTML = `
        <div class="favorite-item-info">
          <span class="method-badge method-${fav.method}" style="font-size:0.6rem; padding:0.1rem 0.3rem;">${fav.method}</span>
          <span class="favorite-item-title">${fav.title || fav.table}</span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm btn-icon delete-fav-btn" title="Supprimer ce favori" style="padding:0 0.2rem; font-size:0.7rem;">✕</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-fav-btn')) return;
        if (onSelect) onSelect(fav);
      });

      const delBtn = item.querySelector('.delete-fav-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onDelete) onDelete(fav);
        });
      }

      listEl.appendChild(item);
    });
  },

  /**
   * Render Filter Row in Query Builder
   */
  addFilterRow(container, filter = { column: '', op: 'eq', value: '' }, availableCols = []) {
    const row = document.createElement('div');
    row.className = 'filter-row';

    const operators = [
      { val: 'eq', label: '= eq (égal)' },
      { val: 'neq', label: '!= neq (différent)' },
      { val: 'gt', label: '> gt (supérieur)' },
      { val: 'gte', label: '>= gte (supérieur ou égal)' },
      { val: 'lt', label: '< lt (inférieur)' },
      { val: 'lte', label: '<= lte (inférieur ou égal)' },
      { val: 'like', label: '~ like (motif)' },
      { val: 'ilike', label: '~* ilike (insensible casse)' },
      { val: 'is', label: 'is (null / true / false)' },
      { val: 'in', label: 'in (liste: (1,2,3))' },
      { val: 'cs', label: '@> cs (contient)' },
      { val: 'cd', label: '<@ cd (contenu dans)' }
    ];

    let colOptionsHtml = '';
    if (availableCols.length > 0) {
      colOptionsHtml = availableCols.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }

    row.innerHTML = `
      <input type="text" class="form-input form-input-mono filter-col-input" placeholder="Colonne (ex: user_id)" value="${filter.column}" list="filterColDatalist" />
      <select class="form-select filter-op-select">
        ${operators.map(op => `<option value="${op.val}" ${op.val === filter.op ? 'selected' : ''}>${op.label}</option>`).join('')}
      </select>
      <input type="text" class="form-input form-input-mono filter-val-input" placeholder="Valeur (ex: 123 ou abc)" value="${filter.value}" />
      <button type="button" class="btn btn-ghost btn-sm btn-icon remove-filter-btn" title="Supprimer le filtre">✕</button>
    `;

    row.querySelector('.remove-filter-btn').addEventListener('click', () => {
      row.remove();
    });

    container.appendChild(row);
  },

  /**
   * Get all active filters from container
   */
  getFiltersFromContainer(container) {
    const rows = container.querySelectorAll('.filter-row');
    const filters = [];
    rows.forEach(row => {
      const col = row.querySelector('.filter-col-input').value.trim();
      const op = row.querySelector('.filter-op-select').value;
      const val = row.querySelector('.filter-val-input').value.trim();
      if (col) {
        filters.push({ column: col, op, value: val });
      }
    });
    return filters;
  },

  /**
   * Render Interactive Column Picker Pills for JSON body builder
   */
  renderColumnPills(container, countEl, columns = [], currentJsonObj = {}, onToggleColumn = null) {
    if (!container) return;
    container.innerHTML = '';

    if (!columns || columns.length === 0) {
      if (countEl) countEl.textContent = '0 colonne';
      container.innerHTML = '<span style="color:var(--text-dim); font-size:0.75rem;">Tapez une table ci-dessus ou exécutez une requête pour afficher ses colonnes</span>';
      return;
    }

    if (countEl) {
      countEl.textContent = `${columns.length} colonne(s) détectée(s)`;
    }

    columns.forEach(col => {
      const isPresent = currentJsonObj && Object.prototype.hasOwnProperty.call(currentJsonObj, col.name);
      
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `column-pill-btn ${isPresent ? 'active' : ''}`;
      
      const icon = isPresent ? '✓' : '+';
      pill.innerHTML = `<span>${icon}</span> <strong>${col.name}</strong> <span style="font-size:0.65rem; opacity:0.75;">(${col.type || 'text'})</span>`;
      pill.title = isPresent ? `Retirer "${col.name}" du JSON` : `Ajouter "${col.name}" dans le JSON`;

      pill.addEventListener('click', () => {
        if (onToggleColumn) onToggleColumn(col, isPresent);
      });

      container.appendChild(pill);
    });
  },

  /**
   * Render Query Execution Result
   */
  renderQueryResult(result) {
    const container = document.getElementById('queryResultContainer');
    if (!container) return;

    container.style.display = 'flex';

    // Status & Meta
    const statusBadge = document.getElementById('resStatusBadge');
    const latencyVal = document.getElementById('resLatency');
    const sizeVal = document.getElementById('resSize');
    const verdictCard = document.getElementById('resVerdictCard');
    const rawCode = document.getElementById('resCodeViewer');
    const tableWrap = document.getElementById('resTableWrapper');

    if (statusBadge) {
      statusBadge.textContent = `${result.status} ${result.statusText || ''}`;
      statusBadge.className = `badge ${result.success ? 'badge-success' : 'badge-danger'}`;
    }

    if (latencyVal) latencyVal.textContent = `${result.latency} ms`;
    if (sizeVal) {
      const bytes = new Blob([result.rawText || '']).size;
      sizeVal.textContent = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
    }

    // Verdict Card
    if (verdictCard && result.rlsAnalysis) {
      const { verdict, badgeClass, title, message } = result.rlsAnalysis;
      let icon = 'ℹ️';
      if (verdict === 'success') icon = '🟢';
      if (verdict === 'rls_empty') icon = '🔒';
      if (verdict === 'forbidden' || verdict === 'unauthorized') icon = '⛔';
      if (verdict === 'error') icon = '❌';

      verdictCard.style.display = 'flex';
      verdictCard.className = `rls-verdict-card ${badgeClass}`;
      verdictCard.innerHTML = `
        <div class="rls-verdict-icon">${icon}</div>
        <div class="rls-verdict-content">
          <div class="rls-verdict-title">${title}</div>
          <div class="rls-verdict-desc">${message}</div>
        </div>
      `;
    }

    // Raw Code View
    if (rawCode) {
      let formattedJson = result.rawText;
      try {
        if (result.data) {
          formattedJson = JSON.stringify(result.data, null, 2);
        }
      } catch {
        formattedJson = result.rawText;
      }
      rawCode.textContent = formattedJson || '(Aucun contenu retourné)';
    }

    // Table View
    if (tableWrap) {
      if (Array.isArray(result.data) && result.data.length > 0) {
        const keys = Object.keys(result.data[0]);
        let tableHtml = '<table class="data-table"><thead><tr>';
        keys.forEach(k => tableHtml += `<th>${k}</th>`);
        tableHtml += '</tr></thead><tbody>';

        result.data.forEach(row => {
          tableHtml += '<tr>';
          keys.forEach(k => {
            let val = row[k];
            if (val === null) val = '<span style="color:var(--text-dim)">null</span>';
            else if (typeof val === 'object') val = JSON.stringify(val);
            tableHtml += `<td>${val}</td>`;
          });
          tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table>';
        tableWrap.innerHTML = tableHtml;
        tableWrap.style.display = 'block';
      } else {
        tableWrap.innerHTML = '<div style="padding:1.5rem; color:var(--text-dim); text-align:center;">Pas de données tabulaires à afficher</div>';
      }
    }
  },

  /**
   * Render Multi-Role Matrix Table Comparison
   */
  renderMatrixResults(matrixResults) {
    const container = document.getElementById('matrixResultsContainer');
    const tableBody = document.getElementById('matrixTableBody');
    if (!container || !tableBody) return;

    container.style.display = 'block';
    tableBody.innerHTML = '';

    matrixResults.forEach(({ persona, authSuccess, authError, queryResult }) => {
      const tr = document.createElement('tr');

      if (!authSuccess) {
        tr.innerHTML = `
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="persona-avatar" style="background-color:${persona.avatarColor || '#64748b'}; width:24px; height:24px; font-size:0.7rem;">${persona.name.charAt(0)}</span>
              <strong>${persona.name}</strong>
            </div>
          </td>
          <td><span class="badge badge-secondary">${persona.role || persona.type}</span></td>
          <td><span class="badge badge-danger">Erreur Auth</span></td>
          <td><span style="color:var(--status-danger)">${authError}</span></td>
          <td>-</td>
        `;
        tableBody.appendChild(tr);
        return;
      }

      const res = queryResult;
      const rls = res.rlsAnalysis || {};
      const rowCount = Array.isArray(res.data) ? res.data.length : (res.data ? 1 : 0);

      tr.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="persona-avatar" style="background-color:${persona.avatarColor || '#10b981'}; width:24px; height:24px; font-size:0.7rem;">${persona.name.charAt(0)}</span>
            <div>
              <strong>${persona.name}</strong>
              <div style="font-size:0.7rem; color:var(--text-dim);">${persona.email || 'Anonyme'}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge-secondary">${persona.role || 'authenticated'}</span></td>
        <td><span class="badge ${res.success ? 'badge-success' : 'badge-danger'}">${res.status} ${res.statusText || ''}</span></td>
        <td>
          <div style="font-weight:600; color: ${res.success ? 'var(--status-success)' : 'var(--status-danger)'};">
            ${rls.title || ''}
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted);">${rls.message || ''}</div>
        </td>
        <td><span class="badge badge-info">${rowCount} ligne(s)</span></td>
      `;

      tableBody.appendChild(tr);
    });
  },

  /**
   * Render JWT Deep Inspector Tab
   */
  renderJwtInspector(claims, token) {
    const container = document.getElementById('jwtClaimsInspector');
    const rawTokenInput = document.getElementById('jwtRawTokenInput');
    if (!container) return;

    if (rawTokenInput) rawTokenInput.value = token || '';

    if (!claims) {
      container.innerHTML = '<div style="padding:1.5rem; color:var(--text-dim); text-align:center;">Aucun token Bearer actif actuellement (Session Anonyme).</div>';
      return;
    }

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
        <div class="card">
          <div class="card-title">👤 Claims Clés Supabase</div>
          <div style="display:flex; flex-direction:column; gap:0.6rem; margin-top:0.75rem; font-family:var(--font-mono); font-size:0.8rem;">
            <div><span style="color:var(--text-dim);">auth.uid() (sub):</span> <strong>${claims.userId || 'N/A'}</strong></div>
            <div><span style="color:var(--text-dim);">role:</span> <strong>${claims.role}</strong></div>
            <div><span style="color:var(--text-dim);">email:</span> <strong>${claims.email || 'N/A'}</strong></div>
            <div><span style="color:var(--text-dim);">expiration:</span> <strong>${claims.exp ? claims.exp.toLocaleString() : 'N/A'}</strong></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">🏷️ Métadonnées Utilisateur</div>
          <pre class="code-viewer" style="max-height:160px; margin-top:0.75rem;">${JSON.stringify({ user_metadata: claims.userMetadata, app_metadata: claims.appMetadata }, null, 2)}</pre>
        </div>
      </div>
      <div class="card">
        <div class="card-title">📦 Payload Décodé Complet</div>
        <pre class="code-viewer" style="margin-top:0.75rem;">${JSON.stringify(claims.payload, null, 2)}</pre>
      </div>
    `;
  },

  /**
   * Render Schema Tables Explorer Tab
   */
  renderSchemaExplorer(tables = [], onSelectTableForTest = null, onDeleteManualTable = null) {
    const container = document.getElementById('schemaTablesList');
    const statusText = document.getElementById('schemaStatusText');
    if (!container) return;

    if (!tables || tables.length === 0) {
      if (statusText) statusText.textContent = '0 table détectée automatiquement.';
      container.innerHTML = `
        <div class="card" style="padding:2.5rem; text-align:center;">
          <div style="font-size:2.5rem; margin-bottom:0.75rem;">📂</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin-bottom:0.4rem;">
            Aucune table détectée automatiquement
          </div>
          <div style="font-size:0.82rem; color:var(--text-muted); max-width:550px; margin:0 auto 1.5rem auto; line-height:1.5;">
            Supabase expose la structure de vos tables via OpenAPI sur l'URL <code>/rest/v1/</code>.<br>
            Si vos tables sont soumises à des politiques RLS strictes ou si OpenAPI est restreint, vous pouvez déclarer vos tables manuellement pour les tester sans limite.
          </div>
          <div style="display:flex; justify-content:center; gap:0.75rem;">
            <button class="btn btn-secondary" id="schemaEmptyRefreshBtn">🔄 Relancer la détection</button>
            <button class="btn btn-primary" id="schemaEmptyAddBtn">➕ Ajouter une table manuellement</button>
          </div>
        </div>
      `;

      document.getElementById('schemaEmptyRefreshBtn')?.addEventListener('click', () => {
        document.getElementById('schemaRefreshTabBtn')?.click();
      });
      document.getElementById('schemaEmptyAddBtn')?.addEventListener('click', () => {
        document.getElementById('schemaAddManualTableBtn')?.click();
      });
      return;
    }

    if (statusText) {
      statusText.textContent = `✅ ${tables.length} table(s) découverte(s) et prête(s) pour les tests.`;
    }

    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:1rem;">';

    tables.forEach(t => {
      const isManual = Boolean(t.isManual);
      html += `
        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div class="card-header" style="margin-bottom:0.5rem; padding-bottom:0.5rem;">
              <div class="card-title" style="color:var(--accent-blue);">
                📂 ${t.name} ${isManual ? '<span class="badge badge-secondary" style="font-size:0.65rem;">Manuel</span>' : ''}
              </div>
              <div style="display:flex; gap:0.25rem;">
                ${(t.methods || ['GET', 'POST', 'PATCH', 'DELETE']).map(m => `<span class="method-badge method-${m}" style="font-size:0.65rem; padding:0.15rem 0.35rem;">${m}</span>`).join('')}
              </div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.75rem;">
              ${t.columns?.length || 0} colonne(s) ${t.description ? `— <em>${t.description}</em>` : ''}
            </div>
            <div style="max-height:160px; overflow-y:auto; font-family:var(--font-mono); font-size:0.75rem; margin-bottom:1rem;">
              ${(t.columns || []).map(c => `
                <div style="display:flex; justify-content:space-between; padding:0.2rem 0; border-bottom:1px solid var(--border-subtle);">
                  <span style="color:${c.required ? 'var(--status-warning)' : 'var(--text-main)'}">${c.name}${c.required ? '*' : ''}</span>
                  <span style="color:var(--text-dim);">${c.type}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:0.75rem; border-top:1px solid var(--border-subtle);">
            <button class="btn btn-secondary btn-sm test-table-btn" data-table="${t.name}">
              🧪 Tester dans Playground
            </button>
            ${isManual ? `<button class="btn btn-ghost btn-sm delete-manual-table-btn" data-table="${t.name}" title="Supprimer">🗑️</button>` : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Attach test buttons
    container.querySelectorAll('.test-table-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tableName = btn.dataset.table;
        if (onSelectTableForTest) onSelectTableForTest(tableName);
      });
    });

    // Attach delete buttons for manual tables
    container.querySelectorAll('.delete-manual-table-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tableName = btn.dataset.table;
        if (onDeleteManualTable) onDeleteManualTable(tableName);
      });
    });
  }
};
