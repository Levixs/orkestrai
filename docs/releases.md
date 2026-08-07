# Releases e auto-update do Orkestrai

O código-fonte fica no repositório privado `beeblock/pantheon`. Somente
instaladores, blockmaps e manifests de atualização são publicados no repositório
público `beeblock/orkestrai-releases`.

## Credencial obrigatória

Crie um fine-grained personal access token no GitHub com:

- acesso somente ao repositório `beeblock/orkestrai-releases`;
- permissão **Contents: Read and write**;
- sem permissões para o repositório privado do código-fonte.

Cadastre o valor em `beeblock/pantheon` como secret de Actions chamado
`RELEASES_TOKEN`.

## Criar uma versão

1. Atualize a versão em `package.json` e `package-lock.json`:

   ```bash
   npm version 0.1.1 --no-git-tag-version
   ```

2. Atualize no mesmo commit o `CHANGELOG.md` e os três catálogos em
   `src/lib/i18n/docs/`.
3. Rode os testes e faça o commit.
4. Crie uma tag anotada ou leve exatamente igual à versão:

   ```bash
   git tag v0.1.1
   git push origin main v0.1.1
   ```

O workflow `Release Desktop` compila:

- macOS Apple Silicon: DMG, ZIP e blockmaps;
- macOS Intel: DMG, ZIP e blockmaps;
- Windows x64: instalador NSIS e blockmap;
- Linux x64: AppImage e manifest `latest-linux.yml` (o electron-builder não gera blockmap separado para AppImage).

Depois dos builds, `scripts/validate-release-artifacts.mjs` confere versão,
arquivos referenciados, tamanho e SHA-512 dos manifests `latest-mac.yml`,
`latest.yml` e `latest-linux.yml`. A release fica em draft durante o upload e só
é publicada quando todas as validações passam.

## Assinatura

Windows NSIS e Linux AppImage atualizam mesmo sem assinatura. Windows mostra o
aviso esperado do SmartScreen até existir um certificado.

No macOS, a troca automática exige Developer ID Application e notarização. Sem
isso, o Orkestrai detecta a versão, mas oferece o download manual seguro. Para
habilitar assinatura no workflow, cadastre:

- `MAC_CSC_LINK`: certificado `.p12` em base64;
- `MAC_CSC_KEY_PASSWORD`: senha do `.p12`;
- `APPLE_ID`;
- `APPLE_APP_SPECIFIC_PASSWORD`;
- `APPLE_TEAM_ID`.

## Recuperação

Se um build ou upload falhar, a release permanece como draft e não é vista pelo
updater. Corrija o problema e execute novamente o workflow informando a mesma
tag em **Run workflow**. O job aceita completar um draft e substitui assets com
o mesmo nome, mas se recusa a modificar uma release que já esteja pública.

Nunca publique manualmente uma release incompleta: o `electron-updater` depende
do manifest e do instalador correspondente estarem disponíveis ao mesmo tempo.
