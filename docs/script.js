/* WACRM Documentation Portal — v6.8.9 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Theme ---------- */
  const themeBtn = $('#themeBtn');
  const stored = localStorage.getItem('docs-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', initial);
  themeBtn?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('docs-theme', next);
  });

  /* ---------- Mobile sidebar ---------- */
  const sidebar = $('#sidebar');
  const menuBtn = $('#menuBtn');
  const backdrop = $('#backdrop');
  const toggleSidebar = (open) => {
    const isOpen = open ?? !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    backdrop.classList.toggle('show', isOpen);
  };
  menuBtn?.addEventListener('click', () => toggleSidebar());
  backdrop?.addEventListener('click', () => toggleSidebar(false));
  sidebar?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A' && window.innerWidth <= 780) toggleSidebar(false);
  });

  /* ---------- Sections & nav index ---------- */
  const contentRoot = $('#content');
  const sections = $$('.content section[id]');
  const navLinks = $$('.sidebar a[href^="#"]');
  const tocLinks = $$('.toc a[href^="#"]');

  const titleFor = (id) => {
    const link = navLinks.find(a => a.getAttribute('href') === '#' + id);
    if (link) return link.textContent.trim();
    const el = document.getElementById(id);
    const h = el && el.querySelector('h1, h2, h3');
    return h ? h.textContent.trim() : id;
  };
  const groupFor = (id) => {
    const link = navLinks.find(a => a.getAttribute('href') === '#' + id);
    const group = link && link.closest('.nav-group');
    const h4 = group && group.querySelector('h4');
    return h4 ? h4.textContent.trim() : '';
  };

  /* ---------- Tags ---------- */
  const TAG_RULES = [
    ['WhatsApp', /whats\s?app|meta cloud|template/i],
    ['Inbox', /inbox|conversation|messag|chat|omnichannel|telegram|messenger|instagram/i],
    ['CRM', /crm|contact|deal|pipeline|lead|customer/i],
    ['AI', /\bai\b|assistant|chatbot|rag|prompt|llm/i],
    ['Automation', /workflow|automation|flow builder|trigger/i],
    ['Billing', /billing|payment|stripe|paddle|invoice|plan|subscription|pricing/i],
    ['Security', /security|rls|auth|permission|role|audit|2fa/i],
    ['Deployment', /deploy|install|docker|nginx|build|hosting|production|server/i],
    ['UI', /ui|design|theme|color|typography|layout|component|motion|icon|navigation|radius|button|form|table/i],
    ['Database', /database|postgres|supabase|schema|migration|sql|backend/i],
    ['API', /\bapi\b|webhook|sdk|integration|extension/i],
    ['Testing', /test|qa|audit|review|checklist|performance/i],
    ['Marketing', /marketing|campaign|analytics|codecanyon|listing|seo/i],
    ['Mobile & PWA', /pwa|mobile|offline|native|app store/i],
    ['Booking', /booking|appointment|calendar|schedul/i],
    ['Support', /helpdesk|ticket|support|troubleshoot|faq|knowledge/i],
  ];
  const tagsFor = (title, group, id) => {
    const hay = `${title} ${group} ${id.replace(/[-_]/g, ' ')}`;
    const out = TAG_RULES.filter(([, re]) => re.test(hay)).map(([t]) => t);
    return out.length ? out : ['General'];
  };

  const topics = sections.map((s, i) => {
    const title = titleFor(s.id);
    const group = groupFor(s.id);
    return { id: s.id, el: s, index: i, title, group, tags: tagsFor(title, group, s.id) };
  });
  const indexById = new Map(topics.map(t => [t.id, t.index]));
  const linkById = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));

  const setActive = (id) => {
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    tocLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  };

  /* ---------- Topic filter (group + tags) ---------- */
  const FILTER_KEY = 'docs-topic-filter';
  const allGroups = Array.from(new Set(topics.map(t => t.group).filter(Boolean))).sort();
  const allTags = Array.from(new Set(topics.flatMap(t => t.tags))).sort();

  let filter = { group: 'all', tags: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      filter.group = allGroups.includes(saved.group) ? saved.group : 'all';
      filter.tags = Array.isArray(saved.tags) ? saved.tags.filter(t => allTags.includes(t)) : [];
    }
  } catch { /* ignore corrupt filter state */ }

  const matchesFilter = (t) =>
    (filter.group === 'all' || t.group === filter.group) &&
    (filter.tags.length === 0 || filter.tags.every(tag => t.tags.includes(tag)));

  let visible = topics.filter(matchesFilter);

  const filterBox = document.createElement('div');
  filterBox.className = 'nav-filter';
  filterBox.innerHTML = `
    <div class="nav-filter-head">
      <h4>Filter topics</h4>
      <button type="button" class="nav-filter-clear" id="filterClear">Clear</button>
    </div>
    <label class="nav-filter-label" for="filterGroup">Group</label>
    <select id="filterGroup" class="nav-filter-select">
      <option value="all">All groups</option>
      ${allGroups.map(g => `<option value="${g.replace(/"/g, '&quot;')}">${g}</option>`).join('')}
    </select>
    <div class="nav-filter-label">Tags</div>
    <div class="nav-filter-tags" id="filterTags">
      ${allTags.map(t => `<button type="button" class="tag-chip" data-tag="${t.replace(/"/g, '&quot;')}">${t}</button>`).join('')}
    </div>
    <div class="nav-filter-count" id="filterCount"></div>
  `;
  sidebar?.insertBefore(filterBox, sidebar.firstChild);

  const groupSelect = $('#filterGroup');
  const tagsWrap = $('#filterTags');
  const filterCount = $('#filterCount');

  const syncFilterUI = () => {
    groupSelect.value = filter.group;
    $$('.tag-chip', tagsWrap).forEach(b => b.classList.toggle('on', filter.tags.includes(b.dataset.tag)));
    filterCount.textContent = `${visible.length} of ${topics.length} topics`;
    filterBox.classList.toggle('active', filter.group !== 'all' || filter.tags.length > 0);
    // Reflect in the nav lists
    topics.forEach(t => {
      const a = linkById.get(t.id);
      if (a) a.closest('li')?.classList.toggle('nav-hidden', !matchesFilter(t));
    });
    $$('.nav-group', sidebar).forEach(g => {
      const items = $$('li', g);
      g.classList.toggle('nav-hidden', items.length > 0 && items.every(li => li.classList.contains('nav-hidden')));
    });
  };

  const applyFilter = (opts = {}) => {
    visible = topics.filter(matchesFilter);
    if (!visible.length) { filter = { group: 'all', tags: [] }; visible = topics.slice(); }
    localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    syncFilterUI();
    const stillVisible = visible.some(t => t.index === current);
    if (!stillVisible && opts.jump !== false) {
      const target = visible[0];
      history.replaceState(null, '', '#' + target.id);
      showTopic(target.index, { smooth: false });
    } else {
      renderPager();
    }
  };

  groupSelect.addEventListener('change', () => { filter.group = groupSelect.value; applyFilter(); });
  tagsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-chip');
    if (!btn) return;
    const tag = btn.dataset.tag;
    filter.tags = filter.tags.includes(tag) ? filter.tags.filter(t => t !== tag) : [...filter.tags, tag];
    applyFilter();
  });
  $('#filterClear').addEventListener('click', () => { filter = { group: 'all', tags: [] }; applyFilter(); });


  /* ---------- Pager UI ---------- */
  const pager = document.createElement('nav');
  pager.className = 'pager';
  pager.setAttribute('aria-label', 'Topic pagination');
  pager.innerHTML = `
    <div class="pager-progress"><span id="pagerBar"></span></div>
    <div class="pager-meta">
      <span id="pagerCount"></span>
      <span class="pager-hint">Use <kbd>←</kbd> <kbd>→</kbd> to move between topics</span>
    </div>
    <div class="pager-links">
      <a class="pager-link prev" id="pagerPrev" href="#">
        <span class="pager-dir">← Previous</span>
        <span class="pager-title"></span>
      </a>
      <a class="pager-link next" id="pagerNext" href="#">
        <span class="pager-dir">Next →</span>
        <span class="pager-title"></span>
      </a>
    </div>
    <button class="pager-top" id="pagerTop" type="button">↑ Back to top</button>
  `;
  const contentFooter = contentRoot.querySelector('footer, .footer');
  if (contentFooter) contentRoot.insertBefore(pager, contentFooter); else contentRoot.appendChild(pager);

  const pagerPrev = $('#pagerPrev');
  const pagerNext = $('#pagerNext');
  const pagerCount = $('#pagerCount');
  const pagerBar = $('#pagerBar');
  $('#pagerTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  let current = 0;
  let searching = false;

  const renderPager = () => {
    const list = visible.length ? visible : topics;
    let pos = list.findIndex(t => t.index === current);
    const inFilter = pos !== -1;
    // Topic outside the active filter: navigate relative to its position in the full list
    const seq = inFilter ? list : topics;
    if (!inFilter) pos = topics.findIndex(t => t.index === current);
    const prev = seq[pos - 1];
    const next = seq[pos + 1];
    const fill = (el, topic) => {
      if (!topic) { el.classList.add('disabled'); el.removeAttribute('href'); el.querySelector('.pager-title').textContent = '—'; return; }
      el.classList.remove('disabled');
      el.setAttribute('href', '#' + topic.id);
      el.querySelector('.pager-title').textContent = topic.title;
    };
    fill(pagerPrev, prev);
    fill(pagerNext, next);
    const scope = inFilter && seq.length !== topics.length ? ' · filtered' : '';
    const grp = topics[current].group ? ' · ' + topics[current].group : '';
    pagerCount.textContent = `Topic ${pos + 1} of ${seq.length}${scope}${grp}`;
    pagerBar.style.width = ((pos + 1) / seq.length * 100).toFixed(2) + '%';
  };

  /* ---------- Lazy topic content ---------- */
  /* Every topic's markup is parked in memory at boot and only mounted into the
     DOM when it is shown (or prefetched), keeping the live document small. */
  const rawHTML = new Map();
  const textIndex = new Map();
  const mounted = new Set();

  topics.forEach(t => {
    rawHTML.set(t.id, t.el.innerHTML);
    textIndex.set(t.id, t.el.textContent.toLowerCase());
    t.el.innerHTML = '';
  });

  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 200));

  const prepMedia = (root) => {
    $$('img', root).forEach(img => {
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    });
    $$('iframe', root).forEach(f => { if (!f.hasAttribute('loading')) f.setAttribute('loading', 'lazy'); });
  };

  const highlight = (root) => {
    if (!window.hljs) return;
    $$('pre code', root).forEach(b => { if (!b.dataset.highlighted) window.hljs.highlightElement(b); });
  };

  const mountTopic = (t, opts = {}) => {
    if (!t || mounted.has(t.id)) return;
    t.el.innerHTML = rawHTML.get(t.id) || '';
    mounted.add(t.id);
    prepMedia(t.el);
    if (opts.highlight !== false) highlight(t.el);
  };

  const unmountTopic = (t) => {
    if (!t || !mounted.has(t.id)) return;
    t.el.innerHTML = '';
    mounted.delete(t.id);
  };

  /* Keep a small window of mounted topics around the current one */
  const MOUNT_BUDGET = 6;
  const trimMounted = (keepIds) => {
    if (mounted.size <= MOUNT_BUDGET) return;
    for (const id of Array.from(mounted)) {
      if (mounted.size <= MOUNT_BUDGET) break;
      if (keepIds.has(id)) continue;
      unmountTopic(topics[indexById.get(id)]);
    }
  };

  /* Prefetch the neighbours so Prev/Next paints instantly */
  const prefetchNeighbours = () => {
    const list = visible.length ? visible : topics;
    let pos = list.findIndex(t => t.index === current);
    const seq = pos === -1 ? topics : list;
    if (pos === -1) pos = topics.findIndex(t => t.index === current);
    const next = seq[pos + 1];
    const prev = seq[pos - 1];
    const keep = new Set([topics[current].id, next?.id, prev?.id].filter(Boolean));
    idle(() => { mountTopic(next); idle(() => { mountTopic(prev); trimMounted(keep); }); });
  };

  const showTopic = (idOrIndex, opts = {}) => {
    const idx = typeof idOrIndex === 'number' ? idOrIndex : indexById.get(idOrIndex);
    if (idx == null || idx < 0 || idx >= topics.length) return;
    current = idx;
    mountTopic(topics[idx]);
    topics.forEach((t, i) => t.el.classList.toggle('pg-hidden', i !== idx));
    pager.classList.remove('hidden');
    setActive(topics[idx].id);
    renderPager();
    document.title = `${topics[idx].title} — WACRM Docs v6.8.9`;
    if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: opts.smooth === false ? 'auto' : 'smooth' });
    prefetchNeighbours();
  };


  /* Sidebar / TOC / pager clicks stay on-page */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('disabled')) return;
    const id = a.getAttribute('href').slice(1);
    if (!indexById.has(id)) return;
    e.preventDefault();
    if (searching && $('#search')) { $('#search').value = ''; runSearch(''); }
    history.replaceState(null, '', '#' + id);
    showTopic(id);
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (indexById.has(id)) showTopic(id);
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (searching) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const list = visible.length ? visible : topics;
    let pos = list.findIndex(t => t.index === current);
    const seq = pos === -1 ? topics : list;
    if (pos === -1) pos = topics.findIndex(t => t.index === current);
    const target = e.key === 'ArrowRight' ? seq[pos + 1] : seq[pos - 1];
    if (!target) return;
    history.replaceState(null, '', '#' + target.id);
    showTopic(target.index);
  });


  /* ---------- Search ---------- */
  const searchInput = $('#search');
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function runSearch(q) {
    const query = q.trim();
    if (!query) {
      searching = false;
      // Drop search-rendered markup; topics remount lazily on demand.
      topics.forEach(t => {
        t.el.classList.remove('hidden');
        if (mounted.has(t.id)) { t.el.innerHTML = ''; mounted.delete(t.id); }
      });
      showTopic(current, { scroll: false });
      $('#searchEmpty')?.classList.add('hidden');
      return;
    }
    searching = true;
    pager.classList.add('hidden');
    const re = new RegExp(escapeRegex(query), 'gi');
    const needle = query.toLowerCase();
    let matches = 0;
    const visibleIds = new Set((visible.length ? visible : topics).map(t => t.id));
    topics.forEach(t => {
      const s = t.el;
      const hit = visibleIds.has(t.id) && (textIndex.get(t.id) || '').includes(needle);
      if (!hit) { s.classList.add('hidden'); unmountTopic(t); return; }
      s.classList.remove('hidden');
      s.classList.remove('pg-hidden');
      // Re-render from the pristine copy so previous highlights don't stack
      s.innerHTML = rawHTML.get(t.id) || '';
      mounted.add(t.id);
      prepMedia(s);
      const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest('pre, code, script, style')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const targets = [];
      while (walker.nextNode()) targets.push(walker.currentNode);
      targets.forEach(node => {
        if (!re.test(node.nodeValue)) return;
        re.lastIndex = 0;
        const span = document.createElement('span');
        span.innerHTML = node.nodeValue.replace(re, (m) => `<mark>${m}</mark>`);
        node.parentNode.replaceChild(span, node);
      });
      matches++;
    });
    $('#searchEmpty')?.classList.toggle('hidden', matches > 0);
  }

  let searchTimer;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 120);
  });
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; runSearch(''); searchInput.blur(); }
  });

  /* ---------- Hover / focus prefetch ---------- */
  const prefetchById = (id) => {
    const i = indexById.get(id);
    if (i != null) idle(() => mountTopic(topics[i]));
  };
  const hoverPrefetch = (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (a) prefetchById(a.getAttribute('href').slice(1));
  };
  document.addEventListener('pointerover', hoverPrefetch, { passive: true });
  document.addEventListener('focusin', hoverPrefetch);


  /* ---------- Boot ---------- */
  const startId = location.hash.slice(1);
  const hasStart = indexById.has(startId);
  applyFilter({ jump: false });
  showTopic(hasStart ? startId : (visible[0]?.index ?? 0), { smooth: false });

})();
