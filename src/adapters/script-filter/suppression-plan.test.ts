import { describe, it, expect } from 'vitest';
import { suppressionPlan } from './suppression-plan';

// The extension turns VS Code's own html.validate.scripts/styles off so its
// DTL-aware checkers can replace them. Writing to a user's settings.json is a
// side effect, so the decision of WHETHER to write is isolated and pinned here.

describe('suppressionPlan', () => {
  const base = {
    enabled: true,
    hasWorkspace: true,
    isDjangoProject: true,
    scripts: true,
    styles: true,
  };

  it('suppresses both keys in a workspace when neither is off yet', () => {
    expect(suppressionPlan(base)).toEqual(['scripts', 'styles']);
  });

  it('leaves a key alone when the user already set it to false', () => {
    expect(suppressionPlan({ ...base, scripts: false })).toEqual(['styles']);
    expect(suppressionPlan({ ...base, styles: false })).toEqual(['scripts']);
  });

  it('writes nothing when both are already false', () => {
    expect(suppressionPlan({ ...base, scripts: false, styles: false })).toEqual([]);
  });

  it('treats an unset key as needing suppression', () => {
    expect(suppressionPlan({ ...base, scripts: undefined, styles: undefined })).toEqual([
      'scripts',
      'styles',
    ]);
  });

  // The three guards that keep this from being a surprise.

  it('never writes when no workspace is open — global settings are off limits', () => {
    expect(suppressionPlan({ ...base, hasWorkspace: false })).toEqual([]);
  });

  it('never writes when the user opted out', () => {
    expect(suppressionPlan({ ...base, enabled: false })).toEqual([]);
  });

  // The extension activates on any .py or .html file, so "a workspace is open"
  // was never evidence that the workspace is Django's. It edited the settings
  // of whatever repo happened to be in the window.
  it('never writes until the workspace is known to be a Django project', () => {
    expect(suppressionPlan({ ...base, isDjangoProject: false })).toEqual([]);
  });

  it('writes once the evidence arrives, and only then', () => {
    expect(suppressionPlan({ ...base, isDjangoProject: false })).toEqual([]);
    expect(suppressionPlan({ ...base, isDjangoProject: true })).toEqual(['scripts', 'styles']);
  });
});
