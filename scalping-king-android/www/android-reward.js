(function () {
  'use strict';

  const native = window.Capacitor?.Plugins?.ScalpRewardAds;
  if (!native) return;
  let ready = false;

  function updateAvailability(status) {
    ready = status?.ready === true;
    window.dispatchEvent(new Event('scalp-reward-availability'));
  }

  window.scalpRewardProvider = {
    isAvailable() {
      return ready;
    },
    async show({feature, signal, onReward}) {
      if (!ready || signal.aborted) return 'canceled';
      updateAvailability({ready: false});
      const result = await native.show({feature});
      if (result?.earned !== true || signal.aborted) return 'canceled';
      onReward();
      return 'completed';
    },
  };

  async function prepare() {
    try {
      await native.addListener('availabilityChanged', updateAvailability);
      updateAvailability(await native.prepare());
    } catch {
      updateAvailability({ready: false});
    }
  }

  prepare();
}());
