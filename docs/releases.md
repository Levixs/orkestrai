# Releases e auto-update do Orkestrai

O código-fonte fica no repositório privado `beeblock/pantheon`. Somente
instaladores, blockmaps e manifests de atualização são publicados no repositório
público `beeblock/orkestrai-releases`.

Agentes responsáveis por uma release devem usar a skill
`.agents/skills/orkestrai-release` (espelhada para Claude em
`.claude/skills/orkestrai-release`). Ela cobre preflight, publicação, recuperação
de falhas e auditoria do feed público.

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
isso, `scripts/package-macos.sh` assina o bundle inteiro de forma ad-hoc para
evitar a mensagem falsa de aplicativo danificado e grava `stagingPercentage: 0`
no feed para bloquear updaters antigos. O app novo consulta a release pública
diretamente e oferece o download manual seguro sem tocar na instalação atual.
No primeiro uso, tente abrir o app e feche o aviso. Depois abra **Ajustes do
Sistema → Privacidade e Segurança**, desça até **Segurança**, clique em **Abrir
Mesmo Assim**, autentique e confirme **Abrir**. O botão aparece por cerca de uma
hora após a tentativa. Para eliminar esse passo e habilitar a troca automática,
cadastre:

- `MAC_CSC_LINK`: certificado `.p12` em base64;
- `MAC_CSC_KEY_PASSWORD`: senha do `.p12`;
- `APPLE_ID`;
- `APPLE_APP_SPECIFIC_PASSWORD`;
- `APPLE_TEAM_ID`.

## Recuperação

Se um build ou upload falhar, a release permanece ausente ou como draft e não é
vista pelo updater. Para falha transitória sem mudança no código, execute o
workflow novamente informando a mesma tag em **Run workflow**. Se a correção
alterar a fonte, confirme que a release pública ainda não existe (ou é draft),
faça commit/push e mova a tag para o novo commit antes de disparar o workflow.
O job aceita completar um draft e substitui assets com o mesmo nome, mas se
recusa a modificar uma release que já esteja pública.

Nunca publique manualmente uma release incompleta: o `electron-updater` depende
do manifest e do instalador correspondente estarem disponíveis ao mesmo tempo.

O job macOS precisa passar `codesign --verify --deep --strict` nos bundles das
duas arquiteturas, `hdiutil verify` nos DMGs e `unzip -t` nos ZIPs antes do
upload. Um checksum correto não substitui essa verificação: a `0.1.2` tinha
arquivos íntegros, mas uma assinatura ad-hoc parcial que o Gatekeeper reportava
como aplicativo danificado.

## Bootstrap do auto-update na 0.1.1

`electron-updater` precisa permanecer em `dependencies`, nunca em
`devDependencies`: o electron-builder remove dependências de desenvolvimento do
aplicativo final. As versões `0.0.1` e `0.1.0` foram distribuídas sem esse
módulo e não conseguem buscar a própria correção. Esses usuários fazem uma
instalação manual única da `0.1.1`; a pasta de dados fica fora do bundle e é
preservada. O teste `packaged updater` em `release-artifacts.test.ts` protege
essa regra nas próximas releases.
