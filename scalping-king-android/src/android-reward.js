(function () {
  'use strict';

  const native = window.Capacitor?.Plugins?.ScalpRewardAds;
  if (!native) return;
  let features = new Set();
  let serverVerifiedOnly = true;
  let privacyRequired = false;
  let privacyBusy = false;

  function updateAvailability(status) {
    features = new Set(Array.isArray(status?.features) ? status.features : []);
    serverVerifiedOnly = status?.serverVerifiedOnly !== false;
    privacyRequired = status?.privacyRequired === true;
    privacyBusy = status?.privacyBusy === true;
    window.dispatchEvent(new Event('scalp-reward-availability'));
  }

  window.scalpRewardProvider = {
    isAvailable(feature) {
      return features.has(feature) && (!serverVerifiedOnly || Boolean(window.scalpOfficial));
    },
    privacyRequired: () => privacyRequired,
    privacyBusy: () => privacyBusy,
    openPrivacyOptions: () => native.openPrivacyOptions(),
    async show({feature, signal, onReward, nonce}) {
      if (!this.isAvailable(feature) || signal.aborted || (serverVerifiedOnly && !nonce)) return 'canceled';
      features.clear();
      window.dispatchEvent(new Event('scalp-reward-availability'));
      const result = await native.show({feature, nonce});
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
