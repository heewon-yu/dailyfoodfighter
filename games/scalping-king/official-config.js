(function () {
  'use strict';
  const live = location.hostname === 'dailyfoodfighter.com' ||
               location.hostname.endsWith('.pages.dev') ||
               new URLSearchParams(location.search).has('official');
  window.scalpOfficialConfig = Object.freeze(live ? {
    url: 'https://spavqmvojydmwpyhqqlj.supabase.co',
    key: 'sb_publishable_pcuxX6R--MMgysHm2zQ4dA_5xLC4mIA',
  } : {url: '', key: ''});
}());
