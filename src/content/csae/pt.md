_Última atualização: 19 de março de 2026_

## Nosso compromisso

O {{appName}} aplica uma **política de tolerância zero** em relação a material de abuso e exploração sexual infantil (CSAE). A segurança das crianças é primordial, e estamos comprometidos a fazer tudo dentro do nosso poder como aplicativo cliente para prevenir a distribuição, promoção ou facilitação de conteúdo CSAE através do nosso aplicativo.

Esta política se aplica a todo o conteúdo acessível através do {{appName}}, incluindo texto, imagens, vídeos, links e qualquer outra mídia. Cobre todas as formas de CSAE, incluindo mas não se limitando a imagens, solicitação, aliciamento, tráfico e sexualização de menores.

## Como o {{appName}} funciona

O {{appName}} é um **aplicativo cliente** para o protocolo Nostr, uma rede de comunicação aberta e descentralizada. Entender a arquitetura é um contexto importante para esta política:

- **Nossa infraestrutura:** Operamos o **relay Eranos** e o **servidor Blossom Eranos**, que servem como o relay e host de arquivos padrão para o {{appName}}. Temos controle total de moderação sobre o conteúdo armazenado nesses serviços.
- **Relays de terceiros:** Os usuários também podem se conectar a relays Nostr adicionais operados por terceiros independentes. O {{appName}} busca e exibe conteúdo de quaisquer relays aos quais o usuário esteja conectado. Não temos controle de moderação sobre relays de terceiros, mas controlamos o que o aplicativo exibe.
- **Servidores de mídia de terceiros:** Os usuários podem enviar imagens e vídeos para servidores de arquivos compatíveis com Blossom de terceiros. Não operamos ou moderamos esses serviços externos.

Assumimos total responsabilidade pela experiência dentro do nosso aplicativo. Em nossa própria infraestrutura (relay Eranos e servidor Blossom Eranos), podemos remover diretamente o conteúdo e banir contas infratoras. Para conteúdo originário de serviços de terceiros, ativamente o bloqueamos de ser exibido dentro do {{appName}}.

## Conteúdo e comportamento proibidos

O seguinte é estritamente proibido no {{appName}}. Usuários encontrados se envolvendo em qualquer um dos seguintes estarão sujeitos a ação imediata:

- **CSAM (material de abuso sexual infantil):** Qualquer representação visual de conduta sexual explícita envolvendo um menor, incluindo fotografias, vídeos e imagens geradas digitalmente ou por IA.
- **Aliciamento:** Qualquer tentativa de construir um relacionamento com um menor com o propósito de exploração sexual ou abuso.
- **Solicitação:** Solicitar, oferecer ou facilitar a troca de material CSAE ou contato sexual com menores.
- **Sexualização de menores:** Conteúdo que sexualiza menores, incluindo comentários sugestivos ou sexuais sobre crianças, mesmo que nenhuma imagem explícita esteja envolvida.
- **Tráfico:** Qualquer conteúdo que facilite, promova ou coordene o tráfico de menores para fins sexuais.
- **Links e referências:** Compartilhar links para sites externos ou recursos contendo material CSAE, ou fornecer instruções sobre como encontrar ou produzir tal material.

## Detecção e prevenção

O {{appName}} implementa múltiplas camadas de proteção para combater CSAE:

- **Filtragem de conteúdo:** Mantemos e aplicamos mecanismos de filtragem de conteúdo dentro do aplicativo para bloquear material CSAE conhecido de ser exibido, independentemente de qual relay seja originário.
- **Denúncia por usuários:** Fornecemos ferramentas de denúncia no aplicativo que permitem aos usuários sinalizar conteúdo CSAE suspeito para revisão imediata.
- **Moderação do relay Eranos:** Em nosso próprio relay Eranos, moderamos ativamente o conteúdo e removeremos imediatamente qualquer material CSAE e baniremos permanentemente as contas associadas.
- **Moderação do servidor Blossom Eranos:** Em nosso próprio servidor de arquivos Blossom Eranos, excluiremos imediatamente qualquer mídia CSAE e baniremos a conta que fez o upload.
- **Bloqueio de relays de terceiros:** Relays de terceiros conhecidos por hospedar ou tolerar material CSAE podem ser removidos da lista de relays padrão do {{appName}} e bloqueados de serem adicionados por usuários.
- **Ferramentas de silenciar e bloquear:** Os usuários podem silenciar ou bloquear contas no nível do cliente, impedindo que o conteúdo dessas contas apareça em seu feed.

## Ações de aplicação

Quando conteúdo ou comportamento CSAE é identificado, o {{appName}} tomará as seguintes ações conforme aplicável:

- **Bloqueio imediato de conteúdo:** Conteúdo CSAE conhecido será bloqueado de renderizar no aplicativo através de filtros de conteúdo e listas de bloqueio.
- **Remoção da infraestrutura Eranos:** Conteúdo CSAE no relay Eranos e no servidor Blossom Eranos será imediatamente excluído, e as contas associadas permanentemente banidas.
- **Bloqueio de contas:** Chaves públicas Nostr associadas à atividade CSAE serão adicionadas a listas de bloqueio em nível de aplicativo, impedindo que seu conteúdo apareça no {{appName}} independentemente de qual relay seja buscado.
- **Bloqueio de relays:** Relays de terceiros que falham em abordar conteúdo CSAE podem ser removidos da lista de relays padrão do {{appName}} e bloqueados de serem adicionados por usuários.
- **Denúncia às autoridades:** Denunciaremos material CSAE identificado ao [National Center for Missing & Exploited Children (NCMEC)](https://www.missingkids.org/gethelpnow/cybertipline) através da CyberTipline, e às agências de aplicação da lei aplicáveis.

## Denúncia de conteúdo CSAE

Se você encontrar algum conteúdo no {{appName}} que acredita constituir abuso ou exploração sexual infantil, por favor denuncie imediatamente:

- **Denúncia no aplicativo:** Use o botão de denúncia disponível em qualquer publicação ou perfil de usuário para sinalizar conteúdo para revisão.
- **Entre em contato conosco diretamente:** Entre em contato com nossa equipe em [goblin.st/team](https://goblin.st/team) com detalhes do conteúdo, incluindo quaisquer IDs de eventos Nostr relevantes ou chaves públicas.
- **Denunciar ao NCMEC:** Você também pode arquivar um relatório diretamente com a [NCMEC CyberTipline](https://www.missingkids.org/gethelpnow/cybertipline).
- **Contatar autoridades policiais:** Se você acredita que uma criança está em perigo imediato, contate sua polícia local ou ligue **911** (EUA) imediatamente.

Todas as denúncias de conteúdo CSAE são tratadas com a maior prioridade e serão revisadas o mais rápido possível.

## Cooperação com autoridades policiais

O {{appName}} está comprometido em cooperar totalmente com agências de aplicação da lei investigando CSAE. Embora o {{appName}} não armazene conteúdo de usuário em seus próprios servidores, nós:

- Forneceremos qualquer informação disponível para nós — incluindo dados do relay Eranos e do servidor Blossom Eranos — que possa ajudar em investigações, de acordo com a lei aplicável.
- Identificaremos e compartilharemos as URLs específicas de relays e servidores de arquivos onde o conteúdo infrator foi observado, para que as autoridades policiais possam contatar esses operadores diretamente.
- Preservaremos qualquer evidência ou informação disponível ao receber uma solicitação legal válida.
- Denunciaremos material CSAE identificado ao NCMEC e outras autoridades relevantes proativamente.

## Considerações sobre arquitetura descentralizada

A natureza descentralizada do Nostr significa que nenhuma entidade única tem controle completo sobre todo o conteúdo na rede. O {{appName}} reconhece as seguintes realidades e nossa abordagem para cada uma:

- **Controle total sobre nossa própria infraestrutura:** Podemos e removemos conteúdo do relay Eranos e do servidor Blossom Eranos. Material CSAE encontrado em nossa infraestrutura é excluído imediatamente e contas são permanentemente banidas.
- **Controle limitado sobre relays de terceiros:** Não podemos excluir conteúdo de relays de terceiros. No entanto, bloqueamos esse conteúdo de ser exibido dentro do nosso aplicativo através de filtros e listas de bloqueio em nível de cliente.
- **Usuários controlam suas conexões de relay:** Embora os usuários possam se conectar a relays de sua escolha, o {{appName}} reserva o direito de bloquear conexões a relays conhecidos por hospedar conteúdo CSAE.
- **Chaves públicas são pseudônimas:** Contas Nostr são identificadas por pares de chaves criptográficas em vez de identidades verificadas. Ainda assim, bloquearemos e denunciaremos chaves infratoras e cooperaremos com a polícia para identificar os indivíduos por trás delas.

## Recursos

Se você acredita que seu conteúdo ou conta foi sinalizado ou bloqueado incorretamente sob esta política, você pode nos contatar em [goblin.st/team](https://goblin.st/team) para solicitar uma revisão. Avaliaremos recursos caso a caso. No entanto, erramos do lado da segurança infantil em todas as decisões, e nossa determinação é final.

## Alterações nesta política

Podemos atualizar esta política de segurança infantil à medida que nossas ferramentas, processos e o ecossistema Nostr evoluem. As alterações serão refletidas nesta página com uma data atualizada. Estamos comprometidos em melhorar continuamente nossa capacidade de detectar, prevenir e responder a conteúdo CSAE.

## Contato

Para dúvidas sobre esta política ou para denunciar conteúdo CSAE, entre em contato com a equipe por trás do {{appName}} em [goblin.st/team](https://goblin.st/team).
