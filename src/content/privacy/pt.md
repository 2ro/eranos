_Última atualização: 18 de março de 2026_

## Visão geral

O {{appName}} é um aplicativo cliente para o **protocolo Nostr**, uma rede de comunicação aberta e descentralizada. Esta política de privacidade explica como o {{appName}} lida com seus dados e quais informações são compartilhadas ao usar o aplicativo.

## Como o Nostr funciona

O Nostr é um protocolo descentralizado. Quando você publica conteúdo, ele é enviado para um ou mais **relays** (servidores independentes) que você escolhe. O {{appName}} não opera esses relays e não tem controle sobre os dados armazenados neles. O conteúdo publicado em relays Nostr é **público por padrão** e pode ser visível para qualquer um.

## Dados que coletamos

O {{appName}} é projetado para minimizar a coleta de dados. Aqui está o que o aplicativo acessa:

- **Chave pública:** Sua chave pública Nostr é usada para identificar sua conta. Ela não é considerada informação privada na rede Nostr.
- **Conexões de relay:** O aplicativo se conecta a relays Nostr em seu nome para buscar e publicar eventos. Os operadores de relay podem registrar metadados de conexão, como seu endereço IP.
- **Armazenamento local:** Preferências, informações de conta e dados em cache são armazenados localmente no seu navegador. Esses dados não saem do seu dispositivo a menos que você os publique explicitamente.
- **Eventos publicados:** Qualquer conteúdo que você publica (publicações, reações, atualizações de perfil, etc.) é enviado para seus relays configurados e se torna parte da rede Nostr pública.

## Chaves privadas

O {{appName}} suporta assinatura via extensões de navegador (NIP-07) e outros assinadores externos. Ao usar esses métodos, sua chave privada é gerenciada pelo assinador e **nunca** é acessada ou armazenada pelo {{appName}}. Recomendamos fortemente usar uma extensão de navegador ou assinador de hardware para proteger sua chave privada.

## Uploads de arquivos

Quando você envia arquivos (imagens, vídeos, etc.), eles são enviados para servidores de arquivos compatíveis com Blossom. Esses servidores são operados por terceiros e podem ter suas próprias políticas de privacidade. Os arquivos enviados são geralmente acessíveis publicamente através de suas URLs.

## Análises

O {{appName}} pode usar análises amigáveis à privacidade (como Plausible) para entender padrões gerais de uso. Essas análises não usam cookies, não rastreiam usuários individuais e não coletam informações pessoais.

## Serviços de terceiros

O aplicativo pode interagir com os seguintes serviços de terceiros:

- **Relays Nostr:** Para ler e publicar eventos
- **Servidores Blossom:** Para upload de arquivos e hospedagem de mídia
- **Provedores NIP-05:** Para verificar endereços Nostr

Cada um desses serviços é operado independentemente e pode ter suas próprias práticas de tratamento de dados.

## Remoção de dados

Como o Nostr é um protocolo descentralizado, o {{appName}} não pode garantir a exclusão de conteúdo uma vez publicado em relays. Você pode solicitar a exclusão publicando um evento de exclusão (NIP-09), mas os relays individuais não são obrigados a honrar essas solicitações. Para limpar os dados locais, você pode limpar o armazenamento do seu navegador para este site.

## Alterações nesta política

Podemos atualizar esta política de privacidade de tempos em tempos. As alterações serão refletidas nesta página com uma data atualizada. O uso continuado do {{appName}} após as alterações constitui aceitação da política revisada.

## Contato

Se você tiver dúvidas sobre esta política de privacidade, pode entrar em contato com a equipe por trás do {{appName}} em [soapbox.pub](https://soapbox.pub).
