<script setup lang="ts">
import BillingPricingPlans from "~/components/billing/BillingPricingPlans.vue";

const { data: page } = await useAsyncData("pricing", () =>
  queryCollection("pricing").first(),
);

const title = page.value?.seo?.title || page.value?.title;
const description = page.value?.seo?.description || page.value?.description;

useSeoMeta({
  title,
  ogTitle: title,
  description,
  ogDescription: description,
});

defineOgImageComponent("Saas");
</script>

<template>
  <div v-if="page" class="pricing-page">
    <BillingPricingPlans :page="page" />

    <UContainer>
      <section class="pricing-faq" aria-labelledby="faq-title">
        <div class="faq-heading">
          <p
            class="text-xs font-semibold uppercase tracking-widest text-primary"
          >
            ANTES DE COMEÇAR
          </p>
          <h2 id="faq-title">{{ page.faq.title }}</h2>
          <p class="mt-5 text-sm leading-7 text-muted">
            {{ page.faq.description }}
          </p>
          <UButton
            to="/#recursos"
            label="Conheça o Kortex"
            trailing-icon="i-lucide-arrow-up-right"
            variant="link"
            class="mt-4 min-h-11 px-0"
          />
        </div>
        <UAccordion
          :items="page.faq.items"
          :unmount-on-hide="false"
          :default-value="['0']"
          type="multiple"
          class="min-w-0 w-full"
          :ui="{
            trigger: 'text-base text-highlighted py-5',
            body: 'text-sm leading-7 text-muted pb-5',
          }"
        />
      </section>
      <section class="pricing-closing">
        <div>
          <h2>Seu próximo passo pode ser simples.</h2>
          <p>
            Escolha seu plano e dê um lugar para suas ideias, tarefas e rotina.
          </p>
        </div>
        <UButton
          to="/signup"
          label="Criar minha conta"
          trailing-icon="i-lucide-arrow-right"
          size="xl"
          class="min-h-12 justify-center rounded-xl"
        />
      </section>
    </UContainer>
  </div>
</template>

<style scoped>
.pricing-page {
  padding-bottom: 80px;
}
.pricing-faq {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 72px;
  padding: 80px 0;
  margin-top: 72px;
  border-top: 1px solid var(--ui-border);
}
.faq-heading h2 {
  margin-top: 20px;
  font-size: clamp(2rem, 3.4vw, 3rem);
  line-height: 1.15;
  letter-spacing: -0.045em;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
.pricing-closing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 36px;
  border: 1px solid var(--ui-border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg));
}
.pricing-closing h2 {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ui-text-highlighted);
}
.pricing-closing p {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ui-text-muted);
}
.pricing-closing > a {
  flex-shrink: 0;
}
@media (max-width: 767px) {
  .pricing-faq {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding: 48px 0;
    margin-top: 48px;
  }
  .pricing-closing {
    align-items: stretch;
    flex-direction: column;
    padding: 24px;
  }
  .pricing-page {
    padding-bottom: 48px;
  }
}
</style>
