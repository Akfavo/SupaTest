 # ⚡ SupaTest — Supabase RLS & Role Tester

Application web moderne, fluide et 100% client-side (sans backend requis) dédiée aux développeurs et créateurs no-code travaillant avec Supabase pour **tester, auditer et valider les politiques de sécurité Row Level Security (RLS) et les accès par rôles (RBAC) sans friction**.

---

## 🚀 Pourquoi SupaTest ?

Fini la corvée et la complexité de Postman :
- ❌ Plus besoin de copier/coller manuellement le JWT Bearer token à chaque requête.
- ❌ Plus besoin de re-saisir l'`apikey` et l'URL de base.
- ❌ Plus besoin de re-rédiger les en-têtes `Authorization` ou `Prefer`.
- ✅ **Switch de persona en 1 clic** (Admin, Auteur, Apprenant, Visiteur Public Anon...).
- ✅ **Top HUD en temps réel** : Affiche le rôle RBAC actif, le persona, `auth.uid()` et le décompte live de la session (`Session Exp.`).
- ✅ **Éditeur JSON visuel & Badges de colonnes** : Cliquez sur les colonnes de votre table pour bâtir vos payloads `POST` et `PATCH` en 2 secondes.
- ✅ **Ciblage intelligent pour PATCH** : Modifiez vos lignes par ID sans avoir à construire d'URL complexe.
- ✅ **Auto-apprentissage du Schéma** : Mémorisation instantanée des tables et types lors de chaque requête.
- ✅ **⚡ Matrice Multi-Rôles** : Exécutez votre requête sur tous vos rôles simultanément et exportez un rapport d'audit Markdown (`.md`).
- ✅ **💡 Modèles SQL RLS intégrés** : Aide-mémoire interactif avec copie en 1 clic des 5 patterns de sécurité Supabase indispensables.
- ✅ **⭐ Gestionnaire de Favoris** : Sauvegardez et restaurez vos requêtes de test préférées en un clic.
- ✅ **🛡️ Protection anti-suppression accidentelle** : Confirmation de sécurité sur les `DELETE` sans clause `WHERE`.

---

## 📖 Guide d'Utilisation

### 1. Configuration Initiale
1. Cliquez sur l'encadré **"Projet Actif"** dans la barre latérale gauche.
2. Renseignez votre **URL de projet** (ex: `https://votre-projet.supabase.co`).
3. Renseignez votre **Clé Publique (Anon Key)**. *(Ne collez jamais votre clé secrète `service_role`).*
4. Cliquez sur **"Enregistrer le Projet"**. *(Ces clés restent 100% privées dans le `localStorage` de votre navigateur).*

### 2. Gestion des Personas de Test
1. Dans la barre latérale gauche, cliquez sur **"+ Ajouter"**.
2. Créez vos différents profils de test avec leur email et mot de passe (Admin, Auteur, Apprenant...).
3. **Cliquez sur un persona pour vous connecter instantanément !** Le bandeau supérieur s'actualise avec le rôle RBAC, le persona actif, `auth.uid()` et le minuteur d'expiration de session en direct.

### 3. Playground CRUD & Sélecteur de Colonnes
1. Choisissez l'opération : **GET (SELECT)**, **POST (INSERT)**, **PATCH (UPDATE)**, **DELETE**.
2. Saisissez ou sélectionnez votre table (ex: `lecon`, `cours`, `commentaire`).
3. **Pour `GET` & `DELETE`** : Définissez vos colonnes (`select=*`), tri, pagination (`limit`/`offset`) et filtres conditionnels (`WHERE`).
4. **Pour `POST` & `PATCH`** :
   - L'interface passe en mode plein écran JSON.
   - **👆 Cliquez sur les badges de colonnes** (ex: `+ id`, `+ contenu`, `+ position`) pour ajouter ou retirer des champs dans le JSON en 1 clic.
   - Bouton **"✨ Tout insérer"** pour injecter toutes les colonnes détectées.
   - Bouton **"👤 auth.uid()"** pour injecter l'UUID du compte actif.
   - **Pour PATCH** : Renseignez simplement `"id": "xxx"` et vos modifications dans le JSON, SupaTest cible automatiquement la bonne ligne en base !
5. Cliquez sur **"▶️ Exécuter (Rôle Actif)"** :
   - Statut HTTP, latence, nombre total de lignes en base (`Prefer: count=exact`) et diagnostic RLS immédiat.
   - Basculez à volonté entre la vue **JSON Formatté** et la vue **Tableau**.

### 4. ⭐ Sauvegarder des Requêtes Favorites
* Cliquez sur l'étoile **`⭐`** dans la barre de requête pour enregistrer vos configurations de test.
* Retrouvez vos favoris dans la barre latérale gauche pour les recharger en 1 clic à tout moment.

### 5. ⚡ La Matrice Multi-Rôles & Export de Rapport
1. Préparez votre requête dans le Playground.
2. Cliquez sur le bouton bleu **"⚡ Matrice RLS"**.
3. SupaTest teste la requête en parallèle pour **tous vos personas** et dresse un tableau comparatif de sécurité.
4. Cliquez sur **"📄 Exporter le Rapport (Markdown)"** pour télécharger un compte-rendu d'audit `.md` complet prêt pour vos livrables ou présentations.

### 6. 💡 Aide-Mémoire & Modèles SQL RLS
* Cliquez sur **`💡 Modèles RLS SQL`** dans le bandeau supérieur pour accéder aux 5 modèles de politiques de sécurité SQL les plus utilisés sur Supabase, prêts à être copiés en un clic.

### 7. 🔍 Inspecteur JWT & 📂 Schéma
* **Inspecteur JWT** : Visualisez et décodez l'ensemble des claims, métadonnées (`app_metadata`, `user_metadata`) et dates d'expiration du token actif.
* **Schéma & Tables** : Consultez vos tables mémorisées, leurs colonnes et types, ou ajoutez manuellement de nouvelles tables en 1 clic.

---

## 🔒 Sécurité & Confidentialité

- **100% Client-Side (Zéro backend intermédiaire)** : Même hébergée en ligne sur Vercel, GitHub Pages ou Netlify, l'application s'exécute exclusivement et directement dans votre navigateur web.
- **Connexion directe Supabase** : Toutes les requêtes HTTP sont envoyées directement depuis votre navigateur vers votre projet Supabase via HTTPS. Aucune donnée ne transite par un serveur tiers.
- **Stockage local & privé** : Vos URLs de projet, clés publiques anon, comptes personas, tokens JWT et favoris sont stockés exclusivement dans le `localStorage` de votre navigateur.
- **Sauvegarde et Transfert** : Utilisez les boutons **"💾 Exporter"** et **"📥 Importer"** pour sauvegarder votre environnement de travail ou le déplacer d'une machine à une autre en 1 clic.
