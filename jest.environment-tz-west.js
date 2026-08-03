/**
 * jsdom test environment pinned to a timezone WEST of Greenwich
 * (America/Los_Angeles, UTC−8/−7).
 *
 * WHY THIS EXISTS
 * ---------------
 * The date-only bug class this repo keeps hitting — `new Date('YYYY-MM-DD')`
 * parses as UTC *midnight*, so the value renders one calendar day early for
 * every negative UTC offset — is INVISIBLE in UTC, which is what CI runs in. A
 * test for it that runs in UTC passes whether or not the bug is present.
 *
 * `process.env.TZ = ...` inside a test file does NOT work: Jest hands the
 * sandbox a copy of `process.env`, so the write never reaches Node's env
 * setter and V8's timezone cache is never invalidated. Setting it here does
 * work — an environment module's `setup()`/`teardown()` run in the worker's
 * real context, before the sandbox is built.
 *
 * TZ is restored in `teardown()` because Jest reuses workers across files; a
 * process-wide TZ change that outlived this environment would silently retime
 * every suite that ran after it in the same worker.
 */
const { TestEnvironment: JSDOMEnvironment } = require('jest-environment-jsdom');

const TZ = 'America/Los_Angeles';

class TimezoneWestEnvironment extends JSDOMEnvironment {
  async setup() {
    this.previousTz = process.env.TZ;
    process.env.TZ = TZ;
    await super.setup();
  }

  async teardown() {
    await super.teardown();
    if (this.previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = this.previousTz;
    }
  }
}

module.exports = TimezoneWestEnvironment;
