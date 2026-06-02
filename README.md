# Frases em Ingles SRS

App PWA simples para estudar frases em ingles com repeticao espacada, audio por Web Speech API e banco local no IndexedDB.

## Stack

- React + Vite
- IndexedDB no navegador
- Web Speech API para Text-to-Speech
- PWA instalavel no celular

## Instalar e rodar

```bash
npm install
npm run dev
```

Depois acesse o endereco exibido pelo Vite. No iPhone, abra pelo Safari e use **Compartilhar > Adicionar a Tela de Inicio**.

## Build de producao

```bash
npm run build
npm run preview
```

## Publicar no GitHub Pages

1. Crie um repositorio no GitHub, por exemplo `frases-ingles-srs`.
2. Envie estes arquivos para o repositorio, sem a pasta `node_modules`.
3. No GitHub, abra **Settings > Pages**.
4. Em **Build and deployment**, escolha **GitHub Actions**.
5. O workflow `.github/workflows/deploy.yml` vai publicar a pasta `dist` automaticamente a cada push na branch `main`.

Depois que a Action terminar, o app ficara em um endereco parecido com:

```text
https://seu-usuario.github.io/frases-ingles-srs/
```

## Importacao CSV

O CSV deve ter as colunas:

```csv
portugues,ingles,categoria,observacao
Voce poderia repetir mais devagar?,Could you repeat that more slowly?,Conversacao,
```

Tambem sao aceitos cabecalhos com acentos, como `português`, `inglês` e `observação`.
