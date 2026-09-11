/**
 * overlay.js — Injects the Tab Freezer UI as a floating iframe widget.
 */

let overlayIframe = null;

function createOverlay() {
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('popup/popup.html');
  iframe.id = 'tf-floating-overlay';
  
  // Premium floating styles
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '320px',
    height: '500px', // Max height
    border: '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
    zIndex: '2147483647', // Maximum z-index
    backgroundColor: 'transparent',
    colorScheme: 'light',
    overflow: 'hidden',
    display: 'none',
    transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    opacity: '0',
    transform: 'translateY(-10px)'
  });

  document.body.appendChild(iframe);
  return iframe;
}

function toggleOverlay() {
  if (!overlayIframe) {
    overlayIframe = createOverlay();
  }

  const isShowing = overlayIframe.style.display === 'block';

  if (isShowing) {
    overlayIframe.style.opacity = '0';
    overlayIframe.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      overlayIframe.style.display = 'none';
    }, 200);
  } else {
    overlayIframe.style.display = 'block';
    // Trigger reflow
    void overlayIframe.offsetWidth;
    overlayIframe.style.opacity = '1';
    overlayIframe.style.transform = 'translateY(0)';
  }
}

// Close when clicking outside the iframe
document.addEventListener('click', () => {
  if (overlayIframe && overlayIframe.style.display === 'block') {
    overlayIframe.style.opacity = '0';
    overlayIframe.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      overlayIframe.style.display = 'none';
    }, 200);
  }
});

// Close when switching tabs
document.addEventListener('visibilitychange', () => {
  if (document.hidden && overlayIframe && overlayIframe.style.display === 'block') {
    overlayIframe.style.opacity = '0';
    overlayIframe.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      overlayIframe.style.display = 'none';
    }, 200);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TF_TOGGLE_OVERLAY') {
    toggleOverlay();
  }
});

// Dynamic iframe resizing
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'TF_RESIZE' && overlayIframe) {
    overlayIframe.style.height = e.data.height + 'px';
  }
});
