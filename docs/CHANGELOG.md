# Atualizações públicas do Kortex

O changelog usa arquivos Markdown em `content/4.changelog`. A página exibe somente entradas com `published: true`, ordenadas da data mais recente para a mais antiga. Em datas iguais, usa o nome do arquivo como desempate.

## Como adicionar uma atualização

Use o nome `AAAA-MM-DD-assunto.md` e inclua:

```yaml
---
title: Um título que explique o benefício
description: Resumo do que mudou para quem usa o produto.
date: "2026-09-15"
published: false
category: improvement
areas:
  - Notas
action:
  label: Abrir minhas notas
  to: /app/notes
---
```

Categorias: `new` (novo recurso), `improvement` (melhoria) ou `fix` (correção). O corpo deve explicar a mudança em linguagem simples e, quando necessário, como usar ou ativar o recurso. O link de ação é opcional.

Antes de marcar `published: true`, confirme que a mudança está disponível e que a data corresponde à publicação. O campo é uma decisão editorial, não um agendador. Evite detalhes de infraestrutura, promessas futuras, métricas não verificadas e versões inventadas.

As dez entradas antigas de exemplo foram preservadas como rascunhos: a ausência de `published` equivale a `false`. Elas continham descrições genéricas, imagens decorativas e uma mesma data; não devem reaparecer como histórico confirmado sem revisão.
