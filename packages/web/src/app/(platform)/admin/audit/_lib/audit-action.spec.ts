import { describe, expect, it } from 'vitest';

import {
  auditActionLabel,
  auditActionLabels,
  auditFamily,
  auditNamespace,
  auditVerb,
} from './audit-action';

describe('reading an action name', () => {
  it('takes the verb from the last segment', () => {
    expect(auditVerb('platform.academy.suspended')).toBe('suspended');
    expect(auditVerb('academy.member.password.revealed')).toBe('revealed');
  });

  /*
   * The two halves are rendered next to each other in one `<code>`, so they
   * have to rejoin into exactly the string they came from — a dropped or
   * duplicated dot would corrupt a name operators search by.
   */
  it('splits an action into halves that rejoin exactly', () => {
    for (const action of [
      'platform.academy.suspended',
      'academy.feature.updated',
      'academy.member.password.revealed',
      'orphan',
    ]) {
      expect(auditNamespace(action) + auditVerb(action)).toBe(action);
    }
  });

  it('leaves an action with no namespace to its verb alone', () => {
    expect(auditNamespace('orphan')).toBe('');
    expect(auditVerb('orphan')).toBe('orphan');
  });
});

describe('which family an action belongs to', () => {
  it('separates looking from doing', () => {
    // The distinction the page exists to draw. A read and a deletion are both
    // entries in this log and they are not the same kind of event.
    expect(auditFamily('platform.audit.read')).toBe('read');
    expect(auditFamily('academy.member.password.revealed')).toBe('read');
    expect(auditFamily('platform.academy.deleted')).toBe('destroyed');
  });

  it('reads the real vocabulary the platform writes', () => {
    expect(auditFamily('platform.academy.created')).toBe('created');
    expect(auditFamily('academy.invitation.accepted')).toBe('created');
    expect(auditFamily('academy.feature.updated')).toBe('changed');
    expect(auditFamily('content.lecture.reordered')).toBe('changed');
    expect(auditFamily('platform.academy.suspended')).toBe('withdrawn');
    expect(auditFamily('academy.invitation.revoked')).toBe('withdrawn');
    expect(auditFamily('class.student.removed')).toBe('withdrawn');
    expect(auditFamily('content.course.deleted')).toBe('destroyed');
    expect(auditFamily('document.flush.failed')).toBe('destroyed');
  });

  /*
   * A suffix rule rather than a list of known actions, so a feature shipped
   * next month is understood the day it exists. An unfamiliar verb falls back
   * to `changed`, which is true of anything written to an audit log.
   */
  it('understands an action nobody has written yet', () => {
    expect(auditFamily('content.module.created')).toBe('created');
    expect(auditFamily('billing.invoice.voided')).toBe('changed');
  });

  it('never throws on a malformed action', () => {
    for (const action of ['', '.', '...', 'x']) {
      expect(() => auditFamily(action)).not.toThrow();
    }
  });
});

describe('the sentence an action is written as', () => {
  it('names the action every entry the platform writes', () => {
    // Spot-checked against the real vocabulary rather than every string: the
    // failure worth catching is a table that stopped covering the actions an
    // operator sees most, and these are them.
    for (const action of [
      'academy.feature.updated',
      'class.courses.updated',
      'platform.academy.suspended',
      'platform.support.granted',
      'content.course.deleted',
    ]) {
      expect(auditActionLabel(action)).toBe(`action.${action}`);
    }
  });

  /*
   * A key is `action.` plus the action itself, and i18next resolves it by
   * splitting on dots. A value that did not follow that shape would look up a
   * catalogue path nothing writes to and render its own key at an operator.
   */
  it('keys every label on the action it describes', () => {
    for (const [action, key] of Object.entries(auditActionLabels)) {
      expect(key).toBe(`action.${action}`);
    }
  });

  /*
   * The fallback is what keeps a feature shipped ahead of its copy from
   * rendering a blank row — the page shows the raw code, as it used to.
   */
  it('has no sentence for an action nobody has written copy for', () => {
    expect(auditActionLabel('billing.invoice.voided')).toBeNull();
  });
});
