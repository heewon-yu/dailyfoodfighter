import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const embeddedBlog = process.env.EMBED_BENEFITS === '1';
const base = embeddedBlog ? '/benefits' : '';

export default {
  preprocess: vitePreprocess(),
  kit: {
    // The dynamic /api/programs route is supplied by a separate Cloudflare
    // Pages Function on the blog; only public HTML pages are exported here.
    adapter: embeddedBlog
      ? adapterStatic({ strict: false })
      : adapterAuto(),
    paths: { base },
    // Avoid Jekyll excluding assets named "_app" from the blog's output.
    appDir: embeddedBlog ? 'app' : '_app',
    prerender: {
      entries: ['*'],
      // 푸터의 블로그 루트 링크(/about/, /editorial-policy/, /contact/, /privacy/)는
      // 이 앱의 base(/benefits) 밖에 있는 DailyFoodFighter 페이지다. 프리렌더 링크
      // 검사는 앱 내부 링크에만 적용하고, 루트 페이지 링크는 통과시킨다.
      handleHttpError:
        embeddedBlog
          ? ({ path, message }) => {
              if (!path.startsWith(base)) return;
              throw new Error(message);
            }
          : 'fail'
    }
  }
};
