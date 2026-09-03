import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o build funciona tanto na raiz de um domínio
  // quanto num subdiretório (ex.: GitHub Pages /usuario/repo/).
  base: './',
  server: {
    // `--host` já expõe na rede; isso permite abrir do celular/Quest em dev.
    // Atenção: WebXR exige contexto seguro, e `http://192.168.x.x` não é um.
    // Abrindo pelo IP, o botão de VR NÃO aparece.
    //
    // Para testar VR existem dois caminhos, e a escolha depende da FAIXA:
    //
    //   - Faixa nossa (cartas/teste.json): o deploy resolve. Todo push
    //     republica, e no Quest é só abrir a URL.
    //
    //   - Faixa de terceiro (Colour Me Red, Money): essa não vai para o
    //     repositório nem para o deploy — a licença é de uso didático, e
    //     publicar seria distribuir. Aí o caminho é o cabo USB:
    //
    //         adb reverse tcp:5173 tcp:5173
    //
    //     e no navegador do Quest abrir http://localhost:5173. Como é
    //     `localhost`, conta como contexto seguro e o WebXR liga — sem que
    //     o áudio saia da máquina.
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Modelos .glb já vêm comprimidos (Draco + KTX2); não vale reprocessar.
    assetsInlineLimit: 0,
    target: 'es2022',
  },
});
