/**
 * Node test environment for route-handler tests.
 *
 * Node >= 22 exposes experimental `localStorage`/`sessionStorage` globals whose
 * getters throw unless the process was started with `--localstorage-file`.
 * jest-environment-node@29 copies every global into the sandbox and trips that
 * getter. Removing the two globals first (a no-op on Node 20, which lacks them)
 * lets the stock node environment load cleanly on any Node version.
 */
try {
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
} catch {
  // Non-configurable on this Node version; let jest-environment-node handle it.
}

module.exports = require('jest-environment-node').TestEnvironment;
