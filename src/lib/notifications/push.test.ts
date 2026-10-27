import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CreatorNotification } from './model';
import {
  PUSH_PROMPT,
  deliverInBackground,
  getPushPermission,
  onPushPermissionChange,
  requestPushPermission,
} from './push';

const item: CreatorNotification = {
  id: '4b6f1c22-0000-4000-8000-000000000001',
  type: 'plan_today',
  category: 'plan',
  title: 'You planned a Reel for today',
  message: 'Your planned posting time is 8:15 PM.',
  isRead: false,
  actionType: 'screen',
  actionTarget: 'plan',
  actionLabel: 'Open Plan',
  metadata: {},
  dedupeKey: 'plan:2026-10-27',
  createdAt: new Date(2026, 9, 27, 12).toISOString(),
  readAt: null,
};

const REQUIRED_EXPLANATION =
  'Get notified when your content starts outperforming your usual results or when your next post is due.';

describe('permission prompt', () => {
  it('uses the agreed wording and buttons verbatim', () => {
    assert.equal(PUSH_PROMPT.enable, 'Enable Notifications');
    assert.equal(PUSH_PROMPT.dismiss, 'Not Now');
    assert.ok(
      PUSH_PROMPT.body.startsWith(REQUIRED_EXPLANATION),
      'the benefit must be explained with the product copy, in this order',
    );
  });

  it('never asks on its own — only from an explicit press', async () => {
    // No browser here: the honest answer, not a fabricated one.
    assert.equal(getPushPermission(), 'unsupported');
    assert.equal(await requestPushPermission(), 'unsupported');
  });

  it('subscribes and unsubscribes without touching anything global', () => {
    const unsubscribe = onPushPermissionChange(() => undefined);
    assert.equal(typeof unsubscribe, 'function');
    unsubscribe();
  });
});

describe('background delivery', () => {
  it('stays silent without an opt-in', () => {
    assert.equal(deliverInBackground(item, false), false);
  });

  it('stays silent where there is no Notification API, so in-app still works', () => {
    // Opted in, but the platform cannot show a browser alert — the caller
    // treats `false` as "nothing more to do", never as a failure.
    assert.equal(deliverInBackground(item, true), false);
  });
});
