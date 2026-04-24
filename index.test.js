const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

test('Storage functions (saveState & loadState)', async (t) => {
  // Mock localStorage
  const storage = {};
  const localStorageMock = {
    setItem: (key, value) => { storage[key] = value; },
    getItem: (key) => storage[key] || null,
  };

  // Mock DOM elements and other globals needed by the script
  const documentMock = {
    addEventListener: () => {},
    getElementById: (id) => ({
      addEventListener: () => {},
      value: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      innerHTML: '',
      srcdoc: ''
    }),
    createElement: () => ({ click: () => {} }),
  };

  const windowMock = {
    location: { href: 'http://localhost' },
    localStorage: localStorageMock,
  };

  const sandbox = {
    localStorage: localStorageMock,
    document: documentMock,
    window: windowMock,
    console: console,
    JSON: JSON,
    Date: Date,
    setTimeout: setTimeout,
    setInterval: setInterval,
    Blob: function() {},
    URL: { createObjectURL: () => '' },
  };

  // Read the code directly from index.html and instrument it for testing
  const html = fs.readFileSync('index.html', 'utf8');
  const scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
  if (!scripts) throw new Error('No scripts found in index.html');
  const code = scripts.map(s => s.replace(/<\/?script>/g, '')).join('\n');

  const instrumentedCode = code
    .replace('let state =', 'var state =')
    .replace('function saveState', 'saveState = function')
    .replace('function loadState', 'loadState = function');

  // Execute the script in the sandbox
  vm.runInNewContext(instrumentedCode, sandbox);

  await t.test('saveState should serialize the state object and save it to localStorage', () => {
    // Modify state
    sandbox.state.html = '<h1>Test content</h1>';
    sandbox.state.currentId = '12345';

    // Call saveState
    sandbox.saveState();

    // Verify localStorage content
    const savedString = storage['ai_builder_state'];
    assert.ok(savedString, 'State should be saved in localStorage under "ai_builder_state"');

    const savedState = JSON.parse(savedString);
    assert.strictEqual(savedState.html, '<h1>Test content</h1>');
    assert.strictEqual(savedState.currentId, '12345');
  });

  await t.test('loadState should retrieve the state from localStorage and update the state object', () => {
    // Set up initial state in localStorage
    const initialState = {
      projects: [{ id: 'proj1', name: 'Initial Project', html: '<p>Initial</p>', updated: new Date().toISOString() }],
      settings: { url: 'https://test-api.com', key: 'test-key', model: 'test-model' },
      currentId: 'proj1'
    };
    storage['ai_builder_state'] = JSON.stringify(initialState);

    // Call loadState
    sandbox.loadState();

    // Verify sandbox state was updated
    assert.strictEqual(sandbox.state.currentId, 'proj1');
    assert.strictEqual(sandbox.state.projects.length, 1);
    assert.strictEqual(sandbox.state.projects[0].name, 'Initial Project');
    assert.strictEqual(sandbox.state.settings.url, 'https://test-api.com');
  });

  await t.test('loadState should handle missing or partial data in localStorage gracefully', () => {
    // Clear storage
    delete storage['ai_builder_state'];

    // Reset state to a known state
    sandbox.state.projects = [];
    sandbox.state.currentId = null;

    // Call loadState with empty storage
    sandbox.loadState();

    // State should remain empty (not crash)
    assert.strictEqual(sandbox.state.projects.length, 0);
    assert.strictEqual(sandbox.state.currentId, null);

    // Call loadState with partial data
    storage['ai_builder_state'] = JSON.stringify({ currentId: 'partial' });
    sandbox.loadState();

    assert.strictEqual(sandbox.state.currentId, 'partial');
    assert.ok(Array.isArray(sandbox.state.projects), 'projects should still be an array');
  });
});
