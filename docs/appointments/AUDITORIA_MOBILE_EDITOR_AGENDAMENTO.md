# Auditoria mobile do editor de Agendamento

Data: 18/09/2026. Escopo: `/app/appointments/scheduling/:id`, edição de perguntas, menus e confirmações associados.

## Achados e correções

| Achado na implementação | Correção |
| --- | --- |
| Grid sem coluna explícita no mobile e sidebar sem `min-width: 0`: a largura mínima das seis abas pode expandir o contêiner. | Coluna `minmax(0, 1fr)`, sidebar e painel com largura mínima zero; scroll horizontal limitado à navegação. Mesma correção no skeleton. |
| Skeleton de descrição com largura fixa que pode exceder telas estreitas. | Limite de 100% da largura disponível. |
| Inputs pequenos e botões `xs`/`2xs` difíceis de acionar. | Abaixo de 1024 px: campos com fonte de 16 px, botões com tamanho mínimo de 44 px e textos auxiliares de 14 px. |
| Dois horários, separador e botão de exclusão disputavam uma linha. | Dois campos em grid e exclusão em linha própria em telas menores que 640 px. |
| Nome de usuário dentro do input de URL ocupava a área de digitação. | Prefixo permanece na descrição do campo; input fica dedicado ao slug. |
| Linha de pergunta com título, reordenação, badge, switch e edição comprimidos. | Organização em linhas no mobile e quebra do título. |
| Cores, antecedência e ações dos modais não acomodavam controles maiores. | Quebra de linha, campos de antecedência em largura total e footer flexível. |
| Controles de ação e switches sem nomes acessíveis. | Rótulos para reordenar, adicionar/remover horários, cores e switches. |

Os estilos estão restritos à classe `scheduling-editor-mobile`, incluindo o conteúdo dos overlays. O tamanho visual dos switches é preservado, com área de toque ampliada. A navegação desktop continua lateral.

## Verificação

- Scripts TypeScript e templates dos dois componentes passaram na análise de sintaxe e compilação do template Vue.
- A folha de estilos passou no parser CSS.
- `git diff --check` sem erros de whitespace.
- ESLint bloqueado por dependência local incompleta: `picomatch/lib/constants` ausente.
- Navegador conectado indisponível: a ausência de overflow e o conforto de toque ainda precisam de conferência visual em 320, 375, 390, 768 e 1024 px, nas seis seções e nos overlays. Não houve validação em dispositivo físico.
