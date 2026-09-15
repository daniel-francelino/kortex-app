<script setup lang="ts">
import { motion } from "motion-v";
import { PostHogEvent } from "~/types/analytics";

const { capture } = usePostHog();
const { data: page } = await useAsyncData("blog", () =>
  queryCollection("blog").first(),
);
const {
  data: posts,
  status,
  error,
  refresh,
} = await useAsyncData("blog-posts", () =>
  queryCollection("posts").order("date", "DESC").order("stem", "ASC").all(),
);
const selected = ref("Todos");
const search = ref("");
const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
const categories = computed(() => [
  "Todos",
  ...new Set((posts.value ?? []).map((post) => post.badge.label)),
]);
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const filtered = computed(() =>
  (posts.value ?? []).filter(
    (post) =>
      (selected.value === "Todos" || post.badge.label === selected.value) &&
      normalize(post.title + " " + post.description).includes(
        normalize(search.value.trim()),
      ),
  ),
);
const title = page.value?.seo?.title || "Blog Kortex";
const description = page.value?.seo?.description || page.value?.description;
useSeoMeta({ title, ogTitle: title, description, ogDescription: description });
defineOgImageComponent("Saas");
function trackPostClick(path: string, index: number) {
  capture(PostHogEvent.BlogPostOpened, { index, post_path: path });
}
</script>

<template>
  <UContainer>
    <header class="blog-hero">
      <p class="blog-eyebrow">CADERNO KORTEX / IDEIAS PARA A VIDA REAL</p>
      <h1>Mais clareza começa<br /><span>com uma boa ideia.</span></h1>
      <p class="blog-lead">{{ page?.description }}</p>
    </header>
    <section aria-label="Artigos do blog">
      <div class="blog-toolbar">
        <div class="blog-filters" role="group" aria-label="Filtrar por tema">
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            :aria-pressed="selected === category"
            @click="selected = category"
          >
            {{ category }}
          </button>
        </div>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Buscar um assunto"
          aria-label="Buscar artigos"
          size="lg"
          class="blog-search"
        />
      </div>
      <p class="sr-only" aria-live="polite">
        {{ filtered.length }} artigos encontrados.
      </p>
      <div
        v-if="status === 'pending'"
        class="blog-grid py-8"
        role="status"
        aria-label="Carregando artigos"
      >
        <USkeleton v-for="n in 3" :key="n" class="h-64 rounded-2xl" />
      </div>
      <div v-else-if="error" class="blog-empty" role="alert">
        <h2>Não foi possível carregar os artigos.</h2>
        <UButton label="Tentar novamente" class="mt-5" @click="refresh()" />
      </div>
      <div v-else-if="!filtered.length" class="blog-empty">
        <h2>Nenhum artigo encontrado.</h2>
        <p>Tente outro assunto ou explore todos os temas.</p>
        <UButton
          label="Ver todos os artigos"
          class="mt-5"
          variant="outline"
          @click="
            selected = 'Todos';
            search = '';
          "
        />
      </div>
      <div v-else class="blog-grid">
        <motion.article
          v-for="(post, index) in filtered"
          :key="post.id"
          class="blog-card"
          :class="{
            'blog-card-featured':
              index === 0 && selected === 'Todos' && !search.trim(),
            'blog-card-wide':
              index === 5 && selected === 'Todos' && !search.trim(),
          }"
          :initial="{ y: reducedMotion ? 0 : 16 }"
          :while-in-view="{ y: 0 }"
          :in-view-options="{ once: true }"
          :transition="{ duration: 0.4 }"
        >
          <NuxtLink
            :to="post.path"
            class="blog-card-link"
            @click="trackPostClick(post.path, index)"
          >
            <div class="blog-card-meta">
              <span class="blog-tag">{{ post.badge.label }}</span
              ><span>{{ post.readingMinutes }} min de leitura</span>
            </div>
            <div>
              <p
                v-if="index === 0 && selected === 'Todos' && !search.trim()"
                class="blog-eyebrow mb-4"
              >
                UMA LEITURA PARA COMEÇAR
              </p>
              <h2>{{ post.title }}</h2>
              <p class="blog-card-description">{{ post.description }}</p>
            </div>
            <div class="blog-card-bottom">
              <span>Ler o guia</span
              ><UIcon name="i-lucide-arrow-up-right" aria-hidden="true" />
            </div>
          </NuxtLink>
        </motion.article>
      </div>
    </section>
    <section class="blog-callout">
      <div>
        <p class="blog-eyebrow">DA LEITURA À PRÁTICA</p>
        <h2>Uma ideia. Um próximo passo.</h2>
        <p>
          Guarde o que fez sentido e experimente na sua rotina com o Kortex.
        </p>
      </div>
      <UButton
        to="/app"
        label="Abrir meu Kortex"
        trailing-icon="i-lucide-arrow-right"
        size="xl"
        class="min-h-12 justify-center rounded-xl"
      />
    </section>
  </UContainer>
</template>
