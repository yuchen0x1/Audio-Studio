import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReleaseNotes } from './release-notes.mjs';

const history =
  '# History\r\n\r\n## 未发布\r\nFuture\r\n\r\n## v0.1.1 — 2026-11-13\r\n### Windows\r\n- Fixed a job\r\n\r\n## v0.1.0 — 2026-11-09\r\n- Initial release\r\n';

test('selects an exact version with platform sections and normalizes line endings', () => {
  const actual = extractReleaseNotes(history, 'v0.1.1');
  assert.match(actual, /### Windows\n- Fixed a job/);
  assert.doesNotMatch(actual, /Future|Initial release|\r/);
});
test('supports the final entry and a tag without the v prefix', () => {
  assert.match(extractReleaseNotes(history, '0.1.0'), /Initial release/);
});
test('rejects a missing version instead of publishing unrelated notes', () => {
  assert.throws(() => extractReleaseNotes(history, 'v0.1.10'), /found 0/);
});
test('rejects duplicate entries and empty release notes', () => {
  assert.throws(() => extractReleaseNotes(`${history}\n## v0.1.0\nDuplicate`, 'v0.1.0'), /found 2/);
  assert.throws(() => extractReleaseNotes('## v0.1.0\n\n## v0.0.9\nOld', 'v0.1.0'), /Empty/);
});
test('keeps prerelease notes separate from the stable release', () => {
  const versions = '## v1.0.0-rc.1\nCandidate\n\n## v1.0.0\nStable\n';
  assert.match(extractReleaseNotes(versions, 'v1.0.0-rc.1'), /Candidate/);
  assert.doesNotMatch(extractReleaseNotes(versions, 'v1.0.0'), /Candidate/);
  assert.throws(() => extractReleaseNotes(history, '../v0.1.0'), /Invalid/);
});
