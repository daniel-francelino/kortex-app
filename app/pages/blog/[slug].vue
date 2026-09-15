<script setup lang="ts">
import { PostHogEvent } from '~/types/analytics'
const route = useRoute()
const { capture } = usePostHog()
const { data: post, error } = await useAsyncData(route.path, () => queryCollection('posts').path(route.path).first())
if (error.value) throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar o artigo.' })
if (!post.value) throw createError({ statusCode: 404, statusMessage: 'Artigo não encontrado', fatal: true })
const { data: otherPosts } = await useAsyncData(route.path + '-related', () => queryCollection('posts').where('path', '<>', route.path).order('date', 'DESC').order('stem', 'ASC').all())
const related = computed(() => [...(otherPosts.value ?? [])].sort((a, b) => Number(b.badge.label === post.value?.badge.label) - Number(a.badge.label === post.value?.badge.label)).slice(0, 2))
const title = post.value.seo?.title || post.value.title
const description = post.value.seo?.description || post.value.description
const formatDate = (date: Date | string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(date))
useSeoMeta({ title, ogTitle: title, description, ogDescription: description, ogType: 'article', articlePublishedTime: new Date(post.value.date).toISOString(), articleModifiedTime: new Date(post.value.updatedAt || post.value.date).toISOString() })
defineOgImageComponent('Saas', { headline: 'Blog Kortex' })
</script>

<template>
  <UContainer v-if="post">
    <NuxtLink to="/blog" class="blog-back"><UIcon name="i-lucide-arrow-left" /> Todos os artigos</NuxtLink>
    <header class="article-header">
      <div class="blog-card-meta"><span class="blog-tag">{{ post.badge.label }}</span><span>{{ post.readingMinutes }} min de leitura</span></div>
      <h1>{{ post.title }}</h1>
      <p class="blog-lead">{{ post.description }}</p>
      <div class="article-dates"><span>Publicado em <time :datetime="new Date(post.date).toISOString()">{{ formatDate(post.date) }}</time></span><span v-if="post.updatedAt">Atualizado em <time :datetime="new Date(post.updatedAt).toISOString()">{{ formatDate(post.updatedAt) }}</time></span></div>
    </header>
    <div class="article-layout">
      <div class="min-w-0">
        <article class="article-prose" aria-label="Conteúdo do artigo"><ContentRenderer :value="post" /></article>
        <section class="article-action"><p class="blog-eyebrow">EXPERIMENTE NO KORTEX</p><h2>Leve uma ideia para a sua rotina.</h2><p>Comece com o exercício deste guia e ajuste ao seu jeito.</p><UButton :to="post.action.to" :label="post.action.label" trailing-icon="i-lucide-arrow-up-right" class="mt-5 min-h-11" /></section>
      </div>
      <aside v-if="post.body.toc?.links?.length" class="article-toc"><UContentToc title="Neste artigo" :links="post.body.toc.links" /></aside>
    </div>
    <section v-if="related.length" class="related-section" aria-labelledby="related-title">
      <p class="blog-eyebrow">CONTINUE EXPLORANDO</p><h2 id="related-title">Outras ideias para o seu dia.</h2>
      <div class="related-grid"><article v-for="(item, index) in related" :key="item.id" class="blog-card"><NuxtLink :to="item.path" class="blog-card-link" @click="capture(PostHogEvent.BlogPostOpened, { index, post_path: item.path })"><div class="blog-card-meta"><span class="blog-tag">{{ item.badge.label }}</span><span>{{ item.readingMinutes }} min de leitura</span></div><h3>{{ item.title }}</h3><p class="blog-card-description">{{ item.description }}</p><span class="blog-card-bottom">Ler o guia <UIcon name="i-lucide-arrow-up-right" /></span></NuxtLink></article></div>
    </section>
  </UContainer>
</template>
