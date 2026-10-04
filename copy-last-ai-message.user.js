// ==UserScript==
// @name         会话菜单：复制最后一条 AI 消息
// @name:en      Conversation menu: copy last AI message
// @namespace    snow-client
// @version      1.0.0
// @description  在侧边栏会话的「⋯」/右键菜单中新增一项“复制最后一条AI消息”，一键把当前对话最后一条 AI 回复复制到剪贴板。
// @description:en Adds a "Copy last AI message" item to the sidebar conversation menu (⋯ / right-click) and copies the last AI reply of the opened conversation to the clipboard.
// @author       Snow AI
// @snow-target  client
// @snow-view    chat
// @snow-surface sidebar
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

/*
 * 会话菜单：复制最后一条 AI 消息（客户端 UI 脚本 · 沙箱档）
 *
 * 行为：在对话视图（chat）下，侧边栏任意会话的「⋯」/右键菜单中会多出一项
 *      「复制最后一条AI消息」，点击后把【当前打开会话】的最后一条 AI 回复
 *      写入系统剪贴板，并在窗口底部弹出提示。
 *
 * 为什么是“当前打开会话”：脚本运行在沙箱隔离世界，读不到 React 内部状态，
 * 只能读取界面已渲染的消息 DOM。因此要复制某个会话的回复时，先打开该会话即可。
 *
 * 实现要点（遵循客户端脚本稳定契约）：
 *   - 会话菜单没有锚点/插槽，通过 MutationObserver 侦测“置顶 + 重命名”文案
 *     特征的弹出菜单（菜单必然是新增的小块 DOM），再克隆“重命名”项生成同款
 *     菜单项挂在原位置；React 重渲染顶掉注入项时会自动重挂；
 *   - 消息定位只用 data-snow-anchor="chat.message" + data-snow-message-role；
 *   - 提取文本时跳过 data-snow-slot（消息操作行）、按钮 / 图标等非正文节点；
 *   - 消息列表是虚拟化滚动，若当前不在底部，会先临时滚到底读出最后一条再还原；
 *   - 剪贴板使用 GM_setClipboard；提示条为本脚本自有节点，卸载时一并清理。
 */

(() => {
  'use strict';

  // ---------- 常量与工具 ----------
  const ITEM_CLASS = 'snow-copy-last-msg'; // 注入菜单项的标记类
  const TOAST_CLASS = 'snow-copy-last-toast'; // 底部提示条
  const LABEL_ZH = '复制最后一条AI消息';
  const LABEL_EN = 'Copy last AI message';

  const RE_RENAME = /重命名|rename/i;
  const RE_PIN = /置顶|\bpin\b|unpin/i;
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const log = (...args) => {
    try {
      if (typeof snow !== 'undefined' && snow && typeof snow.log === 'function') {
        snow.log('[copy-last-msg]', ...args);
      } else {
        console.log('[copy-last-msg]', ...args);
      }
    } catch (_) {
      /* 忽略日志失败 */
    }
  };

  const setScrollTop = (el, top) => {
    try {
      el.scrollTo({ top, behavior: 'instant' });
    } catch (_) {
      try {
        el.scrollTop = top;
      } catch (__) {
        /* 忽略 */
      }
    }
  };

  // ---------- 提示条 ----------
  const injectStyle = () => {
    const css = `
.${TOAST_CLASS} {
  position: fixed;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%) translateY(4px);
  z-index: 2147483000;
  max-width: 70vw;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(24, 24, 28, 0.92);
  color: #fff;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.${TOAST_CLASS}.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
`;
    if (typeof snow !== 'undefined' && snow && typeof snow.style === 'function') {
      snow.style(css);
    } else if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    }
  };

  let toastTimer = null;
  const showToast = (message) => {
    let el = document.querySelector('.' + TOAST_CLASS);
    if (!el) {
      el = document.createElement('div');
      el.className = TOAST_CLASS;
      document.body.appendChild(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add('show'));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 240);
    }, 2200);
  };

  // ---------- 剪贴板 ----------
  const writeClipboard = (text) => {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text);
        return true;
      }
    } catch (err) {
      log('GM_setClipboard 调用失败：', err);
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).catch(() => {});
        return true;
      }
    } catch (_) {
      /* 忽略 */
    }
    return false;
  };

  // ---------- 消息定位与文本提取 ----------
  const findLastAssistantMessage = () => {
    const messages = document.querySelectorAll('[data-snow-anchor="chat.message"]');
    let last = null;
    for (const el of messages) {
      const role = el.getAttribute('data-snow-message-role');
      if (role === 'assistant') last = el;
    }
    return last;
  };

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO',
    'IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'TIME',
  ]);
  const BLOCK_TAGS = new Set([
    'DIV', 'P', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'NAV',
    'UL', 'OL', 'LI', 'PRE', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'TABLE',
    'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4',
    'H5', 'H6', 'HR', 'ADDRESS', 'DETAILS', 'SUMMARY', 'FIELDSET',
  ]);
  const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row']);

  const extractMessageText = (root) => {
    const parts = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        parts.push(node.nodeValue || '');
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node;
      const tag = el.tagName;
      if (SKIP_TAGS.has(tag)) return;
      if (tag === 'BR') {
        parts.push('\n');
        return;
      }
      if (el.hasAttribute('data-snow-slot')) return; // 跳过宿主插槽（消息操作行等）
      if (el.getAttribute('aria-hidden') === 'true') return;
      let cs = null;
      try {
        cs = window.getComputedStyle(el);
      } catch (_) {
        /* 忽略 */
      }
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return;
      const isBlock = BLOCK_TAGS.has(tag) || (cs && BLOCK_DISPLAYS.has(cs.display));
      if (isBlock) parts.push('\n');
      const children = el.childNodes;
      for (let i = 0; i < children.length; i += 1) walk(children[i]);
      if (isBlock) parts.push('\n');
    };
    walk(root);
    return parts
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  // ---------- 复制流程 ----------
  let copyBusy = false;
  const copyLastAssistantMessage = async () => {
    if (copyBusy) return;
    copyBusy = true;

    let scroller = null;
    let savedScrollTop = null;

    try {
      const context = typeof snow !== 'undefined' && snow ? snow.context : null;
      if (context && context.view && context.view !== 'chat') {
        showToast('请先切换到对话视图再复制');
        return;
      }

      scroller = document.querySelector('[data-snow-anchor="chat.messages"]');
      if (!scroller) {
        showToast('未找到消息列表，请先打开一个会话');
        return;
      }

      const nearBottom = () =>
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
      if (!nearBottom()) {
        // 列表虚拟化：先滚到底，让最后一条消息渲染出来
        savedScrollTop = scroller.scrollTop;
        setScrollTop(scroller, scroller.scrollHeight);
        await sleep(420);
      }

      let msgEl = findLastAssistantMessage();
      if (!msgEl) {
        await sleep(320);
        msgEl = findLastAssistantMessage();
      }
      if (!msgEl) {
        showToast('当前会话还没有 AI 回复');
        return;
      }

      const text = extractMessageText(msgEl);
      if (!text) {
        showToast('未能提取到消息文本');
        return;
      }
      if (!writeClipboard(text)) {
        showToast('复制失败：剪贴板接口不可用');
        return;
      }

      log('已复制', text.length, '字符');
      showToast(`已复制当前会话最后一条 AI 消息（${text.length} 字符）`);
    } catch (err) {
      log('复制失败：', err);
      showToast('复制失败，详情见控制台 [Snow Client Script] 日志');
    } finally {
      if (savedScrollTop !== null && scroller) {
        try {
          setScrollTop(scroller, savedScrollTop);
        } catch (_) {
          /* 忽略 */
        }
      }
      copyBusy = false;
    }
  };

  // ---------- 会话菜单检测与注入 ----------
  let lastMenuRoot = null;

  const isExcludedContext = (el) =>
    !!el.closest(
      '[data-snow-anchor="chat.message"], [data-snow-anchor="chat.messages"], [data-snow-anchor="chat.input"], [data-snow-anchor="rightPanel"], [data-snow-anchor="topbar"]',
    );

  const isConversationMenu = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (isExcludedContext(el)) return false;
    const text = el.textContent || '';
    if (!text || text.length > 700) return false;
    if (!RE_RENAME.test(text) || !RE_PIN.test(text)) return false;
    try {
      if (el.querySelectorAll('*').length > 90) return false;
    } catch (_) {
      return false;
    }
    return true;
  };

  // 在（很小的）新增节点子树里找会话菜单根
  const findMenuRoot = (el) => {
    if (!el || el.nodeType !== 1) return null;
    if (isConversationMenu(el)) return el;
    let count = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      count += 1;
      if (count > 90) return null; // 太大，不可能是弹出菜单
    }
    for (let i = 0; i < el.children.length; i += 1) {
      const found = findMenuRoot(el.children[i]);
      if (found) return found;
    }
    return null;
  };

  // 找“重命名”菜单项，作为同款克隆样本
  const findRenameItem = (root) => {
    const exact = (s) => /^(重命名|rename)$/i.test(norm(s));
    const candidates = [];
    for (const el of root.querySelectorAll('*')) {
      if (exact(el.textContent)) candidates.push(el);
    }
    let chosen = null;
    for (const candidate of candidates) {
      const parent = candidate.parentElement;
      if (parent && !exact(parent.textContent)) chosen = candidate; // 最外层且父级含其他内容者 = 菜单项
    }
    return chosen || candidates[candidates.length - 1] || null;
  };

  const onItemClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    void copyLastAssistantMessage();

    // 尝试关闭菜单（Esc 是弹出菜单的常规关闭键；失效也不影响复制结果）
    try {
      const root = lastMenuRoot;
      if (root && root.isConnected) {
        root.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    } catch (_) {
      /* 忽略 */
    }
  };

  const injectItem = (menuRoot) => {
    if (!menuRoot || !menuRoot.isConnected) return false;
    if (menuRoot.querySelector('.' + ITEM_CLASS)) return true; // 已注入
    const sample = findRenameItem(menuRoot);
    if (!sample || !sample.parentElement) return false;

    const container = sample.parentElement;
    const clone = sample.cloneNode(true);
    clone.classList.add(ITEM_CLASS);
    clone.removeAttribute('id');
    // 去掉可能触发原菜单动作的标记属性，避免误派发“重命名”等命令
    ['data-action', 'data-command', 'data-menu-action', 'data-value'].forEach((attr) =>
      clone.removeAttribute(attr),
    );
    Array.from(clone.querySelectorAll('svg')).forEach((svg) => svg.remove());

    const label = /重命名/.test(sample.textContent || '') ? LABEL_ZH : LABEL_EN;
    let replaced = false;
    const textWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let textNode = textWalker.nextNode();
    while (textNode) {
      if (RE_RENAME.test(textNode.nodeValue || '')) {
        textNode.nodeValue = label;
        replaced = true;
        break;
      }
      textNode = textWalker.nextNode();
    }
    if (!replaced) clone.textContent = label;
    if (RE_RENAME.test(clone.getAttribute('title') || '')) clone.setAttribute('title', label);
    if (RE_RENAME.test(clone.getAttribute('aria-label') || '')) clone.setAttribute('aria-label', label);

    clone.addEventListener('click', onItemClick, true);

    const lastChild = container.lastElementChild;
    if (lastChild && lastChild !== clone && /删除|delete/i.test(norm(lastChild.textContent))) {
      container.insertBefore(clone, lastChild); // 放在“删除”之前，更符合操作顺序
    } else {
      container.appendChild(clone);
    }
    return true;
  };

  // ---------- 监听 DOM，等待会话菜单弹出 ----------
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const added = record.addedNodes;
      for (let i = 0; i < added.length; i += 1) {
        const node = added[i];
        if (node.nodeType !== 1) continue;
        if (
          node.classList &&
          (node.classList.contains(TOAST_CLASS) || node.classList.contains(ITEM_CLASS))
        ) {
          continue;
        }
        const root = findMenuRoot(node);
        if (root) {
          lastMenuRoot = root;
          injectItem(root);
        }
      }
      // 菜单以“逐个追加子项”的方式出现时，改看变更目标
      const target = record.target;
      if (target && target.nodeType === 1 && isConversationMenu(target)) {
        lastMenuRoot = target;
        injectItem(target);
      }
    }
    // React 重渲染把注入项顶掉时重新挂上
    if (lastMenuRoot && lastMenuRoot.isConnected && !lastMenuRoot.querySelector('.' + ITEM_CLASS)) {
      injectItem(lastMenuRoot);
    }
  });

  // ---------- 启动与清理 ----------
  const cleanup = () => {
    try {
      observer.disconnect();
    } catch (_) {
      /* 忽略 */
    }
    try {
      document.querySelectorAll('.' + ITEM_CLASS).forEach((el) => el.remove());
    } catch (_) {
      /* 忽略 */
    }
    try {
      document.querySelectorAll('.' + TOAST_CLASS).forEach((el) => el.remove());
    } catch (_) {
      /* 忽略 */
    }
  };

  injectStyle();
  observer.observe(document.body, { childList: true, subtree: true });
  if (typeof snow !== 'undefined' && snow && typeof snow.onCleanup === 'function') {
    snow.onCleanup(cleanup);
  } else {
    window.addEventListener('pagehide', cleanup, { once: true });
  }
  log('已加载，等待会话菜单出现');
})();
