const globals = require('globals');

module.exports = [
  {
    ignores: ['tab-freezer.zip', 'dist/**']
  },
  {
    // Background service worker + popup/options pages: browser + WebExtension globals.
    files: ['background.js', 'popup/**/*.js', 'options/**/*.js', 'lib/browser-compat.js', 'lib/rules.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        chrome: 'readonly',
        browser: 'readonly',
        module: 'writable',
        self: 'writable',
        global: 'readonly' // lib/rules.js is a UMD module; this branch is dead in-browser
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  },
  {
    // Content scripts run in the page context.
    files: ['content/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        browser: 'readonly',
        module: 'writable',
        self: 'writable'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // Node-side tooling: tests, build scripts.
    files: ['test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  }
];
