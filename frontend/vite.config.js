import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o build funciona tanto na raiz de um domínio
  // quanto num subdiretório (ex.: GitHub Pages /usuario/repo/).
  base: './',
  server: {
    // `--host` já expõe na rede; isso permite abrir do celular/Quest em dev.
    // Atenção: WebXR exige HTTPS fora de localhost, então em dev pelo IP o
    // botão de VR NÃO aparece. Para testar VR, use o deploy.
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Modelos .glb já vêm comprimidos (Draco + KTX2); não vale reprocessar.
    assetsInlineLimit: 0,
    target: 'es2022',
  },
});
