import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Ship a portable release that also works when opened directly from disk.
export default defineConfig({
  base: './',
  build: { assetsInlineLimit: 2_000_000, modulePreload: false },
  plugins: [{
    name: 'portable-game',
    enforce: 'post',
    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      let html = index.source;
      for (const [file, asset] of Object.entries(bundle)) {
        if (asset.type === 'chunk' && asset.isEntry) {
          html = html.replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/, () =>
            '<script type="module">' + asset.code.replaceAll('</script', '<\\/script') + '</script>');
          delete bundle[file];
        } else if (file.endsWith('.svg')) {
          const uri = 'data:image/svg+xml;base64,' + Buffer.from(asset.source).toString('base64');
          html = html.replaceAll('./' + file, uri);
          delete bundle[file];
        } else if (file.endsWith('.css')) {
          html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/, () => '<style>' + asset.source + '</style>');
          delete bundle[file];
        }
      }
      const notices = ['Barlow.txt','Barlow-Condensed.txt','game-audio.md'].map(name =>
        readFileSync(new URL('./licenses/' + name, import.meta.url), 'utf8'));
      index.source = html.replace('</body>', () =>
        '<script type="text/plain" id="third-party-notices">' + notices.join('\n\n') + '</script></body>');
    }
  }]
});
