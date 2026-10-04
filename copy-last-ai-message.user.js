// ==UserScript==
// @name         会话菜单：复制最后一条 AI 消息
// @name:en      Conversation menu: copy last AI message
// @namespace    snow-client
// @version      1.1.0
// @description  在侧边栏会话的「⋯」/右键菜单中新增一项“复制最后一条AI消息”，一键把该会话的最后一条 AI 回复复制到剪贴板。
// @description:en Adds a "Copy last AI message" item to the sidebar conversation menu (⋯ / right-click) and copies that conversation's last AI reply to the clipboard.
// @author       Snow AI
// @snow-target  client
// @snow-view    chat
// @snow-surface sidebar
// @snow-privacy messages
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  'use strict';

  const ITEM_CLASS = 'snow-copy-last-msg';
  const TOAST_CLASS = 'snow-copy-last-toast';
  const LABEL_ZH = '复制最后一条AI消息';
  const LABEL_EN = 'Copy last AI message';

  const MENU_SELECTOR = '[role="menu"][data-snow-conversation-id]';
  const RE_RENAME = /重命名|rename/i;
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  const log = (...args) => {
    try {
      if (typeof snow !== 'undefined' && snow && typeof snow.log === 'function') {
        snow.log('[copy-last-msg]', ...args);
      } else {
        console.log('[copy-last-msg]', ...args);
      }
    } catch (_) {}
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
    } catch (_) {}
    return false;
  };

  // ---------- 复制流程：按会话 id 读取数据 ----------
  let copyBusy = false;
  const copyLastAssistantMessage = async (conversationId) => {
    if (copyBusy) return;
    copyBusy = true;
    try {
      const response = await snow.metadata.get('messages', {
        params: { conversationId },
      });
      if (response && response.denied && response.denied.messages) {
        showToast('复制失败：脚本缺少 messages 数据域声明');
        return;
      }
      const data = response && response.domains ? response.domains.messages : null;
      const items = data && Array.isArray(data.items) ? data.items : null;
      if (!items) {
        showToast('未能读取该会话的消息，请稍后重试');
        return;
      }
      const last = [...items]
        .reverse()
        .find(
          (item) =>
            item &&
            item.role === 'assistant' &&
            typeof item.content === 'string' &&
            item.content.trim(),
        );
      if (!last) {
        showToast('该会话还没有 AI 回复');
        return;
      }
      if (!writeClipboard(last.content)) {
        showToast('复制失败：剪贴板接口不可用');
        return;
      }
      log('已复制', last.content.length, '字符');
      showToast(`已复制该会话最后一条 AI 消息（${last.content.length} 字符）`);
    } catch (error) {
      log('复制失败：', error);
      showToast('复制失败，详情见控制台 [Snow Client Script] 日志');
    } finally {
      copyBusy = false;
    }
  };

  // ---------- 会话菜单检测与注入 ----------
  // 应用里 Esc 是「中断会话」快捷键，合成 Esc 会打断正在输出的会话；
  // 关闭菜单改为在 body 上模拟一次外部 mousedown，走菜单自身的「点击外部关闭」逻辑。
  const closeMenu = () => {
    try {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
      );
    } catch (_) {}
  };

  const onItemClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    let conversationId = '';
    try {
      const menu =
        event.currentTarget && event.currentTarget.closest
          ? event.currentTarget.closest(MENU_SELECTOR)
          : null;
      conversationId = menu ? menu.getAttribute('data-snow-conversation-id') || '' : '';
    } catch (_) {}

    setTimeout(closeMenu, 0);

    if (!conversationId) {
      showToast('无法确定会话，请重新打开会话菜单');
      return;
    }
    void copyLastAssistantMessage(conversationId);
  };

  const findRenameItem = (root) => {
    const exact = (s) => /^(重命名|rename)$/i.test(norm(s));
    const candidates = [];
    for (const el of root.querySelectorAll('*')) {
      if (exact(el.textContent)) candidates.push(el);
    }
    let chosen = null;
    for (const candidate of candidates) {
      const parent = candidate.parentElement;
      if (parent && !exact(parent.textContent)) chosen = candidate;
    }
    return chosen || candidates[candidates.length - 1] || null;
  };

  const injectItem = (menuRoot) => {
    if (!menuRoot || !menuRoot.isConnected) return false;
    if (menuRoot.querySelector('.' + ITEM_CLASS)) return true;
    const sample = findRenameItem(menuRoot);
    if (!sample || !sample.parentElement) return false;

    const container = sample.parentElement;
    const clone = sample.cloneNode(true);
    clone.classList.add(ITEM_CLASS);
    clone.removeAttribute('id');
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
      container.insertBefore(clone, lastChild);
    } else {
      container.appendChild(clone);
    }
    return true;
  };

  // ---------- 监听 DOM，等待会话菜单弹出 ----------
  let lastMenuRoot = null;

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
        if (node.matches && node.matches(MENU_SELECTOR)) {
          lastMenuRoot = node;
          injectItem(node);
          continue;
        }
        const menu = node.querySelector ? node.querySelector(MENU_SELECTOR) : null;
        if (menu) {
          lastMenuRoot = menu;
          injectItem(menu);
        }
      }
      // 菜单子项重建（React 重渲染）时补挂注入项
      const target = record.target;
      if (target && target.nodeType === 1 && target.closest) {
        const menu = target.closest(MENU_SELECTOR);
        if (menu && !menu.querySelector('.' + ITEM_CLASS)) {
          lastMenuRoot = menu;
          injectItem(menu);
        }
      }
    }
    if (lastMenuRoot) {
      if (!lastMenuRoot.isConnected) {
        lastMenuRoot = null;
      } else if (!lastMenuRoot.querySelector('.' + ITEM_CLASS)) {
        injectItem(lastMenuRoot);
      }
    }
  });

  // ---------- 启动与清理 ----------
  const cleanup = () => {
    try {
      observer.disconnect();
    } catch (_) {}
    document.querySelectorAll('.' + ITEM_CLASS).forEach((el) => el.remove());
    document.querySelectorAll('.' + TOAST_CLASS).forEach((el) => el.remove());
  };

  injectStyle();
  document.querySelectorAll(MENU_SELECTOR).forEach((menu) => injectItem(menu));
  observer.observe(document.body, { childList: true, subtree: true });
  if (typeof snow !== 'undefined' && snow && typeof snow.onCleanup === 'function') {
    snow.onCleanup(cleanup);
  } else {
    window.addEventListener('pagehide', cleanup, { once: true });
  }
  log('已加载，等待会话菜单出现');
})();
