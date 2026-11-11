(function () {
  'use strict';

  function ready(provider, feature) {
    try {
      return typeof provider?.show === 'function' && provider.isAvailable?.(feature) === true;
    } catch {
      return false;
    }
  }

  // A provider only calls onReward from its verified reward event. Its show()
  // promise settles when the ad closes; cancellation and rejection earn nothing.
  async function request(provider, feature, signal) {
    if (signal.aborted || !ready(provider, feature)) return false;
    let earned = false;
    let closed = false;
    try {
      const outcome = await provider.show({feature, signal, onReward() {
        if (!closed && !signal.aborted) earned = true;
      }});
      return outcome === 'completed' && earned && !signal.aborted;
    } catch {
      return false;
    } finally {
      closed = true;
    }
  }

  globalThis.ScalpReward = {ready, request};
}());
