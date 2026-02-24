// ProposalManager — Proposal loading utility for Upwork job apply pages
// Handles: apply page detection, button injection, n8n fetch, panel rendering, paste/copy
// Used by: src/content/upwork-content.js (listed before content script in manifest)
//
// Design contract:
// - All public methods are try/catch wrapped — failures log to console, never throw
// - ProposalManager is a plain object (not a class) — content scripts use object literals
// - No ES module syntax — loaded as a classic content script

const ProposalManager = {

  // ─── Apply page detection ─────────────────────────────────────────────────

  /**
   * Returns true if the current page URL matches the Upwork job apply pattern.
   * Pattern: /jobs/<anything>/apply
   *
   * @returns {boolean}
   */
  isApplyPage() {
    try {
      return /\/nx\/proposals\/job\/[^/]+\/apply/.test(window.location.href);
    } catch (err) {
      console.error('[ProposalManager] isApplyPage error:', err);
      return false;
    }
  },

  // ─── Job context extraction ───────────────────────────────────────────────

  /**
   * Extracts job metadata from the current apply page.
   * Returns { job_id, title, description } — all values may be null if not found.
   *
   * @returns {{ job_id: string|null, title: string|null, description: string|null }}
   */
  getJobContext() {
    try {
      // job_id — extract the numeric ID after the ~ sigil in the URL
      // Handles /nx/proposals/job/~022024701216023723954/apply/ and /jobs/~<id>
      const idMatch = window.location.href.match(/[/_]~([a-zA-Z0-9]+)/);
      const job_id = idMatch ? idMatch[1] : null;

      // title — strip " | Upwork" (or " - Upwork") suffix from document.title
      let title = document.title || null;
      if (title) {
        title = title.replace(/\s*[|\-]\s*Upwork\s*$/i, '').trim() || null;
      }

      // description — try known data-test selectors, fallback to .job-description
      let descEl = document.querySelector('[data-test="job-description"]')
        || document.querySelector('[data-test="description"]')
        || document.querySelector('.job-description');
      const description = descEl
        ? (descEl.textContent.trim().slice(0, 2000) || null)
        : null;

      return { job_id, title, description };
    } catch (err) {
      console.error('[ProposalManager] getJobContext error:', err);
      return { job_id: null, title: null, description: null };
    }
  },

  // ─── Button injection ─────────────────────────────────────────────────────

  /**
   * Injects the "Load Proposal" button and wrapper div above the cover letter
   * textarea on the apply page. Safe to call multiple times — exits early if
   * already injected.
   */
  injectButton() {
    try {
      // Guard: don't inject twice
      if (document.getElementById('ext-load-proposal-btn')) return;

      // Find the cover letter textarea
      const textarea = document.querySelector('[data-test="cover-letter-text"]')
        || document.querySelector('[name="cover_letter"]')
        || document.querySelector('[data-test="cover-letter-section"] textarea')
        || document.querySelector('textarea');

      if (!textarea) {
        console.debug('[ProposalManager] injectButton: cover letter textarea not found');
        return;
      }

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.id = 'ext-proposal-wrapper';
      wrapper.style.cssText = 'margin-bottom: 8px;';

      // Create button
      const btn = document.createElement('button');
      btn.id = 'ext-load-proposal-btn';
      btn.textContent = 'Load Proposal';
      btn.style.cssText = 'background:#14a800;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:14px;margin-bottom:8px;';

      btn.addEventListener('click', () => {
        try {
          btn.disabled = true;
          btn.textContent = 'Loading\u2026';
          ProposalManager.loadProposal();
        } catch (err) {
          console.error('[ProposalManager] button click error:', err);
          btn.disabled = false;
          btn.textContent = 'Load Proposal';
        }
      });

      wrapper.appendChild(btn);

      // Inject after the "Cover Letter" label/heading if one exists,
      // otherwise fall back to immediately before the textarea.
      let injected = false;
      const labelCandidates = document.querySelectorAll('label, h1, h2, h3, h4, h5, legend');
      for (const el of labelCandidates) {
        if (/cover letter/i.test(el.textContent.trim())) {
          el.insertAdjacentElement('afterend', wrapper);
          injected = true;
          break;
        }
      }
      if (!injected) {
        // Fallback: look for a span whose sole text is "Cover Letter"
        for (const el of document.querySelectorAll('span')) {
          if (el.children.length === 0 && /^cover letter$/i.test(el.textContent.trim())) {
            el.insertAdjacentElement('afterend', wrapper);
            injected = true;
            break;
          }
        }
      }
      if (!injected) {
        textarea.parentNode.insertBefore(wrapper, textarea);
      }

      console.debug('[ProposalManager] injectButton: button injected');
    } catch (err) {
      console.error('[ProposalManager] injectButton error:', err);
    }
  },

  // ─── Proposal loading ─────────────────────────────────────────────────────

  /**
   * Extracts job context and sends LOAD_PROPOSAL to the service worker.
   * On response, renders the panel (success) or shows error state.
   * Restores the button either way.
   */
  loadProposal() {
    try {
      const context = ProposalManager.getJobContext();

      chrome.runtime.sendMessage({ action: 'LOAD_PROPOSAL', jobData: context }, (response) => {
        try {
          const btn = document.getElementById('ext-load-proposal-btn');

          if (chrome.runtime.lastError) {
            console.error('[ProposalManager] sendMessage error:', chrome.runtime.lastError.message);
            ProposalManager.renderPanel('\u26a0 Extension error: ' + chrome.runtime.lastError.message);
          } else if (!response) {
            ProposalManager.renderPanel('\u26a0 No response from extension background. Reload the page and try again.');
          } else if (response.error) {
            console.warn('[ProposalManager] LOAD_PROPOSAL error response:', response.error);
            ProposalManager.renderPanel('\u26a0 ' + response.error);
          } else if (response.proposal) {
            ProposalManager.renderPanel(response.proposal);
          } else {
            ProposalManager.renderPanel('\u26a0 Received empty proposal from n8n. Check your workflow output.');
          }

          // Restore button
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Load Proposal';
          }
        } catch (innerErr) {
          console.error('[ProposalManager] loadProposal callback error:', innerErr);
        }
      });
    } catch (err) {
      console.error('[ProposalManager] loadProposal error:', err);
      const btn = document.getElementById('ext-load-proposal-btn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Load Proposal';
      }
    }
  },

  // ─── Panel rendering ──────────────────────────────────────────────────────

  /**
   * Renders the proposal panel below the "Load Proposal" button.
   * If the panel already exists, updates the text content only.
   *
   * @param {string} proposalText - The proposal text (or error message) to display
   */
  renderPanel(proposalText) {
    try {
      const wrapper = document.getElementById('ext-proposal-wrapper');
      if (!wrapper) {
        console.warn('[ProposalManager] renderPanel: wrapper not found — button not injected?');
        return;
      }

      // Update existing panel
      const existingPanel = document.getElementById('ext-proposal-panel');
      if (existingPanel) {
        const pre = document.getElementById('ext-proposal-text');
        if (pre) pre.textContent = proposalText;
        // Update paste/copy handlers with new text
        ProposalManager._attachPanelHandlers(proposalText);
        return;
      }

      // Build panel
      const panel = document.createElement('div');
      panel.id = 'ext-proposal-panel';
      panel.style.cssText = 'border:1px solid #d5d5d5;border-radius:4px;padding:12px;margin-top:8px;background:#fafafa;max-height:300px;overflow-y:auto;';

      const pre = document.createElement('pre');
      pre.id = 'ext-proposal-text';
      pre.style.cssText = 'white-space:pre-wrap;font-family:inherit;font-size:14px;margin:0 0 8px 0;';
      pre.textContent = proposalText;

      const pasteBtn = document.createElement('button');
      pasteBtn.id = 'ext-paste-btn';
      pasteBtn.textContent = 'Paste into form';
      pasteBtn.style.cssText = 'background:#14a800;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin-right:8px;font-size:13px;';

      const copyBtn = document.createElement('button');
      copyBtn.id = 'ext-copy-btn';
      copyBtn.textContent = 'Copy to clipboard';
      copyBtn.style.cssText = 'background:#fff;color:#14a800;border:1px solid #14a800;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:13px;';

      panel.appendChild(pre);
      panel.appendChild(pasteBtn);
      panel.appendChild(copyBtn);
      wrapper.appendChild(panel);

      ProposalManager._attachPanelHandlers(proposalText);

      console.debug('[ProposalManager] renderPanel: panel rendered,', proposalText.length, 'chars');
    } catch (err) {
      console.error('[ProposalManager] renderPanel error:', err);
    }
  },

  /**
   * Attaches (re-attaches) click handlers to the paste and copy buttons
   * with the current proposal text. Called on first render and on panel updates.
   *
   * @param {string} proposalText
   */
  _attachPanelHandlers(proposalText) {
    try {
      const pasteBtn = document.getElementById('ext-paste-btn');
      const copyBtn = document.getElementById('ext-copy-btn');

      if (pasteBtn) {
        // Replace to remove old listener before attaching new one
        const newPaste = pasteBtn.cloneNode(true);
        pasteBtn.parentNode.replaceChild(newPaste, pasteBtn);
        newPaste.addEventListener('click', () => ProposalManager.pasteProposal(proposalText));
      }

      if (copyBtn) {
        const newCopy = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopy, copyBtn);
        newCopy.addEventListener('click', () => ProposalManager.copyProposal(proposalText));
      }
    } catch (err) {
      console.error('[ProposalManager] _attachPanelHandlers error:', err);
    }
  },

  // ─── Paste ────────────────────────────────────────────────────────────────

  /**
   * Inserts proposal text into the Upwork cover letter textarea.
   * Fires input and change events to trigger React's synthetic event system
   * so the form registers the value change (character counter updates, etc.).
   *
   * @param {string} text - The proposal text to paste
   */
  pasteProposal(text) {
    try {
      const textarea = document.querySelector('[data-test="cover-letter-text"]')
        || document.querySelector('[name="cover_letter"]')
        || document.querySelector('textarea');

      if (!textarea) {
        console.warn('[ProposalManager] pasteProposal: textarea not found');
        return;
      }

      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      // Transient feedback
      const btn = document.getElementById('ext-paste-btn');
      if (btn) {
        btn.textContent = 'Pasted!';
        setTimeout(() => { btn.textContent = 'Paste into form'; }, 1500);
      }

      console.debug('[ProposalManager] pasteProposal: pasted', text.length, 'chars into textarea');
    } catch (err) {
      console.error('[ProposalManager] pasteProposal error:', err);
    }
  },

  // ─── Copy ─────────────────────────────────────────────────────────────────

  /**
   * Copies proposal text to the clipboard via navigator.clipboard.writeText().
   * Failure is logged, never thrown.
   *
   * @param {string} text - The proposal text to copy
   */
  copyProposal(text) {
    try {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('ext-copy-btn');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy to clipboard'; }, 1500);
        }
        console.debug('[ProposalManager] copyProposal: copied to clipboard');
      }).catch((err) => {
        console.error('[ProposalManager] Clipboard write failed:', err);
      });
    } catch (err) {
      console.error('[ProposalManager] copyProposal error:', err);
    }
  },

  // ─── Init ─────────────────────────────────────────────────────────────────

  /**
   * Entry point — called by upwork-content.js on every page load.
   * Exits immediately on non-apply pages.
   * Injects the button and sets up a MutationObserver to re-inject if Upwork's
   * React renderer removes and re-renders the cover letter section.
   */
  init() {
    try {
      if (!ProposalManager.isApplyPage()) return;

      console.log('[ProposalManager] apply page detected:', window.location.href);

      ProposalManager.injectButton();

      // MutationObserver — re-inject button if React re-renders the section.
      // Debounced to 500ms to avoid excessive calls during render thrashing.
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!document.getElementById('ext-load-proposal-btn')) {
            console.debug('[ProposalManager] MutationObserver: button gone, re-injecting');
            ProposalManager.injectButton();
          }
        }, 500);
      });

      observer.observe(document.body, { childList: true, subtree: true });

      console.debug('[ProposalManager] init: observer watching for React re-renders');
    } catch (err) {
      console.error('[ProposalManager] init error:', err);
    }
  },

};
