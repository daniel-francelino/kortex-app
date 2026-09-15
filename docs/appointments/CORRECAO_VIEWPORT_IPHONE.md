# Espaço inferior na PWA — análise da captura de 15/09/2026

## Complemento: onboarding em tela cheia (16/09/2026)

O `FlowModal.vue` ainda herdava o limite responsivo de altura de modais centralizados em `app.config.ts`. A altura `h-dvh` não anulava esse `max-height`, e o modal não reservava a área segura superior. A navegação inferior, com `z-index: 50`, também podia aparecer acima do diálogo.

A correção local define altura e altura máxima de `100dvh` no mobile e `100vh` no WebKit com a classe `pwa-standalone`, seguindo a referência do shell descrita abaixo. As quatro áreas seguras ficam dentro da caixa do modal. Overlay e conteúdo usam as camadas 220/230, abaixo dos seletores (320) e acima da navegação. Cabeçalho e ações não encolhem; o corpo tem rolagem independente. Em telas muito baixas, o cabeçalho também pode rolar para preservar espaço para as ações.

Validação desta alteração: `git diff --check` sem erros. Lint e compilação Vue bloqueados por dependências locais incompletas (`eslint` e `@vue/compiler-core` indisponíveis). A confirmação visual no navegador e no iPhone continua pendente. Conferir as cinco etapas, especialmente Perfil, em retrato e paisagem: ações acessíveis, conteúdo rolável e cabeçalho fora da barra de status.

Fonte: `kortex-css-2026-09-15T21-13-50-430Z.json`, incluindo a marcação `manual:gap-visible` em `/app/habits`.

## Evidências

- Tela e `100vh/100lvh`: 956 px. `innerHeight/visualViewport/100dvh`: aproximadamente 894 px. Diferença: 62 px, igual ao inset superior.
- O mesmo estado aparece nas 52 capturas, em Configurações, Início e Hábitos. Não há variação de teclado nem overflow da raiz registrado; não é evidência sobre o comportamento com teclado aberto.
- `navigator.standalone = true`, mas `(display-mode: standalone) = false`. A classe `pwa-standalone` está aplicada corretamente.
- `html` mede 894 px; `body` e `#__nuxt` têm altura zero, pois usam alturas mínimas percentuais sem uma altura definida e o shell sai do fluxo com `position: fixed`.
- O shell mede 894 px. A barra vai de y=818 a y=928, tem 110 px de altura e padding inferior de 34 px. O `bottom: -34px` desloca a barra para fora do viewport menor, mas não corrige a diferença de 62 px na raiz.

## Alteração

Em `app/assets/css/main.css`, o modo instalado no WebKit mobile passa a definir altura explícita `100vh` em html/body e no shell. A barra usa `top: calc(100vh - var(--mobile-bottom-nav-height))`, alinhando-se à mesma referência. A área segura permanece dentro da barra. O deslocamento negativo foi removido.

A regra usa a classe de runtime em vez de depender da media query de standalone. Não altera as metatags de instalação nem exige reinstalação para aplicar o CSS.

Com os valores capturados, a geometria esperada é shell de 956 px e barra de y=846 a y=956, com controles terminando em y=922 e 34 px reservados ao gesto do sistema. Esses valores são uma previsão do CSS; não são uma nova medição do iPhone.

## Validação e limites

O CSS foi analisado com o parser CSS Tree sem erros. O relatório sustenta a diferença de alturas, mas a confirmação visual precisa ocorrer no aparelho após carregar os novos assets. Não há navegador conectado neste ambiente e a emulação de desktop não reproduz o enquadramento nativo do iOS.

Após publicar: encerrar e reabrir o app, conferir a barra em Início/Hábitos, a última linha ao rolar, abrir/fechar o teclado e retornar da Tela de Início. Após o usuário confirmar uma melhora significativa no layout, o diagnóstico temporário foi removido; as correções de CSS foram preservadas.

Há relatos primários de problemas de viewport em [Home Screen Web apps no WebKit](https://bugs.webkit.org/show_bug.cgi?id=301994) e da mitigação de altura explícita nas raízes no [OpenChamber](https://github.com/openchamber/openchamber/issues/2287). São contexto técnico, não confirmação de que toda faixa nativa do iOS pode ser corrigida por CSS.
